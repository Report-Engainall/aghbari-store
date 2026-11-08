import type { BusinessHealthMapResult, BusinessHealthCurrencyPosition } from "@/lib/intelligence/business-health-map";
import { EvidenceReferences, EvidenceStatusLabel, EvidenceWarnings, formatEvidenceNumber, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";

export interface BusinessHealthMapProps {
  result?: BusinessHealthMapResult | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
}
const money = (value: number | null, currency: string) => value === null ? "غير متاح" : formatEvidenceNumber(value) + " " + currency;

function CurrencyHealthCard({ position }: { position: BusinessHealthCurrencyPosition }) {
  const rows = [
    ["صافي السيولة المتاحة", position.netAvailableLiquidity, "الصافي = الرصيد المتاح + التحصيلات المتوقعة − الالتزامات المستحقة"],
    ["التحصيلات المتوقعة — ضمن الصافي", position.expectedCollections, "لا تُجمع مرة ثانية مع صافي السيولة"],
    ["الذمم المتأخرة", position.overdueReceivables, "عرض منفصل؛ لا تضاف إلى التحصيلات أو الصافي"],
    ["الالتزامات المستحقة — مخصومة من الصافي", position.dueObligations, "لا تُخصم مرة ثانية"],
    ["تعرض المخزون الراكد — رأس مال غير نقدي", position.stagnantStockExposure, "لا يخصم من النقد"],
  ] as const;
  return (
    <article className="rounded-xl border bg-card p-4 text-card-foreground">
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{position.currency}</h3>
        <span className="text-xs"><EvidenceStatusLabel status={position.status} /></span>
      </header>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map(([label, item, note]) => (
          <div key={label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-semibold">{money(item.value, position.currency)}</dd>
            <p className="text-xs"><EvidenceStatusLabel status={item.status} /> · {note}</p>
            <p className="text-xs">الإثبات: <EvidenceReferences ids={item.evidenceIds} /></p>
            <p className="text-xs text-muted-foreground">مصدر القياس: {item.sourceAsOf ?? "غير متاح"} · {item.sourcePeriod ? item.sourcePeriod.from + " — " + item.sourcePeriod.to : "فترة المصدر غير متاحة"}</p>
            <EvidenceWarnings warnings={item.note ? [item.note] : []} />
          </div>
        ))}
      </dl>
      <EvidenceWarnings warnings={position.warnings} />
    </article>
  );
}
export function BusinessHealthMap({ result = null, state = "ready", onRetry }: BusinessHealthMapProps) {
  const effective = state === "ready" && !result ? "unavailable" : state;
  if (effective !== "ready") return <IntelligenceStatePanel state={effective} onRetry={onRetry} errorMessage="تعذر تحميل خريطة صحة العمل." />;
  if (!result) return <IntelligenceStatePanel state="unavailable" unavailableMessage="مصادر خريطة صحة العمل غير متاحة؛ لا توجد بيانات بديلة." />;
  const currencies = [...new Set(result.cashflow.map(point => point.currency))];
  return (
    <section dir="rtl" className="space-y-4 rounded-xl border p-4" aria-label="خريطة صحة العمل ورأس المال المحجوز">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">خريطة صحة العمل ورأس المال المحجوز</h2>
          <p className="text-xs text-muted-foreground">حتى {result.asOf} · سياسة {result.policyVersion} · {result.period.from} — {result.period.to}</p>
        </div>
        <span className="text-xs"><EvidenceStatusLabel status={result.status} /></span>
      </header>
      <p className="text-sm text-muted-foreground">كل مبلغ يبقى بعملته ومصدره. لا تجمع المكونات المتداخلة، ولا تخصم تكلفة المخزون الراكد من الرصيد النقدي.</p>
      <section className="space-y-2">
        <h3 className="font-semibold">السيولة ومكونات رأس المال</h3>
        {result.currencies.length ? <div className="grid gap-3 xl:grid-cols-2">{result.currencies.map(position => <CurrencyHealthCard key={position.currency} position={position} />)}</div> : <p className="text-sm">لا توجد مراكز سيولة حسب العملة.</p>}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">التدفق النقدي المجدول</h3>
        <p className="text-xs text-muted-foreground">الأفق 7 / 30 / 90 يوماً مستقل لكل عملة؛ الفترات الثلاث لا تُجمع معاً.</p>
        {currencies.length ? currencies.map(currency => (
          <article key={currency} className="rounded-lg border p-3">
            <h4 className="font-semibold">{currency}</h4>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b text-right text-xs text-muted-foreground">
                  <th className="p-2">الأفق</th><th className="p-2">داخل</th><th className="p-2">خارج</th><th className="p-2">الرصيد المتوقع</th><th className="p-2">الحالة</th>
                </tr></thead>
                <tbody>{result.cashflow.filter(point => point.currency === currency).sort((a,b)=>a.horizonDays-b.horizonDays).map(point => (
                  <tr key={point.horizonDays} className="border-b last:border-0">
                    <td className="p-2">{point.horizonDays} يوم<span className="block text-xs text-muted-foreground">{point.period.from} — {point.period.to}</span></td>
                    <td className="p-2">{money(point.knownInflows,currency)}</td>
                    <td className="p-2">{money(point.knownOutflows,currency)}</td>
                    <td className="p-2 font-semibold">{money(point.projectedBalance,currency)}</td>
                    <td className="p-2"><EvidenceStatusLabel status={point.status} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </article>
        )) : <p className="text-sm text-muted-foreground">جدول التدفق النقدي غير متاح.</p>}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">حركة المخزون</h3>
        <p className="text-sm">عدد الأصناف: {formatEvidenceNumber(result.stock.totalProducts)} · <EvidenceStatusLabel status={result.stock.status} /></p>
        <p className="text-xs text-muted-foreground">مصدر حركة المخزون: {result.stock.sourceAsOf ?? "غير متاح"} · {result.stock.sourcePeriod ? result.stock.sourcePeriod.from + " — " + result.stock.sourcePeriod.to : "فترة المصدر غير متاحة"}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {result.stock.classes.map(item => <article key={item.classification} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{item.classification}</p>
            <p className="font-semibold">{formatEvidenceNumber(item.count)}</p>
            <EvidenceStatusLabel status={item.status} />
          </article>)}
        </div>
        {result.stock.totalsByCurrency.map(item => <article key={item.currency} className="rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><span>التعرض الراكد · {item.currency}</span><strong>{money(item.exposure,item.currency)}</strong></div>
          <p className="text-xs"><EvidenceStatusLabel status={item.status} /> · مثبت: {item.verifiedItems} · محجوب: {item.withheldItems}</p>
          <p className="text-xs">الإثبات: <EvidenceReferences ids={item.evidenceIds} /></p>
        </article>)}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">إعادة التوريد</h3>
        <p className="text-sm"><EvidenceStatusLabel status={result.replenishment.status} /> · توصيات مثبتة: {formatEvidenceNumber(result.replenishment.recommendedCount)} · لا إجراء: {formatEvidenceNumber(result.replenishment.noActionCount)} · محجوب: {formatEvidenceNumber(result.replenishment.withheldCount)}</p>
        <p className="text-xs text-muted-foreground">فترة بيانات التوريد: {result.replenishment.sourcePeriod ? result.replenishment.sourcePeriod.from + " — " + result.replenishment.sourcePeriod.to : "غير متاحة"}</p>
        {result.replenishment.recommendations.map(item => <article key={item.productRef} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
          <span>{item.productRef}</span><strong>{formatEvidenceNumber(item.quantity)} {item.quantityUnit}</strong>
          <p className="w-full text-xs">الإثبات: <EvidenceReferences ids={item.evidenceIds} /></p>
        </article>)}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">تركيز الإيراد حسب العملاء</h3>
        {result.customerFocus.length ? result.customerFocus.map(item => <article key={item.currency} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
          <span>{item.currency}</span><span>تركيز أعلى 5: {item.top5SalesConcentration === null ? "غير متاح" : formatEvidenceNumber(item.top5SalesConcentration) + "%"}</span>
          <span>العملاء: {formatEvidenceNumber(item.customerCount)} · <EvidenceStatusLabel status={item.status} /></span>
          <span className="w-full text-xs text-muted-foreground">فترة المصدر: {item.sourcePeriod.from} — {item.sourcePeriod.to}</span>
        </article>) : <p className="text-sm text-muted-foreground">تركيز العملاء غير متاح من مصدر مكتمل.</p>}
      </section>
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">تركيز قيمة سطور الفواتير حسب المنتج والعملة</h3>
          <p className="text-xs text-muted-foreground">
            صافي قيمة السطور = قيمة سطور فواتير العملاء الصادرة − الإشعارات الدائنة المنشورة والمرتبطة بسطر الفاتورة نفسه.
            كل عملة مستقلة؛ هذا ليس ربحاً صافياً ولا إجمالي المقبوضات، ولا يضم الضرائب أو التحصيلات.
          </p>
        </div>
        {result.productRevenueConcentration ? <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              الفترة {result.productRevenueConcentration.period.from} — {result.productRevenueConcentration.period.to}
              · كما في {new Date(result.productRevenueConcentration.asOf).toLocaleString("ar-YE")}
            </span>
            <EvidenceStatusLabel status={
              result.productRevenueConcentration.status === "VERIFIED" ? "VERIFIED" :
              result.productRevenueConcentration.status === "EMPTY" ? "UNAVAILABLE" : "NEEDS_REVIEW"
            } />
          </div>
          {result.productRevenueConcentration.status === "EMPTY" ?
            <p role="status" className="rounded-lg border p-3 text-sm">لا توجد فواتير صادرة ضمن الفترة المختارة؛ لذلك لا يوجد مجتمع قيمة سطور لحساب التركّز.</p> : null}
          {result.productRevenueConcentration.currencies.length ?
            <div className="grid gap-3 xl:grid-cols-2">
              {result.productRevenueConcentration.currencies.map(item=><article key={item.currency} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{item.currency}</strong>
                  <EvidenceStatusLabel status={item.status === "VERIFIED" ? "VERIFIED" : "NEEDS_REVIEW"} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground">إجمالي قيمة سطور الفواتير</p>
                    <strong>{money(item.grossInvoiceLineAmount,item.currency)}</strong>
                  </div>
                  <div className="rounded-md bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground">صافي قيمة السطور بعد الإشعارات الدائنة</p>
                    <strong>{money(item.netInvoiceLineAmount,item.currency)}</strong>
                  </div>
                  <div className="rounded-md bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground">قيمة أعلى خمسة منتجات</p>
                    <strong>{money(item.top5NetInvoiceLineAmount,item.currency)}</strong>
                  </div>
                  <div className="rounded-md bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground">تركيز أعلى خمسة منتجات</p>
                    <strong>{item.top5ConcentrationPercent===null?"غير متاح":formatEvidenceNumber(item.top5ConcentrationPercent)+"%"}</strong>
                  </div>
                </div>
                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                  <span>الفواتير: {formatEvidenceNumber(item.invoiceCount)}</span>
                  <span>سطور الفواتير: {formatEvidenceNumber(item.invoiceLineCount)}</span>
                  <span>المنتجات المرتبطة: {formatEvidenceNumber(item.productCount)}</span>
                  <span>سطور مربوطة: {formatEvidenceNumber(item.mappedLineCount)}</span>
                  <span>سطور محجوبة: {formatEvidenceNumber(item.unmappedLineCount)}</span>
                  <span>تعارضات إشعار دائن: {formatEvidenceNumber(item.invalidCreditLineCount)}</span>
                  <span>فواتير بلا سطور: {formatEvidenceNumber(item.invoicesWithoutLines)}</span>
                </div>
                {item.status!=="VERIFIED"?<p role="status" className="text-xs text-muted-foreground">
                  حُجبت نسبة التركّز وصافي القيمة لهذه العملة لأن بعض سطور الفواتير لا تملك منتجاً موثوقاً أو لأن ربط الإشعار الدائن غير مكتمل؛ لم تُقدّر القيم الناقصة.
                </p>:null}
              </article>)}
            </div>
          :null}
          <p className="text-xs text-muted-foreground">{result.productRevenueConcentration.formulaDescription}</p>
        </> : <div role="status" className="rounded-lg border p-3 text-sm">
          <strong>مصدر تركّز قيمة الفواتير غير متاح لهذه اللقطة.</strong>
          <p className="mt-1 text-xs text-muted-foreground">
            لا تعرض الخريطة أصفاراً بديلة أو نسباً تقديرية. قد تتطلب القراءة صلاحية مالية أو تطبيق ترحيل المصدر في قاعدة البيانات.
          </p>
        </div>}
      </section>
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">حركة الالتزامات المنشورة للموردين</h3>
          <p className="text-xs text-muted-foreground">
            المصدر هو قيود يومية منشورة ومربوطة بإيصالات الاستلام وإشعارات المورد الدائنة المنشورة فقط.
            تركّز أعلى خمسة محسوب من الدائن في قيود الاستلام؛ مدينة الإشعارات الدائنة منفصلة.
            لا يمثل هذا إجمالي المشتريات أو جميع فواتير الموردين أو التسويات النقدية أو رصيد الذمم الختامي.
          </p>
        </div>
        {result.supplierPostedPayableActivity ? <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>الفترة {result.supplierPostedPayableActivity.period.from} — {result.supplierPostedPayableActivity.period.to}
              · كما في {new Date(result.supplierPostedPayableActivity.asOf).toLocaleString("ar-YE")}</span>
            <EvidenceStatusLabel status={result.supplierPostedPayableActivity.status === "VERIFIED" ? "VERIFIED" :
              result.supplierPostedPayableActivity.status === "EMPTY" ? "UNAVAILABLE" : "NEEDS_REVIEW"} />
          </div>
          {result.supplierPostedPayableActivity.status === "EMPTY" ?
            <p role="status" className="rounded-lg border p-3 text-sm">لا توجد قيود مؤهلة ضمن نطاق المصدر والفترة؛ لم تُنشأ أصفار بديلة.</p> : null}
          {result.supplierPostedPayableActivity.currencies.length ? <div className="grid gap-3 xl:grid-cols-2">
            {result.supplierPostedPayableActivity.currencies.map(item => <article key={item.currency} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{item.currency}</strong><EvidenceStatusLabel status={item.status === "VERIFIED" ? "VERIFIED" : "NEEDS_REVIEW"} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md bg-muted/30 p-2"><p className="text-xs text-muted-foreground">دائن قيود إيصالات الاستلام المنشورة</p><strong>{money(item.grossPayableCreditAmount,item.currency)}</strong></div>
                <div className="rounded-md bg-muted/30 p-2"><p className="text-xs text-muted-foreground">مدين إشعارات المورد الدائنة المنشورة</p><strong>{money(item.postedSupplierCreditNoteDebitAmount,item.currency)}</strong></div>
                <div className="rounded-md bg-muted/30 p-2"><p className="text-xs text-muted-foreground">صافي حركة الالتزام ضمن النطاق</p><strong>{money(item.netPayableMovementAmount,item.currency)}</strong></div>
                <div className="rounded-md bg-muted/30 p-2"><p className="text-xs text-muted-foreground">حصة أعلى خمسة موردين من دائن الاستلام</p><strong>{item.top5GrossPayableCreditPercent===null ? "غير متاح" : formatEvidenceNumber(item.top5GrossPayableCreditPercent)+"%"}</strong></div>
                <div className="rounded-md bg-muted/30 p-2"><p className="text-xs text-muted-foreground">قيمة دائن أعلى خمسة موردين</p><strong>{money(item.top5GrossPayableCreditAmount,item.currency)}</strong></div>
              </div>
              <p className="text-xs text-muted-foreground">الموردون ذوو حركة: {formatEvidenceNumber(item.supplierCount)} · القيود المؤهلة: {formatEvidenceNumber(item.sourceEntryCount)}</p>
              {item.status!=="VERIFIED" ? <p role="status" className="text-xs text-muted-foreground">لا يوجد إجمالي دائن موجب لهذه العملة؛ حُجبت نسبة التركّز.</p> : null}
            </article>)}
          </div> : null}
          <section className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">اتجاه تركّز أعلى خمسة موردين</h4>
              <span className="text-xs">
                {result.supplierPostedPayableActivityTrend.status === "VERIFIED" ? "مقارنة قابلة للمقارنة" :
                  result.supplierPostedPayableActivityTrend.status === "PARTIAL" ? "مقارنة جزئية" :
                  result.supplierPostedPayableActivityTrend.status === "NOT_COMPARABLE" ? "لا توجد مقارنة صالحة" : "المقارنة غير متاحة"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              مقارنة أعلى خمسة موردين في كل فترة مع الفترة السابقة المساوية لها، لكل عملة مستقلة.
              قد تختلف أسماء الموردين بين الفترتين؛ التغير يقيس درجة التركّز ولا يعني أن المجموعة نفسها بقيت ثابتة.
              يتطلب المؤشر أكثر من خمسة موردين في كل فترة حتى لا تصبح النسبة 100% بحكم احتواء المجموعة على جميع الموردين.
            </p>
            {result.supplierPostedPayableActivityTrend.comparisons.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {result.supplierPostedPayableActivityTrend.comparisons.map(item => (
                  <article key={item.currency} className="rounded-md bg-muted/30 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{item.currency}</strong>
                      <span>{item.direction === "INCREASED" ? "ارتفع التركّز" :
                        item.direction === "DECREASED" ? "انخفض التركّز" : "لم يتغير تقريباً"}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div><p className="text-xs text-muted-foreground">الفترة السابقة</p><strong>{formatEvidenceNumber(item.baselinePercent)}%</strong></div>
                      <div><p className="text-xs text-muted-foreground">الفترة الحالية</p><strong>{formatEvidenceNumber(item.currentPercent)}%</strong></div>
                    </div>
                    <p className="mt-1 text-xs">
                      التغير: {item.changePercentagePoints > 0 ? "+" : ""}{formatEvidenceNumber(item.changePercentagePoints)} نقطة مئوية
                    </p>
                    <p className="text-xs text-muted-foreground">
                      عدد الموردين: {formatEvidenceNumber(item.baselineSupplierCount)} سابقاً · {formatEvidenceNumber(item.currentSupplierCount)} حالياً
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p role="status" className="text-xs text-muted-foreground">
                لم تتوفر عملة تحقق شروط المقارنة؛ لا تُستبدل الفترة أو النسبة الناقصة بصفر.
              </p>
            )}
            {result.supplierPostedPayableActivityTrend.withheld.length ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {result.supplierPostedPayableActivityTrend.withheld.map((item, index) => (
                  <li key={item.currency ?? "scope-" + index}>
                    {item.currency ? item.currency + ": " : ""}
                    {item.reason === "CURRENT_CURRENCY_MISSING" ? "لا توجد حركة مؤهلة في الفترة الحالية." :
                      item.reason === "BASELINE_CURRENCY_MISSING" ? "لا توجد حركة مؤهلة في الفترة السابقة." :
                      item.reason === "INSUFFICIENT_SUPPLIER_DIVERSITY" ? "عدد الموردين خمسة أو أقل؛ النسبة لا تصلح لمقارنة التركّز." :
                      item.reason === "CURRENCY_NEEDS_REVIEW" ? "إحدى فترتي العملة تحتاج مراجعة؛ حُجبت المقارنة." :
                      "بيانات العملة أو أدلة الفترة غير كافية للمقارنة."}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">
              الفترة السابقة: {result.supplierPostedPayableActivityTrend.baselinePeriod?.from ?? "غير متاحة"} — {result.supplierPostedPayableActivityTrend.baselinePeriod?.to ?? "غير متاحة"}
              · الحالية: {result.supplierPostedPayableActivityTrend.currentPeriod?.from ?? "غير متاحة"} — {result.supplierPostedPayableActivityTrend.currentPeriod?.to ?? "غير متاحة"}
            </p>
          </section>
          <p className="text-xs text-muted-foreground">{result.supplierPostedPayableActivity.formulaDescription}</p>
          <p className="text-xs text-muted-foreground">مجموعة القيود متصالحة بحسب مجاميع المصدر داخل النطاق المحدد، وليست إثباتاً لاكتمال كل التزامات الموردين.</p>
        </> : <div role="status" className="rounded-lg border p-3 text-sm">
          <strong>مصدر حركة الالتزامات المنشورة للموردين غير متاح لهذه اللقطة.</strong>
          <p className="mt-1 text-xs text-muted-foreground">يظل تركّز إنفاق الموردين غير قابل للحساب ما لم تتوفر مجموعة مشتريات مكتملة ومثبتة حسب المورد.</p>
        </div>}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">مؤشرات لا يمكن حسابها بالمدخلات الحالية</h3>
        {Object.entries(result.calculations).map(([key,item]) => <article key={key} className="rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">{key}</h4>
            <span className="text-xs">{item.status==="VERIFIED"?"محسوب بأدلة مكتملة":
              item.status==="PARTIAL"?"جزئي":
              item.status==="NEEDS_REVIEW"?"يحتاج مراجعة":
              item.status==="EMPTY"?"لا توجد سجلات":
              "غير قابل للحساب"}</span>
          </div>
          <p>{item.reason}</p>
          {item.missingInputs.length?<p className="text-xs text-muted-foreground">المدخلات المطلوبة/المحجوبة: {item.missingInputs.join("، ")}</p>:null}
        </article>)}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">ما يستحق الانتباه</h3>
        {result.attention.length ? result.attention.map(item => <article key={item.id} className="rounded-lg border p-3">
          <p className="text-sm font-medium">{item.message}</p>
          {item.value !== null ? <p className="text-sm">{formatEvidenceNumber(item.value)} {item.unit}</p> : null}
          <p className="text-xs text-muted-foreground">المصدر: {item.source} · الإثبات: <EvidenceReferences ids={item.evidenceIds} /></p>
        </article>) : <p className="text-sm text-muted-foreground">لا توجد استثناءات مثبتة في المدخلات المتاحة.</p>}
      </section>
      <section className="rounded-lg border p-3">
        <h3 className="font-semibold">إجمالي رأس المال المعرض للمخاطر</h3>
        <p className="mt-1 text-sm font-semibold">غير محسوب</p>
        <p className="text-xs text-muted-foreground">{result.totalCapitalAtRiskReason}</p>
      </section>
      <EvidenceWarnings warnings={result.warnings} />
    </section>
  );
}
