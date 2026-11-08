import type { SupplierQuoteComparisonAssistantResult } from "@/lib/intelligence/supplier-quote-comparison-assistant";

const number = new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 0 });

function amount(value: number, currency: string): string {
  return number.format(value) + " " + currency;
}

const withheldLabels: Record<string, string> = {
  UNIT_MISSING: "وحدة القياس غير محددة",
  PRODUCT_SNAPSHOT_MISMATCH: "لقطة اسم أو رمز الصنف غير متطابقة",
  LINE_TOTAL_MISMATCH: "إجمالي السطر لا يطابق الكمية × تكلفة الوحدة",
  INSUFFICIENT_DISTINCT_SUPPLIERS: "لا يوجد عرضان من موردين مختلفين على أساس مقارنة واحد",
};

export function SupplierQuoteComparisonAssistant({
  result,
}: {
  result: SupplierQuoteComparisonAssistantResult;
}) {
  return (
    <section dir="rtl" className="space-y-3 rounded-xl border p-3" aria-label="مقارنة عروض الموردين">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">مقارنة عروض الموردين المحفوظة</h3>
        <span className="rounded-full border px-2 py-1 text-xs">
          {result.state === "EMPTY" ? "لا توجد عروض" : result.state === "PARTIAL" ? "نطاق جزئي — حد 200 عرض" : "النطاق المعاد كامل"}
        </span>
      </header>
      <p className="text-sm">{result.answer}</p>
      <p className="text-xs text-muted-foreground">
        المصدر: {result.sourceRpc} · وقت طلب القراءة: {new Date(result.queriedAt).toLocaleString("ar-YE")}
        · العروض المعادة: {count.format(result.quoteCount)}
        · المستلمة: {count.format(result.quoteCounts.received)}
        · المرسّاة: {count.format(result.quoteCounts.awarded)}
        · المنتهية: {count.format(result.quoteCounts.expired)}
      </p>
      {result.supplierPerformance.status !== "NOT_REQUESTED" ? (
        <p className="text-xs text-muted-foreground">
          أداء التوريد الفعلي: {result.supplierPerformance.status === "READY" ? "نطاق مكتمل" :
            result.supplierPerformance.status === "PARTIAL" ? "نطاق جزئي" :
            result.supplierPerformance.status === "DENIED" ? "غير مصرح" : "المصدر غير متاح"}
          {result.supplierPerformance.period
            ? " · الفترة " + result.supplierPerformance.period.from + " إلى " + result.supplierPerformance.period.to + " UTC"
            : ""}
          {result.supplierPerformance.returnedSupplierCount !== null
            ? " · الموردون المعادون " + count.format(result.supplierPerformance.returnedSupplierCount) + " من " + count.format(result.supplierPerformance.totalSupplierCount ?? 0)
            : ""}
        </p>
      ) : null}

      {result.comparisons.map((item) => (
        <article key={item.key} className="space-y-2 rounded-lg border p-3">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold">{item.productName}</h4>
              <p className="text-xs text-muted-foreground">{item.itemCode} · {count.format(item.quantity)} {item.unit}</p>
            </div>
            <span className="text-xs">{count.format(item.offerCount)} موردين · العملة {item.currency}</span>
          </header>
          <ol className="space-y-1">
            {item.offers.map((offer, index) => (
              <li key={offer.quoteNumber + ":" + offer.supplierName} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-2 text-sm">
                <span>
                  <strong>{offer.supplierName}</strong>
                  <span className="ms-2 text-xs text-muted-foreground">عرض {offer.quoteNumber}</span>
                  {index === 0 ? <span className="ms-2 text-xs">أقل تكلفة وحدة مسجلة</span> : null}
                </span>
                <div className="text-start">
                  <strong className="tabular-nums">{amount(offer.unitCost, item.currency)}</strong>
                  <p className="text-xs text-muted-foreground">التوريد: {offer.deliveryDays === null ? "غير محدد" : count.format(offer.deliveryDays) + " يوم"}</p>
                  <p className="text-xs text-muted-foreground">الدفع: {offer.paymentTerms ?? "الشروط غير مسجلة"}</p>
                  {offer.validUntil ? <p className="text-xs text-muted-foreground">صالح حتى: {offer.validUntil}</p> : null}
                  {offer.supplierPerformance?.state === "AVAILABLE" ? (
                    <p className="text-xs text-muted-foreground">
                      الأداء الفعلي · أوامر: {count.format(offer.supplierPerformance.purchaseOrderCount ?? 0)}
                      · مكتمل: {count.format(offer.supplierPerformance.completedOrderCount ?? 0)}
                      · مفتوح: {count.format(offer.supplierPerformance.openOrderCount ?? 0)}
                      · متبقي: {count.format(offer.supplierPerformance.backlogLineCount ?? 0)} سطر
                    </p>
                  ) : null}
                  {offer.supplierPerformance?.state === "AVAILABLE" ? (
                    <p className="text-xs text-muted-foreground">
                      أوامر موسومة مستلمة دون إثبات اكتمالها: {count.format(offer.supplierPerformance.inconsistentReceivedCount ?? 0)}
                      {" · "}أوامر مكتملة دون مدة توريد مسجلة: {count.format(offer.supplierPerformance.completedWithoutPromiseCount ?? 0)}
                    </p>
                  ) : null}
                  {offer.supplierPerformance?.state === "AVAILABLE" ? (
                    <p className="text-xs text-muted-foreground">
                      وسيط زمن الاستلام: {offer.supplierPerformance.medianLeadDays === null
                        ? "غير متاح — أقل من 3 عينات"
                        : count.format(offer.supplierPerformance.medianLeadDays) + " يوم"}
                      {" · "}عينات الزمن: {count.format(offer.supplierPerformance.leadTimeSampleCount ?? 0)}
                      {" · "}P90: {offer.supplierPerformance.p90LeadDays === null
                        ? "غير متاح — يلزم 10 عينات"
                        : count.format(offer.supplierPerformance.p90LeadDays) + " يوم"}
                      {" · "}الالتزام: {offer.supplierPerformance.onTimePercent === null
                        ? "غير متاح — أقل من 3 عينات"
                        : number.format(offer.supplierPerformance.onTimePercent) + "%"}
                      {" · "}عينات الموعد: {count.format(offer.supplierPerformance.promisedDeliverySampleCount ?? 0)}
                    </p>
                  ) : null}
                  {offer.supplierPerformance?.state === "NO_ELIGIBLE_ORDERS_IN_PERIOD" ? (
                    <p className="text-xs text-muted-foreground">لا توجد أوامر شراء مؤهلة لقياس الأداء لهذا المورد في الفترة المعروضة.</p>
                  ) : null}
                  {offer.supplierPerformance?.state === "NOT_IN_RETURNED_PAGE" ? (
                    <p className="text-xs text-muted-foreground">لم يظهر هذا المورد في صفحة أداء الموردين الجزئية؛ لا يمكن الجزم بغياب نشاطه.</p>
                  ) : null}
                  {offer.supplierPerformance?.state === "SOURCE_UNAVAILABLE" ? (
                    <p className="text-xs text-muted-foreground">مؤشرات الأداء الفعلي غير متاحة.</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {item.omittedOfferCount > 0 ? (
            <p className="text-xs text-muted-foreground">عُرضت أفضل 10 أسعار وحدة فقط من أصل {count.format(item.offerCount)} عرض.</p>
          ) : null}
          {item.secondLowestUnitCost !== null ? (
            <p className="text-xs text-muted-foreground">
              الفارق بين أقل تكلفة والثانية: {amount(item.differenceToNextUnitCost ?? 0, item.currency)} لكل وحدة على هذا الأساس فقط.
            </p>
          ) : null}
          <div className="rounded-md border p-2 text-xs">
            <p>أقصر مدة توريد مسجلة: {item.deliveryProfile.shortestDays === null ? "غير محددة" : count.format(item.deliveryProfile.shortestDays) + " يوم"} · عدد العروض التي سجلت مدة: {count.format(item.deliveryProfile.withDays)} · غير المسجل: {count.format(item.deliveryProfile.withoutDays)}</p>
            <p>شروط دفع مسجلة: {count.format(item.paymentTermsCoverage.recorded)} · غير مسجلة: {count.format(item.paymentTermsCoverage.missing)}</p>
          </div>
        </article>
      ))}

      {result.priceHistoryGroupCount > 0 ? (
        <section className="space-y-2 rounded-lg border p-3">
          <h4 className="font-semibold">سجل تغير أسعار الموردين المحفوظ</h4>
          <p className="text-xs text-muted-foreground">
            مقارنة أول وآخر عرض مؤرخ في الصفحة المعادة، لنفس المورد والصنف والكمية والوحدة والعملة. يشمل العروض المستلمة والمرساة والمنتهية كسجل تاريخي، ولا يمثل سعراً حالياً أو توقعاً.
          </p>
          {result.priceHistory.map(item => (
            <article key={item.key} className="rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{item.productName} · {item.supplierName}</strong>
                <span>{item.currency} · {count.format(item.quantity)} {item.unit}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {item.first.quoteNumber} ({new Date(item.first.createdAt).toLocaleDateString("ar-YE")})
                {" "}→{" "}
                {item.latest.quoteNumber} ({new Date(item.latest.createdAt).toLocaleDateString("ar-YE")})
              </p>
              <p>
                {amount(item.first.unitCost, item.currency)} → {amount(item.latest.unitCost, item.currency)}
                {" · "}
                {item.direction === "INCREASED" ? "ارتفاع مسجل" : item.direction === "DECREASED" ? "انخفاض مسجل" : "دون تغير"}
                {" · "}
                {amount(Math.abs(item.changeAmount), item.currency)}
                {item.changePercent === null ? " · لا تحسب النسبة لأن سعر البداية صفر" : " · " + number.format(Math.abs(item.changePercent)) + "%"}
              </p>
              <p className="text-xs text-muted-foreground">
                عدد العروض المؤرخة: {count.format(item.quoteCount)} · الحالة الأخيرة:
                {" "}{item.latest.status === "awarded" ? "مرسى" : item.latest.status === "expired" ? "منتهي" : "مستلم"}
              </p>
            </article>
          ))}
          {result.priceHistoryTruncated ? (
            <p className="text-xs text-muted-foreground">عُرضت أول 40 مجموعة من سجل تغير الأسعار.</p>
          ) : null}
        </section>
      ) : null}
      {result.comparisonGroupCount === 0 ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">لا توجد مجموعة سعرية مؤهلة للمقارنة حالياً؛ لم تُعرض عروض غير متوافقة كأنها قابلة للمقارنة.</p>
      ) : null}
      {result.withheldGroupCount > 0 ? (
        <section className="space-y-2 rounded-lg border p-3">
          <h4 className="text-sm font-semibold">مجموعات حُجبت عن المقارنة ({count.format(result.withheldGroupCount)})</h4>
          {result.withheld.map((item) => (
            <p key={item.key} className="text-xs text-muted-foreground">
              {item.productName} · {item.itemCode}: {withheldLabels[item.reason] ?? "أساس المقارنة غير مكتمل"}
            </p>
          ))}
          {result.withheldGroupCount > result.withheld.length ? (
            <p className="text-xs text-muted-foreground">توجد مجموعات أخرى محجوبة لم تُعرض هنا.</p>
          ) : null}
        </section>
      ) : null}
      {result.comparisonsTruncated ? (
        <p className="text-xs text-muted-foreground">عُرضت أول 20 مجموعة مقارنة من أصل {count.format(result.comparisonGroupCount)}.</p>
      ) : null}
      {result.warnings.map((warning) => (
        <p key={warning} className="text-xs text-muted-foreground">
          {warning.startsWith("SOURCE_LIMIT_REACHED")
            ? "تنبيه تغطية: الخدمة تعيد أحدث 200 عرض فقط ولا تعيد إجمالي السجل أو مؤشراً للصفحات السابقة."
            : warning.startsWith("NON_COMPARABLE_OFFERS_WITHHELD")
              ? "حُجبت المقارنات غير المتطابقة في الكمية أو الوحدة أو العملة أو لقطة الصنف أو إجمالي السطر."
              : "توجد مجموعات إضافية لم تظهر في هذه الصفحة."}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        تكلفة الوحدة ومدة التوريد الموعودة وشروط الدفع منفصلة عن أداء المورد الفعلي. الوسيط يحتاج 3 عينات، وP90 يحتاج 10 عينات، ومعدل الالتزام يحتاج 3 مواعيد توريد مقاسة. عدد الأوامر الموسومة مستلمة دون إثبات اكتمالها مؤشر حالة مصدر لا يثبت خطأ موظف أو عجز مخزون. لا يوجد مجموع نقاط أو ترسية تلقائية.
      </p>
    </section>
  );
}
