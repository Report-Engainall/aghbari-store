import { AlertTriangle, RefreshCw } from "lucide-react";

export type DashboardLoadErrorProps = {
  message: string;
  onRetry: () => void;
};

/** A failed dashboard load must offer recovery instead of trapping the operator on an error screen. */
export function DashboardLoadError({ message, onRetry }: DashboardLoadErrorProps) {
  return (
    <section
      className="panel"
      role="alert"
      aria-labelledby="dashboard-load-error-title"
      style={{ padding: 24 }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <AlertTriangle size={22} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <h2 id="dashboard-load-error-title" style={{ marginTop: 0 }}>
            تعذر تحميل مؤشرات لوحة المعلومات
          </h2>
          <p>{message}</p>
          <p style={{ color: "var(--muted-foreground, #64748b)", fontSize: 13 }}>
            لم تُستبدل البيانات غير المتاحة بأرقام صفرية. أعد المحاولة لاسترجاع المؤشرات من الخدمة.
          </p>
          <button type="button" className="btn primary" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" /> إعادة محاولة تحميل بيانات اللوحة
          </button>
        </div>
      </div>
    </section>
  );
}
