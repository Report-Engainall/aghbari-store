import { supabase } from "@/lib/supabase";
import {buildSupplierPerformance,parseSupplierPerformanceSnapshot,type SupplierPerformanceResult,type SupplierPerformanceSnapshot} from "./supplier-performance";
export type SupplierPerformanceFetchResult=
 |{ok:true;snapshot:SupplierPerformanceSnapshot;result:SupplierPerformanceResult}
 |{ok:false;status:"DENIED"|"UNAVAILABLE"|"ERROR";message:string};
export interface FetchSupplierPerformanceInput {from:string;to:string;limit?:number;}
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function validDay(v:string):boolean {
 if(!DAY.test(v))return false;const d=new Date(v+"T00:00:00.000Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function failure(e:{code?:string}):SupplierPerformanceFetchResult {
 if(e.code==="42501"||e.code==="28000"||e.code==="PGRST301")
  return {ok:false,status:"DENIED",message:"لا تملك صلاحية قراءة مؤشرات أداء الموردين."};
 if(e.code==="PGRST202"||e.code==="42883")
  return {ok:false,status:"UNAVAILABLE",message:"محرك أداء الموردين غير متاح قبل تطبيق ترحيله."};
 return {ok:false,status:"ERROR",message:"تعذر تحميل مؤشرات أداء الموردين من سجلات المشتريات."};
}
export async function fetchSupplierPerformance(input:FetchSupplierPerformanceInput):Promise<SupplierPerformanceFetchResult> {
 const limit=input.limit??100,from=Date.parse(input.from+"T00:00:00.000Z"),to=Date.parse(input.to+"T00:00:00.000Z");
 if(!validDay(input.from)||!validDay(input.to)||input.from>input.to||(to-from)/86400000>730||
  !Number.isInteger(limit)||limit<1||limit>200)
  return {ok:false,status:"ERROR",message:"الفترة أو حد الموردين غير صالح."};
 const {data,error}=await supabase.rpc("fetch_supplier_performance_snapshot",{p_from:input.from,p_to:input.to,p_limit:limit});
 if(error)return failure(error);
 const snapshot=parseSupplierPerformanceSnapshot(data);
 if(!snapshot)return {ok:false,status:"ERROR",message:"استجابة أداء الموردين لا تطابق عقد المصدر؛ لم تُستخدم بيانات بديلة."};
 return {ok:true,snapshot,result:buildSupplierPerformance(snapshot)};
}
