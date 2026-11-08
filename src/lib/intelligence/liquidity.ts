import {buildEvidencePassport} from "./evidence-passport";
import type {DataCompleteness,EvidencePeriod,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";

export interface LiquidityAgingBucketInput {bucket:string;amount:MetricSnapshot}
export interface LiquidityCurrencyInput {
 currency:string;availableBalance:MetricSnapshot|null;expectedCollections:MetricSnapshot|null;dueObligations:MetricSnapshot|null;
 overdueReceivables?:MetricSnapshot|null;stagnantStockCost?:MetricSnapshot|null;receivableAging?:LiquidityAgingBucketInput[];
}
export interface BuildLiquidityInput {id:string;generatedAt:string;asOf:string;period:EvidencePeriod;evidenceRecords:EvidenceRecord[];currencies:LiquidityCurrencyInput[]}
export interface LiquidityLineage {metricIds:string[];evidenceIds:string[];formulaVersions:string[]}
export interface LiquidityMetricEvidence {
 key:string;label:string;metricId:string|null;metricKey:string|null;status:EvidenceStatus;currency:string;
 sourceCurrency:string|null;sourceAsOf:string|null;sourcePeriod:EvidencePeriod|null;calculatedAt:string|null;
 formulaId:string|null;formulaVersion:string|null;evidenceIds:string[];sources:EvidenceRecord[];warnings:string[];
}
export interface LiquidityPosition {
 currency:string;asOf:string;period:EvidencePeriod;
 /** Status/completeness describe netAvailableLiquidity only; field statuses below govern each component amount. */
 status:EvidenceStatus;completeness:DataCompleteness;
 availableBalance:number|null;availableBalanceStatus:EvidenceStatus;
 expectedCollections:number|null;expectedCollectionsStatus:EvidenceStatus;
 overdueReceivables:number|null;overdueReceivablesStatus:EvidenceStatus;
 dueObligations:number|null;dueObligationsStatus:EvidenceStatus;
 netAvailableLiquidity:number|null;stagnantStockExposure:number|null;stagnantStockExposureStatus:EvidenceStatus;
 receivableAging:Array<{bucket:string;amount:number|null;status:EvidenceStatus;warnings:string[]}>;
 metricEvidence:LiquidityMetricEvidence[];
 formulaId:string;formulaVersion:string;lineage:LiquidityLineage;warnings:string[];
}
export interface LiquiditySnapshot {id:string;generatedAt:string;asOf:string;period:EvidencePeriod;positions:LiquidityPosition[];warnings:string[]}
interface MetricValue {value:number|null;status:EvidenceStatus;warnings:string[]}
const FORMULA_ID="liquidity.net-available";
const FORMULA_VERSION="1.0.0";
function numeric(value:number|string|null):number|null {
 if(typeof value==="number")return Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER?value:null;
 if(typeof value!=="string"||! /^-?\d+(?:\.\d+)?$/.test(value.trim()))return null;
 const n=Number(value);return Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER?n:null;
}
function metricValue(metric:MetricSnapshot|null|undefined,index:Map<string,MetricSnapshot>,currency:string,asOf:string,period:EvidencePeriod,allowNegative=false):MetricValue {
 if(!metric)return {value:null,status:"UNAVAILABLE",warnings:["METRIC_NOT_SUPPLIED"]};
 const verified=index.get(metric.id);
 if(!verified)return {value:null,status:"UNVERIFIED",warnings:["METRIC_ID_AMBIGUOUS_OR_MISSING"]};
 if(verified.status!=="VERIFIED")return {value:null,status:verified.status,warnings:[...verified.warnings,"METRIC_NOT_VERIFIED"]};
 if(verified.unit!=="CURRENCY"||verified.currency!==currency)return {value:null,status:"UNVERIFIED",warnings:["CURRENCY_OR_UNIT_MISMATCH"]};
 if(verified.asOf!==asOf)return {value:null,status:"NEEDS_REVIEW",warnings:["AS_OF_MISMATCH"]};
 if(!verified.period||verified.period.from!==period.from||verified.period.to!==period.to)return {value:null,status:"NEEDS_REVIEW",warnings:["PERIOD_MISMATCH"]};
 const value=numeric(verified.value);
 if(value===null)return {value:null,status:"NEEDS_REVIEW",warnings:["UNKNOWN_AMOUNT"]};
 if(!allowNegative&&value<0)return {value:null,status:"NEEDS_REVIEW",warnings:["NEGATIVE_AMOUNT_NOT_ALLOWED"]};
 return {value,status:"VERIFIED",warnings:[]};
}
function statusOf(values:MetricValue[]):EvidenceStatus {
 if(values.some(v=>v.status==="UNVERIFIED"))return "UNVERIFIED";
 if(values.some(v=>v.status==="NEEDS_REVIEW"))return "NEEDS_REVIEW";
 if(values.some(v=>v.status==="UNAVAILABLE"))return "UNAVAILABLE";
 return "VERIFIED";
}
function allMetricInputs(p:LiquidityCurrencyInput):MetricSnapshot[] {
 return [p.availableBalance,p.expectedCollections,p.dueObligations,p.overdueReceivables,p.stagnantStockCost,...(p.receivableAging??[]).map(x=>x.amount)]
  .filter((metric):metric is MetricSnapshot=>metric!==null&&metric!==undefined);
}
function buildMetricEvidence(args:{
 key:string;label:string;metric:MetricSnapshot|null|undefined;status:EvidenceStatus;warnings:string[];
 currency:string;index:Map<string,MetricSnapshot>;evidenceRecords:EvidenceRecord[];evidenceCounts:Map<string,number>;
}):LiquidityMetricEvidence {
 const {key,label,metric,status,warnings,currency,index,evidenceRecords,evidenceCounts}=args;
 if(!metric)return {
  key,label,metricId:null,metricKey:null,status,currency,sourceCurrency:null,sourceAsOf:null,sourcePeriod:null,
  calculatedAt:null,formulaId:null,formulaVersion:null,evidenceIds:[],sources:[],
  warnings:[...new Set(warnings)],
 };
 const sourceMetric=index.get(metric.id)??metric;
 const evidenceIds=[...new Set(sourceMetric.lineage?.evidenceIds??[])];
 const sources=evidenceIds.flatMap(id=>{
  if(evidenceCounts.get(id)!==1)return [];
  const record=evidenceRecords.find(item=>item.id===id);
  return record?[record]:[];
 });
 const unresolved=evidenceIds.some(id=>evidenceCounts.get(id)!==1);
 return {
  key,label,metricId:sourceMetric.id,metricKey:sourceMetric.key,status,currency,
  sourceCurrency:sourceMetric.currency??null,sourceAsOf:sourceMetric.asOf??null,
  sourcePeriod:sourceMetric.period??null,calculatedAt:sourceMetric.lineage?.calculatedAt??null,
  formulaId:sourceMetric.lineage?.formulaId??null,formulaVersion:sourceMetric.lineage?.formulaVersion??null,
  evidenceIds,sources,
  warnings:[...new Set([...warnings,...(sourceMetric.warnings??[]),...(unresolved?["SOURCE_EVIDENCE_REFERENCE_UNRESOLVED_OR_AMBIGUOUS"]:[])])],
 };
}
/** Computes reconciled liquidity independently by currency; this engine contains no FX conversion. */
export function buildLiquiditySnapshot(input:BuildLiquidityInput):LiquiditySnapshot {
 if(!Number.isFinite(Date.parse(input.generatedAt))||!Number.isFinite(Date.parse(input.asOf)))throw new Error("generatedAt and asOf must be valid timestamps");
 const all=input.currencies.flatMap(allMetricInputs);
 const passport=buildEvidencePassport({id:"liquidity:"+input.asOf,generatedAt:input.generatedAt,asOf:input.asOf,evidenceRecords:input.evidenceRecords,metrics:all});
 const idCounts=new Map<string,number>();for(const m of passport.metrics)idCounts.set(m.id,(idCounts.get(m.id)??0)+1);
 const index=new Map<string,MetricSnapshot>();for(const m of passport.metrics)if(idCounts.get(m.id)===1)index.set(m.id,m);
 const evidenceCounts=new Map<string,number>();for(const record of input.evidenceRecords)evidenceCounts.set(record.id,(evidenceCounts.get(record.id)??0)+1);
 const currencyCounts=new Map<string,number>();for(const p of input.currencies)currencyCounts.set(p.currency,(currencyCounts.get(p.currency)??0)+1);
 const warnings:string[]=[];
 const positions=input.currencies.map(position=>{
  const duplicate=(currencyCounts.get(position.currency)??0)>1;
  const available=metricValue(position.availableBalance,index,position.currency,input.asOf,input.period,true);
  const collections=metricValue(position.expectedCollections,index,position.currency,input.asOf,input.period);
  const obligations=metricValue(position.dueObligations,index,position.currency,input.asOf,input.period);
  const required=[available,collections,obligations],baseStatus=statusOf(required);
  const rawNet=!duplicate&&baseStatus==="VERIFIED"&&available.value!==null&&collections.value!==null&&obligations.value!==null?
   available.value+collections.value-obligations.value:null;
  const arithmeticUnsafe=rawNet!==null&&(!Number.isFinite(rawNet)||Math.abs(rawNet)>Number.MAX_SAFE_INTEGER);
  const status:EvidenceStatus=arithmeticUnsafe?"NEEDS_REVIEW":duplicate&&baseStatus==="VERIFIED"?"NEEDS_REVIEW":baseStatus;
  const net=arithmeticUnsafe?null:rawNet;
  const overdue=metricValue(position.overdueReceivables,index,position.currency,input.asOf,input.period);
  const stock=metricValue(position.stagnantStockCost,index,position.currency,input.asOf,input.period);
  const aging=(position.receivableAging??[]).map(item=>{
   const value=metricValue(item.amount,index,position.currency,input.asOf,input.period);
   return {bucket:item.bucket,amount:value.value,status:value.status,warnings:value.warnings};
  });
  const metricEvidence=[
   buildMetricEvidence({key:"availableBalance",label:"الرصيد النقدي/المصرفي المتاح",metric:position.availableBalance,status:available.status,warnings:available.warnings,currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts}),
   buildMetricEvidence({key:"expectedCollections",label:"التحصيلات المتوقعة",metric:position.expectedCollections,status:collections.status,warnings:collections.warnings,currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts}),
   buildMetricEvidence({key:"dueObligations",label:"الالتزامات المستحقة",metric:position.dueObligations,status:obligations.status,warnings:obligations.warnings,currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts}),
   buildMetricEvidence({key:"overdueReceivables",label:"الذمم المتأخرة",metric:position.overdueReceivables,status:overdue.status,warnings:overdue.warnings,currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts}),
   buildMetricEvidence({key:"stagnantStockCost",label:"تكلفة المخزون الراكد المثبتة",metric:position.stagnantStockCost,status:stock.status,warnings:stock.warnings,currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts}),
   ...(position.receivableAging??[]).map((item,i)=>buildMetricEvidence({
    key:"receivableAging:"+i,label:"أعمار الذمم · "+item.bucket,metric:item.amount,status:aging[i].status,warnings:aging[i].warnings,
    currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts,
   })),
  ];
  const metricList=allMetricInputs(position),metricIds=[...new Set(metricList.map(m=>m.id))];
  const evidenceIds=[...new Set(metricList.flatMap(m=>m.lineage.evidenceIds))];
  const formulaVersions=[...new Set(metricList.map(m=>m.lineage.formulaId+"@"+m.lineage.formulaVersion))];
  const positionWarnings=[
   ...(duplicate?["DUPLICATE_CURRENCY_POSITION"]:[]),...(arithmeticUnsafe?["LIQUIDITY_ARITHMETIC_OVERFLOW"]:[]),
   ...available.warnings,...collections.warnings,...obligations.warnings,
   ...overdue.warnings,...stock.warnings,...aging.flatMap((a,i)=>a.status==="VERIFIED"?[]:["AGING_BUCKET_"+(i+1)+"_NOT_VERIFIED"]),
  ];
  warnings.push(...positionWarnings.map(w=>position.currency+":"+w));
  return {
   currency:position.currency,asOf:input.asOf,period:input.period,status,completeness:status==="VERIFIED"?"COMPLETE" as const:"PARTIAL" as const,
   availableBalance:available.value,availableBalanceStatus:available.status,
   expectedCollections:collections.value,expectedCollectionsStatus:collections.status,
   overdueReceivables:overdue.value,overdueReceivablesStatus:overdue.status,
   dueObligations:obligations.value,dueObligationsStatus:obligations.status,
   netAvailableLiquidity:duplicate?null:net,stagnantStockExposure:stock.value,stagnantStockExposureStatus:stock.status,
   receivableAging:aging,metricEvidence,
   formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,lineage:{metricIds,evidenceIds,formulaVersions},warnings:positionWarnings,
  };
 });
 return {id:input.id,generatedAt:input.generatedAt,asOf:input.asOf,period:input.period,positions,warnings:[...new Set(warnings)]};
}
