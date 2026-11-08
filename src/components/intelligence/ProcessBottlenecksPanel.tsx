import type { ProcessBottleneckResult } from "@/lib/intelligence/process-bottlenecks";

const labels:Record<string,string>={ORDERS:"الطلبات",QUOTES:"عروض الأسعار",PURCHASE:"المشتريات",INVOICES:"تحصيل الفواتير",TASKS:"المهام"};
const waits:Record<string,string>={
  MIXED_OR_UNATTRIBUTED:"انتظار/تنفيذ غير منسوب",INTERNAL_RESPONSE:"استجابة داخلية",
  INTERNAL_DRAFT_REVIEW:"مراجعة داخلية",MIXED_SUPPLIER_RECEIVING:"توريد واستلام مختلط",
  EXTERNAL_CUSTOMER_SETTLEMENT:"انتظار سداد العميل",INTERNAL_QUEUE_AND_WORK:"قائمة عمل وتنفيذ داخلي",
};
const fmt=(v:number)=>new Intl.NumberFormat("ar-YE",{maximumFractionDigits:1}).format(v);
const date=(v:string|null)=>v?new Date(v).toLocaleString("ar-YE",{dateStyle:"medium",timeStyle:"short"}):"غير متاح";

export function ProcessBottlenecksPanel({result,state="ready",onRetry}:{
  result:ProcessBottleneckResult|null;state?:"ready"|"loading"|"error"|"unavailable";onRetry?:()=>void;
}) {
  if(state==="loading") return <section dir="rtl" className="rounded-xl border p-4" role="status">جارٍ تحميل تحليل زمن العمليات…</section>;
  if(state!=="ready" || !result) return <section dir="rtl" className="rounded-xl border p-4 space-y-2" role="status">
    <p className="font-semibold">{state==="unavailable"?"تحليل زمن العمليات غير متاح":"تعذر تحميل تحليل زمن العمليات"}</p>
    <p className="text-sm text-muted-foreground">لا توجد نتائج بديلة أو أرقام تجريبية.</p>
    {onRetry?<button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onRetry}>إعادة المحاولة</button>:null}
  </section>;
  return <section dir="rtl" className="space-y-4 rounded-xl border p-4" aria-label="تحليل الاختناقات وزمن دورة العملية">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">تحليل الاختناقات وزمن دورة العملية</h2>
        <p className="text-xs text-muted-foreground">الفترة {result.period.from} إلى {result.period.to} · UTC · كما في {date(result.asOf)}</p>
        {result.baselinePeriod?<p className="text-xs text-muted-foreground">المقارنة {result.baselinePeriod.from} إلى {result.baselinePeriod.to}</p>:null}
      </div>
      <span className="rounded-full border px-2 py-1 text-xs">{result.state==="READY"?"المصادر المتاحة موثقة":result.state==="PARTIAL"?"تغطية جزئية حسب الصلاحية":"المصادر غير متاحة"}</span>
    </header>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {result.queues.map(x=><article key={x.processKey} className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">{labels[x.processKey]}</p>
        <p className="text-2xl font-semibold tabular-nums">{fmt(x.openCount)}</p>
        <p className="text-xs text-muted-foreground">مفتوح الآن</p>
        <p className="mt-2 text-xs">أقدم بداية: {date(x.oldestOpenedAt)}</p>
        {x.oldestAgeMinutes!==null?<p className="text-xs">العمر: {fmt(x.oldestAgeMinutes/60)} ساعة</p>:null}
      </article>)}
    </div>
    <section className="space-y-2">
      <h3 className="font-semibold">أطول المراحل المرصودة</h3>
      {result.findings.length?result.findings.map((x,i)=><article key={x.processKey+":"+x.stageKey} className="rounded-lg border p-3 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{i+1}. {labels[x.processKey]} · {x.stageKey}</strong><span className="text-xs text-muted-foreground">عينة {fmt(x.sampleCount)}</span></div>
        <p className="text-sm">الوسيط {fmt(x.medianMinutes)} دقيقة · المتوسط {fmt(x.averageMinutes)} · المئين 90 {fmt(x.p90Minutes)}</p>
        <p className="text-xs text-muted-foreground">تصنيف الزمن: {waits[x.waitClass]}</p><p className="text-sm">{x.recommendation}</p>
      </article>):<p className="text-sm text-muted-foreground">لا توجد مرحلة بعينة كافية لإعلانها اختناقاً. تُعرض أحجام الطوابير فقط.</p>}
    </section>
    {result.comparisons.length?<section className="space-y-2">
      <h3 className="font-semibold">مقارنة الفترتين المتكافئتين</h3>
      {result.comparisons.map(x=><article key={x.processKey+":"+x.stageKey} className="rounded-lg border p-3">
        <strong>{labels[x.processKey]} · {x.stageKey}</strong>
        <p className="text-sm">السابق {fmt(x.baselineMedianMinutes)} دقيقة · الحالي {fmt(x.currentMedianMinutes)} دقيقة</p>
        <p className="text-sm">{x.changeMinutes>0?"زاد":x.changeMinutes<0?"انخفض":"لم يتغير"} {fmt(Math.abs(x.changeMinutes))} دقيقة{x.changePercent===null?"":" ("+fmt(Math.abs(x.changePercent))+"٪)"}</p>
        <p className="text-xs text-muted-foreground">{x.note}</p>
      </article>)}
    </section>:null}
    <section className="space-y-2">
      <h3 className="font-semibold">تغطية مصادر القياس</h3>
      {result.sourceCoverage.map(x=><article key={x.key} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-xs">
        <span>{labels[x.key]}</span><span>{x.status==="VERIFIED"?"موثق · عينة "+fmt(x.sampleCount??0):"غير متاح لهذه الصلاحية"}</span>
        <span>{x.source}</span><p className="w-full text-muted-foreground">{x.message}</p>
      </article>)}
    </section>
    {result.reopenedTasks!==null?<p className="text-xs text-muted-foreground">مرات إعادة فتح المهام في الفترة: {fmt(result.reopenedTasks)}</p>:null}
    {result.withheldReasons.length?<details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">ما لم نحتسبه</summary>
      <ul className="mt-2 list-disc ps-5 text-sm">{result.withheldReasons.map(x=><li key={x}>{x}</li>)}</ul>
    </details>:null}
    <p className="text-xs text-muted-foreground">هذه مؤشرات وصفية وليست تقييماً لأداء موظف. الزمن بين سجلين لا يحدد وحده وقت العمل الفعلي أو الطرف المتسبب. لا يُنسب التحسن إلى إجراء بعينه.</p>
  </section>;
}
