import type { DeadStockReport, DeadStockClass } from "@/lib/intelligence/dead-stock";
import { EvidenceReferences, EvidenceStatusLabel, EvidenceWarnings, formatEvidenceNumber, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";

export interface DeadStockCardProps {
  report?: DeadStockReport | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
}

const classes: Record<DeadStockClass, string> = {
  ACTIVE: "نشط",
  SLOW_MOVING: "بطيء الحركة",
  STAGNANT: "راكد",
  ZERO_MOVEMENT: "بلا حركة ضمن السجل",
  UNKNOWN: "غير معروف",
};

export function DeadStockCard({ report, state = "ready", onRetry }: DeadStockCardProps) {
  const effectiveState = state === "ready" && !report ? "unavailable" : state;
  if (effectiveState !== "ready") {
    return <IntelligenceStatePanel state={effectiveState} onRetry={onRetry} emptyMessage="لا توجد بيانات حركة أصناف للفترة المحددة." />;
  }
  if (!report || report.items.length === 0) {
    return <IntelligenceStatePanel state="empty" emptyMessage="لا توجد بيانات حركة أصناف للفترة المحددة." />;
  }

  return (
    <section dir="rtl" className="space-y-3" aria-label="تحليل المخزون الراكد">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">حركة المخزون والأصناف الراكدة</h3>
        <span className="text-xs text-muted-foreground">حتى {report.asOf} · القاعدة {report.ruleId}@{report.ruleVersion}</span>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {report.items.map((item) => (
          <article key={item.productRef} aria-label={item.productRef} className="rounded-xl border bg-card p-4 text-card-foreground">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">{item.productRef}</h4>
              <span className="text-xs">{classes[item.classification]}</span>
            </header>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">الأيام منذ آخر حركة</dt><dd>{formatEvidenceNumber(item.daysSinceMovement)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">الكمية المتاحة</dt><dd>{formatEvidenceNumber(item.availableQuantity)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">معدل الدوران</dt><dd>{formatEvidenceNumber(item.turnoverRatio)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">تكلفة الوحدة</dt><dd>{item.unitCost === null || item.currency === null ? "غير متاح" : formatEvidenceNumber(item.unitCost) + " " + item.currency}</dd></div>
            </dl>
            <div className="mt-3 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">التعرض المالي المثبت</p>
              <p className="font-semibold">{item.financialExposure === null || item.exposureStatus !== "VERIFIED" || !item.currency ? "غير متاح" : formatEvidenceNumber(item.financialExposure) + " " + item.currency}</p>
              <p className="mt-1 text-xs">حالة التكلفة: <EvidenceStatusLabel status={item.exposureStatus} /> · حالة الحركة: <EvidenceStatusLabel status={item.movementStatus} /></p>
            </div>
            <footer className="mt-3 text-xs text-muted-foreground">
              <p>المعادلة: {item.formulaId}@{item.formulaVersion}</p>
              <p>مراجع الإثبات: <EvidenceReferences ids={item.evidenceIds} /></p>
              <EvidenceWarnings warnings={item.warnings} />
            </footer>
          </article>
        ))}
      </div>
      {report.totalsByCurrency.length ? <div role="region" aria-label="إجمالي التعرض المالي حسب العملة" className="rounded-xl border p-4">
        <h4 className="font-semibold">التعرض الإجمالي حسب العملة — دون تحويل</h4>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {report.totalsByCurrency.map((total) => <li key={total.currency} className="flex items-center justify-between gap-3 text-sm">
            <span>{total.currency}</span>
            <span>{total.exposure === null ? "غير متاح" : formatEvidenceNumber(total.exposure) + " " + total.currency}</span>
            <span className="text-xs text-muted-foreground">مثبت: {total.verifiedItems} · محجوب: {total.withheldItems}</span>
          </li>)}
        </ul>
      </div> : null}
      <EvidenceWarnings warnings={report.warnings} />
    </section>
  );
}
