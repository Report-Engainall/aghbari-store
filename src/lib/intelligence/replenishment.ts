import {buildEvidencePassport} from "./evidence-passport";
import {decimalToMinorUnits,minorUnitsToNumber} from "./financial-precision";
import type {EvidencePeriod,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";

export interface ReplenishmentProductInput {
 productRef:string;availableToPromise:MetricSnapshot;reorderPoint:MetricSnapshot;soldQuantityWindow:MetricSnapshot;
 supplierLeadTimeDays:MetricSnapshot;incomingPurchaseQuantity:MetricSnapshot;minimumOrderQuantity?:MetricSnapshot|null;orderMultiple?:MetricSnapshot|null;quantityUnit:string;
}
export interface ReplenishmentRecommendation {
 productRef:string;status:EvidenceStatus;action:"RECOMMEND"|"NO_ACTION"|"WITHHELD";quantityUnit:string|null;availableToPromise:number|null;incomingPurchaseQuantity:number|null;coveredAfterIncoming:number|null;
 reorderPoint:number|null;dailyDemand:number|null;leadTimeDemand:number|null;targetStock:number|null;recommendedQuantity:number|null;
 formulaId:string;formulaVersion:string;evidenceIds:string[];warnings:string[];automaticPurchase:false;
}
const FORMULA_ID="inventory.replenishment-target";
const FORMULA_VERSION="1.1.1";
function ceilDivNonNegative(numerator:bigint,denominator:bigint):bigint {
 if(numerator<=0n)return 0n;
 return (numerator+denominator-1n)/denominator;
}
function dayCount(period:EvidencePeriod):number {
 const from=Date.parse(period.from+"T00:00:00Z"),to=Date.parse(period.to+"T00:00:00Z");
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<from)return 0;
 return Math.floor((to-from)/86400000)+1;
}

type ReplenishmentMetricRead = { value: number | null; minorUnits: bigint | null; status: EvidenceStatus; metric: MetricSnapshot | null };

function readReplenishmentMetric(args: {
  metric: MetricSnapshot;
  unit: string;
  expectedQuantityUnit: string;
  asOf: string;
  period: EvidencePeriod;
  soldQuantityMetricId: string;
  index: Map<string, MetricSnapshot>;
  warnings: string[];
}): ReplenishmentMetricRead {
  const { metric, unit, expectedQuantityUnit, asOf, period, soldQuantityMetricId, index, warnings } = args;
  const source = index.get(metric.id);
  if (!source) return { value: null, minorUnits: null, status: "UNVERIFIED", metric: null };
  if (
    source.status !== "VERIFIED" ||
    source.completeness !== "COMPLETE" ||
    source.quality !== "ACCEPTABLE" ||
    source.asOf !== asOf ||
    source.unit !== unit ||
    !source.lineage.evidenceIds.length
  ) {
    return {
      value: null,
      minorUnits: null,
      status: source.status === "VERIFIED" ? "NEEDS_REVIEW" : source.status,
      metric: source,
    };
  }
  if (unit === "QUANTITY") {
    if (!expectedQuantityUnit || !source.unitOfMeasure?.trim()) {
      warnings.push("QUANTITY_UOM_MISSING");
      return { value: null, minorUnits: null, status: "NEEDS_REVIEW", metric: source };
    }
    if (source.unitOfMeasure.trim() !== expectedQuantityUnit) {
      warnings.push("QUANTITY_UOM_MISMATCH");
      return { value: null, minorUnits: null, status: "UNVERIFIED", metric: source };
    }
  }
  const hasWrongSoldPeriod = metric.id === soldQuantityMetricId &&
    (!source.period || source.period.from !== period.from || source.period.to !== period.to);
  const hasWrongQuantityPeriod = unit === "QUANTITY" && Boolean(source.period) &&
    (source.period!.from !== period.from || source.period!.to !== period.to);
  const hasPeriodOnDayMetric = unit === "DAYS" && source.period !== null;
  if (hasWrongSoldPeriod || hasWrongQuantityPeriod || hasPeriodOnDayMetric) {
    return { value: null, minorUnits: null, status: "NEEDS_REVIEW", metric: source };
  }
  // The source aggregate is NUMERIC(18,3); six fractional places preserve it
  // without float conversion and leave deterministic headroom for calculations.
  const minorUnits = decimalToMinorUnits(source.value, 6);
  const value = minorUnits === null ? null : minorUnitsToNumber(minorUnits, 6);
  if (minorUnits === null || value === null) {
    warnings.push("METRIC_DECIMAL_PRECISION_OR_RANGE_INVALID");
    return { value: null, minorUnits: null, status: "NEEDS_REVIEW", metric: source };
  }
  return { value, minorUnits, status: "VERIFIED", metric: source };
}

export function buildReplenishmentRecommendations(input:{
 id:string;asOf:string;period:EvidencePeriod;evidenceRecords:EvidenceRecord[];products:ReplenishmentProductInput[];
}):{id:string;asOf:string;period:EvidencePeriod;recommendations:ReplenishmentRecommendation[]} {
 if(!Number.isFinite(Date.parse(input.asOf)))throw new Error("asOf must be valid");
 const periodDays=dayCount(input.period);if(periodDays<1)throw new Error("invalid period");
 const metrics=input.products.flatMap(p=>[p.availableToPromise,p.reorderPoint,p.soldQuantityWindow,p.supplierLeadTimeDays,p.incomingPurchaseQuantity,...(p.minimumOrderQuantity?[p.minimumOrderQuantity]:[]),...(p.orderMultiple?[p.orderMultiple]:[])]);
 const passport=buildEvidencePassport({id:"replenishment:"+input.asOf,generatedAt:input.asOf,asOf:input.asOf,evidenceRecords:input.evidenceRecords,metrics});
 const counts=new Map<string,number>();for(const m of passport.metrics)counts.set(m.id,(counts.get(m.id)??0)+1);
 const index=new Map<string,MetricSnapshot>();for(const m of passport.metrics)if(counts.get(m.id)===1)index.set(m.id,m);
 const recommendations:ReplenishmentRecommendation[]=input.products.map((product):ReplenishmentRecommendation=>{
  const warnings:string[]=[],expectedQuantityUnit=typeof product.quantityUnit==="string"?product.quantityUnit.trim():"",evidenceIds=[...new Set(metrics.filter(m=>[product.availableToPromise.id,product.reorderPoint.id,product.soldQuantityWindow.id,product.supplierLeadTimeDays.id,product.incomingPurchaseQuantity.id,product.minimumOrderQuantity?.id,product.orderMultiple?.id].includes(m.id)).flatMap(m=>m.lineage.evidenceIds))];
  const read = (metric: MetricSnapshot, unit: string) => readReplenishmentMetric({
    metric,
    unit,
    expectedQuantityUnit,
    asOf: input.asOf,
    period: input.period,
    soldQuantityMetricId: product.soldQuantityWindow.id,
    index,
    warnings,
  });
  const atp = read(product.availableToPromise, "QUANTITY");
  const rop = read(product.reorderPoint, "QUANTITY");
  const sold = read(product.soldQuantityWindow, "QUANTITY");
  const lead = read(product.supplierLeadTimeDays, "DAYS");
  const incoming = read(product.incomingPurchaseQuantity, "QUANTITY");
  const optional = [
    product.minimumOrderQuantity ? read(product.minimumOrderQuantity, "QUANTITY") : null,
    product.orderMultiple ? read(product.orderMultiple, "QUANTITY") : null,
  ];
  const required=[atp,rop,sold,lead,incoming],bad=required.find(r=>r.status!=="VERIFIED")??optional.find(r=>r&&r.status!=="VERIFIED");
  if(bad){warnings.push("REQUIRED_OR_CONFIGURED_INPUT_NOT_VERIFIED");return {
   productRef:product.productRef,status:bad.status,action:"WITHHELD",quantityUnit:null,availableToPromise:atp.value,incomingPurchaseQuantity:incoming.value,coveredAfterIncoming:null,reorderPoint:rop.value,dailyDemand:null,leadTimeDemand:null,targetStock:null,
   recommendedQuantity:null,formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  }}
  if(required.some(r=>r.value===null)||optional.some(r=>r&&r.value===null)){warnings.push("UNKNOWN_INPUT");return {
   productRef:product.productRef,status:"NEEDS_REVIEW",action:"WITHHELD",quantityUnit:null,availableToPromise:atp.value,incomingPurchaseQuantity:incoming.value,coveredAfterIncoming:null,reorderPoint:rop.value,dailyDemand:null,leadTimeDemand:null,targetStock:null,
   recommendedQuantity:null,formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  }}
  const atpMinor=atp.minorUnits as bigint,ropMinor=rop.minorUnits as bigint,soldMinor=sold.minorUnits as bigint,
   leadDaysMinor=lead.minorUnits as bigint,incomingMinor=incoming.minorUnits as bigint;
  const soldValue=minorUnitsToNumber(soldMinor,6);
  const dailyDemand=soldValue===null?null:soldValue/periodDays;
  // Round demand upward to the source precision before subtracting stock, so the recommendation cannot understate lead-time need.
  const leadDemandMinor=ceilDivNonNegative(soldMinor*leadDaysMinor,BigInt(periodDays)*1_000_000n);
  const targetMinor=ropMinor>leadDemandMinor?ropMinor:leadDemandMinor;
  const coveredMinor=atpMinor+incomingMinor;
  let recommendedMinor=targetMinor>coveredMinor?targetMinor-coveredMinor:0n;
  const minimumMinor=optional[0]?.minorUnits??0n,multipleMinor=optional[1]?.minorUnits??null;
  if(minimumMinor>0n&&recommendedMinor>0n&&recommendedMinor<minimumMinor)recommendedMinor=minimumMinor;
  if(multipleMinor!==null&&multipleMinor>0n&&recommendedMinor>0n)
   recommendedMinor=ceilDivNonNegative(recommendedMinor,multipleMinor)*multipleMinor;
  const leadDemand=minorUnitsToNumber(leadDemandMinor,6);
  const target=minorUnitsToNumber(targetMinor,6);
  const coveredAfterIncoming=minorUnitsToNumber(coveredMinor,6);
  const recommended=minorUnitsToNumber(recommendedMinor,6);
  const safe=[dailyDemand,leadDemand,target,coveredAfterIncoming,recommended].every(n=>n!==null&&Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER);
  if(!safe){warnings.push("RECOMMENDED_QUANTITY_OVERFLOW");return {
   productRef:product.productRef,status:"NEEDS_REVIEW",action:"WITHHELD",quantityUnit:null,availableToPromise:atp.value,incomingPurchaseQuantity:incoming.value,coveredAfterIncoming:null,reorderPoint:rop.value,dailyDemand:null,leadTimeDemand:null,targetStock:null,
   recommendedQuantity:null,formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  }}
  return {
   productRef:product.productRef,status:"VERIFIED",action:(recommended as number)>0?"RECOMMEND":"NO_ACTION",
   quantityUnit:expectedQuantityUnit,availableToPromise:atp.value,incomingPurchaseQuantity:incoming.value,coveredAfterIncoming:coveredAfterIncoming as number,reorderPoint:rop.value,dailyDemand:dailyDemand as number,leadTimeDemand:leadDemand as number,targetStock:target as number,recommendedQuantity:recommended as number,
   formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  };
 });
 return {id:input.id,asOf:input.asOf,period:input.period,recommendations};
}
