import { supabase } from "@/lib/supabase";
import {
  parseTaskQualityMetrics,
  type TaskQualityMetrics,
  type TaskQualityActionability,
  type TaskQualityAlertVerdict,
  type TaskQualityDisposition,
  type TaskQualityReasonCode,
  type TaskQualityReviewType,
} from "./task-quality-reviews";

export interface RecordTaskQualityReviewInput {
  taskId:string;taskUpdatedAt:string;reviewType:TaskQualityReviewType;
  actionability?:TaskQualityActionability;disposition?:TaskQualityDisposition;alertVerdict?:TaskQualityAlertVerdict;
  reasonCode?:TaskQualityReasonCode;reasonNote?:string;decisionOutcomeId?:string;
  eventId?:string;idempotencyKey?:string;
}
export interface TaskQualityReviewEvent {
  id:string;eventId:string;taskId:string;decisionOutcomeId:string|null;reviewType:TaskQualityReviewType;
  actionability:TaskQualityActionability|null;disposition:TaskQualityDisposition|null;
  alertVerdict:TaskQualityAlertVerdict|null;reasonCode:TaskQualityReasonCode|null;createdAt:string;
}
export type TaskQualityReviewResult =
 | {ok:true;duplicate:boolean;event:TaskQualityReviewEvent}
 | {ok:false;status:"DENIED"|"STALE"|"CONFLICT"|"UNAVAILABLE"|"ERROR";message:string};

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASONS=new Set<TaskQualityReasonCode>([
 "SOURCE_MISSING","SOURCE_INCOMPLETE","SOURCE_STALE","SOURCE_MISMATCH","ALREADY_RESOLVED",
 "DUPLICATE_RECOMMENDATION","OUT_OF_SCOPE","POLICY_CONFLICT","RESOURCE_UNAVAILABLE",
 "TIMING_NOT_APPROPRIATE","LOW_EXPECTED_IMPACT","BUDGET_CONSTRAINT","THRESHOLD_NOT_MET","OTHER",
]);
type Row=Record<string,unknown>;
function asRow(value:unknown):Row|null{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Row:null;}
function failure(error:unknown):Extract<TaskQualityReviewResult,{ok:false}>{
 const row=asRow(error),code=typeof row?.code==="string"?row.code:"";
 if(code==="42501"||code==="28000"||code==="PGRST301")return{ok:false,status:"DENIED",message:"تسجيل مراجعة جودة المهام يتطلب صلاحية مدير أو مسؤول."};
 if(code==="40001")return{ok:false,status:"STALE",message:"تغيرت المهمة منذ فتح المراجعة؛ حدّث بياناتها ثم أعد المحاولة."};
 if(code==="23505")return{ok:false,status:"CONFLICT",message:"مفتاح المراجعة استُخدم ببيانات مختلفة أو أن الحدث موجود مسبقاً."};
 if(code==="PGRST202"||code==="42883")return{ok:false,status:"UNAVAILABLE",message:"خدمة مراجعات الجودة غير متاحة قبل تطبيق ترحيلها."};
 if(code==="22023")return{ok:false,status:"ERROR",message:"رفض الخادم تصنيف المراجعة؛ تحقق من نوع المراجعة والسبب المختار."};
 return{ok:false,status:"ERROR",message:"تعذر تسجيل مراجعة الجودة من المصدر المعتمد."};
}
function validInput(input:RecordTaskQualityReviewInput):boolean{
 if(!UUID.test(input.taskId)||!Number.isFinite(Date.parse(input.taskUpdatedAt))||
   (input.decisionOutcomeId!==undefined&&!UUID.test(input.decisionOutcomeId))||
   (input.reasonNote!==undefined&&input.reasonNote.length>500)||
   (input.eventId!==undefined&&(!input.eventId.trim()||input.eventId.length>100))||
   (input.idempotencyKey!==undefined&&(!input.idempotencyKey.trim()||input.idempotencyKey.length>100)))return false;
 const needsReason=(input.reviewType==="ACTIONABILITY"&&input.actionability!=="ACTIONABLE")||
   (input.reviewType==="RECOMMENDATION_DISPOSITION"&&(input.disposition==="REJECTED"||input.disposition==="DEFERRED"))||
   (input.reviewType==="ALERT_VALIDATION"&&input.alertVerdict==="FALSE_POSITIVE");
 if(needsReason&&(!input.reasonCode||!REASONS.has(input.reasonCode)))return false;
 if(input.reasonCode==="OTHER"&&!input.reasonNote?.trim())return false;
 if(input.reasonCode!=="OTHER"&&input.reasonNote?.trim())return false;
 if(input.reviewType==="ACTIONABILITY"){
  if(!input.actionability||input.disposition||input.alertVerdict)return false;
  if(input.actionability==="ACTIONABLE"&&(input.reasonCode||input.reasonNote))return false;
  if(input.reasonCode==="THRESHOLD_NOT_MET")return false;
 }else if(input.reviewType==="RECOMMENDATION_DISPOSITION"){
  if(!input.disposition||input.actionability||input.alertVerdict)return false;
  if(input.disposition==="APPROVED"&&(input.reasonCode||input.reasonNote))return false;
  if(input.reasonCode==="THRESHOLD_NOT_MET")return false;
 }else{
  if(!input.alertVerdict||input.actionability||input.disposition)return false;
  if(input.alertVerdict!=="FALSE_POSITIVE"&&(input.reasonCode||input.reasonNote))return false;
  if(input.reasonCode&&!new Set<TaskQualityReasonCode>(["SOURCE_STALE","SOURCE_MISMATCH","ALREADY_RESOLVED","DUPLICATE_RECOMMENDATION","THRESHOLD_NOT_MET","OTHER"]).has(input.reasonCode))return false;
 }
 return true;
}

export async function recordOperationalTaskQualityReview(input:RecordTaskQualityReviewInput):Promise<TaskQualityReviewResult>{
 if(!validInput(input))return{ok:false,status:"ERROR",message:"حقول مراجعة الجودة أو سببها لا تطابق نوع المراجعة المختار."};
 try{
  const review:Record<string,unknown>={};
  if(input.actionability)review.actionability=input.actionability;
  if(input.disposition)review.disposition=input.disposition;
  if(input.alertVerdict)review.alertVerdict=input.alertVerdict;
  if(input.reasonCode)review.reasonCode=input.reasonCode;
  if(input.reasonNote?.trim())review.reasonNote=input.reasonNote.trim();
  if(input.decisionOutcomeId)review.decisionOutcomeId=input.decisionOutcomeId;
  const eventId=input.eventId??crypto.randomUUID();
  const idempotencyKey=input.idempotencyKey??crypto.randomUUID();
  const {data,error}=await supabase.rpc("record_operational_task_quality_review",{
   p_task_id:input.taskId,p_expected_task_updated_at:input.taskUpdatedAt,p_review_type:input.reviewType,
   p_review:review,p_event_id:eventId,p_idempotency_key:idempotencyKey,
  });
  if(error)return failure(error);
  const result=asRow(data),event=asRow(result?.event);
  if(!result||result.ok!==true||typeof result.duplicate!=="boolean"||!event||
    typeof event.id!=="string"||!UUID.test(event.id)||event.taskId!==input.taskId||
    event.reviewType!==input.reviewType||event.eventId!==eventId||
    event.actionability!==(input.actionability??null)||
    event.disposition!==(input.disposition??null)||
    event.alertVerdict!==(input.alertVerdict??null)||
    event.reasonCode!==(input.reasonCode??null)||
    (event.decisionOutcomeId??null)!==(input.decisionOutcomeId??null)||
    !Number.isFinite(Date.parse(String(event.createdAt)))||
    (event.decisionOutcomeId!==null&&event.decisionOutcomeId!==undefined&&
      (typeof event.decisionOutcomeId!=="string"||!UUID.test(event.decisionOutcomeId)))){
   return{ok:false,status:"ERROR",message:"استجابة مراجعة الجودة غير مكتملة؛ لم يُعرض نجاح غير مثبت."};
  }
  return{ok:true,duplicate:result.duplicate,event:{
   id:event.id,eventId:event.eventId,taskId:input.taskId,
   decisionOutcomeId:typeof event.decisionOutcomeId==="string"?event.decisionOutcomeId:null,
   reviewType:input.reviewType,actionability:input.actionability??null,disposition:input.disposition??null,
   alertVerdict:input.alertVerdict??null,reasonCode:input.reasonCode??null,createdAt:event.createdAt as string,
  }};
 }catch{return{ok:false,status:"UNAVAILABLE",message:"تعذر الاتصال بخدمة مراجعات الجودة؛ لم تُحفظ مراجعة محلية."};}
}


/**
 * Reads manager-reviewed quality evidence from its dedicated tenant-scoped RPC.
 * Permission and migration failures stay explicit; no fallback counts are invented.
 */
export async function fetchOperationalTaskQualityMetrics(): Promise<TaskQualityMetrics> {
  try {
    const { data, error } = await supabase.rpc("fetch_operational_task_quality_metrics");
    if (error) {
      const row = asRow(error);
      const code = typeof row?.code === "string" ? row.code : "";
      const message = typeof row?.message === "string" ? row.message : "";
      if (code === "42501" || code === "28000" || code === "PGRST301") {
        return { status: "RESTRICTED", reasonCode: "QUALITY_REVIEW_MANAGER_ONLY" };
      }
      if (code === "PGRST202" || code === "42883" ||
          /function .* does not exist|could not find the function/i.test(message)) {
        return { status: "UNAVAILABLE", reasonCode: "QUALITY_REVIEW_MIGRATION_PENDING" };
      }
      return { status: "UNAVAILABLE", reasonCode: "QUALITY_REVIEW_SOURCE_INVALID" };
    }
    return parseTaskQualityMetrics(data);
  } catch {
    return { status: "UNAVAILABLE", reasonCode: "QUALITY_REVIEW_SOURCE_INVALID" };
  }
}
