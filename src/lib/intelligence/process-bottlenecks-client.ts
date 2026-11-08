import { supabase } from "@/lib/supabase";
import {
  buildProcessBottlenecks, parseProcessBottleneckSnapshot,
  type ProcessBottleneckResult, type ProcessBottleneckSnapshot,
} from "./process-bottlenecks";

export type ProcessBottleneckFetchResult =
  | { ok: true; snapshot: ProcessBottleneckSnapshot; result: ProcessBottleneckResult }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };
export interface FetchProcessBottlenecksInput {
  from: string; to: string; baselineFrom?: string | null; baselineTo?: string | null;
}
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function validDay(v:string):boolean {
  if(!DAY.test(v)) return false;
  const d=new Date(v+"T00:00:00.000Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===v;
}
function failure(e:{code?:string;message?:string}):ProcessBottleneckFetchResult {
  if(e.code==="42501" || e.code==="28000" || e.code==="PGRST301")
    return {ok:false,status:"DENIED",message:"لا تملك صلاحية قراءة تحليل زمن العمليات."};
  if(e.code==="PGRST202" || e.code==="42883")
    return {ok:false,status:"UNAVAILABLE",message:"خدمة تحليل زمن العمليات غير متاحة قبل تطبيق ترحيل القسم 54."};
  return {ok:false,status:"ERROR",message:e.message || "تعذر تحميل تحليل زمن العمليات."};
}
export async function fetchProcessBottlenecks(input:FetchProcessBottlenecksInput):Promise<ProcessBottleneckFetchResult> {
  if(!validDay(input.from) || !validDay(input.to) || input.from>input.to ||
    (input.baselineFrom!=null && !validDay(input.baselineFrom)) ||
    (input.baselineTo!=null && !validDay(input.baselineTo)) ||
    ((input.baselineFrom==null)!==(input.baselineTo==null)))
    return {ok:false,status:"ERROR",message:"الفترة أو فترة المقارنة غير صالحة."};
  const {data,error}=await supabase.rpc("fetch_process_bottleneck_snapshot",{
    p_from:input.from,p_to:input.to,p_baseline_from:input.baselineFrom??null,p_baseline_to:input.baselineTo??null,
  });
  if(error) return failure(error);
  const snapshot=parseProcessBottleneckSnapshot(data);
  if(!snapshot) return {ok:false,status:"ERROR",message:"استجابة تحليل العمليات ناقصة أو لا تطابق عقد المصدر؛ لم تُنشأ بيانات بديلة."};
  return {ok:true,snapshot,result:buildProcessBottlenecks(snapshot)};
}
