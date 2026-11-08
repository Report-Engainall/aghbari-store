import {buildEvidencePassport} from "./evidence-passport";
import {decimalToMinorUnits,minorUnitsToNumber} from "./financial-precision";
import type {DataCompleteness,DataQuality,EvidencePeriod,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";

export interface CashflowScheduledEntry {id:string;direction:"INFLOW"|"OUTFLOW";dueDate:string;amount:MetricSnapshot}
export interface BuildCashflowForecastInput {
 id:string;generatedAt:string;asOf:string;evidenceRecords:EvidenceRecord[];openingBalances:MetricSnapshot[];
 entries:CashflowScheduledEntry[];scheduleStatus:EvidenceStatus;scheduleCompleteness:DataCompleteness;scheduleQuality:DataQuality;
}
export interface CashflowForecastPoint {
 currency:string;horizonDays:7|30|90;period:EvidencePeriod;asOf:string;openingBalance:number|null;
 knownInflows:number|null;knownOutflows:number|null;projectedBalance:number|null;status:EvidenceStatus;scheduleComplete:boolean;
 formulaId:string;formulaVersion:string;evidenceIds:string[];formulaVersions:string[];warnings:string[];
}
export interface CashflowForecast {id:string;generatedAt:string;asOf:string;points:CashflowForecastPoint[];warnings:string[]}
const FORMULA_ID="cashflow.scheduled-net",FORMULA_VERSION="1.1.0";
function addDays(day:string,days:number):string {const d=new Date(day+"T00:00:00.000Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function parseDay(day:string):string|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const d=new Date(day+"T00:00:00.000Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day?day:null;
}
function statusOf(status:EvidenceStatus,completeness:DataCompleteness,quality:DataQuality):EvidenceStatus {
 if(status==="UNVERIFIED"||quality==="INVALID")return "UNVERIFIED";
 if(status==="UNAVAILABLE")return "UNAVAILABLE";
 if(status==="NEEDS_REVIEW"||completeness!=="COMPLETE"||quality!=="ACCEPTABLE")return "NEEDS_REVIEW";
 return "VERIFIED";
}
function resolveCashflowPointStatus(
 opening:MetricSnapshot|undefined,
 openingValid:boolean,
 complete:boolean,
 scheduleStatus:EvidenceStatus,
):EvidenceStatus {
 if(!opening){
  if(complete)return "UNAVAILABLE";
  if(scheduleStatus==="UNVERIFIED")return "UNVERIFIED";
  if(scheduleStatus==="UNAVAILABLE")return "UNAVAILABLE";
  return "NEEDS_REVIEW";
 }
 if(!openingValid){
  if(opening.status==="UNVERIFIED")return "UNVERIFIED";
  if(opening.status==="UNAVAILABLE")return "UNAVAILABLE";
  return "NEEDS_REVIEW";
 }
 if(!complete)return scheduleStatus==="VERIFIED"?"NEEDS_REVIEW":scheduleStatus;
 return "VERIFIED";
}

/** Forecasts scheduled movements only; no probability, sales extrapolation or assumed collection rate. */
export function buildCashflowForecast(input:BuildCashflowForecastInput):CashflowForecast {
 if(!Number.isFinite(Date.parse(input.generatedAt))||!Number.isFinite(Date.parse(input.asOf)))throw new Error("generatedAt and asOf must be valid timestamps");
 const day=new Date(Date.parse(input.asOf)).toISOString().slice(0,10);if(!parseDay(day))throw new Error("asOf must contain an ISO date");
 const metrics=[...input.openingBalances,...input.entries.map(e=>e.amount)];
 const passport=buildEvidencePassport({id:"cashflow:"+input.asOf,generatedAt:input.generatedAt,asOf:input.asOf,evidenceRecords:input.evidenceRecords,metrics});
 const duplicates=new Set<string>(),metricCounts=new Map<string,number>();
 for(const m of passport.metrics)metricCounts.set(m.id,(metricCounts.get(m.id)??0)+1);
 for(const [id,count] of metricCounts)if(count>1)duplicates.add(id);
 const byId=new Map<string,MetricSnapshot>();
 for(const m of passport.metrics)if(!duplicates.has(m.id))byId.set(m.id,m);
 const openingCurrencies=new Map<string,MetricSnapshot>(),duplicateOpening=new Set<string>();
 for(const raw of input.openingBalances){
  if(!raw.currency)continue;
  if(openingCurrencies.has(raw.currency))duplicateOpening.add(raw.currency);
  else openingCurrencies.set(raw.currency,byId.get(raw.id)??{...raw,status:"UNVERIFIED",warnings:[...raw.warnings,"METRIC_ID_AMBIGUOUS_OR_MISSING"]});
 }
 const validEntries=input.entries.map(entry=>{
  const metric=byId.get(entry.amount.id),dueDate=parseDay(entry.dueDate),amountMinor=metric?decimalToMinorUnits(metric.value,2):null;
  const valid=Boolean(metric&&metric.status==="VERIFIED"&&metric.unit==="CURRENCY"&&metric.currency&&metric.asOf===input.asOf&&
    metric.completeness==="COMPLETE"&&metric.quality==="ACCEPTABLE"&&metric.lineage.evidenceIds.length&&
    amountMinor!==null&&amountMinor>=0n&&dueDate&&(entry.direction==="INFLOW"||entry.direction==="OUTFLOW")&&entry.id.trim());
  return {entry,metric,dueDate,amountMinor,valid};
 });
 const duplicateEntryIds=new Set<string>(),seen=new Set<string>();
 for(const entry of input.entries){if(seen.has(entry.id))duplicateEntryIds.add(entry.id);seen.add(entry.id)}
 const scheduleStatus=statusOf(input.scheduleStatus,input.scheduleCompleteness,input.scheduleQuality);
 const result:CashflowForecastPoint[]=[],topWarnings:string[]=[];
 // Scheduled evidence may be displayed without a cash opening balance. The currency
 // is still sourced from a validated schedule metric; no opening or projected balance
 // is synthesized when the bank/cash source is absent.
 const currencies=new Set<string>([
  ...openingCurrencies.keys(),
  ...validEntries.flatMap(item=>item.valid&&item.metric?.currency?[item.metric.currency]:[]),
 ]);
 for(const currency of [...currencies].sort()){
  const opening=openingCurrencies.get(currency);
  const openingMinor=opening?decimalToMinorUnits(opening.value,2,true):null;
  const openingValue=openingMinor===null?null:minorUnitsToNumber(openingMinor,2);
  const openingValid=Boolean(opening&&!duplicateOpening.has(currency)&&opening.status==="VERIFIED"&&opening.unit==="CURRENCY"&&opening.currency===currency&&
   opening.asOf===input.asOf&&opening.completeness==="COMPLETE"&&opening.quality==="ACCEPTABLE"&&opening.lineage.evidenceIds.length>0&&openingMinor!==null&&openingValue!==null);
  const scoped=validEntries.filter(x=>(x.metric?.currency??x.entry.amount.currency)===currency);
  const badScoped=validEntries.some(x=>x.entry.amount.currency===currency&&!x.valid);
  const duplicateScoped=input.entries.some(e=>duplicateEntryIds.has(e.id)&&e.amount.currency===currency);
  const dateCoverageValid=!input.entries.some(e=>!parseDay(e.dueDate)&&(!e.amount.currency||e.amount.currency===currency));
  const hasUnclassifiedCurrency=input.entries.some(e=>!e.amount.currency?.trim());
  const complete=scheduleStatus==="VERIFIED"&&!badScoped&&!duplicateScoped&&dateCoverageValid&&!hasUnclassifiedCurrency;
  const baseWarnings=[
   ...(openingValid?[]:["OPENING_BALANCE_NOT_VERIFIED"]),
   ...(scheduleStatus==="VERIFIED"?[]:["SCHEDULE_SOURCE_NOT_COMPLETE_OR_VERIFIED"]),
   ...(badScoped?["SCHEDULE_ENTRY_NOT_VERIFIED"]:[]),
   ...(duplicateScoped?["DUPLICATE_SCHEDULE_ENTRY_ID"]:[]),
   ...(!dateCoverageValid?["INVALID_DUE_DATE"]:[]),
   ...(hasUnclassifiedCurrency?["UNSCOPED_SCHEDULE_CURRENCY"]:[]),
  ];
  for(const horizon of [7,30,90] as const){
   const end=addDays(day,horizon),window=scoped.filter(x=>x.dueDate!==null&&x.dueDate>=day&&x.dueDate<end);
   const knownInflowMinor=window.filter(x=>x.valid&&x.entry.direction==="INFLOW").reduce((sum,x)=>sum+(x.amountMinor??0n),0n);
   const knownOutflowMinor=window.filter(x=>x.valid&&x.entry.direction==="OUTFLOW").reduce((sum,x)=>sum+(x.amountMinor??0n),0n);
   const knownInflow=minorUnitsToNumber(knownInflowMinor,2);
   const knownOutflow=minorUnitsToNumber(knownOutflowMinor,2);
   const aggregatesSafe=knownInflow!==null&&knownOutflow!==null;
   const hasKnownInflows=window.some(x=>x.valid&&x.entry.direction==="INFLOW");
   const hasKnownOutflows=window.some(x=>x.valid&&x.entry.direction==="OUTFLOW");
   // The existing aggregate only proves receivable inflows; absent an independently complete
   // supplier/expense outflow schedule, a zero outflow cannot be assumed for closing cash.
   const projectedMinor=complete&&hasKnownOutflows&&openingValid&&aggregatesSafe
    ?(openingMinor as bigint)+knownInflowMinor-knownOutflowMinor:null;
   const projected=projectedMinor===null?null:minorUnitsToNumber(projectedMinor,2);
   const closingScheduleComplete=complete&&hasKnownOutflows&&aggregatesSafe&&(!openingValid||projected!==null);
   const status=resolveCashflowPointStatus(opening,openingValid,closingScheduleComplete,scheduleStatus);
   const sources=[...(opening?[opening]:[]),...window.flatMap(x=>x.metric?[x.metric]:[])];
   const evidenceIds=[...new Set(sources.flatMap(m=>m.lineage.evidenceIds))];
   const formulaVersions=[...new Set(sources.map(m=>m.lineage.formulaId+"@"+m.lineage.formulaVersion))];
   result.push({
    currency,horizonDays:horizon,period:{from:day,to:end},asOf:input.asOf,openingBalance:openingValid?openingValue:null,
    knownInflows:complete||hasKnownInflows?knownInflow:null,knownOutflows:hasKnownOutflows?knownOutflow:null,
    projectedBalance:projected,status,scheduleComplete:closingScheduleComplete,formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,
    evidenceIds,formulaVersions,warnings:[...baseWarnings,...(!aggregatesSafe?["SCHEDULE_AMOUNT_OUT_OF_RANGE"]:[]),...(!closingScheduleComplete?["OUTFLOW_SCHEDULE_NOT_VERIFIED_OR_UNAVAILABLE"]:[]),...(projectedMinor!==null&&projected===null?["PROJECTED_BALANCE_OUT_OF_RANGE"]:[]),...(projected===null?["PROJECTED_BALANCE_WITHHELD"]:[])],
   });
  }
 }
 for(const item of validEntries)if(!item.metric?.currency||!openingCurrencies.has(item.metric.currency))topWarnings.push("SCHEDULE_CURRENCY_WITHOUT_OPENING_BALANCE:"+String(item.metric?.currency??"UNKNOWN"));
 return {id:input.id,generatedAt:input.generatedAt,asOf:input.asOf,points:result,warnings:[...new Set(topWarnings)]};
}