export interface CustomerQuotePipelineSnapshot {
  asOf:string; period:{from:string;to:string;timeZone:"UTC"}; completePopulation:true;
  totalQuotes:number; requestedForPricing:number; awaitingCustomerResponse:number;
  accepted:number; rejected:number; expired:number; sideEffects:"NONE";
}
export interface CustomerQuotePipelineResult {
  kind:"CUSTOMER_QUOTE_PIPELINE"; state:"READY"|"EMPTY";
  sourceRpc:"fetch_customer_quote_pipeline"; asOf:string;
  period:{from:string;to:string;timeZone:"UTC"};
  cohortBasis:"SALES_QUOTES.CREATED_AT"; statusAsOf:string; completePopulation:true;
  totalQuotes:number; requestedForPricing:number; awaitingCustomerResponse:number;
  accepted:number; rejected:number; expired:number; decidedCount:number;
  acceptanceRatePercent:number|null; answer:string; warnings:string[];
}
type R=Record<string,unknown>;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function object(value:unknown):R|null{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as R:null}
function validDay(value:unknown):value is string {
 if(typeof value!=="string"||!DAY.test(value))return false;
 const date=new Date(value+"T00:00:00.000Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function validTimestamp(value:unknown):value is string{return typeof value==="string"&&value.includes("T")&&Number.isFinite(Date.parse(value))}
function count(value:unknown):value is number{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0}
export function parseCustomerQuotePipelineSnapshot(value:unknown):CustomerQuotePipelineSnapshot|null {
 const raw=object(value),period=object(raw?.period);
 if(!raw||!period||!validTimestamp(raw.asOf)||!validDay(period.from)||!validDay(period.to)||period.from>period.to||
    period.timeZone!=="UTC"||raw.completePopulation!==true||raw.sideEffects!=="NONE"||
    !count(raw.totalQuotes)||!count(raw.requestedForPricing)||!count(raw.awaitingCustomerResponse)||
    !count(raw.accepted)||!count(raw.rejected)||!count(raw.expired))return null;
 const sum=raw.requestedForPricing+raw.awaitingCustomerResponse+raw.accepted+raw.rejected+raw.expired;
 if(!Number.isSafeInteger(sum)||sum!==raw.totalQuotes)return null;
 return {asOf:raw.asOf,period:{from:period.from,to:period.to,timeZone:"UTC"},completePopulation:true,
  totalQuotes:raw.totalQuotes,requestedForPricing:raw.requestedForPricing,awaitingCustomerResponse:raw.awaitingCustomerResponse,
  accepted:raw.accepted,rejected:raw.rejected,expired:raw.expired,sideEffects:"NONE"};
}
/** Acceptance is a customer decision, not an order conversion. */
export function buildCustomerQuotePipeline(snapshot:CustomerQuotePipelineSnapshot):CustomerQuotePipelineResult {
 const decidedCount=snapshot.accepted+snapshot.rejected;
 const acceptanceRatePercent=decidedCount>=3?Math.round(snapshot.accepted/decidedCount*1000)/10:null;
 const state=snapshot.totalQuotes===0?"EMPTY":"READY";
 const answer=state==="EMPTY"?"لا توجد طلبات عروض أسعار أُنشئت ضمن الفترة المحددة."
  :"ضمن فترة إنشاء العروض "+snapshot.period.from+" إلى "+snapshot.period.to+
   " UTC، توجد "+snapshot.totalQuotes+" عروض: "+snapshot.requestedForPricing+
   " بانتظار تسعير الفريق، و"+snapshot.awaitingCustomerResponse+
   " بانتظار قرار العميل، و"+snapshot.accepted+" مقبولة، و"+snapshot.rejected+
   " مرفوضة، و"+snapshot.expired+" منتهية.";
 const warnings=[
  "COHORT_BY_CREATED_AT_CURRENT_STATUS: الفترة تخص تاريخ إنشاء العرض، بينما الحالة هي الحالة الحالية كما في وقت قراءة الخادم.",
  "ACCEPTANCE_IS_NOT_ORDER_CONVERSION: قبول العميل للعرض لا يثبت إنشاء طلب بيع؛ لا يوجد رابط مصدر موثق بين sales_quotes وorders.",
  "NO_RESPONSE_TIMESTAMP: المصدر لا يوفر وقت استجابة مستقلاً؛ لم يُحسب زمن التسعير أو زمن قرار العميل.",
  ...(acceptanceRatePercent===null&&decidedCount>0?["ACCEPTANCE_RATE_WITHHELD: معدل القبول يحتاج 3 قرارات صريحة على الأقل؛ تعرض الأعداد فقط."]:[]),
 ];
 return {kind:"CUSTOMER_QUOTE_PIPELINE",state,sourceRpc:"fetch_customer_quote_pipeline",asOf:snapshot.asOf,
  period:snapshot.period,cohortBasis:"SALES_QUOTES.CREATED_AT",statusAsOf:snapshot.asOf,completePopulation:true,
  totalQuotes:snapshot.totalQuotes,requestedForPricing:snapshot.requestedForPricing,
  awaitingCustomerResponse:snapshot.awaitingCustomerResponse,accepted:snapshot.accepted,rejected:snapshot.rejected,
  expired:snapshot.expired,decidedCount,acceptanceRatePercent,answer,warnings};
}
