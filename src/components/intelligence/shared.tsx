export type IntelligenceViewState = "loading" | "empty" | "error" | "unavailable" | "ready";

export interface IntelligenceStatePanelProps {
  state: IntelligenceViewState;
  onRetry?: () => void;
  errorMessage?: string;
  emptyMessage?: string;
  unavailableMessage?: string;
}

export function IntelligenceStatePanel({
  state,
  onRetry,
  errorMessage = "تعذر تحميل بيانات الذكاء التجاري.",
  emptyMessage = "لا توجد بيانات للفترة المحددة.",
  unavailableMessage = "المصدر غير متاح؛ لم يتم إنشاء بيانات بديلة.",
}: IntelligenceStatePanelProps) {
  if (state === "ready") return null;
  if (state === "loading") {
    return <div role="status" dir="rtl" className="rounded-xl border p-4 text-sm">جارٍ تحميل البيانات المثبتة…</div>;
  }
  if (state === "empty") {
    return <div role="status" dir="rtl" className="rounded-xl border p-4 text-sm">{emptyMessage}</div>;
  }
  if (state === "unavailable") {
    return <div role="note" dir="rtl" className="rounded-xl border p-4 text-sm">{unavailableMessage}</div>;
  }
  return (
    <div role="alert" dir="rtl" className="rounded-xl border p-4 text-sm">
      <p>{errorMessage}</p>
      {onRetry ? <button type="button" className="mt-3 rounded-lg border px-3 py-2" onClick={onRetry}>إعادة المحاولة</button> : null}
    </div>
  );
}

export function formatEvidenceNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "غير متاح";
  return new Intl.NumberFormat("ar", { maximumFractionDigits: 3 }).format(value);
}

const evidenceStatusLabels = {
  VERIFIED: "مثبت",
  NEEDS_REVIEW: "يحتاج مراجعة",
  UNVERIFIED: "غير مثبت",
  UNAVAILABLE: "غير متاح",
} as const;

export function EvidenceStatusLabel({ status }: { status: keyof typeof evidenceStatusLabels }) {
  return <span>{evidenceStatusLabels[status]}</span>;
}

export function EvidenceReferences({ ids }: { ids: string[] }) {
  return <span>{ids.length ? ids.join("، ") : "لا توجد مراجع إثبات"}</span>;
}

export function EvidenceWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return <ul
    className="mt-2 list-disc space-y-1 pr-5 text-xs"
    aria-label="تحذيرات المصدر"
    style={{ minWidth: 0, maxWidth: "100%", overflowWrap: "anywhere" }}
  >
    {warnings.map((warning, index) => (
      <li
        key={warning + ":" + index}
        style={{ minWidth: 0, overflowWrap: "anywhere" }}
      >
        {warning}
      </li>
    ))}
  </ul>;
}
