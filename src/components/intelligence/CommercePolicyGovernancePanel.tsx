import { useCallback, useEffect, useMemo, useState } from "react";
import { buildPromotionPolicyOverlapReview } from "@/lib/intelligence/commerce-policy-overlap-review";
import {
  fetchCommercePolicyCatalog, fetchCommercePolicyOwners, fetchCommercePolicySources,
  fetchCommercePolicySimulationHistory, registerCommercePolicyMetadata, simulateCommercePolicy,
  previewCommercePolicyRollback,
  type CommercePolicyCatalog, type CommercePolicyOwner, type CommercePolicySimulation,
  type CommercePolicySimulationHistoryItem, type CommercePolicySimulationType,
  type CommercePolicySource, type CommercePolicySourceTable,
  type CommercePolicyRollbackPreview,
} from "@/lib/intelligence/commerce-policy-governance-client";

const sourceLabels: Record<CommercePolicySourceTable,string> = {
  pricing_rules:"قواعد التسعير", promotions:"العروض الترويجية", customers:"حدود ائتمان العملاء",
  products:"سياسة كمية الطلب للصنف", inventory_balances:"نقطة إعادة الطلب بالمستودع",
};
const simulationLabels: Record<CommercePolicySimulationType,string> = {
  PROMOTION_PREVIEW:"محاكاة خصم وعروض متعارضة", CUSTOMER_CREDIT:"محاكاة حد الائتمان",
  PRODUCT_ORDER_QUANTITY:"التحقق من أقل كمية ومضاعف الطلب",
  INVENTORY_REORDER_POINT:"محاكاة نقطة إعادة الطلب", TASK_DEDUPLICATION:"منع تكرار المهمة",
};
const simulationTemplates: Record<CommercePolicySimulationType,string> = {
  PROMOTION_PREVIEW: JSON.stringify({product_id:"UUID الصنف",customer_id:"UUID العميل",quantity:1,candidate_discount_type:"percentage",candidate_discount_value:5},null,2),
  CUSTOMER_CREDIT: JSON.stringify({customer_id:"UUID العميل",proposed_credit_limit:100000,proposed_order_amount:15000},null,2),
  PRODUCT_ORDER_QUANTITY: JSON.stringify({product_id:"UUID الصنف",quantity:5},null,2),
  INVENTORY_REORDER_POINT: JSON.stringify({product_id:"UUID الصنف",inventory_balance_id:"UUID رصيد المستودع",proposed_reorder_point:50},null,2),
  TASK_DEDUPLICATION: JSON.stringify({source_event_key:"order-review:UUID",source_entity_type:"orders",source_entity_id:"UUID الطلب",task_role:"sales"},null,2),
};
function localDateTimeValue() {
  const now=new Date(); const local=new Date(now.getTime()-now.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}
function pretty(value: unknown) { return JSON.stringify(value,null,2); }

export function CommercePolicyGovernancePanel() {
  const [catalog,setCatalog]=useState<CommercePolicyCatalog|null>(null);
  const [owners,setOwners]=useState<CommercePolicyOwner[]>([]);
  const [sources,setSources]=useState<CommercePolicySource[]>([]);
  const [history,setHistory]=useState<CommercePolicySimulationHistoryItem[]>([]);
  const [sourceTable,setSourceTable]=useState<CommercePolicySourceTable>("pricing_rules");
  const [sourceSearch,setSourceSearch]=useState("");
  const [sourceId,setSourceId]=useState("");
  const [ownerId,setOwnerId]=useState("");
  const [effectiveFrom,setEffectiveFrom]=useState(localDateTimeValue);
  const [effectiveUntil,setEffectiveUntil]=useState("");
  const [priority,setPriority]=useState("100");
  const [businessRule,setBusinessRule]=useState("");
  const [rationale,setRationale]=useState("");
  const [examples,setExamples]=useState('[{"case":"قبل التطبيق","input":{},"expected":"مراجعة بشرية"}]');
  const [simulationType,setSimulationType]=useState<CommercePolicySimulationType>("PRODUCT_ORDER_QUANTITY");
  const [simulationInput,setSimulationInput]=useState(simulationTemplates.PRODUCT_ORDER_QUANTITY);
  const [lastSimulation,setLastSimulation]=useState<CommercePolicySimulation|null>(null);
  const [rollbackPreview,setRollbackPreview]=useState<CommercePolicyRollbackPreview|null>(null);
  const [rollbackLoading,setRollbackLoading]=useState(false);
  const [loading,setLoading]=useState(false);
  const [sourceLoading,setSourceLoading]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [simulating,setSimulating]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refreshCatalog=useCallback(async()=>{
    setLoading(true);setError(null);
    try {
      const [catalogResult,ownerResult,historyResult]=await Promise.all([
        fetchCommercePolicyCatalog(),fetchCommercePolicyOwners(),fetchCommercePolicySimulationHistory(undefined,30),
      ]);
      if(!catalogResult.ok) throw new Error(catalogResult.message);
      if(!ownerResult.ok) throw new Error(ownerResult.message);
      if(!historyResult.ok) throw new Error(historyResult.message);
      setCatalog(catalogResult.data);setOwners(ownerResult.data.items);setHistory(historyResult.data);
      setOwnerId(current=>current || ownerResult.data.items[0]?.id || "");
    } catch(cause) { setError(cause instanceof Error?cause.message:"تعذر تحميل سجل السياسات."); }
    finally { setLoading(false); }
  },[]);
  const refreshSources=useCallback(async()=>{
    setSourceLoading(true);
    try {
      const result=await fetchCommercePolicySources(sourceTable,sourceSearch,100);
      if(!result.ok) throw new Error(result.message);
      setSources(result.data.items);
      setSourceId(current=>result.data.items.some(item=>item.id===current)?current:result.data.items[0]?.id??"");
    } catch(cause) { setSources([]);setError(cause instanceof Error?cause.message:"تعذر تحميل سجلات المصدر."); }
    finally { setSourceLoading(false); }
  },[sourceTable,sourceSearch]);
  useEffect(()=>{void refreshCatalog();},[refreshCatalog]);
  useEffect(()=>{void refreshSources();},[refreshSources]);

  const selectedSource=useMemo(()=>sources.find(item=>item.id===sourceId)??null,[sources,sourceId]);
  const promotionOverlapReview=useMemo(
    ()=>catalog?buildPromotionPolicyOverlapReview(catalog):null,
    [catalog],
  );
  const overlapDate=(value:string|null)=>value
    ?new Date(value).toLocaleString("ar-YE",{dateStyle:"medium",timeStyle:"short"})
    :"دون نهاية محددة";

  async function handleRegister() {
    setSubmitting(true);setError(null);setNotice(null);
    try {
      let parsedExamples:unknown;
      try { parsedExamples=JSON.parse(examples); } catch { throw new Error("أمثلة الاختبار يجب أن تكون JSON صالحاً."); }
      if(!Array.isArray(parsedExamples) || parsedExamples.some(item=>item===null || typeof item!=="object" || Array.isArray(item)))
        throw new Error("أمثلة الاختبار يجب أن تكون مصفوفة من كائنات JSON.");
      if(!sourceId || !ownerId || !effectiveFrom || !businessRule.trim() || !rationale.trim())
        throw new Error("أكمل المصدر والمالك وتاريخ السريان ووصف القاعدة والمبرر.");
      const result=await registerCommercePolicyMetadata({
        sourceTable,sourceId,ownerProfileId:ownerId,
        effectiveFrom:new Date(effectiveFrom).toISOString(),
        effectiveUntil:effectiveUntil?new Date(effectiveUntil).toISOString():null,
        conflictPriority:Number(priority),businessRule,rationale,
        testExamples:parsedExamples as Record<string,unknown>[],
      });
      if(!result.ok) throw new Error(result.message);
      setNotice("تم حفظ إصدار حوكمة السياسة رقم "+result.data.version+" دون تعديل القاعدة التجارية الأصلية.");
      await refreshCatalog();
    } catch(cause) { setError(cause instanceof Error?cause.message:"تعذر تسجيل بيانات السياسة."); }
    finally { setSubmitting(false); }
  }

  async function handleRollbackPreview(item: {sourceTable: CommercePolicySourceTable; sourceId: string}) {
    if(item.sourceTable!=="pricing_rules" && item.sourceTable!=="promotions") return;
    setRollbackLoading(true);setError(null);setRollbackPreview(null);
    try {
      const result=await previewCommercePolicyRollback(item.sourceTable,item.sourceId);
      if(!result.ok) throw new Error(result.message);
      setRollbackPreview(result.data);
      setNotice(result.data.canRestore
        ? "وجدت لقطة سابقة موثقة. المعاينة لا تنفذ الاستعادة؛ يجب استخدام مسار التعديل الأصلي وموافقاته."
        : "لا توجد لقطة سابقة موثقة قابلة للاستعادة لهذا السجل.");
    } catch(cause) { setError(cause instanceof Error?cause.message:"تعذر معاينة الاستعادة."); }
    finally { setRollbackLoading(false); }
  }

  async function handleSimulation() {
    setSimulating(true);setError(null);setNotice(null);setLastSimulation(null);
    try {
      let parsedInput:unknown;
      try { parsedInput=JSON.parse(simulationInput); } catch { throw new Error("مدخلات المحاكاة يجب أن تكون JSON صالحاً."); }
      if(parsedInput===null || typeof parsedInput!=="object" || Array.isArray(parsedInput))
        throw new Error("مدخلات المحاكاة يجب أن تكون كائناً.");
      const result=await simulateCommercePolicy(simulationType,parsedInput as Record<string,unknown>);
      if(!result.ok) throw new Error(result.message);
      setLastSimulation(result.data);
      setNotice("اكتملت المحاكاة وحُفظ أثرها للمراجعة؛ لم يتم تعديل الأسعار أو الائتمان أو المخزون أو المهام.");
      const historyResult=await fetchCommercePolicySimulationHistory(undefined,30);
      if(historyResult.ok) setHistory(historyResult.data);
    } catch(cause) { setError(cause instanceof Error?cause.message:"تعذر إجراء المحاكاة."); }
    finally { setSimulating(false); }
  }

  return (
    <section dir="rtl" className="space-y-5 rounded-xl border p-4" aria-label="حوكمة السياسات التجارية">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">حوكمة السياسات التجارية والمحاكاة</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            يربط السجل القاعدة بمالكها وإصدارها ومبررها. الأسعار والائتمان والمخزون تبقى في مصادرها الأصلية؛
            المحاكاة للمعاينة والتدقيق فقط ولا تنفذ أي تعديل تجاري.
          </p>
        </div>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>void refreshCatalog()} disabled={loading}>
          {loading?"جارٍ التحديث…":"تحديث السجل"}
        </button>
      </header>
      {error?<div role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700">{error}</div>:null}
      {notice?<div role="status" className="rounded-lg border p-3 text-sm">{notice}</div>:null}

      <section className="space-y-3 rounded-lg border p-3" aria-label="مراجعة التداخل المحتمل للعروض">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">مراجعة التداخل المحتمل للعروض</h3>
          <span className="text-xs text-muted-foreground">
            {promotionOverlapReview?.state==="READY"?"مصادر صالحة للمقارنة":
              promotionOverlapReview?.state==="PARTIAL"?"مراجعة جزئية":"لا توجد بيانات كافية"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          يرصد المحرك عرضين نشطين/مجدولين فقط عند تطابق المنتج أو الفئة صراحةً وتداخل نافذتي سريان المصدر والسياسة
          مع ثبات بصمتي المصدر. هذا «تداخل محتمل يحتاج مراجعة» وليس إثباتاً أن الخصومات ممنوع جمعها؛
          لا تتغير أولوية أي قاعدة ولا تتعدل العروض تلقائياً.
        </p>
        {promotionOverlapReview?<>
          <div className="grid gap-2 sm:grid-cols-3">
            <article className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">العروض القابلة للمقارنة</p>
              <strong className="text-xl tabular-nums">{promotionOverlapReview.inspectedPromotionCount}</strong>
            </article>
            <article className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">أزواج التداخل المحتمل</p>
              <strong className="text-xl tabular-nums">{promotionOverlapReview.candidatePairCount}</strong>
            </article>
            <article className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">مصادر/مقارنات محجوبة</p>
              <strong className="text-xl tabular-nums">{promotionOverlapReview.withheldCount}</strong>
            </article>
          </div>
          {promotionOverlapReview.state==="EMPTY"?
            <p className="text-sm text-muted-foreground">لم يُرصد تداخل صريح في المنتجات أو الفئات والفترات ضمن كامل سجل السياسات المحمل.</p>:null}
          {promotionOverlapReview.candidates.length?
            <div className="space-y-2">
              {promotionOverlapReview.candidates.map((pair,index)=><article key={pair.first.version+":"+pair.second.version+":"+pair.overlapPeriod.from+":"+index} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{pair.first.label} ↔ {pair.second.label}</strong>
                  <span className="rounded-full border px-2 py-1 text-xs">تداخل محتمل للمراجعة</span>
                </div>
                <div className="grid gap-1 text-xs sm:grid-cols-2">
                  <p>الأول: إصدار {pair.first.version} · أولوية مسجلة {pair.first.conflictPriority}</p>
                  <p>الثاني: إصدار {pair.second.version} · أولوية مسجلة {pair.second.conflictPriority}</p>
                  <p>النطاق المشترك: {pair.sharedScope.kind==="PRODUCT"?"نفس المنتج":"نفس الفئة"} · {pair.sharedScope.count} تطابقاً صريحاً</p>
                  <p>فترة التداخل: {overlapDate(pair.overlapPeriod.from)} — {overlapDate(pair.overlapPeriod.to)}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  لم يثبت مصدر الحوكمة قاعدة جمع الخصومات أو أسبقية التنفيذ؛ يلزم فحص أمثلة الاختبار ومسار سياسة العروض قبل أي قرار.
                </p>
              </article>)}
              {promotionOverlapReview.candidatePairCount>promotionOverlapReview.candidates.length?
                <p className="text-xs text-muted-foreground">عُرضت أول {promotionOverlapReview.candidates.length} أزواج فقط من أصل {promotionOverlapReview.candidatePairCount}.</p>:null}
            </div>:null}
          {promotionOverlapReview.withheldReasons.length?
            <details className="rounded-lg border p-2">
              <summary className="cursor-pointer text-xs font-semibold">ما لم يمكن مقارنته ({promotionOverlapReview.withheldCount})</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {promotionOverlapReview.withheldReasons.map(item=><li key={item.reason}>
                  {item.reason==="SOURCE_CHANGED"?"بصمة المصدر تغيرت منذ تسجيل السياسة":
                    item.reason==="SCOPE_NOT_COMPARABLE"?"نطاق المنتج/الفئة غير صريح أو غير قابل للمقارنة":
                    item.reason==="SOURCE_STATUS_UNAVAILABLE"?"حالة تفعيل المصدر غير متاحة أو غير صالحة":
                    "تاريخ السريان في سجل المصدر غير صالح أو مفقود"} · {item.count}
                </li>)}
              </ul>
            </details>:null}
          {!promotionOverlapReview.completePopulation?
            <p role="status" className="text-xs text-muted-foreground">المجتمع غير مكتمل أو توجد مصادر محجوبة؛ عدم ظهور زوج هنا لا يثبت عدم وجود تداخلات أخرى.</p>:null}
          <p className="text-xs text-muted-foreground">وقت التحليل: {new Date(promotionOverlapReview.asOf).toLocaleString("ar-YE")}</p>
        </>:<p className="text-sm text-muted-foreground">{loading?"جارٍ تحميل سجل السياسات…":"مصدر سجل السياسات غير متاح."}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">سجل القواعد المسؤولة</h3>
          <span className="text-xs text-muted-foreground">{catalog?"المسجل "+catalog.returnedCount+" من "+catalog.totalCount:"لم يُحمّل"}</span>
        </div>
        {catalog?.completePopulation===false?<p className="text-xs text-amber-700">القائمة محدودة بأحدث 200 سجل؛ لم تُعرض كامل الأرشفة.</p>:null}
        {catalog?.items.length?catalog.items.map(item=>(
          <article key={item.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{sourceLabels[item.sourceTable]} · إصدار {item.version}</strong>
              <span className="rounded-full border px-2 py-1 text-xs">{item.lifecycle==="EFFECTIVE"?"سارٍ":item.lifecycle==="SCHEDULED"?"مجدول":item.lifecycle==="SUPERSEDED"?"مستبدل":"منتهي"}</span>
            </div>
            <p className="text-sm">{item.businessRule}</p>
            <p className="text-xs text-muted-foreground">المبرر: {item.rationale}</p>
            <div className="grid gap-1 text-xs sm:grid-cols-2">
              <p>مرجع المصدر: <code>{item.sourceId}</code></p><p>مالك السياسة: <code>{item.ownerProfileId}</code></p>
              <p>الأولوية: {item.conflictPriority}</p>
              <p>من {new Date(item.effectiveFrom).toLocaleString("ar-YE")} إلى {item.effectiveUntil?new Date(item.effectiveUntil).toLocaleString("ar-YE"):"دون نهاية محددة"}</p>
            </div>
            {item.sourceChanged?<p className="text-xs font-medium text-amber-700">تغيرت بيانات المصدر منذ تسجيل هذه النسخة؛ راجعها قبل اعتماد أي إجراء.</p>:null}
            {(item.sourceTable==="pricing_rules" || item.sourceTable==="promotions")?<button type="button" className="rounded-lg border px-3 py-2 text-xs" onClick={()=>void handleRollbackPreview(item)} disabled={rollbackLoading}>
              {rollbackLoading?"جارٍ معاينة الاستعادة…":"معاينة القيم السابقة قبل الاستعادة"}
            </button>:null}
            {rollbackPreview?.sourceId===item.sourceId?<div className="rounded-lg border p-3 text-xs">
              <p className="font-semibold">{rollbackPreview.canRestore?"توجد بيانات سابقة من سجل التدقيق":"لا توجد بيانات سابقة كافية"}</p>
              <p>{rollbackPreview.requiredWorkflow}</p>
              <p className="mt-1 text-amber-700">تتطلب موافقة بشرية؛ لا تنفذ هذه الشاشة الاستعادة ولا تكتب على مصدر السياسة.</p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">{pretty({previousValue:rollbackPreview.previousValue,currentValue:rollbackPreview.currentValue,sourceAuditEventId:rollbackPreview.sourceAuditEventId})}</pre>
            </div>:null}
            <details><summary className="cursor-pointer text-xs">بيانات المصدر وأمثلة التحقق</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{pretty({currentSource:item.currentSource,testExamples:item.testExamples,sourceFingerprint:item.sourceFingerprint})}</pre>
            </details>
          </article>
        )):<p className="rounded-lg border p-3 text-sm text-muted-foreground">{loading?"جارٍ تحميل السجل…":"لا توجد بيانات حوكمة مسجلة بعد. ابدأ بربط سياسة موجودة من مصدرها الأصلي."}</p>}
      </section>

      <section className="space-y-3 rounded-lg border p-3">
        <div><h3 className="font-semibold">تسجيل مالك وإصدار ومبرر للقاعدة</h3>
          <p className="text-xs text-muted-foreground">يحفظ بيانات الحوكمة كحدث تاريخي فقط؛ لا يغير قيم السعر أو الترويج أو الائتمان أو إعادة الطلب.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span>نوع المصدر الأصلي</span>
            <select className="w-full rounded-lg border bg-background p-2" value={sourceTable} onChange={e=>setSourceTable(e.target.value as CommercePolicySourceTable)}>
              {Object.entries(sourceLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>بحث عن سجل المصدر</span>
            <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-lg border bg-background p-2" value={sourceSearch} onChange={e=>setSourceSearch(e.target.value)} placeholder="اسم أو رقم الصنف أو UUID"/>
              <button type="button" className="rounded-lg border px-3" onClick={()=>void refreshSources()} disabled={sourceLoading}>{sourceLoading?"…":"بحث"}</button></div>
          </label>
          <label className="space-y-1 text-sm"><span>السجل المراد حوكمته</span>
            <select className="w-full rounded-lg border bg-background p-2" value={sourceId} onChange={e=>setSourceId(e.target.value)}>
              {sources.map(item=><option key={item.id} value={item.id}>{item.label} · {item.status}</option>)}
            </select>
            {selectedSource?<small className="block text-muted-foreground">{selectedSource.detail} · {selectedSource.id}</small>:<small className="text-muted-foreground">لا يوجد سجل مطابق. غيّر البحث أو نوع المصدر.</small>}
          </label>
          <label className="space-y-1 text-sm"><span>مالك السياسة (مستخدم نشط بالمؤسسة)</span>
            <select className="w-full rounded-lg border bg-background p-2" value={ownerId} onChange={e=>setOwnerId(e.target.value)}>
              {owners.map(owner=><option key={owner.id} value={owner.id}>{owner.name} · {owner.roles.join("، ")||"بلا دور مسجل"}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>بداية السريان</span>
            <input type="datetime-local" className="w-full rounded-lg border bg-background p-2" value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/>
          </label>
          <label className="space-y-1 text-sm"><span>نهاية السريان (اختياري)</span>
            <input type="datetime-local" className="w-full rounded-lg border bg-background p-2" value={effectiveUntil} onChange={e=>setEffectiveUntil(e.target.value)}/>
          </label>
          <label className="space-y-1 text-sm"><span>أولوية التعارض (1 أعلى من 10000)</span>
            <input type="number" min={1} max={10000} step={1} className="w-full rounded-lg border bg-background p-2" value={priority} onChange={e=>setPriority(e.target.value)}/>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2"><span>صياغة القاعدة بلغة العمل</span>
            <textarea className="min-h-20 w-full rounded-lg border bg-background p-2" value={businessRule} onChange={e=>setBusinessRule(e.target.value)} maxLength={1000} placeholder="متى تنطبق القاعدة؟ وعلى أي معاملات؟"/>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2"><span>المبرر التجاري أو التشغيلي</span>
            <textarea className="min-h-20 w-full rounded-lg border bg-background p-2" value={rationale} onChange={e=>setRationale(e.target.value)} maxLength={2000} placeholder="لماذا توجد القاعدة؟ وما أثرها المقصود؟"/>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2"><span>أمثلة الاختبار (JSON من كائنات بيانات فقط؛ لا SQL)</span>
            <textarea dir="ltr" className="min-h-28 w-full rounded-lg border bg-background p-2 font-mono text-xs" value={examples} onChange={e=>setExamples(e.target.value)}/>
          </label>
        </div>
        <button type="button" className="rounded-lg border px-4 py-2 text-sm font-medium" onClick={()=>void handleRegister()} disabled={submitting||!sourceId||!ownerId}>
          {submitting?"جارٍ حفظ الإصدار…":"حفظ بيانات الحوكمة"}
        </button>
      </section>

      <section className="space-y-3 rounded-lg border p-3">
        <div><h3 className="font-semibold">مختبر «ماذا لو؟»</h3>
          <p className="text-xs text-muted-foreground">خمسة سيناريوهات محددة مسبقاً. الخادم يقبل الأنواع المدرجة فقط ولا ينفذ SQL أو يغير سياسة قائمة.</p></div>
        <label className="block space-y-1 text-sm"><span>نوع المحاكاة</span>
          <select className="w-full rounded-lg border bg-background p-2" value={simulationType} onChange={e=>{
            const next=e.target.value as CommercePolicySimulationType;setSimulationType(next);
            setSimulationInput(simulationTemplates[next]);setLastSimulation(null);
          }}>
            {Object.entries(simulationLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm"><span>مدخلات السيناريو (JSON بيانات فقط؛ استبدل UUIDs بسجلات حقيقية)</span>
          <textarea dir="ltr" className="min-h-36 w-full rounded-lg border bg-background p-2 font-mono text-xs" value={simulationInput} onChange={e=>setSimulationInput(e.target.value)}/>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm font-medium" onClick={()=>void handleSimulation()} disabled={simulating}>
            {simulating?"جارٍ تنفيذ المحاكاة…":"نفّذ المحاكاة وسجّل الأثر"}
          </button>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setSimulationInput(simulationTemplates[simulationType])}>إعادة المدخلات النموذجية</button>
        </div>
        {lastSimulation?<div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap justify-between gap-2"><strong>نتيجة المحاكاة المحفوظة</strong><span className="text-xs text-muted-foreground">{new Date(lastSimulation.asOf).toLocaleString("ar-YE")}</span></div>
          <p className="text-xs text-muted-foreground">مرجع الأثر: <code>{lastSimulation.simulationId}</code></p>
          <p className="text-xs text-muted-foreground">بصمة المدخلات: <code>{lastSimulation.inputFingerprint}</code></p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{pretty(lastSimulation.outcome)}</pre>
          <p className="text-xs font-medium">لا كتابة على القواعد الحية أو أرصدة العميل أو المخزون أو صندوق المهام.</p>
        </div>:null}
      </section>

      <section className="space-y-2"><h3 className="font-semibold">سجل المحاكاة</h3>
        {history.length?history.map(item=><article key={item.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{simulationLabels[item.simulationType]}</strong><span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("ar-YE")}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">مرجع العملية: <code>{item.id}</code></p>
          <details className="mt-2"><summary className="cursor-pointer text-xs">عرض النتيجة</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{pretty(item.outcome)}</pre>
          </details>
        </article>):<p className="text-sm text-muted-foreground">لا توجد محاكاة محفوظة بعد.</p>}
      </section>
    </section>
  );
}
