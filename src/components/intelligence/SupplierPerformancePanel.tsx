import type {SupplierPerformanceResult} from "@/lib/intelligence/supplier-performance";
const qty=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:3});
const days=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:2});
const date=(v:string|null)=>v?new Date(v).toLocaleDateString("ar-YE",{dateStyle:"medium"}):"غير متاح";
export interface SupplierPerformancePanelProps {result:SupplierPerformanceResult|null;state?:"loading"|"error"|"unavailable"|"ready";onRetry?:()=>void;onOpenPurchaseOrder?:(purchaseOrderId:string)=>void;}
export function SupplierPerformancePanel({result,state="ready",onRetry,onOpenPurchaseOrder}:SupplierPerformancePanelProps) {
 if(state==="loading")return <section dir="rtl" role="status" className="rounded-xl border p-4">جارٍ تحميل أداء الموردين من سجلات التوريد…</section>;
 if(state!=="ready"||!result)return <section dir="rtl" role="status" className="rounded-xl border p-4 space-y-2">
  <h2 className="font-semibold">تحليل أداء الموردين غير متاح</h2><p className="text-sm text-muted-foreground">لم تُعرض أرقام بديلة أو بيانات تجريبية.</p>
  {onRetry?<button type="button" onClick={onRetry} className="rounded-lg border px-3 py-2 text-sm">إعادة المحاولة</button>:null}</section>;
 if(result.state==="EMPTY")return <section dir="rtl" className="rounded-xl border p-4 space-y-2">
  <h2 className="font-semibold">لا توجد أوامر شراء مؤهلة في الفترة</h2>
  <p className="text-sm text-muted-foreground">{result.period.from} — {result.period.to} UTC. غياب السجلات لا يعني أن الموردين بلا أداء.</p></section>;
 return <section dir="rtl" className="space-y-4 rounded-xl border p-4" aria-label="ذكاء أداء الموردين">
  <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">ذكاء أداء الموردين</h2>
   <p className="text-xs text-muted-foreground">{result.period.from} — {result.period.to} UTC · كما في {date(result.asOf)}</p></div>
   <span className="rounded-full border px-2 py-1 text-xs">{result.completePopulation?"تغطية كاملة":"تغطية جزئية"}</span></header>
  <div className="grid gap-2 sm:grid-cols-3">
   <article className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">الموردون المشمولون</p>
    <p className="text-2xl font-semibold tabular-nums">{qty.format(result.returnedSupplierCount)}</p>
    <p className="text-xs text-muted-foreground">من أصل {qty.format(result.totalSupplierCount)}</p></article>
   <article className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">أوامر مكتملة الاستلام</p>
    <p className="text-2xl font-semibold tabular-nums">{qty.format(result.suppliers.reduce((n,x)=>n+x.completedOrderCount,0))}</p>
    <p className="text-xs text-muted-foreground">اكتمال كميات جميع السطور شرط للقياس</p></article>
   <article className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">أوامر مفتوحة</p>
    <p className="text-2xl font-semibold tabular-nums">{qty.format(result.suppliers.reduce((n,x)=>n+x.openOrderCount,0))}</p>
    <p className="text-xs text-muted-foreground">مرسلة أو مستلمة جزئياً</p></article>
  </div>
  <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-right">
   <th className="p-2">المورد</th><th className="p-2">أوامر / مكتمل</th><th className="p-2">مفتوح</th><th className="p-2">متوسط التوريد (يوم)</th>
   <th className="p-2">الوسيط / P90</th><th className="p-2">الالتزام بالموعد الموعود</th><th className="p-2">سطور أصناف معلقة</th>
  </tr></thead><tbody>{result.suppliers.map(s=><tr key={s.supplierId} className="border-b align-top">
   <td className="p-2"><p className="font-semibold">{s.supplierName}</p><p className="text-xs text-muted-foreground">{s.supplierCode??"بلا رمز مورد"}</p></td>
   <td className="p-2 tabular-nums">{qty.format(s.purchaseOrderCount)} / {qty.format(s.completedOrderCount)}</td>
   <td className="p-2 tabular-nums">{qty.format(s.openOrderCount)}</td>
   <td className="p-2 tabular-nums">{s.leadTimeSampleCount<3||s.averageLeadDays===null?"عينة غير كافية":days.format(s.averageLeadDays)}<p className="text-xs text-muted-foreground">عينة {qty.format(s.leadTimeSampleCount)}</p></td>
   <td className="p-2 tabular-nums">{s.leadTimeSampleCount<3||s.medianLeadDays===null||s.p90LeadDays===null?"عينة غير كافية":days.format(s.medianLeadDays)+" / "+days.format(s.p90LeadDays)}</td>
   <td className="p-2">{s.promisedDeliverySampleCount<3||s.onTimePercent===null?"عينة غير كافية":days.format(s.onTimePercent)+"٪"}<p className="text-xs text-muted-foreground">{qty.format(s.onTimeCount)} من {qty.format(s.promisedDeliverySampleCount)} عينة</p></td>
   <td className="p-2 tabular-nums">{qty.format(s.backlogLineCount)}</td>
  </tr>)}</tbody></table></div>
  <section className="space-y-2"><h3 className="font-semibold">أحدث أوامر الشراء ومصدر القياس</h3>
   {result.suppliers.map(s=><details key={s.supplierId} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{s.supplierName} · {qty.format(s.recentOrders.length)} سجلات</summary>
    <div className="mt-3 space-y-2">{s.recentOrders.map(o=><article key={o.purchaseOrderId} className="rounded-md bg-muted/40 p-2 text-xs">
     <div className="flex flex-wrap justify-between gap-2"><strong>أمر {o.purchaseOrderNumber}</strong><span>{o.status==="received"?"مستلم":o.status==="partially_received"?"مستلم جزئياً":"مرسل"}</span></div>
     <p>الإرسال: {date(o.submittedAt)} · آخر استلام: {date(o.lastReceivedAt)}</p>
     {onOpenPurchaseOrder?<button type="button" onClick={()=>onOpenPurchaseOrder(o.purchaseOrderId)} className="mt-1 rounded-md border px-2 py-1">فتح أمر الشراء</button>:null}
     <p>سطور الأصناف: {qty.format(o.lineCount)} · السطور ذات الاستلام المتبقي: {qty.format(o.pendingLineCount)}</p>
     <p>زمن التوريد: {o.actualLeadDays===null?"غير مكتمل":days.format(o.actualLeadDays)+" يوم"} · الموعود: {o.promisedDeliveryDays===null?"غير مسجل":qty.format(o.promisedDeliveryDays)+" يوم"} · الالتزام: {o.onTime===null?"غير قابل للقياس":o.onTime?"ضمن المدة":"متأخر"}</p>
    </article>)}</div></details>)}
  </section>
  {result.withheldReasons.length>0?<details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">البيانات والمؤشرات المحجوبة</summary>
   <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">{result.withheldReasons.map(x=><li key={x}>{x}</li>)}</ul></details>:null}
  <p className="text-xs text-muted-foreground">زمن التوريد من إرسال أمر الشراء إلى آخر استلام ولا يظهر إلا بعد اكتمال الكميات. الالتزام يقاس فقط بمدة عرض سعر ممنوح. السطور المعلقة تُعد ولا تُجمع كميات أصناف أو وحدات مختلفة؛ المؤشرات والنسب لا تُعرض إلا بعينة لا تقل عن 3 أوامر. لا تعرض الشاشة أسعار شراء أو ديوناً أو مدفوعات، ولا تدّعي قياس الجودة أو العيوب أو تصنيف المورد.</p>
 </section>;
}
