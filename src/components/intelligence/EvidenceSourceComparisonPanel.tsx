import type {
  EvidenceSourceComparison,
  EvidenceSourceComparisonReason,
  EvidenceMetricComparisonSide,
} from "@/lib/intelligence/evidence-source-comparison";

export type EvidenceSourceComparisonPanelState =
  | "loading" | "empty" | "error" | "unavailable" | "ready";

export interface EvidenceSourceComparisonPanelProps {
  comparison?: EvidenceSourceComparison | null;
  state?: EvidenceSourceComparisonPanelState;
  errorMessage?: string;
  onRetry?: () => void;
}

const statusLabels: Record<EvidenceSourceComparison["status"], string> = {
  MATCHED: "متطابق",
  VARIANCE: "يوجد تباين",
  NOT_COMPARABLE: "غير قابل للمقارنة",
  WITHHELD: "المقارنة محجوبة",
};

const reasonLabels: Record<EvidenceSourceComparisonReason, string> = {
  INVALID_INPUT: "بيانات طلب المقارنة غير صالحة.",
  COMPARISON_KEY_REQUIRED: "مفتاح المقارنة غير متوفر؛ لا يمكن إثبات أن المصدرين يخصان الكيان نفسه.",
  LEFT_PASSPORT_INVALID: "لقطة المصدر الأول غير صالحة.",
  RIGHT_PASSPORT_INVALID: "لقطة المصدر الثاني غير صالحة.",
  LEFT_METRIC_MISSING: "المؤشر غير موجود في المصدر الأول.",
  RIGHT_METRIC_MISSING: "المؤشر غير موجود في المصدر الثاني.",
  METRIC_AMBIGUOUS: "يوجد أكثر من سجل للمؤشر نفسه في إحدى اللقطتين.",
  LEFT_EVIDENCE_NOT_VERIFIED: "أدلة المصدر الأول غير مكتملة أو غير مقبولة.",
  RIGHT_EVIDENCE_NOT_VERIFIED: "أدلة المصدر الثاني غير مكتملة أو غير مقبولة.",
  METRIC_VALUE_NOT_NUMERIC: "إحدى القيم ليست رقماً صالحاً للمقارنة.",
  METRIC_VALUE_PRECISION_INVALID: "إحدى القيم تتجاوز دقة العملة أو تحتوي على كسور غير مقبولة.",
  METRIC_VALUE_OUT_OF_RANGE: "إحدى القيم تتجاوز الحدود الرقمية الآمنة.",
  ZERO_BASELINE_PERCENT_UNDEFINED: "خط الأساس يساوي صفراً؛ الفرق المطلق متاح لكن النسبة غير معرفة.",
  METRIC_UNIT_MISMATCH: "وحدة المؤشر مختلفة.",
  CURRENCY_MISMATCH: "العملة مختلفة أو غير محددة.",
  UNIT_OF_MEASURE_MISMATCH: "وحدة الصنف أو القياس مختلفة.",
  PERIOD_MISSING_OR_MISMATCH: "فترة القياس مختلفة أو غير مكتملة.",
  AS_OF_MISMATCH: "وقت احتساب المصدرين مختلف.",
  FORMULA_MISMATCH: "معادلة الحساب أو إصدارها مختلف.",
  COMPARISON_ARITHMETIC_UNSAFE: "الفرق الحسابي غير آمن؛ لم يتم احتسابه.",
};

function sourceAgeLabel(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds < 0) return "غير متاح";
  if (milliseconds < 60_000) return Math.floor(milliseconds / 1000) + " ثانية";
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return minutes + " دقيقة";
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return days + " يوم و" + (hours % 24) + " ساعة";
  return hours + " ساعة و" + (minutes % 60) + " دقيقة";
}

const value = (amount: number | null, unit: string, currency: string | null) => {
  if (amount === null) return "غير متاح";
  const formatted = new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 4 }).format(amount);
  return [formatted, currency ?? (unit === "CURRENCY" || unit === "CURRENCY_PER_UNIT" ? "عملة غير محددة" : unit)]
    .filter(Boolean).join(" ");
};

function SourceSide({
  label,
  side,
}: {
  label: string;
  side: EvidenceMetricComparisonSide | null;
}) {
  if (!side) {
    return (
      <article className="rounded-lg border p-3" aria-label={label}>
        <h4 className="font-semibold">{label}</h4>
        <p className="mt-2 text-sm text-muted-foreground">لا توجد لقطة موثوقة لهذا الجانب.</p>
      </article>
    );
  }

  return (
    <article className="min-w-0 rounded-lg border p-3" aria-label={label}>
      <h4 className="font-semibold">{label}</h4>
      <p className="mt-2 break-words text-xl font-bold tabular-nums">
        {value(side.value, side.unit, side.currency)}
      </p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">الحالة</dt>
          <dd>{side.status} · {side.completeness} · {side.quality}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">الفترة</dt>
          <dd>{side.period ? side.period.from + " — " + side.period.to : "غير متاحة"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">وقت القياس</dt>
          <dd dir="ltr">{side.asOf}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">وحدة الصنف</dt>
          <dd>{side.unitOfMeasure ?? "غير منطبقة/غير محددة"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">المعادلة</dt>
          <dd className="break-all" dir="ltr">{side.formulaId}@{side.formulaVersion}</dd>
        </div>
      </dl>
      <div className="mt-3 border-t pt-2">
        <p className="text-xs font-semibold">مصدر القيمة ووقته</p>
        {side.sources.length ? (
          <ul className="mt-1 space-y-2">
            {side.sources.map((source, index) => (
              <li key={source.sourceKind + source.sourceName + source.sourceTimestamp + index} className="text-xs">
                <p className="break-words font-medium">{source.sourceName} · {source.sourceKind}</p>
                <p className="text-muted-foreground">
                  نسخة المصدر: {source.sourceVersion ?? "غير محددة"} · وقت المصدر: {source.sourceTimestamp}
                </p>
                <p className="text-muted-foreground">
                  الفاصل بين تحديث المصدر ووقت القياس: {sourceAgeLabel(source.sourceAgeMilliseconds)}
                </p>
                <p className="text-muted-foreground">
                  جودة الإثبات: {source.status} · {source.completeness} · {source.quality}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">لا توجد مراجع مصدر صالحة قابلة للعرض.</p>
        )}
      </div>
    </article>
  );
}

function StateMessage({
  state,
  errorMessage,
  onRetry,
}: {
  state: Exclude<EvidenceSourceComparisonPanelState, "ready">;
  errorMessage: string;
  onRetry?: () => void;
}) {
  const messages: Record<Exclude<EvidenceSourceComparisonPanelState, "ready">, string> = {
    loading: "جارٍ تحميل لقطتي المصدر…",
    empty: "لا توجد مقارنة محددة للفترة أو المؤشر المختار.",
    error: errorMessage,
    unavailable: "مصدر المقارنة غير متاح؛ لم تُعرض قيم بديلة.",
  };
  return (
    <section
      role={state === "error" ? "alert" : "status"}
      dir="rtl"
      className="rounded-xl border p-4 text-sm"
    >
      <p>{messages[state]}</p>
      {state === "error" && onRetry ? (
        <button type="button" className="mt-3 rounded-lg border px-3 py-2" onClick={onRetry}>
          إعادة المحاولة
        </button>
      ) : null}
    </section>
  );
}

export function EvidenceSourceComparisonPanel({
  comparison = null,
  state = "ready",
  errorMessage = "تعذر تحميل مقارنة المصدرين.",
  onRetry,
}: EvidenceSourceComparisonPanelProps) {
  if (state !== "ready") {
    return <StateMessage state={state} errorMessage={errorMessage} onRetry={onRetry} />;
  }
  if (!comparison) {
    return <StateMessage state="unavailable" errorMessage={errorMessage} />;
  }
  return (
    <section
      dir="rtl"
      className="space-y-3 rounded-xl border p-4 text-card-foreground"
      aria-label="مقارنة مصدرين للبيانات"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">مقارنة مصدرين</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            المؤشر: <span dir="ltr">{comparison.metricKey}</span> · مفتاح المقارنة:{" "}
            <span dir="ltr">{comparison.comparisonKey ?? "غير متاح"}</span>
          </p>
        </div>
        <span className="rounded-full border px-2 py-1 text-xs">
          {statusLabels[comparison.status]}
        </span>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <SourceSide label="المصدر الأول" side={comparison.left} />
        <SourceSide label="المصدر الثاني" side={comparison.right} />
      </div>

      {comparison.difference !== null ? (
        <section className="rounded-lg border p-3">
          <h4 className="text-sm font-semibold">الفرق المحسوب</h4>
          <p className="mt-1 text-lg font-bold tabular-nums">
            {new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 4 }).format(comparison.difference)}
          </p>
          <p className="text-xs text-muted-foreground">
            نسبة التغير: {comparison.differencePercent === null
              ? "غير معرفة لخط أساس صفري"
              : new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(comparison.differencePercent) + "%"}
          </p>
        </section>
      ) : null}

      {comparison.reasons.length ? (
        <section className="rounded-lg border p-3">
          <h4 className="text-sm font-semibold">حدود المقارنة وأسبابها</h4>
          <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">
            {comparison.reasons.map(reason => <li key={reason}>{reasonLabels[reason]}</li>)}
          </ul>
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">{comparison.explanation}</p>
      <p className="text-xs text-muted-foreground">
        لم يتم حساب متوسط بين المصدرين ولم يُعدّل أي مصدر أو سجل تشغيلي. الفاصل الزمني المعروض ليس حكماً على حداثة المصدر؛ يتطلب تصنيف التأخر مهلة معتمدة خاصة بنوع المصدر.
      </p>
    </section>
  );
}
