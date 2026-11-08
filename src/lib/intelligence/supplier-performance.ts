export interface SupplierPerformancePeriod {from:string;to:string;timeZone:"UTC";}
export interface SupplierPerformanceOrder {
  purchaseOrderId:string;purchaseOrderNumber:string;status:"submitted"|"partially_received"|"received";
  submittedAt:string;lastReceivedAt:string|null;lineCount:number;pendingLineCount:number;
  receiptCount:number;actualLeadDays:number|null;promisedDeliveryDays:number|null;onTime:boolean|null;
}
export interface SupplierPerformanceSupplier {
  supplierId:string;supplierName:string;supplierCode:string|null;purchaseOrderCount:number;completedOrderCount:number;
  openOrderCount:number;inconsistentReceivedCount:number;backlogLineCount:number;leadTimeSampleCount:number;
  averageLeadDays:number|null;medianLeadDays:number|null;p90LeadDays:number|null;promisedDeliverySampleCount:number;
  onTimeCount:number;onTimePercent:number|null;completedWithoutPromiseCount:number;latestSubmittedAt:string;
  recentOrders:SupplierPerformanceOrder[];
}
export interface SupplierPerformanceSnapshot {
  asOf:string;period:SupplierPerformancePeriod;source:string;totalSupplierCount:number;returnedSupplierCount:number;
  resultLimit:number;completePopulation:boolean;suppliers:SupplierPerformanceSupplier[];
}
export interface SupplierPerformanceResult {
  state:"READY"|"PARTIAL"|"EMPTY";asOf:string;period:SupplierPerformancePeriod;totalSupplierCount:number;
  returnedSupplierCount:number;completePopulation:boolean;suppliers:SupplierPerformanceSupplier[];withheldReasons:string[];
}
type R=Record<string,unknown>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const SOURCE="purchase_orders + purchase_order_items + purchase_receipts + awarded supplier quote delivery terms";
const obj=(v:unknown):R|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as R:null;
const int=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const num=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
const nullableNum=(v:unknown):v is number|null=>v===null||num(v);
const txt=(v:unknown,n=180):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=n;
function day(v:unknown):v is string {
 if(typeof v!=="string"||!DAY.test(v))return false;
 const d=new Date(v+"T00:00:00.000Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
const timestamp=(v:unknown):v is string=>typeof v==="string"&&v.includes("T")&&Number.isFinite(Date.parse(v));
function parsePeriod(v:unknown):SupplierPerformancePeriod|null {
 const r=obj(v);return r&&day(r.from)&&day(r.to)&&r.from<=r.to&&r.timeZone==="UTC"?{from:r.from,to:r.to,timeZone:"UTC"}:null;
}
function parseOrder(v:unknown):SupplierPerformanceOrder|null {
 const r=obj(v);
 if(!r||typeof r.purchaseOrderId!=="string"||!UUID.test(r.purchaseOrderId)||!txt(r.purchaseOrderNumber,40)||
  !["submitted","partially_received","received"].includes(String(r.status))||!timestamp(r.submittedAt)||
  (r.lastReceivedAt!==null&&!timestamp(r.lastReceivedAt))||!int(r.lineCount)||!int(r.pendingLineCount)||r.pendingLineCount>r.lineCount||
  !int(r.receiptCount)||!nullableNum(r.actualLeadDays)||
  (r.promisedDeliveryDays!==null&&!int(r.promisedDeliveryDays))||(r.onTime!==null&&typeof r.onTime!=="boolean"))return null;
 if((r.actualLeadDays!==null&&(r.status!=="received"||r.lastReceivedAt===null||r.receiptCount===0))||
  (r.onTime!==null&&(r.promisedDeliveryDays===null||r.actualLeadDays===null)))return null;
 return {purchaseOrderId:r.purchaseOrderId,purchaseOrderNumber:r.purchaseOrderNumber,
  status:r.status as SupplierPerformanceOrder["status"],submittedAt:r.submittedAt,lastReceivedAt:r.lastReceivedAt as string|null,
  lineCount:r.lineCount,pendingLineCount:r.pendingLineCount,receiptCount:r.receiptCount,
  actualLeadDays:r.actualLeadDays as number|null,
  promisedDeliveryDays:r.promisedDeliveryDays as number|null,onTime:r.onTime as boolean|null};
}
function parseSupplier(v:unknown):SupplierPerformanceSupplier|null {
 const r=obj(v);
 if(!r||typeof r.supplierId!=="string"||!UUID.test(r.supplierId)||!txt(r.supplierName,160)||
  (r.supplierCode!==null&&!txt(r.supplierCode,80))||!int(r.purchaseOrderCount)||r.purchaseOrderCount<1||
  !int(r.completedOrderCount)||!int(r.openOrderCount)||!int(r.inconsistentReceivedCount)||!int(r.backlogLineCount)||
  !int(r.leadTimeSampleCount)||!nullableNum(r.averageLeadDays)||!nullableNum(r.medianLeadDays)||!nullableNum(r.p90LeadDays)||
  !int(r.promisedDeliverySampleCount)||!int(r.onTimeCount)||!int(r.completedWithoutPromiseCount)||
  !timestamp(r.latestSubmittedAt)||!Array.isArray(r.recentOrders)||r.recentOrders.length>5)return null;
 if(r.completedOrderCount+r.openOrderCount+r.inconsistentReceivedCount>r.purchaseOrderCount||
  r.leadTimeSampleCount>r.completedOrderCount||r.promisedDeliverySampleCount>r.leadTimeSampleCount||
  r.onTimeCount>r.promisedDeliverySampleCount||r.completedWithoutPromiseCount>r.completedOrderCount||
  (r.leadTimeSampleCount===0&&(r.averageLeadDays!==null||r.medianLeadDays!==null||r.p90LeadDays!==null))||
  (r.leadTimeSampleCount>0&&(r.averageLeadDays===null||r.medianLeadDays===null||r.p90LeadDays===null)))return null;
 const recent=r.recentOrders.map(parseOrder);
 if(recent.some(x=>x===null)||new Set((recent as SupplierPerformanceOrder[]).map(x=>x.purchaseOrderId)).size!==recent.length)return null;
 return {supplierId:r.supplierId,supplierName:r.supplierName,supplierCode:r.supplierCode as string|null,
  purchaseOrderCount:r.purchaseOrderCount,completedOrderCount:r.completedOrderCount,openOrderCount:r.openOrderCount,
  inconsistentReceivedCount:r.inconsistentReceivedCount,backlogLineCount:r.backlogLineCount,leadTimeSampleCount:r.leadTimeSampleCount,
  averageLeadDays:r.averageLeadDays as number|null,medianLeadDays:r.medianLeadDays as number|null,p90LeadDays:r.p90LeadDays as number|null,
  promisedDeliverySampleCount:r.promisedDeliverySampleCount,onTimeCount:r.onTimeCount,
  onTimePercent:r.promisedDeliverySampleCount>0?Math.round(r.onTimeCount/r.promisedDeliverySampleCount*1000)/10:null,
  completedWithoutPromiseCount:r.completedWithoutPromiseCount,latestSubmittedAt:r.latestSubmittedAt,
  recentOrders:recent as SupplierPerformanceOrder[]};
}
export function parseSupplierPerformanceSnapshot(value:unknown):SupplierPerformanceSnapshot|null {
 const r=obj(value);
 if(!r||!timestamp(r.asOf)||r.source!==SOURCE||!int(r.totalSupplierCount)||!int(r.returnedSupplierCount)||
  !int(r.resultLimit)||r.resultLimit<1||r.resultLimit>200||typeof r.completePopulation!=="boolean"||!Array.isArray(r.suppliers))return null;
 const p=parsePeriod(r.period);
 if(!p||r.returnedSupplierCount!==r.suppliers.length||r.returnedSupplierCount>r.resultLimit||
  r.returnedSupplierCount>r.totalSupplierCount||r.completePopulation!==(r.totalSupplierCount<=r.resultLimit)||
  (r.completePopulation&&r.returnedSupplierCount!==r.totalSupplierCount))return null;
 const values=r.suppliers.map(parseSupplier);
 if(values.some(x=>x===null)||new Set((values as SupplierPerformanceSupplier[]).map(x=>x.supplierId)).size!==values.length)return null;
 return {asOf:r.asOf,period:p,source:r.source,totalSupplierCount:r.totalSupplierCount,
  returnedSupplierCount:r.returnedSupplierCount,resultLimit:r.resultLimit,completePopulation:r.completePopulation,
  suppliers:values as SupplierPerformanceSupplier[]};
}
export function buildSupplierPerformance(s:SupplierPerformanceSnapshot):SupplierPerformanceResult {
 const state=s.returnedSupplierCount===0?"EMPTY":s.completePopulation?"READY":"PARTIAL";
 const reasons:string[]=[];
 if(!s.completePopulation)reasons.push("عُرضت "+s.returnedSupplierCount+" من "+s.totalSupplierCount+" مورداً؛ القائمة جزئية.");
 const completed=s.suppliers.reduce((n,x)=>n+x.completedOrderCount,0);
 const lead=s.suppliers.reduce((n,x)=>n+x.leadTimeSampleCount,0);
 const promised=s.suppliers.reduce((n,x)=>n+x.promisedDeliverySampleCount,0);
 const noPromise=s.suppliers.reduce((n,x)=>n+x.completedWithoutPromiseCount,0);
 if(completed>0&&lead===0)reasons.push("لا توجد أوامر مكتملة بشروط استلام كافية لقياس زمن التوريد.");
 if(s.suppliers.some(x=>x.leadTimeSampleCount>0&&x.leadTimeSampleCount<3))reasons.push("حُجبت مؤشرات زمن التوريد للموردين ذوي العينات الأقل من 3 أوامر.");
 if(s.suppliers.some(x=>x.promisedDeliverySampleCount>0&&x.promisedDeliverySampleCount<3))reasons.push("حُجب معدل الالتزام بالموعد للموردين ذوي العينات الأقل من 3 أوامر.");
 if(noPromise>0)reasons.push("حُجب قياس الموعد عن "+noPromise+" أمراً مكتملاً لغياب مدة توريد في عرض سعر ممنوح.");
 if(completed>0&&promised===0)reasons.push("لا توجد عينة مكتملة ذات مدة توريد موعودة؛ لم يُحسب معدل الالتزام.");
 if(s.suppliers.some(x=>x.inconsistentReceivedCount>0))reasons.push("عُزلت أوامر حالتها مستلمة لكن كمياتها أو أدلة استلامها غير مكتملة.");
 return {state,asOf:s.asOf,period:s.period,totalSupplierCount:s.totalSupplierCount,
  returnedSupplierCount:s.returnedSupplierCount,completePopulation:s.completePopulation,suppliers:s.suppliers,
  withheldReasons:[...new Set(reasons)]};
}
