import type { LiquidityMetricEvidence, LiquidityPosition, LiquiditySnapshot } from "@/lib/intelligence/liquidity";
import {
  EvidenceReferences,
  EvidenceStatusLabel,
  EvidenceWarnings,
  formatEvidenceNumber,
  IntelligenceStatePanel,
  type IntelligenceViewState,
} from "./shared";

export interface LiquiditySummaryProps {
  snapshot?: LiquiditySnapshot | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
}

const amount = (value: number | null, currency: string) =>
  value === null ? "غير متاح" : formatEvidenceNumber(value) + " " + currency;

type LiquidityMetricStatus = LiquidityPosition["status"];

function LiquidityMetricEvidenceDetails({ evidence }: { evidence?: LiquidityMetricEvidence }) {
  if (!evidence) return null;
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer">مصدر واحتساب المؤشر</summary>
      <div className="mt-2 space-y-1 rounded-md bg-muted/30 p-2">
        <p>حالة المصدر: <EvidenceStatusLabel status={evidence.status} /> · العملة المطلوبة: {evidence.currency} · عملة سجل المصدر: {evidence.sourceCurrency ?? "غير متاحة"}</p>
        <p>وقت احتساب المؤشر: {evidence.calculatedAt ?? "غير متاح"} · تاريخ اللقطة المصدرية: {evidence.sourceAsOf ?? "غير متاح"}</p>
        <p>فترة المصدر: {evidence.sourcePeriod ? evidence.sourcePeriod.from + " — " + evidence.sourcePeriod.to : "غير محددة"}</p>
        <p>المعادلة المصدرية: {evidence.formulaId && evidence.formulaVersion ? evidence.formulaId + "@" + evidence.formulaVersion : "غير متاحة"}</p>
        <p>معرّف القياس: {evidence.metricId ?? "لا يوجد قياس مربوط"}</p>
        <p>مراجع الإثبات: <EvidenceReferences ids={evidence.evidenceIds} /></p>
        {evidence.sources.length ? (
          <ul className="list-disc space-y-1 ps-5">
            {evidence.sources.map((source) => (
              <li key={source.id}>
                {source.source.name} ({source.source.kind})
                {source.source.recordId ? " · سجل " + source.source.recordId : ""}
                {source.source.version ? " · إصدار " + source.source.version : ""}
                {" · وقت المصدر " + source.sourceTimestamp}
                {" · حالة الدليل "}<EvidenceStatusLabel status={source.status} />
              </li>
            ))}
          </ul>
        ) : <p>لا يوجد سجل مصدر موثّق مربوط بهذا المؤشر في اللقطة الحالية.</p>}
        <EvidenceWarnings warnings={evidence.warnings} />
      </div>
    </details>
  );
}

function LiquidityMetric({
  label,
  value,
  currency,
  status,
  emphasized = false,
  evidence,
}: {
  label: string;
  value: number | null;
  currency: string;
  status: LiquidityMetricStatus;
  emphasized?: boolean;
  evidence?: LiquidityMetricEvidence;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={emphasized ? "font-semibold" : undefined}>
        {amount(value, currency)} · <EvidenceStatusLabel status={status} />
        <LiquidityMetricEvidenceDetails evidence={evidence} />
      </dd>
    </div>
  );
}

function LiquidityMetricsGrid({ position }: { position: LiquidityPosition }) {
  return (
    <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <LiquidityMetric
        label="الرصيد المتاح"
        value={position.availableBalance}
        currency={position.currency}
        status={position.availableBalanceStatus}
        emphasized
        evidence={(position.metricEvidence ?? []).find((item) => item.key === "availableBalance")}
      />
      <LiquidityMetric
        label="التحصيلات المتوقعة"
        value={position.expectedCollections}
        currency={position.currency}
        status={position.expectedCollectionsStatus}
        emphasized
        evidence={(position.metricEvidence ?? []).find((item) => item.key === "expectedCollections")}
      />
      <LiquidityMetric
        label="المبالغ المستحقة"
        value={position.dueObligations}
        currency={position.currency}
        status={position.dueObligationsStatus}
        emphasized
        evidence={(position.metricEvidence ?? []).find((item) => item.key === "dueObligations")}
      />
      <LiquidityMetric
        label="الذمم المتأخرة"
        value={position.overdueReceivables}
        currency={position.currency}
        status={position.overdueReceivablesStatus}
        evidence={(position.metricEvidence ?? []).find((item) => item.key === "overdueReceivables")}
      />
      <LiquidityMetric
        label="صافي السيولة المتاحة"
        value={position.netAvailableLiquidity}
        currency={position.currency}
        status={position.status}
        emphasized
        evidence={undefined}
      />
      <LiquidityMetric
        label="تكلفة المخزون الراكد المثبتة (خارج صافي السيولة)"
        value={position.stagnantStockExposure}
        currency={position.currency}
        status={position.stagnantStockExposureStatus}
        evidence={(position.metricEvidence ?? []).find((item) => item.key === "stagnantStockCost")}
      />
    </dl>
  );
}

function ReceivableAgingRow({
  bucket,
  currency,
  evidence,
}: {
  bucket: LiquidityPosition["receivableAging"][number];
  currency: string;
  evidence?: LiquidityMetricEvidence;
}) {
  return (
    <li className="flex justify-between gap-3 text-sm">
      <span>{bucket.bucket}</span>
      <span>{amount(bucket.amount, currency)} · <EvidenceStatusLabel status={bucket.status} /></span>
      <LiquidityMetricEvidenceDetails evidence={evidence} />
    </li>
  );
}

function ReceivableAgingPanel({ position }: { position: LiquidityPosition }) {
  if (position.receivableAging.length === 0) return null;

  return (
    <div className="mt-4 border-t pt-3">
      <h5 className="text-sm font-semibold">أعمار الذمم</h5>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {position.receivableAging.map((bucket, index) => (
          <ReceivableAgingRow
            key={bucket.bucket + ":" + index}
            bucket={bucket}
            currency={position.currency}
            evidence={(position.metricEvidence ?? []).find((item) => item.key === "receivableAging:" + index)}
          />
        ))}
      </ul>
    </div>
  );
}

function LiquidityPositionCard({
  position,
  index,
}: {
  position: LiquidityPosition;
  index: number;
}) {
  return (
    <article
      key={position.currency + ":" + index}
      aria-label={position.currency}
      className="rounded-xl border bg-card p-4 text-card-foreground"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{position.currency}</h4>
        <span className="text-xs">
          حالة صافي السيولة: <EvidenceStatusLabel status={position.status} /> · الاكتمال: {position.completeness}
        </span>
      </header>
      <LiquidityMetricsGrid position={position} />
      <ReceivableAgingPanel position={position} />
      <footer className="mt-3 border-t pt-3 text-xs text-muted-foreground">
        <p>المعادلة: {position.formulaId} · الإصدار: {position.formulaVersion} · الفترة: {position.period.from} — {position.period.to}</p>
        <p>مراجع المصدر: <EvidenceReferences ids={position.lineage.evidenceIds} /></p>
        <EvidenceWarnings warnings={position.warnings} />
      </footer>
    </article>
  );
}

export function LiquiditySummary({
  snapshot,
  state = "ready",
  onRetry,
}: LiquiditySummaryProps) {
  const effectiveState = state === "ready" && !snapshot ? "unavailable" : state;

  if (effectiveState !== "ready") {
    return (
      <IntelligenceStatePanel
        state={effectiveState}
        onRetry={onRetry}
        emptyMessage="لا توجد مراكز سيولة للفترة المحددة."
      />
    );
  }

  if (!snapshot || snapshot.positions.length === 0) {
    return (
      <IntelligenceStatePanel
        state="empty"
        emptyMessage="لا توجد مراكز سيولة للفترة المحددة."
      />
    );
  }

  return (
    <section dir="rtl" className="space-y-3" aria-label="ملخص السيولة حسب العملة">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">مركز السيولة</h3>
        <span className="text-xs text-muted-foreground">حتى {snapshot.asOf}</span>
      </header>
      {snapshot.positions.map((position, index) => (
        <LiquidityPositionCard
          key={position.currency + ":" + index}
          position={position}
          index={index}
        />
      ))}
      <EvidenceWarnings warnings={snapshot.warnings} />
    </section>
  );
}
