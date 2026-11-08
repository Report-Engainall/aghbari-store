import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {recordOperationalTaskQualityReview} from "@/lib/intelligence/task-quality-reviews-client";
import {fetchDecisionOutcomes,type DecisionOutcomeView} from "@/lib/intelligence/decision-outcome-client";
import type {TaskQualityActionability,TaskQualityAlertVerdict,TaskQualityDisposition,TaskQualityReasonCode,TaskQualityReviewType} from "@/lib/intelligence/task-quality-reviews";

export interface TaskQualityReviewFormProps{taskId:string;taskUpdatedAt:string;decisionOutcomeId?:string;onSaved?:()=>void|Promise<void>}
const reasonLabels:Record<TaskQualityReasonCode,string>={"SOURCE_MISSING":"دليل المصدر غير موجود","SOURCE_INCOMPLETE":"بيانات المصدر غير مكتملة","SOURCE_STALE":"بيانات المصدر قديمة","SOURCE_MISMATCH":"عدم تطابق مع المصدر","ALREADY_RESOLVED":"المهمة حُلّت بالفعل","DUPLICATE_RECOMMENDATION":"توصية مكررة","OUT_OF_SCOPE":"خارج النطاق التشغيلي","POLICY_CONFLICT":"تعارض مع سياسة معتمدة","RESOURCE_UNAVAILABLE":"الموارد غير متاحة","TIMING_NOT_APPROPRIATE":"التوقيت غير مناسب","LOW_EXPECTED_IMPACT":"الأثر المتوقع منخفض","BUDGET_CONSTRAINT":"قيد الميزانية","THRESHOLD_NOT_MET":"الحد المعتمد لم يتحقق","OTHER":"سبب آخر موضح"};
const commonReasons:TaskQualityReasonCode[]=["SOURCE_MISSING","SOURCE_INCOMPLETE","SOURCE_STALE","SOURCE_MISMATCH","ALREADY_RESOLVED","DUPLICATE_RECOMMENDATION","OUT_OF_SCOPE","POLICY_CONFLICT","RESOURCE_UNAVAILABLE","TIMING_NOT_APPROPRIATE","LOW_EXPECTED_IMPACT","BUDGET_CONSTRAINT","OTHER"];
const alertReasons:TaskQualityReasonCode[]=["SOURCE_STALE","SOURCE_MISMATCH","ALREADY_RESOLVED","DUPLICATE_RECOMMENDATION","THRESHOLD_NOT_MET","OTHER"];
export function TaskQualityReviewForm({taskId,taskUpdatedAt,decisionOutcomeId,onSaved}:TaskQualityReviewFormProps){
 const [reviewType,setReviewType]=useState<TaskQualityReviewType>("ACTIONABILITY");
 const [actionability,setActionability]=useState<TaskQualityActionability>("ACTIONABLE");
 const [disposition,setDisposition]=useState<TaskQualityDisposition>("APPROVED");
 const [alertVerdict,setAlertVerdict]=useState<TaskQualityAlertVerdict>("TRUE_POSITIVE");
 const [reasonCode,setReasonCode]=useState<TaskQualityReasonCode|"">("");
 const [reasonNote,setReasonNote]=useState("");
 const [selectedDecisionOutcomeId,setSelectedDecisionOutcomeId]=useState(decisionOutcomeId??"");
 const [decisionPickerOpen,setDecisionPickerOpen]=useState(false);
 const [decisionOutcomes,setDecisionOutcomes]=useState<DecisionOutcomeView[]>([]);
 const [decisionOutcomesTotal,setDecisionOutcomesTotal]=useState(0);
 const [decisionOutcomesLoaded,setDecisionOutcomesLoaded]=useState(false);
 const [decisionOutcomesLoading,setDecisionOutcomesLoading]=useState(false);
 const [decisionOutcomesError,setDecisionOutcomesError]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
 const requestKey=useRef<{eventId:string;idempotencyKey:string}|null>(null);
 const resetRequestKey=()=>{requestKey.current=null;};
 useEffect(()=>{
  requestKey.current=null;
  setError(null);
  setMessage(null);
 },[taskId,taskUpdatedAt]);
 useEffect(()=>{
  setSelectedDecisionOutcomeId(decisionOutcomeId??"");
 },[decisionOutcomeId]);
 useEffect(()=>{
  requestKey.current=null;
 },[selectedDecisionOutcomeId]);
 async function loadDecisionOutcomes(append=false){
  if(decisionOutcomesLoading)return;
  setDecisionOutcomesLoading(true);setDecisionOutcomesError(null);
  const result=await fetchDecisionOutcomes(50,append?decisionOutcomes.length:0);
  setDecisionOutcomesLoading(false);
  if(!result.ok){setDecisionOutcomesError(result.message);return;}
  setDecisionOutcomes(current=>append?[...current,...result.items]:result.items);
  setDecisionOutcomesTotal(result.total);
  setDecisionOutcomesLoaded(true);
 }
 const linkedDecisionOutcomeId=decisionOutcomeId??(selectedDecisionOutcomeId||undefined);
 const requiresReason=(reviewType==="ACTIONABILITY"&&actionability!=="ACTIONABLE")||
  (reviewType==="RECOMMENDATION_DISPOSITION"&&(disposition==="REJECTED"||disposition==="DEFERRED"))||
  (reviewType==="ALERT_VALIDATION"&&alertVerdict==="FALSE_POSITIVE");
 const reasons=useMemo(()=>reviewType==="ALERT_VALIDATION"?alertReasons:commonReasons,[reviewType]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError(null);setMessage(null);
  requestKey.current??={eventId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()};
  const result=await recordOperationalTaskQualityReview({
   taskId,taskUpdatedAt,reviewType,
   ...(reviewType==="ACTIONABILITY"?{actionability}:{}),
   ...(reviewType==="RECOMMENDATION_DISPOSITION"?{disposition}:{}),
   ...(reviewType==="ALERT_VALIDATION"?{alertVerdict}:{}),
   ...(requiresReason&&reasonCode?{reasonCode}:{}),
   ...(requiresReason&&reasonCode==="OTHER"&&reasonNote.trim()?{reasonNote:reasonNote.trim()}:{}),
   ...(linkedDecisionOutcomeId?{decisionOutcomeId:linkedDecisionOutcomeId}:{}),
   eventId:requestKey.current.eventId,idempotencyKey:requestKey.current.idempotencyKey,
  });
  setBusy(false);
  if(!result.ok){
   setError(result.message);
   if(result.status==="STALE"||result.status==="CONFLICT")resetRequestKey();
   return;
  }
  resetRequestKey();
  setMessage(result.duplicate?"هذا التقييم محفوظ مسبقاً؛ لم تُنشأ مراجعة مكررة.":"تم تسجيل المراجعة في سجل الأدلة دون تغيير حالة المهمة.");
  setReasonCode("");setReasonNote("");
  try{await onSaved?.();}catch{setMessage("تم تسجيل المراجعة، لكن تعذر تحديث المؤشرات الآن. أعد تحميلها لاحقاً.");}
 }
 const change=(callback:()=>void)=>{resetRequestKey();callback();};
 return <form dir="rtl" onSubmit={event=>void submit(event)} className="space-y-3 rounded-lg border p-3" aria-label="مراجعة جودة المهمة">
  <div><h4 className="font-semibold">مراجعة جودة المهمة</h4><p className="mt-1 text-xs text-muted-foreground">تُحفظ المراجعة كحدث غير قابل للمحو، ولا تغيّر حالة المهمة أو تنفذ الإجراء نيابة عنك. إعادة المحاولة تحتفظ بمفتاح الطلب نفسه ما دامت بيانات المراجعة لم تتغير.</p></div>
  {decisionOutcomeId?<p className="text-xs text-muted-foreground">ستُربط هذه المراجعة بالقرار الموثق الذي حدده مصدر المهمة.</p>:<section className="space-y-2 rounded-md border p-3">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <span className="text-sm font-medium">ربط المراجعة بدورة قرار موجودة (اختياري)</span>
    <button type="button" className="rounded-md border px-3 py-1.5 text-xs" disabled={decisionOutcomesLoading} onClick={()=>{const open=!decisionPickerOpen;setDecisionPickerOpen(open);if(open&&!decisionOutcomesLoaded)void loadDecisionOutcomes(false);}}>
     {decisionPickerOpen?"إخفاء قائمة القرارات":"اختيار قرار موجود"}
    </button>
   </div>
   {decisionPickerOpen?<div className="space-y-2">
    {decisionOutcomesLoading?<p role="status" className="text-xs">جارٍ جلب القرارات المحفوظة…</p>:null}
    {decisionOutcomesError?<p role="alert" className="text-xs">{decisionOutcomesError} يمكن حفظ مراجعة الجودة دون ربط.</p>:null}
    {decisionOutcomesLoaded&&!decisionOutcomes.length&&!decisionOutcomesLoading?<p className="text-xs text-muted-foreground">لا توجد قرارات ظاهرة لهذا الحساب؛ لم يتم إنشاء معرف قرار بديل.</p>:null}
    {decisionOutcomes.length?<label className="grid gap-1 text-sm">القرار المرتبط
     <select className="rounded-md border bg-background p-2" value={selectedDecisionOutcomeId} onChange={event=>change(()=>setSelectedDecisionOutcomeId(event.target.value))}>
      <option value="">بدون ربط</option>
      {decisionOutcomes.map(item=><option key={item.id} value={item.id}>{"#"+item.id.slice(0,8)+" · "+item.state+" · "+item.expectedOutcome.slice(0,90)}</option>)}
     </select>
    </label>:null}
    {decisionOutcomes.length<decisionOutcomesTotal?<button type="button" className="rounded-md border px-3 py-1.5 text-xs" disabled={decisionOutcomesLoading} onClick={()=>void loadDecisionOutcomes(true)}>تحميل قرارات إضافية ({decisionOutcomes.length} / {decisionOutcomesTotal})</button>:null}
    {selectedDecisionOutcomeId?<p className="text-xs text-muted-foreground">سيُحفظ الربط بالمعرّف الوارد من قائمة القرارات الخادمية، ويعيد الخادم التحقق من المؤسسة والصلاحية.</p>:null}
   </div>:null}
  </section>}
  <label className="grid gap-1 text-sm">نوع المراجعة
   <select className="rounded-md border bg-background p-2" value={reviewType} onChange={event=>change(()=>{setReviewType(event.target.value as TaskQualityReviewType);setReasonCode("");setReasonNote("");})}>
    <option value="ACTIONABILITY">قابلية تنفيذ المهمة</option><option value="RECOMMENDATION_DISPOSITION">قرار التوصية</option><option value="ALERT_VALIDATION">التحقق من صحة التنبيه</option>
   </select>
  </label>
  {reviewType==="ACTIONABILITY"?<label className="grid gap-1 text-sm">التقييم
   <select className="rounded-md border bg-background p-2" value={actionability} onChange={event=>change(()=>{setActionability(event.target.value as TaskQualityActionability);setReasonCode("");setReasonNote("");})}>
    <option value="ACTIONABLE">قابلة للتنفيذ</option><option value="NOT_ACTIONABLE">غير قابلة للتنفيذ</option><option value="DEFERRED">مؤجلة</option>
   </select>
  </label>:null}
  {reviewType==="RECOMMENDATION_DISPOSITION"?<label className="grid gap-1 text-sm">قرار التوصية
   <select className="rounded-md border bg-background p-2" value={disposition} onChange={event=>change(()=>{setDisposition(event.target.value as TaskQualityDisposition);setReasonCode("");setReasonNote("");})}>
    <option value="APPROVED">مقبولة</option><option value="REJECTED">مرفوضة</option><option value="DEFERRED">مؤجلة</option>
   </select>
  </label>:null}
  {reviewType==="ALERT_VALIDATION"?<label className="grid gap-1 text-sm">نتيجة مراجعة التنبيه
   <select className="rounded-md border bg-background p-2" value={alertVerdict} onChange={event=>change(()=>{setAlertVerdict(event.target.value as TaskQualityAlertVerdict);setReasonCode("");setReasonNote("");})}>
    <option value="TRUE_POSITIVE">تنبيه صحيح</option><option value="FALSE_POSITIVE">إنذار كاذب</option><option value="NEEDS_REVIEW">يحتاج أدلة إضافية</option>
   </select>
  </label>:null}
  {requiresReason?<label className="grid gap-1 text-sm">سبب التقييم
   <select className="rounded-md border bg-background p-2" required value={reasonCode} onChange={event=>change(()=>{setReasonCode(event.target.value as TaskQualityReasonCode|"");setReasonNote("");})}>
    <option value="">اختر سبباً موحداً</option>{reasons.map(reason=><option key={reason} value={reason}>{reasonLabels[reason]}</option>)}
   </select>
  </label>:null}
  {requiresReason&&reasonCode==="OTHER"?<label className="grid gap-1 text-sm">توضيح مختصر
   <textarea className="min-h-20 rounded-md border bg-background p-2" maxLength={500} required value={reasonNote} onChange={event=>change(()=>setReasonNote(event.target.value))}/>
   <span className="text-xs text-muted-foreground">لا تضع بيانات عملاء أو معلومات شخصية أو أسراراً في هذا الحقل.</span>
  </label>:null}
  {error?<p role="alert" className="text-sm">{error}</p>:null}{message?<p role="status" className="text-sm">{message}</p>:null}
  <button type="submit" disabled={busy||!taskId||!taskUpdatedAt||(requiresReason&&(!reasonCode||(reasonCode==="OTHER"&&!reasonNote.trim())))} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">{busy?"جارٍ تسجيل المراجعة…":"حفظ المراجعة"}</button>
 </form>;
}
