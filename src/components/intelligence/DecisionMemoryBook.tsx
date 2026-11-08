import { useState } from "react";
import type { FormEvent } from "react";
import {
  saveDecisionMemorySnapshot,
} from "@/lib/intelligence/decision-memory-client";
import { buildDecisionPolicyReviewSuggestions, searchSimilarDecisionMemory } from "@/lib/intelligence/decision-memory";
import type {
  DecisionMemoryBookResult,
  DecisionMemoryRecord,
  DecisionMemoryMissingField,
  DecisionMemorySnapshot,
  DecisionMemoryReviewDisposition,
} from "@/lib/intelligence/decision-memory";
import { EvidenceReferences, EvidenceStatusLabel, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";
import { DecisionOutcomeLifecycleControls } from "./DecisionOutcomeLifecycleControls";

export interface DecisionMemoryBookProps {
  result?: DecisionMemoryBookResult | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
}
const missingLabels: Record<DecisionMemoryMissingField,string> = {
  PROBLEM_CONTEXT:"سياق المشكلة قبل القرار",FACTS_REVIEWED:"توثيق مراجعة الوقائع",FACTS_WITH_EVIDENCE:"ربط الوقائع بأدلة المصدر",
  ALTERNATIVES:"البدائل التي تمت دراستها",CHOSEN_OPTION:"الخيار الذي تم اختياره",ASSUMPTIONS_REVIEWED:"الافتراضات ومراجعتها صراحة",
  ACTION_TAKEN:"الإجراء التنفيذي الناتج عن القرار",REVIEW_DISPOSITION:"تحديد حالة المراجعة",REVIEW_DATE:"موعد المراجعة المجدول",
  EXPECTED_METRIC:"خط الأساس/الهدف المتوقع",ACTUAL_METRIC:"النتيجة الفعلية ودليلها",LESSONS_REVIEWED:"مراجعة الدروس المستفادة",
};
const states={PROPOSED:"مقترح",IN_REVIEW:"قيد المراجعة",APPROVED:"معتمد",REJECTED:"مرفوض",DEFERRED:"مؤجل",ASSIGNED:"مُعيّن",EXECUTING:"قيد التنفيذ",EXECUTED:"بانتظار القياس",MEASURED:"تم القياس"};
const eventLabels:Record<string,string>={
  CREATE:"إنشاء المقترح",SUBMIT_FOR_REVIEW:"إرسال للمراجعة",APPROVE:"اعتماد القرار",
  REJECT:"رفض القرار",DEFER:"تأجيل القرار",RESUBMIT_FOR_REVIEW:"إعادة القرار للمراجعة",
  ASSIGN:"إسناد المسؤول",START_EXECUTION:"بدء التنفيذ",COMPLETE_EXECUTION:"إكمال التنفيذ",MEASURE:"قياس النتيجة",
};
const number=(value:number)=>new Intl.NumberFormat("ar-YE",{maximumFractionDigits:2}).format(value);
function metricLine(title:string,metric:NonNullable<DecisionMemoryRecord["metricComparison"]["expected"]>){
  return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{title}</p>
    <strong>{number(metric.value)} {metric.currency??metric.unitOfMeasure??metric.unit}</strong>
    <p className="text-xs text-muted-foreground">{metric.period.from} — {metric.period.to} · حتى {metric.asOf}</p>
    <p className="text-xs">المعادلة: {metric.formulaId}@{metric.formulaVersion}</p>
    <p className="text-xs">الإثبات: <EvidenceReferences ids={metric.evidenceIds}/></p></div>;
}
const lines=(value:string)=>value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean);
function addDays(day:string,count:number){
  const value=new Date(day+"T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate()+count);
  return value.toISOString().slice(0,10);
}
function factDraft(snapshot:DecisionMemorySnapshot|null):string {
  return snapshot?.facts.map(item=>item.text+" || "+(item.sourceEvidenceIds??[]).join(",")).join("\n")??"";
}
function alternativesDraft(snapshot:DecisionMemorySnapshot|null):string {
  return snapshot?.alternatives.map(item=>(snapshot.chosenOptionId===item.id?"* ":"")+item.label+(item.rationale?" | "+item.rationale:"")).join("\n")??"";
}
function DecisionMemoryCapture({record,onRetry}:{record:DecisionMemoryRecord;onRetry?:()=>void}){
  const snapshot=record.snapshot;
  const defaultDay=record.createdAt.slice(0,10);
  const [open,setOpen]=useState(false);
  const [problem,setProblem]=useState(snapshot?.problem??"");
  const [factsText,setFactsText]=useState(factDraft(snapshot));
  const [opinionsText,setOpinionsText]=useState(snapshot?.opinions.map(item=>item.text).join("\n")??"");
  const [hypothesesText,setHypothesesText]=useState(snapshot?.hypotheses.map(item=>item.text).join("\n")??"");
  const [assumptionsText,setAssumptionsText]=useState(snapshot?.assumptions.join("\n")??"");
  const [alternativesText,setAlternativesText]=useState(alternativesDraft(snapshot));
  const [actionTaken,setActionTaken]=useState(snapshot?.actionTaken??"");
  const [reviewDisposition,setReviewDisposition]=useState<""|DecisionMemoryReviewDisposition>(snapshot?.reviewDisposition??"");
  const [reviewDate,setReviewDate]=useState(snapshot?.reviewAt?.slice(0,10)??"");
  const [periodFrom,setPeriodFrom]=useState(snapshot?.period.from??defaultDay);
  const [periodTo,setPeriodTo]=useState(snapshot?.period.to??addDays(defaultDay,30));
  const [expectedMetricKey,setExpectedMetricKey]=useState<""|"cashflow.expected_collections">(
    snapshot?.expectedMetric?.key==="cashflow.expected_collections"
      ?snapshot.expectedMetric.key:""
  );
  const [expectedCurrency,setExpectedCurrency]=useState(snapshot?.expectedMetric?.currency??"");
  const maximumPeriod=addDays(defaultDay,90);
  const [lessonsText,setLessonsText]=useState(snapshot?.lessons.join("\n")??"");
  const [factsReviewed,setFactsReviewed]=useState(snapshot?.factsReviewed??true);
  const [assumptionsReviewed,setAssumptionsReviewed]=useState(snapshot?.assumptionsReviewed??true);
  const [lessonsReviewed,setLessonsReviewed]=useState(snapshot?.lessonsReviewed??false);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [messageError,setMessageError]=useState(false);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!reviewDisposition){setMessage("حدد حالة المراجعة صراحة.");setMessageError(true);return;}
    if(!periodFrom||!periodTo||periodFrom>periodTo||periodFrom<defaultDay||periodTo>maximumPeriod){
      setMessage("فترة القياس يجب أن تبدأ من تاريخ القرار وألا تتجاوز 90 يوماً.");setMessageError(true);return;
    }
    if(Boolean(expectedMetricKey)!==Boolean(expectedCurrency.trim())){
      setMessage("حدد نوع خط الأساس والعملة معاً، أو اتركهما فارغين.");setMessageError(true);return;
    }
    if(reviewDisposition==="SCHEDULED"&&!reviewDate){
      setMessage("أدخل موعد المراجعة المجدول.");setMessageError(true);return;
    }
    if(snapshot&&!reason.trim()){
      setMessage("سبب التصحيح إلزامي للحفاظ على تاريخ الذاكرة.");setMessageError(true);return;
    }

    const facts:Array<{id:string;text:string;evidenceIds:string[]}>=[];
    for(const line of lines(factsText)){
      const split=line.indexOf("||");
      if(split<1){setMessage("كل واقعة تحتاج وصفاً ثم || ثم معرفات مصدر فعلية مثل invoice:UUID.");setMessageError(true);return;}
      const text=line.slice(0,split).trim();
      const evidenceIds=line.slice(split+2).split(",").map(item=>item.trim()).filter(Boolean);
      if(!text||!evidenceIds.length){setMessage("لا تحفظ واقعة بلا دليل مصدر محدد.");setMessageError(true);return;}
      const old=snapshot?.facts.find(item=>item.text===text&&(item.sourceEvidenceIds??[]).join(",")===evidenceIds.join(","));
      facts.push({id:old?.id??crypto.randomUUID(),text,evidenceIds});
    }

    const parseStatements=(value:string,kind:"OPINION"|"HYPOTHESIS")=>{
      const oldItems=kind==="OPINION"?snapshot?.opinions??[]:snapshot?.hypotheses??[];
      return lines(value).map(text=>({id:oldItems.find(item=>item.text===text)?.id??crypto.randomUUID(),text}));
    };
    const alternatives:Array<{id:string;label:string;rationale:string|null}>=[];
    let chosenOptionId:string|null=null;
    for(const line of lines(alternativesText)){
      const selected=line.startsWith("*");
      const value=(selected?line.slice(1):line).trim();
      const split=value.indexOf("|");
      const label=(split<0?value:value.slice(0,split)).trim();
      const rationale=split<0?"":value.slice(split+1).trim();
      if(!label){setMessage("يوجد بديل بلا وصف.");setMessageError(true);return;}
      const old=snapshot?.alternatives.find(item=>item.label===label);
      const id=old?.id??crypto.randomUUID();
      if(selected){
        if(chosenOptionId){setMessage("حدد بديلاً مختاراً واحداً فقط.");setMessageError(true);return;}
        chosenOptionId=id;
      }
      alternatives.push({id,label,rationale:rationale||null});
    }
    if(record.state!=="REJECTED"&&!chosenOptionId){
      setMessage("ضع علامة * أمام البديل الذي تم اختياره.");setMessageError(true);return;
    }

    setBusy(true);setMessage("");setMessageError(false);
    try{
      const result=await saveDecisionMemorySnapshot({
        decisionOutcomeId:record.decisionId,
        expectedVersion:record.snapshotVersion??0,
        asOf:snapshot?.asOf??record.createdAt,
        period:{from:periodFrom,to:periodTo},
        problem,
        factsReviewed,
        facts,
        opinions:parseStatements(opinionsText,"OPINION"),
        hypotheses:parseStatements(hypothesesText,"HYPOTHESIS"),
        assumptions:lines(assumptionsText),
        alternatives,
        chosenOptionId,
        assumptionsReviewed,
        actionTaken,
        reviewDisposition,
        reviewAt:reviewDisposition==="SCHEDULED"?reviewDate+"T23:59:59.000Z":null,
        expectedMetric:expectedMetricKey?{key:expectedMetricKey,currency:expectedCurrency.trim().toUpperCase()}:null,
        lessonsReviewed,
        lessons:lines(lessonsText),
        reason,
      });
      if(!result.ok){
        setMessage(result.message);setMessageError(true);
        return;
      }
      setMessage("حُفظ الإصدار "+result.version+" على الخادم"+(result.duplicate?" (إعادة طلب آمنة)":"")+".");
      setMessageError(false);
      setReason("");
      onRetry?.();
    }catch{
      setMessage("تعذر حفظ ذاكرة القرار؛ لم تُعرض نتيجة محلية كأنها محفوظة.");setMessageError(true);
    }finally{setBusy(false);}
  }

  return <section className="rounded-lg border p-3">
    <button type="button" className="text-sm font-semibold underline underline-offset-4" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
      {snapshot?"تصحيح/تحديث إصدار الذاكرة":"توثيق ذاكرة هذا القرار"}
    </button>
    {open?<form className="mt-3 space-y-3" onSubmit={submit}>
      <p className="text-xs text-muted-foreground">يُحفظ السياق على الخادم بإصدار مستقل. تاريخ «كما في» مثبت بتاريخ إنشاء القرار؛ ولا تقبل الوقائع إلا بمعرّفات فواتير/مدفوعات داخل المؤسسة الحالية.</p>
      <label className="block space-y-1 text-sm">المشكلة وسياقها
        <textarea className="w-full rounded-lg border bg-background p-2" rows={2} maxLength={2000} value={problem} onChange={event=>setProblem(event.target.value)}/>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">بداية فترة الوقائع
          <input className="w-full rounded-lg border bg-background p-2" type="date" value={periodFrom} min={defaultDay} max={maximumPeriod} onChange={event=>setPeriodFrom(event.target.value)}/>
        </label>
        <label className="block space-y-1 text-sm">نهاية فترة الوقائع
          <input className="w-full rounded-lg border bg-background p-2" type="date" value={periodTo} min={defaultDay} max={maximumPeriod} onChange={event=>setPeriodTo(event.target.value)}/>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
        <label className="block space-y-1 text-sm">خط الأساس المالي المتوقع (اختياري — يحسبه الخادم من بيانات المصدر)
          <select className="w-full rounded-lg border bg-background p-2" value={expectedMetricKey} onChange={event=>setExpectedMetricKey(event.target.value as ""|"cashflow.expected_collections")}>
            <option value="">بدون خط أساس مالي</option><option value="cashflow.expected_collections">التحصيلات المتوقعة</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">العملة
          <input className="w-full rounded-lg border bg-background p-2 font-mono uppercase" dir="ltr" maxLength={3} placeholder="YER" value={expectedCurrency} onChange={event=>setExpectedCurrency(event.target.value.toUpperCase())}/>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">عند اختيار خط الأساس، يعيد الخادم حساب المبلغ وقائمة الفواتير والمدفوعات كاملةً عند تاريخ القرار. لا يقبل رقماً أو معرّفات أدلة من المتصفح.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={factsReviewed} onChange={event=>setFactsReviewed(event.target.checked)}/> تمت مراجعة الوقائع</label>
      <label className="block space-y-1 text-sm">الوقائع المثبتة — سطر لكل واقعة بصيغة: الوصف || invoice:UUID,payment:UUID
        <textarea className="w-full rounded-lg border bg-background p-2 font-mono text-xs" dir="auto" rows={3} value={factsText} onChange={event=>setFactsText(event.target.value)} placeholder="إجمالي فاتورة ... || invoice:00000000-0000-4000-8000-000000000000"/>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">آراء الإدارة — سطر لكل رأي
          <textarea className="w-full rounded-lg border bg-background p-2" rows={3} value={opinionsText} onChange={event=>setOpinionsText(event.target.value)}/>
        </label>
        <label className="block space-y-1 text-sm">فرضيات قيد التحقق — سطر لكل فرضية
          <textarea className="w-full rounded-lg border bg-background p-2" rows={3} value={hypothesesText} onChange={event=>setHypothesesText(event.target.value)}/>
        </label>
      </div>
      <label className="block space-y-1 text-sm">الافتراضات المعلنة — سطر لكل افتراض
        <textarea className="w-full rounded-lg border bg-background p-2" rows={2} value={assumptionsText} onChange={event=>setAssumptionsText(event.target.value)}/>
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={assumptionsReviewed} onChange={event=>setAssumptionsReviewed(event.target.checked)}/> تمت مراجعة الافتراضات صراحة</label>
      <label className="block space-y-1 text-sm">البدائل — سطر لكل بديل، ابدأ المختار بعلامة *، وافصل المبرر بعلامة |
        <textarea className="w-full rounded-lg border bg-background p-2" rows={3} value={alternativesText} onChange={event=>setAlternativesText(event.target.value)} placeholder={"* تنفيذ الخيار الأول | السبب\nتأجيل التنفيذ | المخاطر"}/>
      </label>
      <label className="block space-y-1 text-sm">الإجراء التنفيذي
        <textarea className="w-full rounded-lg border bg-background p-2" rows={2} maxLength={2000} value={actionTaken} onChange={event=>setActionTaken(event.target.value)}/>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">قرار المراجعة
          <select className="w-full rounded-lg border bg-background p-2" value={reviewDisposition} onChange={event=>setReviewDisposition(event.target.value as ""|DecisionMemoryReviewDisposition)}>
            <option value="">اختر الحالة</option><option value="SCHEDULED">مجدولة</option><option value="NOT_SCHEDULED">غير مجدولة</option><option value="NOT_REQUIRED">غير مطلوبة</option>
          </select>
        </label>
        {reviewDisposition==="SCHEDULED"?<label className="block space-y-1 text-sm">موعد المراجعة
          <input className="w-full rounded-lg border bg-background p-2" type="date" min={new Date().toISOString().slice(0,10)} value={reviewDate} onChange={event=>setReviewDate(event.target.value)}/>
        </label>:null}
      </div>
      {record.state==="MEASURED"?<>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lessonsReviewed} onChange={event=>setLessonsReviewed(event.target.checked)}/> تمت مراجعة الدروس بعد القياس</label>
        <label className="block space-y-1 text-sm">الدروس المستفادة — سطر لكل درس
          <textarea className="w-full rounded-lg border bg-background p-2" rows={2} value={lessonsText} onChange={event=>setLessonsText(event.target.value)}/>
        </label>
      </>:null}
      {snapshot?<label className="block space-y-1 text-sm">سبب التصحيح (إلزامي)
        <textarea className="w-full rounded-lg border bg-background p-2" rows={2} maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/>
      </label>:null}
      {message?<p className={messageError?"text-sm text-destructive":"text-sm text-green-700"} role="status">{message}</p>:null}
      <div className="flex flex-wrap gap-2">
        <button className="btn primary" type="submit" disabled={busy}>{busy?"جارٍ الحفظ...":snapshot?"حفظ إصدار تصحيح":"حفظ ذاكرة القرار"}</button>
        <button className="btn secondary" type="button" disabled={busy} onClick={()=>setOpen(false)}>إغلاق</button>
      </div>
    </form>:null}
  </section>;
}
function DecisionMemoryCard({record,onRetry}:{record:DecisionMemoryRecord;onRetry?:()=>void}){
  return <article className="rounded-xl border p-4 space-y-3">
    <header className="flex flex-wrap items-start justify-between gap-2"><div>
      <h3 className="font-semibold">{record.proposedResult}</h3>
      <p className="text-xs text-muted-foreground" dir="ltr">{record.ruleId}@{record.ruleVersion} · {record.decisionId.slice(0,8)}</p>
      <p className="text-xs">الحالة: {states[record.state]} · الإصدار: {record.version} · المسؤول: {record.owner}</p>
    </div><span className="text-xs"><EvidenceStatusLabel status={record.memoryStatus==="VERIFIED"?"VERIFIED":record.memoryStatus==="PARTIAL"?"NEEDS_REVIEW":"UNVERIFIED"}/></span></header>
    <DecisionOutcomeLifecycleControls outcomeId={record.decisionId} state={record.state} version={record.version} ownerProfileId={record.ownerProfileId} expectedMetric={record.expectedMetric} onChanged={onRetry}/>
    {record.events.length?<section className="space-y-2 rounded-lg border p-3">
      <h4 className="text-sm font-semibold">التاريخ الإلحاقي للقرار ({record.events.length} حدث)</h4>
      <ol className="space-y-2">
        {record.events.map(event=><li key={event.id} className="border-s-2 ps-3 text-xs">
          <p><strong>{eventLabels[event.type]??event.type}</strong> · الإصدار {event.version} · {event.at} · {event.actorRole}</p>
          <p className="text-muted-foreground">{event.reason ? "السبب: " + event.reason : "لم يسجل سبب لهذا الحدث."}</p>
        </li>)}
      </ol>
    </section>:null}
    {record.problem?<section><h4 className="text-sm font-semibold">المشكلة المسجلة</h4><p className="text-sm">{record.problem}</p></section>:null}
    {record.decisionReason?<section><h4 className="text-sm font-semibold">مبرر القرار — سياق إداري لا يُعامل كحقيقة مستقلة</h4><p className="text-sm">{record.decisionReason}</p></section>:null}
    <div className="grid gap-2 sm:grid-cols-2">
      {record.facts.length?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">وقائع مثبتة ({record.facts.length})</h4>
        {record.facts.map(fact=><div key={fact.id} className="mt-2 text-sm"><p>{fact.text}</p><p className="text-xs text-muted-foreground">الدليل: <EvidenceReferences ids={fact.evidenceIds}/></p></div>)}</section>
      :record.factsReviewed?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">مراجعة الوقائع</h4><p className="text-sm">تمت المراجعة ولم تُسجل وقائع مثبتة لهذا القرار.</p></section>:null}
      {record.opinions.length?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">آراء مسجلة ({record.opinions.length})</h4>{record.opinions.map(item=><p key={item.id} className="mt-2 text-sm">{item.text}</p>)}</section>:null}
      {record.hypotheses.length?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">فرضيات قيد التحقق ({record.hypotheses.length})</h4>{record.hypotheses.map(item=><p key={item.id} className="mt-2 text-sm">{item.text}</p>)}</section>:null}
      {record.assumptions.length?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">افتراضات معلنة — ليست وقائع مثبتة ({record.assumptions.length})</h4>{record.assumptions.map((item,index)=><p key={index} className="mt-2 text-sm">{item}</p>)}</section>
        :record.assumptionsReviewed?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">مراجعة الافتراضات</h4><p className="text-sm">تمت المراجعة ولم تُسجل افتراضات.</p></section>:null}
    </div>
    {record.withheldFacts?<p className="text-xs text-amber-700">حُجبت {record.withheldFacts} واقعة لغياب دليل مكتمل أو صالح.</p>:null}
    {record.alternatives.length?<section className="space-y-1"><h4 className="text-sm font-semibold">البدائل المسجلة</h4><ul className="list-disc space-y-1 ps-5 text-sm">
      {record.alternatives.map(option=><li key={option.id}><span>{option.label}</span>{record.chosenAlternative?.id===option.id?<strong> — المختار</strong>:null}
        {option.rationale?<p className="text-xs text-muted-foreground">{option.rationale}</p>:null}
        {option.evidenceIds.length?<p className="text-xs text-muted-foreground">الإثبات: <EvidenceReferences ids={option.evidenceIds}/></p>:null}</li>)}
    </ul></section>:null}
    {record.actionTaken?<p className="text-sm"><strong>الإجراء:</strong> {record.actionTaken}</p>:null}
    <section className="space-y-2"><h4 className="text-sm font-semibold">الهدف والنتيجة المقاسة</h4>
      {record.metricComparison.status==="VERIFIED"?<>
        <div className="grid gap-2 sm:grid-cols-2">{record.metricComparison.expected?metricLine("المتوقع",record.metricComparison.expected):null}{record.metricComparison.actual?metricLine("الفعلي",record.metricComparison.actual):null}</div>
        <p className="text-sm">الفارق: {record.metricComparison.difference===null?"غير متاح":number(record.metricComparison.difference)} · التغير: {record.metricComparison.differencePercent===null?"النسبة غير معرفة لخط أساس صفري":number(record.metricComparison.differencePercent)+"%"}</p>
      </>:<>
        {record.metricComparison.actual?metricLine("النتيجة الفعلية المثبتة — دون خط أساس مقارن",record.metricComparison.actual):null}
        <p className="text-sm text-muted-foreground">المقارنة محجوبة: {record.metricComparison.reason??"لا يوجد قياس مستندي متوافق"}.</p>
      </>}
      {record.legacyMeasurement&&!record.metricComparison.actual?<p className="text-xs text-muted-foreground">القيمة المختصرة في دورة القرار: {number(record.legacyMeasurement.value)} {record.legacyMeasurement.currency} حتى {record.legacyMeasurement.asOf}. لم تُعامل كقياس مثبت مستقل عن دليل المصدر والمعادلة.</p>:null}
    </section>
    {record.reviewDisposition?<p className="text-sm">المراجعة: {record.reviewDisposition==="SCHEDULED"?"مجدولة":record.reviewDisposition==="NOT_REQUIRED"?"غير مطلوبة":"غير مجدولة"} {record.reviewAt?"في "+record.reviewAt:""}</p>:null}
    {record.lessons.length?<section><h4 className="text-sm font-semibold">الدروس المستفادة</h4><ul className="list-disc ps-5 text-sm">{record.lessons.map((lesson,index)=><li key={index}>{lesson}</li>)}</ul></section>
      :record.lessonsReviewed?<p className="text-sm text-muted-foreground">تمت مراجعة الدروس ولم يُسجل درس جديد بعد.</p>:null}
    {record.corrections.length?<section className="space-y-1"><h4 className="text-sm font-semibold">سجل التصحيحات الإلحاقي</h4>
      {record.corrections.map(correction=><article key={correction.id} className="rounded-lg border p-2 text-xs">
        <p>الإصدار {correction.fromVersion} ← {correction.toVersion} · {correction.actorRole} · {correction.recordedAt}</p>
        <p>قبل: {correction.originalText}</p><p>بعد: {correction.correctedText}</p><p>السبب: {correction.reason}</p>
      </article>)}</section>:null}
    {record.missingFields.length?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">حقول الذاكرة غير المحفوظة</h4><ul className="mt-1 list-disc ps-5 text-xs">{record.missingFields.map(field=><li key={field}>{missingLabels[field]}</li>)}</ul></section>:null}
    {record.precedents.length?<section><h4 className="text-sm font-semibold">قرارات سابقة من القاعدة نفسها — ضمن الصفحة المحمّلة فقط</h4><ul className="list-disc ps-5 text-xs">{record.precedents.map(item=><li key={item.decisionId}>{item.ruleVersion} · {states[item.state]} · {item.createdAt} · {item.measured?"قياس مسجل":"بلا قياس"}</li>)}</ul></section>:null}
    {record.warnings.map(warning=><p key={warning} className="text-xs text-muted-foreground">{warning}</p>)}
    <DecisionMemoryCapture record={record} onRetry={onRetry}/>
  </article>;
}
const DECISION_MEMORY_DISPLAY_PAGE_SIZE = 25;

export function DecisionMemoryBook({result=null,state="ready",onRetry}:DecisionMemoryBookProps){
  const [precedentTargetId,setPrecedentTargetId]=useState("");
  const [precedentQuery,setPrecedentQuery]=useState("");
  const [recordPage,setRecordPage]=useState(0);
  const pageCount=Math.max(1,Math.ceil((result?.records.length??0)/DECISION_MEMORY_DISPLAY_PAGE_SIZE));
  const currentPage=Math.min(recordPage,pageCount-1);
  const pageRecords=result?.records.slice(
    currentPage*DECISION_MEMORY_DISPLAY_PAGE_SIZE,
    (currentPage+1)*DECISION_MEMORY_DISPLAY_PAGE_SIZE,
  )??[];
  const selectedTarget=result?.records.find(record=>record.decisionId===precedentTargetId)??null;
  const referenceOptions=selectedTarget&&!pageRecords.some(record=>record.decisionId===selectedTarget.decisionId)
    ?[selectedTarget,...pageRecords]:pageRecords;
  const searchTarget=selectedTarget??pageRecords[0]??null;
  const policyReviewSuggestions=result?buildDecisionPolicyReviewSuggestions(result.records):[];
  const precedentMatches=searchTarget&&result
    ?searchSimilarDecisionMemory({records:result.records,decisionId:searchTarget.decisionId,query:precedentQuery,limit:8})
    :[];
  const effective=state==="ready"&&!result?"unavailable":state;
  if(effective!=="ready")return <IntelligenceStatePanel state={effective} onRetry={onRetry} errorMessage="تعذر تحميل دفتر ذاكرة القرارات." />;
  if(!result)return <IntelligenceStatePanel state="unavailable" unavailableMessage="مصدر ذاكرة القرارات غير متاح؛ لم تُنشأ سجلات افتراضية." />;
  return <section dir="rtl" className="space-y-3 rounded-xl border p-4" aria-label="دفتر ذاكرة القرارات والتعلم">
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">دفتر ذاكرة القرارات والتعلّم من نتائجها</h2>
      <p className="text-xs text-muted-foreground">سياسة {result.policyVersion} · لقطة {result.generatedAt} · الصفحة {result.loadedCount} من {result.totalCount}</p></div>
      <span className="text-xs">{result.status==="EMPTY"?"لا توجد قرارات محفوظة":<EvidenceStatusLabel status={result.status==="VERIFIED"?"VERIFIED":result.status==="PARTIAL"?"NEEDS_REVIEW":"UNAVAILABLE"}/>}</span></header>
    <p className="text-sm text-muted-foreground">يوثق المشكلة والبدائل والافتراضات والإجراء والمراجعة على إصدارات غير قابلة للاستبدال. لا تتحول الوقائع إلى أدلة إلا بعد تحقق الخادم من مصدرها داخل المؤسسة؛ ولا تتغير القواعد أو الأسعار أو الصلاحيات تلقائياً.</p>
    {result.records.length?<section className="space-y-3 rounded-xl border p-3" aria-label="البحث في القرارات السابقة المشابهة">
      <div><h3 className="font-semibold">البحث في القرارات السابقة المشابهة</h3>
        <p className="mt-1 text-xs text-muted-foreground">اختر قراراً مرجعياً. يرتب البحث السوابق الأقدم حسب تطابق قاعدة القرار والمصطلحات المحفوظة، ثم يوضح اختلاف الفترة والعملة والمعادلة. لا يستخدم نموذجاً احتماليًا ولا ينشئ توصية أو تغييراً تجارياً.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">القرار المرجعي
          <select className="w-full rounded-lg border bg-background p-2" value={searchTarget?.decisionId??""} onChange={event=>setPrecedentTargetId(event.target.value)}>
            {referenceOptions.map(record=><option key={record.decisionId} value={record.decisionId}>{record.proposedResult.slice(0,100)} · {record.createdAt.slice(0,10)}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm">مصطلحات إضافية (اختياري)
          <input className="w-full rounded-lg border bg-background p-2" maxLength={500} value={precedentQuery} onChange={event=>setPrecedentQuery(event.target.value)} placeholder="مثال: نفاد مخزون، تأخر توريد، تحصيل"/>
        </label>
      </div>
      {searchTarget?<div className="rounded-lg bg-muted/40 p-2 text-xs">
        <p><strong>السياق المرجعي:</strong> {searchTarget.proposedResult} · {searchTarget.ruleId}@{searchTarget.ruleVersion}</p>
        {searchTarget.problem?<p className="mt-1">المشكلة: {searchTarget.problem}</p>:null}
        <p className="mt-1">تاريخ القرار: {searchTarget.createdAt} · فترة لقطة القرار: {searchTarget.snapshot?.period.from??"غير متاحة"} — {searchTarget.snapshot?.period.to??"غير متاحة"} · كما في {searchTarget.snapshot?.asOf??"غير متاح"}</p>
      </div>:null}
      {result.totalCount>result.loadedCount?<p className="text-xs text-amber-700">تنبيه: البحث مقصور على {result.loadedCount} قراراً محملاً من أصل {result.totalCount}. قد توجد سوابق أقدم خارج هذه الصفحة؛ عدم ظهور نتيجة لا يثبت عدم وجودها.</p>:null}
      {precedentMatches.length?<ol className="space-y-2">
        {precedentMatches.map(match=><li key={match.record.decisionId} className="rounded-lg border p-3 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h4 className="font-semibold text-sm">{match.record.proposedResult}</h4>
              <p className="text-xs text-muted-foreground" dir="ltr">{match.record.ruleId}@{match.record.ruleVersion} · {match.record.decisionId.slice(0,8)}</p>
              <p className="text-xs">الحالة: {states[match.record.state]} · تاريخ القرار: {match.record.createdAt}</p>
            </div>
            <span className="text-xs">{match.comparisonStatus==="COMPARABLE"?"المقياس الفعلي قابل للمقارنة":match.comparisonStatus==="NOT_COMPARABLE"?"سياق القياس مختلف":"النتيجة غير مثبتة للمقارنة"}</span>
          </div>
          <p className="text-xs"><strong>أساس التشابه:</strong> {match.matchReasons.join("، ")}{match.matchedTerms.length?" · المصطلحات: "+match.matchedTerms.join("، "):""}</p>
          {match.record.problem?<p className="text-sm"><strong>المشكلة المسجلة:</strong> {match.record.problem}</p>:null}
          {match.record.actionTaken?<p className="text-sm"><strong>الإجراء المسجل:</strong> {match.record.actionTaken}</p>:null}
          {match.record.lessons.length?<p className="text-sm"><strong>الدروس المحفوظة:</strong> {match.record.lessons.join("؛ ")}</p>:null}
          {match.record.metricComparison.expected||match.record.metricComparison.actual?<div className="grid gap-2 sm:grid-cols-2">
            {match.record.metricComparison.expected?metricLine("الخط الأساس المتوقع",match.record.metricComparison.expected):null}
            {match.record.metricComparison.actual?metricLine("النتيجة الفعلية",match.record.metricComparison.actual):null}
          </div>:null}
          {match.contextDifferences.length?<div className="rounded-md border p-2">
            <p className="text-xs font-semibold">اختلافات السياق وحدود المقارنة</p>
            {match.contextDifferences.map((difference,index)=><p key={index} className="text-xs text-muted-foreground">{difference}</p>)}
          </div>:null}
          <p className="text-xs text-muted-foreground">هذه سابقة تاريخية للمراجعة وليست قاعدة ملزمة أو دليلاً على أن الظروف الحالية مماثلة بالكامل.</p>
        </li>)}
      </ol>:<p className="text-sm text-muted-foreground">لا توجد سابقة أقدم مطابقة ضمن السجلات المحملة حالياً. جرّب مصطلحات أوسع أو تحقق من نطاق الصفحة.</p>}
    </section>:null}
    <section className="space-y-2 rounded-xl border p-3" aria-label="مقترحات مراجعة القواعد من نتائج القرارات">
      <div><h3 className="font-semibold">مقترحات مراجعة القواعد من نتائج القرارات</h3>
        <p className="mt-1 text-xs text-muted-foreground">مسودات مراجعة مشتقة فقط من قرارات مقاسة وذاكرة مكتملة ودروس راجعها المستخدم وقياسات متوافقة ذات أدلة. لا تُعدّل القواعد أو الأسعار أو حدود الائتمان أو المخزون، ولا تفترض أن التوصية سببت النتيجة.</p>
        {result.totalCount>result.loadedCount?<p className="text-xs text-amber-700">هذه المسودات مشتقة من القرارات المحملة فقط ({result.loadedCount} من {result.totalCount}) وليست مراجعة شاملة لكل التاريخ.</p>:null}
      </div>
      {policyReviewSuggestions.length?<div className="space-y-2">
        <p className="text-xs text-muted-foreground">عدد مسودات المراجعة: {policyReviewSuggestions.length}</p>
        {policyReviewSuggestions.slice(0,8).map(suggestion=><article key={suggestion.id} className="rounded-lg border p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm">مراجعة قاعدة القرار {suggestion.ruleId}@{suggestion.ruleVersion}</strong>
            <span className="text-xs">مسودة تتطلب اعتماداً بشرياً</span>
          </div>
          <p className="text-xs text-muted-foreground">المؤشر: {suggestion.metricKey} · الوحدة: {suggestion.unit} · العملة: {suggestion.currency??"غير منطبقة"} · الفترة: {suggestion.period.from} — {suggestion.period.to} · المعادلة: {suggestion.formulaId}@{suggestion.formulaVersion}</p>
          <p className="text-xs">قرارات القياس المتطابقة في السياق: {suggestion.observations.length} · مجموع مراجع الأدلة: {suggestion.evidenceIds.length}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md bg-muted/40 p-2"><p className="text-xs text-muted-foreground">متوسط الفرق (الفعلي − المتوقع)</p><strong>{suggestion.calibration.meanSignedDifference===null?"غير متاح":number(suggestion.calibration.meanSignedDifference)}</strong></div>
            <div className="rounded-md bg-muted/40 p-2"><p className="text-xs text-muted-foreground">وسيط الفرق</p><strong>{suggestion.calibration.medianSignedDifference===null?"غير متاح":number(suggestion.calibration.medianSignedDifference)}</strong></div>
            <div className="rounded-md bg-muted/40 p-2"><p className="text-xs text-muted-foreground">متوسط مقدار الفرق</p><strong>{suggestion.calibration.meanAbsoluteDifference===null?"غير متاح":number(suggestion.calibration.meanAbsoluteDifference)}</strong></div>
            <div className="rounded-md bg-muted/40 p-2"><p className="text-xs text-muted-foreground">متوسط الانحراف النسبي المطلق</p><strong>{suggestion.calibration.meanAbsoluteDifferencePercent===null?"غير متاح":number(suggestion.calibration.meanAbsoluteDifferencePercent)+"%"}</strong><p className="text-xs text-muted-foreground">العينة ذات خط أساس غير صفري: {suggestion.calibration.percentageSampleCount} من {suggestion.calibration.sampleCount}</p></div>
          </div>
          <p className="text-xs text-muted-foreground">
            أعلى من المتوقع: {suggestion.calibration.aboveExpectedCount} · أقل من المتوقع: {suggestion.calibration.belowExpectedCount} · مطابق: {suggestion.calibration.equalExpectedCount} · خط أساس صفري: {suggestion.calibration.zeroBaselineCount}.
            هذه أوصاف للفروق فقط؛ لا تعني أن الارتفاع أفضل أو أن القرار تسبب في النتيجة.
          </p>
          <div className="space-y-2">
            {suggestion.observations.slice(0,5).map(observation=><div key={observation.decisionId} className="rounded-md bg-muted/40 p-2">
              <p className="text-xs">القرار {observation.decisionId.slice(0,8)} · {observation.createdAt}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {metricLine("المتوقع",observation.expected)}
                {metricLine("الفعلي",observation.actual)}
              </div>
              <p className="text-xs">الفارق المرصود: {number(observation.difference)} · التغير: {observation.differencePercent===null?"النسبة غير معرفة لخط أساس صفري":number(observation.differencePercent)+"%"}</p>
              <p className="text-xs">الدروس: {observation.lessons.join("؛ ")}</p>
            </div>)}
          </div>
          <p className="text-xs"><strong>الإجراء المقترح للمراجعة:</strong> {suggestion.reviewInstruction}</p>
          <p className="text-xs text-muted-foreground">الأدلة المحفوظة: <EvidenceReferences ids={suggestion.evidenceIds}/></p>
        </article>)}
        {policyReviewSuggestions.length>8?<p className="text-xs text-muted-foreground">تُعرض أول 8 مسودات من أصل {policyReviewSuggestions.length}؛ البقية محسوبة ولم تُحذف.</p>:null}
      </div>:<p className="text-sm text-muted-foreground">لا توجد مسودات مراجعة مستوفية الشروط ضمن القرارات المحملة حالياً. لا تُنشأ من قرارات غير مقاسة أو ذاكرة ناقصة أو نتائج بلا دليل.</p>}
    </section>
    <div className="grid gap-2 sm:grid-cols-4">
      <article className="rounded-lg border p-3"><p className="text-xs">قرارات محمّلة</p><strong className="text-xl">{result.loadedCount}</strong></article>
      <article className="rounded-lg border p-3"><p className="text-xs">ذاكرة مكتملة</p><strong className="text-xl">{result.completeCount}</strong></article>
      <article className="rounded-lg border p-3"><p className="text-xs">بانتظار الاستكمال</p><strong className="text-xl">{result.partialCount}</strong></article>
      <article className="rounded-lg border p-3"><p className="text-xs">قياسات مثبتة قابلة للمقارنة</p><strong className="text-xl">{result.verifiedMeasurementCount}</strong></article>
    </div>
    {result.records.length?<>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>عرض {currentPage*DECISION_MEMORY_DISPLAY_PAGE_SIZE+1}–{Math.min((currentPage+1)*DECISION_MEMORY_DISPLAY_PAGE_SIZE,result.records.length)} من {result.records.length} قراراً</span>
        {pageCount>1?<div className="flex items-center gap-2">
          <button type="button" className="rounded-lg border px-3 py-1.5" disabled={currentPage===0} onClick={()=>setRecordPage(value=>Math.max(0,value-1))}>الأحدث</button>
          <span>{currentPage+1} / {pageCount}</span>
          <button type="button" className="rounded-lg border px-3 py-1.5" disabled={currentPage>=pageCount-1} onClick={()=>setRecordPage(value=>Math.min(pageCount-1,value+1))}>الأقدم</button>
        </div>:null}
      </div>
      {pageRecords.map(record=><DecisionMemoryCard key={record.decisionId} record={record} onRetry={onRetry}/>)}
    </>:<p className="text-sm">لا توجد قرارات محفوظة بعد.</p>}
    {result.warnings.length?<section className="rounded-lg border p-3"><h3 className="text-sm font-semibold">حدود البيانات الحالية</h3>{result.warnings.map(warning=><p key={warning} className="text-xs">{warning}</p>)}</section>:null}
  </section>;
}
