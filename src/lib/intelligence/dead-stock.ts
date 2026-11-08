import {buildEvidencePassport} from "./evidence-passport";
import {decimalToMinorUnits,minorUnitsToNumber} from "./financial-precision";
import type {EvidencePeriod,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";

export type DeadStockClass="ACTIVE"|"SLOW_MOVING"|"STAGNANT"|"ZERO_MOVEMENT"|"UNKNOWN";
export interface DeadStockRule {id:string;version:string;activeWithinDays:number;stagnantAfterDays:number;lowTurnoverRatio:number;turnoverWindowDays:number}
export interface DeadStockProductInput {
 productRef:string;lastMovementAt:string|null;
 movementCoverage:{status:EvidenceStatus;period:EvidencePeriod;completeness:"COMPLETE"|"PARTIAL"|"UNKNOWN";quality:"ACCEPTABLE"|"WARNINGS"|"INVALID"|"UNKNOWN";evidenceIds:string[]};
 availableQuantity:MetricSnapshot;quantityUnit:string;
 unitCost:MetricSnapshot|null;costQuantityUnit?:string;
 soldQuantityWindow:MetricSnapshot|null;averageInventoryWindow:MetricSnapshot|null;
}
export interface DeadStockProductResult {
 productRef:string;classification:DeadStockClass;daysSinceMovement:number|null;lowTurnover:boolean|null;turnoverRatio:number|null;
 availableQuantity:number|null;unitCost:number|null;currency:string|null;financialExposure:number|null;exposureStatus:EvidenceStatus;
 movementStatus:EvidenceStatus;formulaId:string;formulaVersion:string;evidenceIds:string[];warnings:string[];
}
export interface DeadStockReport {
 id:string;asOf:string;period:EvidencePeriod;ruleId:string;ruleVersion:string;
 status:EvidenceStatus;items:DeadStockProductResult[];totalsByCurrency:Array<{currency:string;exposure:number|null;verifiedItems:number;withheldItems:number}>;
 warnings:string[];
}
const EXPOSURE_FORMULA="dead-stock.exposure";
const EXPOSURE_VERSION="1.1.0";
function isoDay(value:string):number|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const time=Date.parse(value+"T00:00:00.000Z");
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:null;
}
function numberValue(value:number|string|null):number|null {
 if(typeof value==="number")return Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER?value:null;
 if(typeof value!=="string"||! /^-?\d+(?:\.\d+)?$/.test(value.trim()))return null;
 const result=Number(value);return Number.isFinite(result)&&Math.abs(result)<=Number.MAX_SAFE_INTEGER?result:null;
}
function metricIndex(metrics:MetricSnapshot[]):Map<string,MetricSnapshot> {
 const counts=new Map<string,number>();for(const m of metrics)counts.set(m.id,(counts.get(m.id)??0)+1);
 const out=new Map<string,MetricSnapshot>();for(const m of metrics)if(counts.get(m.id)===1)out.set(m.id,m);return out;
}
function checkMetric(metric:MetricSnapshot|null,index:Map<string,MetricSnapshot>,unit:string,asOf:string,period?:EvidencePeriod,quantityUnit?:string):{metric:MetricSnapshot|null;value:number|null;status:EvidenceStatus} {
 if(!metric)return {metric:null,value:null,status:"UNAVAILABLE"};
 const source=index.get(metric.id);if(!source)return {metric:null,value:null,status:"UNVERIFIED"};
 if(source.status!=="VERIFIED"||source.completeness!=="COMPLETE"||source.quality!=="ACCEPTABLE"||source.unit!==unit||source.asOf!==asOf||!source.lineage.evidenceIds.length)
  return {metric:source,value:null,status:source.status==="VERIFIED"?"NEEDS_REVIEW":source.status};
 if(unit==="QUANTITY"||unit==="CURRENCY_PER_UNIT"){
  if(!quantityUnit?.trim()||!source.unitOfMeasure?.trim())return {metric:source,value:null,status:"NEEDS_REVIEW"};
  if(source.unitOfMeasure.trim()!==quantityUnit.trim())return {metric:source,value:null,status:"UNVERIFIED"};
 }
 if(period&&(!source.period||source.period.from!==period.from||source.period.to!==period.to))return {metric:source,value:null,status:"NEEDS_REVIEW"};
 const value=numberValue(source.value);if(value===null||value<0)return {metric:source,value:null,status:"NEEDS_REVIEW"};
 return {metric:source,value,status:"VERIFIED"};
}
function coverageValid(item:DeadStockProductInput,asOf:string,days:number,evidence:Map<string,EvidenceRecord>):boolean {
 const end=isoDay(asOf.slice(0,10)),from=isoDay(item.movementCoverage.period.from),to=isoDay(item.movementCoverage.period.to);
 if(end===null||from===null||to===null||to!==end||from>end-(days-1)*86400000)return false;
 const ids=item.movementCoverage.evidenceIds,asOfTime=Date.parse(asOf);
 if(item.movementCoverage.status!=="VERIFIED"||item.movementCoverage.completeness!=="COMPLETE"||item.movementCoverage.quality!=="ACCEPTABLE"||
  !ids.length||new Set(ids).size!==ids.length||!Number.isFinite(asOfTime))return false;
 return ids.every(id=>{
  const record=evidence.get(id),sourceTime=record?Date.parse(record.sourceTimestamp):NaN;
  return Boolean(record&&record.status==="VERIFIED"&&record.completeness==="COMPLETE"&&record.quality==="ACCEPTABLE"&&
   record.asOf===asOf&&Number.isFinite(sourceTime)&&sourceTime<=asOfTime&&
   record.period?.from===item.movementCoverage.period.from&&record.period?.to===item.movementCoverage.period.to);
 });
}

type MovementClassification = {
  classification: DeadStockClass;
  daysSinceMovement: number | null;
  movementStatus: EvidenceStatus;
  warnings: string[];
};

function classifyProductMovement(
  product: DeadStockProductInput,
  asOf: string,
  rule: DeadStockRule,
  historyOkay: boolean,
): MovementClassification {
  const warnings: string[] = [];
  const current = isoDay(asOf.slice(0, 10));
  const asOfTime = Date.parse(asOf);
  const movement = product.lastMovementAt ? Date.parse(product.lastMovementAt) : null;
  let classification: DeadStockClass = "UNKNOWN";
  let daysSinceMovement: number | null = null;
  const movementStatus: EvidenceStatus = historyOkay ? "VERIFIED" : "NEEDS_REVIEW";

  if (!historyOkay) {
    warnings.push("MOVEMENT_HISTORY_NOT_COMPLETE_OR_VERIFIED");
    return { classification, daysSinceMovement, movementStatus, warnings };
  }
  if (product.lastMovementAt === null) {
    return { classification: "ZERO_MOVEMENT", daysSinceMovement, movementStatus, warnings };
  }
  if (movement === null || !Number.isFinite(movement) || !Number.isFinite(asOfTime) || movement > asOfTime) {
    warnings.push("LAST_MOVEMENT_TIMESTAMP_INVALID");
    return { classification, daysSinceMovement, movementStatus: "UNVERIFIED", warnings };
  }

  const movementDay = isoDay(product.lastMovementAt.slice(0, 10));
  if (movementDay === null || current === null || movementDay > current) {
    warnings.push("LAST_MOVEMENT_TIMESTAMP_INVALID");
    return { classification, daysSinceMovement, movementStatus: "UNVERIFIED", warnings };
  }

  daysSinceMovement = Math.floor((current - movementDay) / 86400000);
  classification = daysSinceMovement <= rule.activeWithinDays
    ? "ACTIVE"
    : daysSinceMovement < rule.stagnantAfterDays ? "SLOW_MOVING" : "STAGNANT";
  return { classification, daysSinceMovement, movementStatus, warnings };
}

type DeadStockExposure = {
  exposure: number | null;
  exposureStatus: EvidenceStatus;
  currency: string | null;
  unitCost: number | null;
  warnings: string[];
};

function calculateDeadStockExposure(args: {
  product: DeadStockProductInput;
  quantityUnit: string;
  quantity: ReturnType<typeof checkMetric>;
  cost: ReturnType<typeof checkMetric>;
}): DeadStockExposure {
  const { product, quantityUnit, quantity, cost } = args;
  if (!product.unitCost) {
    return {
      exposure: null,
      exposureStatus: "UNAVAILABLE",
      currency: null,
      unitCost: null,
      warnings: ["UNIT_COST_NOT_AVAILABLE"],
    };
  }

  const source = cost.metric;
  const legacyCostUnitConflict = Boolean(
    product.costQuantityUnit && product.costQuantityUnit.trim() !== quantityUnit,
  );
  const sourceCurrency = source?.currency;
  const trustedCurrency = cost.status === "VERIFIED" && sourceCurrency?.trim()
    ? sourceCurrency.trim().toUpperCase()
    : null;
  const canCalculate =
    quantity.status === "VERIFIED" &&
    cost.status === "VERIFIED" &&
    Boolean(sourceCurrency && sourceCurrency.trim()) &&
    !legacyCostUnitConflict &&
    quantity.value !== null &&
    cost.value !== null;

  if (canCalculate) {
    // Quantity and unit cost are sourced decimals (up to six fractional places).
    // Multiply at scale 12, then round the non-negative currency result half-up to cents.
    const quantityMicros = decimalToMinorUnits(quantity.metric?.value, 6, true);
    const unitCostMicros = decimalToMinorUnits(cost.metric?.value, 6, true);
    if (quantityMicros === null || unitCostMicros === null ||
        quantityMicros < 0n || unitCostMicros < 0n) {
      return {
        exposure: null,
        exposureStatus: "NEEDS_REVIEW",
        currency: trustedCurrency,
        unitCost: null,
        warnings: ["EXPOSURE_PRECISION_INVALID"],
      };
    }
    const productScale12 = quantityMicros * unitCostMicros;
    const roundedCurrencyCents = (productScale12 + 5_000_000_000n) / 10_000_000_000n;
    const calculated = minorUnitsToNumber(roundedCurrencyCents, 2);
    if (calculated !== null) {
      return {
        exposure: calculated,
        exposureStatus: "VERIFIED",
        currency: trustedCurrency,
        unitCost: cost.value,
        warnings: [],
      };
    }
    return {
      exposure: null,
      exposureStatus: "NEEDS_REVIEW",
      currency: trustedCurrency,
      unitCost: null,
      warnings: ["EXPOSURE_OVERFLOW"],
    };
  }

  const warnings = [
    legacyCostUnitConflict
      ? "COST_QUANTITY_UNIT_MISMATCH"
      : !quantityUnit || !source?.unitOfMeasure?.trim()
        ? "COST_UOM_MISSING"
        : source.unitOfMeasure.trim() !== quantityUnit
          ? "COST_QUANTITY_UNIT_MISMATCH"
          : "VERIFIED_COST_OR_QUANTITY_UNAVAILABLE",
  ];
  return {
    exposure: null,
    exposureStatus:
      quantity.status === "UNVERIFIED" || cost.status === "UNVERIFIED" || legacyCostUnitConflict
        ? "UNVERIFIED"
        : "NEEDS_REVIEW",
    currency: trustedCurrency,
    unitCost: null,
    warnings,
  };
}


/** Movement classification is never made from a partial movement window; cost exposure is independently evidence-gated. */
export function buildDeadStockReport(input:{
 id:string;asOf:string;period:EvidencePeriod;evidenceRecords:EvidenceRecord[];products:DeadStockProductInput[];rule:DeadStockRule;
}):DeadStockReport {
 if(!Number.isFinite(Date.parse(input.asOf)))throw new Error("asOf must be a valid timestamp");
 const {rule}=input;
 if(!rule.id.trim()||!rule.version.trim()||!Number.isInteger(rule.activeWithinDays)||rule.activeWithinDays<0||
  !Number.isInteger(rule.stagnantAfterDays)||rule.stagnantAfterDays<=rule.activeWithinDays||
  !Number.isInteger(rule.turnoverWindowDays)||rule.turnoverWindowDays<1||!Number.isFinite(rule.lowTurnoverRatio)||rule.lowTurnoverRatio<0)
  throw new Error("invalid dead-stock rule");
 const metrics=input.products.flatMap(p=>[p.availableQuantity,...(p.unitCost?[p.unitCost]:[]),...(p.soldQuantityWindow?[p.soldQuantityWindow]:[]),...(p.averageInventoryWindow?[p.averageInventoryWindow]:[])]);
 const passport=buildEvidencePassport({id:"dead-stock:"+input.asOf,generatedAt:input.asOf,asOf:input.asOf,evidenceRecords:input.evidenceRecords,metrics});
 const index=metricIndex(passport.metrics),evidence=new Map<string,EvidenceRecord>();
 for(const record of input.evidenceRecords)if(!evidence.has(record.id))evidence.set(record.id,record);
 const items=input.products.map(product=>{
  const warnings: string[] = [];
  const historyOkay = coverageValid(product, input.asOf, rule.turnoverWindowDays, evidence);
  const movement = classifyProductMovement(product, input.asOf, rule, historyOkay);
  const { classification, daysSinceMovement, movementStatus } = movement;
  warnings.push(...movement.warnings);
  const quantityUnit=typeof product.quantityUnit==="string"?product.quantityUnit.trim():"";
  const sold=checkMetric(product.soldQuantityWindow,index,"QUANTITY",input.asOf,input.period,quantityUnit);
  const average=checkMetric(product.averageInventoryWindow,index,"QUANTITY",input.asOf,input.period,quantityUnit);
  let turnoverRatio:number|null=null,lowTurnover:boolean|null=null;
  if(sold.status==="VERIFIED"&&average.status==="VERIFIED"&&average.value!==null&&sold.value!==null&&average.value>0){
   turnoverRatio=sold.value/average.value;
   if(Number.isFinite(turnoverRatio)){lowTurnover=turnoverRatio<rule.lowTurnoverRatio;}
   else warnings.push("TURNOVER_RATIO_OVERFLOW");
  }else warnings.push("TURNOVER_RATIO_UNAVAILABLE");
  const qty=checkMetric(product.availableQuantity,index,"QUANTITY",input.asOf,undefined,quantityUnit);
  const cost=checkMetric(product.unitCost,index,"CURRENCY_PER_UNIT",input.asOf,undefined,quantityUnit);
  const exposureResult = calculateDeadStockExposure({
   product,
   quantityUnit,
   quantity: qty,
   cost,
  });
  const { exposure, exposureStatus, currency, unitCost } = exposureResult;
  warnings.push(...exposureResult.warnings);
  const evidenceIds=[...new Set([
   ...product.movementCoverage.evidenceIds,...product.availableQuantity.lineage.evidenceIds,
   ...(product.unitCost?.lineage.evidenceIds??[]),...(product.soldQuantityWindow?.lineage.evidenceIds??[]),
   ...(product.averageInventoryWindow?.lineage.evidenceIds??[]),
  ])];
  return {
   productRef:product.productRef,classification,daysSinceMovement,lowTurnover,turnoverRatio,
   availableQuantity:qty.value,unitCost,currency,financialExposure:exposure,exposureStatus,movementStatus,
   formulaId:EXPOSURE_FORMULA,formulaVersion:EXPOSURE_VERSION,evidenceIds,warnings,
  };
 });
 const currencies=[...new Set(items.map(item=>item.currency).filter((c):c is string=>Boolean(c)))];
 const totalWarnings:string[]=[];
 const totalsByCurrency=currencies.map(currency=>{
  const group=items.filter(item=>item.currency===currency),unknown=group.some(item=>item.financialExposure===null);
  let totalCents:bigint|null=unknown?null:0n;
  if(totalCents!==null)for(const item of group){
   const cents=decimalToMinorUnits(item.financialExposure,2);
   if(cents===null){totalCents=null;break;}
   totalCents+=cents;
  }
  const exposure=totalCents===null?null:minorUnitsToNumber(totalCents,2);
  if(!unknown&&exposure===null)totalWarnings.push("TOTAL_EXPOSURE_OVERFLOW");
  return {currency,exposure,verifiedItems:group.filter(item=>item.exposureStatus==="VERIFIED").length,withheldItems:group.filter(item=>item.exposureStatus!=="VERIFIED").length};
 });
 const noPopulationEvidence=items.length===0;
 const warnings=[...new Set([...items.flatMap(item=>item.warnings),...totalWarnings,...(noPopulationEvidence?["NO_PRODUCT_POPULATION_EVIDENCE"]:[])])];
 const statuses=items.map(item=>item.movementStatus);
 const status:EvidenceStatus=noPopulationEvidence?"UNAVAILABLE":statuses.includes("UNVERIFIED")?"UNVERIFIED":statuses.includes("UNAVAILABLE")?"UNAVAILABLE":statuses.includes("NEEDS_REVIEW")?"NEEDS_REVIEW":"VERIFIED";
 return {id:input.id,asOf:input.asOf,period:input.period,ruleId:rule.id,ruleVersion:rule.version,status,items,totalsByCurrency,warnings};
}
