import type {
  EvidencePassport as PassportData,
  EvidenceRecord,
  EvidenceStatus,
  MetricSnapshot,
} from "@/lib/intelligence/types";

export type EvidencePassportState = "loading" | "empty" | "error" | "unavailable" | "ready";

export interface EvidencePassportProps {
  passport?: PassportData | null;
  state?: EvidencePassportState;
  errorMessage?: string;
  onRetry?: () => void;
}

const labels: Record<EvidenceStatus, string> = {
  VERIFIED: "مثبت",
  NEEDS_REVIEW: "يحتاج مراجعة",
  UNVERIFIED: "غير مثبت",
  UNAVAILABLE: "غير متاح",
};

function displayMetricValue(metric: MetricSnapshot): string {
  if (metric.value === null) return "غير متاح";
  if (metric.unit !== "CURRENCY") return String(metric.value) + " " + metric.unit;
  return String(metric.value) + " " + (metric.currency ?? "عملة غير محددة");
}

function EvidencePassportStatePanel({
  state,
  errorMessage,
  onRetry,
}: {
  state: Exclude<EvidencePassportState, "ready">;
  errorMessage: string;
  onRetry?: () => void;
}) {
  if (state === "loading") {
    return <section role="status" dir="rtl" className="rounded-xl border p-4 text-sm">جارٍ تحميل سجل الأدلة…</section>;
  }
  if (state === "empty") {
    return <section role="status" dir="rtl" className="rounded-xl border p-4 text-sm">لا توجد مؤشرات أو أدلة للفترة المحددة.</section>;
  }
  if (state === "unavailable") {
    return <section role="note" dir="rtl" className="rounded-xl border p-4 text-sm">مصدر الأدلة غير متاح. لم تُعرض بيانات بديلة.</section>;
  }
  return (
    <section role="alert" dir="rtl" className="rounded-xl border p-4 text-sm">
      <p>{errorMessage}</p>
      {onRetry ? <button type="button" className="mt-3 rounded-lg border px-3 py-2" onClick={onRetry}>إعادة المحاولة</button> : null}
    </section>
  );
}

function EvidenceStatusText({ status }: { status: EvidenceStatus }) {
  return <span>{labels[status]}</span>;
}

function MetricLineage({ metric }: { metric: MetricSnapshot }) {
  const evidenceIds = metric.lineage.evidenceIds.join("، ") || "لا يوجد مصدر";
  const formulaId = metric.lineage.formulaId || "غير محددة";
  const formulaVersion = metric.lineage.formulaVersion || "غير محدد";

  return (
    <p className="mt-1 text-xs text-muted-foreground">
      المصدر: {evidenceIds} · المعادلة: {formulaId} / {formulaVersion}
    </p>
  );
}

function MetricCalculationDetails({
  metric,
  evidenceRecords,
}: {
  metric: MetricSnapshot;
  evidenceRecords: EvidenceRecord[];
}) {
  const evidenceById = new Map(evidenceRecords.map((record) => [record.id, record]));
  const included = metric.lineage.evidenceIds.map((id) => ({ id, record: evidenceById.get(id) ?? null }));
  const missing = included.filter((item) => item.record === null);

  return (
    <details className="mt-3 rounded-lg border p-3 text-xs">
      <summary className="cursor-pointer font-semibold">كيف حُسب هذا المؤشر؟</summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div><dt className="text-muted-foreground">معرّف المعادلة</dt><dd className="break-all">{metric.lineage.formulaId || "غير محدد"}</dd></div>
        <div><dt className="text-muted-foreground">نسخة المعادلة</dt><dd>{metric.lineage.formulaVersion || "غير محددة"}</dd></div>
        <div><dt className="text-muted-foreground">وقت الحساب</dt><dd>{metric.lineage.calculatedAt || "غير متاح"}</dd></div>
        <div><dt className="text-muted-foreground">توقيت المصدر (As of)</dt><dd>{metric.asOf}</dd></div>
        <div><dt className="text-muted-foreground">الفترة</dt><dd>{metric.period ? metric.period.from + " — " + metric.period.to : "لا تنطبق / غير مقدمة"}</dd></div>
        <div><dt className="text-muted-foreground">الوحدة</dt><dd>{metric.unit}{metric.unitOfMeasure ? " · " + metric.unitOfMeasure : ""}{metric.currency ? " · " + metric.currency : ""}</dd></div>
        <div><dt className="text-muted-foreground">اكتمال البيانات</dt><dd>{metric.completeness}</dd></div>
        <div><dt className="text-muted-foreground">جودة البيانات</dt><dd>{metric.quality}</dd></div>
      </dl>
      <div className="mt-3">
        <h5 className="font-semibold">التحويلات والمرشحات المسجلة</h5>
        {metric.lineage.transformations.length
          ? <ul className="mt-1 list-disc space-y-1 ps-5">{metric.lineage.transformations.map((item, i) => <li key={i}>{item}</li>)}</ul>
          : <p className="mt-1 text-muted-foreground">لا توجد تحويلات مسجلة في عقد المؤشر.</p>}
      </div>
      <div className="mt-3">
        <h5 className="font-semibold">السجلات الداخلة في الحساب ({included.length})</h5>
        {included.length ? <div className="mt-2 space-y-2">{included.map(({ id, record }) => (
          <article key={id} className="rounded-md bg-muted/40 p-2">
            {record ? <>
              <p className="font-semibold">{record.source.name} · {record.source.kind}</p>
              <p>معرّف سجل المصدر: {record.source.recordId ?? "غير متوفر"} · نسخة المصدر: {record.source.version ?? "غير محددة"}</p>
              <p>وقت المصدر: {record.sourceTimestamp} · As of: {record.asOf}</p>
              <p>الفترة: {record.period ? record.period.from + " — " + record.period.to : "غير محددة"} · العملة: {record.currency ?? "لا تنطبق / غير متاحة"}</p>
              <p>الحالة: {labels[record.status]} · الاكتمال: {record.completeness} · الجودة: {record.quality}</p>
              {record.warnings.length ? <p>تحذيرات المصدر: {record.warnings.join("، ")}</p> : null}
            </> : <p>معرّف الدليل {id}: السجل غير موجود داخل جواز الأدلة.</p>}
          </article>
        ))}</div> : <p className="mt-1 text-muted-foreground">لم يُسجل المؤشر أي مصدر؛ لا يمكن اعتباره مثبتاً.</p>}
      </div>
      <div className="mt-3">
        <h5 className="font-semibold">السجلات المستبعدة</h5>
        <p className="mt-1 text-muted-foreground">عقد المصدر الحالي لا يرسل معرّفات السجلات المستبعدة؛ لذلك لا يمكن عرض قائمة استبعاد مؤكدة أو اختلاقها.</p>
      </div>
      {missing.length ? <p className="mt-2 text-amber-700">أدلة مفقودة: {missing.map((item) => item.id).join("، ")}</p> : null}
    </details>
  );
}

function EvidenceMetricCard({
  metric,
  evidenceRecords,
}: {
  metric: MetricSnapshot;
  evidenceRecords: EvidenceRecord[];
}) {
  return (
    <article data-testid="evidence-metric-card" className="rounded-lg border p-3">
      <div className="flex flex-wrap justify-between gap-2">
        <strong className="text-sm">{metric.key}</strong>
        <EvidenceStatusText status={metric.status} />
      </div>
      <p className="mt-1 text-sm">{displayMetricValue(metric)}</p>
      <MetricLineage metric={metric} />
      <MetricCalculationDetails metric={metric} evidenceRecords={evidenceRecords} />
      {metric.warnings.length > 0 ? (
        <p className="mt-2 text-xs">تحذيرات المؤشر: {metric.warnings.join("، ")}</p>
      ) : null}
    </article>
  );
}

function EvidenceMetricList({ metrics, evidenceRecords }: { metrics: MetricSnapshot[]; evidenceRecords: EvidenceRecord[] }) {
  return (
    <div className="mt-3 space-y-3">
      {metrics.map((metric) => <EvidenceMetricCard key={metric.id} metric={metric} evidenceRecords={evidenceRecords} />)}
    </div>
  );
}

function EvidenceRecordRow({ record }: { record: EvidenceRecord }) {
  return (
    <li className="rounded-md border p-2">
      <p className="font-medium">{record.source.name} · {record.source.kind} · <EvidenceStatusText status={record.status} /></p>
      <p>وقت المصدر: {record.sourceTimestamp} · As of: {record.asOf}</p>
      <p>الاكتمال: {record.completeness} · الجودة: {record.quality}</p>
      {record.warnings.length ? <p>تحذيرات: {record.warnings.join("، ")}</p> : null}
    </li>
  );
}

function EvidenceRecordList({ records }: { records: EvidenceRecord[] }) {
  if (records.length === 0) return null;
  return (
    <div className="mt-4 border-t pt-3">
      <h4 className="text-sm font-semibold">المصادر</h4>
      <ul className="mt-2 space-y-1 text-xs">
        {records.map((record) => <EvidenceRecordRow key={record.id} record={record} />)}
      </ul>
    </div>
  );
}

function EvidencePassportContent({ passport }: { passport: PassportData }) {
  return (
    <section dir="rtl" className="rounded-xl border p-4 text-card-foreground">
      <header className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">جواز الأدلة</h3>
        <span className="text-xs">الحالة: <EvidenceStatusText status={passport.status} /></span>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        As of: {passport.asOf} · الاكتمال: {passport.completeness}
      </p>
      <EvidenceMetricList metrics={passport.metrics} evidenceRecords={passport.evidenceRecords} />
      {passport.warnings.length ? <p className="mt-3 rounded-lg border p-3 text-xs">تحذيرات جواز الأدلة: {passport.warnings.join("، ")}</p> : null}
      <EvidenceRecordList records={passport.evidenceRecords} />
    </section>
  );
}

export function EvidencePassport({
  passport,
  state = "ready",
  errorMessage = "تعذر تحميل سجل الأدلة.",
  onRetry,
}: EvidencePassportProps) {
  if (state !== "ready") {
    return <EvidencePassportStatePanel state={state} errorMessage={errorMessage} onRetry={onRetry} />;
  }
  if (!passport) {
    return <section role="status" dir="rtl" className="rounded-xl border p-4 text-sm">سجل الأدلة غير متوفر.</section>;
  }
  return <EvidencePassportContent passport={passport} />;
}
