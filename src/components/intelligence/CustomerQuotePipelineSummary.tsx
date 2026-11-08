import type { CustomerQuotePipelineResult } from "@/lib/intelligence/customer-quote-pipeline";

const count = new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 1 });

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <strong className="text-xl tabular-nums">{count.format(value)}</strong>
    </article>
  );
}

export function CustomerQuotePipelineSummary({ result }: { result: CustomerQuotePipelineResult }) {
  return (
    <section dir="rtl" className="space-y-3 rounded-xl border p-3" aria-label="مسار عروض أسعار العملاء">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">مسار عروض أسعار العملاء</h3>
        <span className="rounded-full border px-2 py-1 text-xs">
          {result.state === "EMPTY" ? "لا توجد عروض" : "مجتمع كامل حسب المصدر"}
        </span>
      </header>
      <p className="text-sm">{result.answer}</p>
      <p className="text-xs text-muted-foreground">
        تاريخ إنشاء العروض: {result.period.from} إلى {result.period.to} UTC
        · الحالة كما في {new Date(result.statusAsOf).toLocaleString("ar-YE")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="إجمالي الطلبات" value={result.totalQuotes}/>
        <Metric label="بانتظار تسعير الفريق" value={result.requestedForPricing}/>
        <Metric label="بانتظار قرار العميل" value={result.awaitingCustomerResponse}/>
        <Metric label="مقبولة من العميل" value={result.accepted}/>
        <Metric label="مرفوضة من العميل" value={result.rejected}/>
        <Metric label="منتهية" value={result.expired}/>
      </div>
      <article className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">قبول العروض التي صدر بشأنها قرار صريح (مقبول أو مرفوض)</p>
        <strong className="text-xl tabular-nums">
          {result.acceptanceRatePercent === null ? "غير متاح" : rate.format(result.acceptanceRatePercent) + "%"}
        </strong>
        <p className="text-xs text-muted-foreground">
          القرارات الصريحة: {count.format(result.decidedCount)}
          {result.acceptanceRatePercent === null ? " · يلزم 3 قرارات صريحة على الأقل" : ""}
        </p>
      </article>
      <div className="rounded-lg border p-3 text-xs text-muted-foreground">
        لا تمثل الموافقة على عرض السعر إنشاء طلب بيع. لا يوجد في مصدر العروض رابط موثق إلى أمر بيع؛ لذلك لا يعرض هذا المؤشر معدل تحويل العروض إلى طلبات، ولا زمن الاستجابة لغياب وقت قرار مستقل.
      </div>
      {result.warnings.map((warning) => (
        <p key={warning} className="text-xs text-muted-foreground">
          {warning.startsWith("COHORT_BY_CREATED_AT")
            ? "الفترة حسب تاريخ إنشاء العرض، والحالات حسب الوضع الحالي وقت القراءة."
            : warning.startsWith("ACCEPTANCE_IS_NOT_ORDER_CONVERSION")
              ? "القبول يصف قرار العميل فقط، وليس بيعاً أو طلباً مؤكداً."
              : warning.startsWith("NO_RESPONSE_TIMESTAMP")
                ? "لا يمكن حساب زمن التسعير أو استجابة العميل من هذا المصدر."
                : "حُجب معدل القبول لصغر عينة القرارات الصريحة."}
        </p>
      ))}
    </section>
  );
}
