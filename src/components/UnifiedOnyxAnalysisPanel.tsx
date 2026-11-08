import { useEffect, useState } from "react";
import { AlertTriangle, Database, FileSpreadsheet, RefreshCw, ShieldCheck } from "lucide-react";
import { fetchOnyxSnapshotAnalytics, fetchOnyxSnapshots } from "@/lib/api";
import type { OnyxSnapshotAnalytics, OnyxSnapshotSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { OnyxSnapshotSourceEvidencePanel } from "@/components/OnyxSnapshotSourceEvidencePanel";

function countText(value: number): string {
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 0 }).format(value);
}

function amountText(value: number): string {
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(value);
}

function safeAnalytics(value: OnyxSnapshotAnalytics): boolean {
  const m = value?.metrics;
  const s = value?.snapshot;
  if (!m || !s || typeof s.id !== "string" || !s.id || typeof s.file_hash !== "string") return false;
  const nonnegative = [
    m.row_count, m.unique_keys, m.valid_rows, m.rejected_rows, m.warning_rows,
    m.quantity_total, m.revenue_total, m.sales_total, m.customer_count, m.supplier_count,
    m.item_count, m.snapshot_row_count, m.dqs,
  ];
  return nonnegative.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) &&
    Number.isInteger(m.row_count) && Number.isInteger(m.unique_keys) &&
    Number.isInteger(m.valid_rows) && Number.isInteger(m.rejected_rows) &&
    Number.isInteger(m.warning_rows) && Number.isInteger(m.customer_count) &&
    Number.isInteger(m.supplier_count) && Number.isInteger(m.item_count) &&
    Number.isInteger(m.snapshot_row_count) && Number.isInteger(m.dqs) && m.dqs <= 100;
}


function OnyxSnapshotPicker({ snapshots, selectedId, onSelect }: {
  snapshots: OnyxSnapshotSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="onyx-snapshot-picker">
      <label htmlFor="executive-onyx-source">لقطة المصدر</label>
      <select id="executive-onyx-source" value={selectedId} onChange={(event) => onSelect(event.target.value)}>
        {snapshots.map((snapshot) => (
          <option key={snapshot.id} value={snapshot.id}>
            {snapshot.source_file_name || snapshot.report_type} · v{snapshot.snapshot_version} · {new Date(snapshot.created_at).toLocaleString("ar-YE")}
          </option>
        ))}
      </select>
    </div>
  );
}

function OnyxSnapshotDetails({ snapshot }: { snapshot: OnyxSnapshotSummary }) {
  return (
    <>
      <div className="onyx-source-metadata" aria-label="بيانات تتبع المصدر">
        <span><strong>ملف المصدر:</strong> {snapshot.source_file_name || "اسم الملف غير متوفر"}</span>
        <span><strong>نوع التقرير:</strong> {snapshot.report_type}</span>
        <span><strong>الفترة:</strong> {snapshot.period_key || "غير محددة في المصدر"}</span>
        <span><strong>تاريخ اللقطة:</strong> {new Date(snapshot.created_at).toLocaleString("ar-YE")}</span>
        <span><strong>عدد صفوف المصدر:</strong> {countText(snapshot.row_count)}</span>
        <span><strong>جودة المصدر:</strong> {countText(snapshot.data_quality_score)}/100</span>
        <span className="onyx-hash"><strong>SHA-256 للمصدر:</strong> <code>{snapshot.source_file_hash}</code></span>
      </div>
      <OnyxSnapshotSourceEvidencePanel snapshotId={snapshot.id} />
    </>
  );
}

function OnyxSnapshotSelectionDetails({ snapshots, selectedId }: {
  snapshots: OnyxSnapshotSummary[];
  selectedId: string;
}) {
  const selected = snapshots.find((row) => row.id === selectedId);
  if (!selected) {
    return <div role="alert" className="onyx-alert">لا تطابق اللقطة المحددة قائمة مصادر المؤسسة الحالية.</div>;
  }
  return <OnyxSnapshotDetails snapshot={selected} />;
}

function OnyxMetricCard({ label, value }: { label: string; value: string }) {
  return <article className="report-metric"><span>{label}</span><strong>{value}</strong></article>;
}

function OnyxSnapshotMetrics({ analytics }: { analytics: OnyxSnapshotAnalytics }) {
  const metrics = analytics.metrics;
  const cards = [
    ["صفوف المصدر", countText(metrics.row_count)],
    ["صفوف صالحة", countText(metrics.valid_rows)],
    ["صفوف مرفوضة", countText(metrics.rejected_rows)],
    ["تحذيرات", countText(metrics.warning_rows)],
    ["الأصناف في المصدر", countText(metrics.item_count)],
    ["العملاء في المصدر", countText(metrics.customer_count)],
    ["الموردون في المصدر", countText(metrics.supplier_count)],
    ["كمية المصدر الإجمالية", amountText(metrics.quantity_total)],
    ["قيمة المصدر المحللة", amountText(metrics.revenue_total)],
    ["قيمة المبيعات داخل اللقطة", amountText(metrics.sales_total)],
    ["المفاتيح المميزة", countText(metrics.unique_keys)],
    ["جودة التحليل", countText(metrics.dqs) + "/100"],
  ];
  return (
    <div className="report-grid" aria-label="مؤشرات المصدر المحدد">
      {cards.map(([label, value]) => <OnyxMetricCard key={label} label={label} value={value} />)}
    </div>
  );
}

function OnyxForecastNote({ analytics }: { analytics: OnyxSnapshotAnalytics }) {
  return (
    <div className="onyx-forecast report-note">
      <strong>حدود التحليل:</strong> {analytics.forecast_reason || "لا يوجد تفسير إضافي محفوظ لحالة التنبؤ."}
      {analytics.forecast_status === "insufficient_history" && " لم يُنشأ تنبؤ لأن التاريخ المصدر لا يكفي."}
      <span> الأرقام تخص اللقطة المحفوظة فقط ولا تعني ترحيلًا إلى الدفاتر أو تحديثًا للمخزون.</span>
    </div>
  );
}

function OnyxAnalyticsState({ loading, error, analytics }: {
  loading: boolean;
  error: string | null;
  analytics: OnyxSnapshotAnalytics | null;
}) {
  if (loading) return <div role="status" className="onyx-empty">جار حساب مؤشرات اللقطة المحددة…</div>;
  if (error) return <div role="alert" className="onyx-alert"><AlertTriangle size={18} /> {error}</div>;
  if (!analytics) return null;
  return (
    <>
      <OnyxSnapshotMetrics analytics={analytics} />
      <OnyxForecastNote analytics={analytics} />
    </>
  );
}

function OnyxSnapshotsState({ snapshotsLoading, error, snapshots, selectedId, onSelect, analyticsLoading, analyticsError, analytics }: {
  snapshotsLoading: boolean;
  error: string | null;
  snapshots: OnyxSnapshotSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
  analyticsLoading: boolean;
  analyticsError: string | null;
  analytics: OnyxSnapshotAnalytics | null;
}) {
  if (snapshotsLoading) {
    return <div role="status" className="onyx-empty"><RefreshCw className="spin" size={21} /> جار تحميل لقطات المصدر المحفوظة…</div>;
  }
  if (error) return <div role="alert" className="onyx-alert"><AlertTriangle size={18} /> {error}</div>;
  if (snapshots.length === 0) {
    return (
      <div className="onyx-empty">
        <Database size={25} /><strong>لا توجد لقطات مصدر جاهزة</strong>
        <p>أنشئ لقطة معتمدة من محرك الاستيراد الموحد. لن تُعرض أرقام تجريبية أو أصفار بديلة.</p>
      </div>
    );
  }
  return (
    <>
      <OnyxSnapshotPicker snapshots={snapshots} selectedId={selectedId} onSelect={onSelect} />
      <OnyxSnapshotSelectionDetails snapshots={snapshots} selectedId={selectedId} />
      <OnyxAnalyticsState loading={analyticsLoading} error={analyticsError} analytics={analytics} />
    </>
  );
}

export function UnifiedOnyxAnalysisPanel() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canAccess = Boolean(user?.isStaff || roles.some((role) =>
    ["admin", "manager", "accountant", "inventory_manager", "purchasing_manager"].includes(role)
  ));
  const [snapshots, setSnapshots] = useState<OnyxSnapshotSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [analytics, setAnalytics] = useState<OnyxSnapshotAnalytics | null>(null);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    if (!canAccess) {
      setSnapshotsLoading(false);
      return;
    }
    let active = true;
    setSnapshotsLoading(true);
    setError(null);
    void fetchOnyxSnapshots().then((rows) => {
      if (!active) return;
      setSnapshots(rows);
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? "");
    }).catch((cause: unknown) => {
      if (!active) return;
      setSnapshots([]);
      setSelectedId("");
      setError(cause instanceof Error ? cause.message : "تعذر تحميل لقطات أونكس المحفوظة.");
    }).finally(() => {
      if (active) setSnapshotsLoading(false);
    });
    return () => { active = false; };
  }, [canAccess, refreshKey]);

  useEffect(() => {
    if (!canAccess || !selectedId) {
      setAnalytics(null);
      setAnalyticsError(null);
      setAnalyticsLoading(false);
      return;
    }
    let active = true;
    setAnalyticsLoading(true);
    setAnalytics(null);
    setAnalyticsError(null);
    void fetchOnyxSnapshotAnalytics(selectedId).then((result) => {
      if (!active) return;
      if (!safeAnalytics(result) || result.snapshot.id !== selectedId) {
        throw new Error("بيانات تحليل اللقطة غير مكتملة أو لا تطابق المصدر المحدد؛ تم حجب المؤشرات.");
      }
      setAnalytics(result);
    }).catch((cause: unknown) => {
      if (!active) return;
      setAnalytics(null);
      setAnalyticsError(cause instanceof Error ? cause.message : "تعذر تحليل لقطة المصدر المحددة.");
    }).finally(() => {
      if (active) setAnalyticsLoading(false);
    });
    return () => { active = false; };
  }, [canAccess, selectedId]);

  if (!canAccess) {
    return <section className="panel onyx-empty" role="alert">
      <ShieldCheck size={22} /><h2>صلاحية المؤسسة مطلوبة</h2>
      <p>تحليل مصادر أونكس المحفوظة متاح للمستخدمين المخولين فقط، وتفرض قاعدة البيانات نطاق المؤسسة.</p>
    </section>;
  }

  return (
    <section className="panel onyx-center onyx-unified-analysis" dir="rtl" aria-label="تحليل أونكس ضمن التقارير التنفيذية">
      <header className="panel-head">
        <div>
          <h2><FileSpreadsheet size={20} /> تحليل مصدر أونكس ضمن التقارير</h2>
          <p>مؤشرات لقطة استيراد محفوظة مستقلة عن إجماليات مبيعات متجر الأغبري؛ لا يُفترض وجود اتصال حي بالنظام الخارجي ولا تُجمع القيم بين المصدرين.</p>
        </div>
        <button type="button" className="btn outline" disabled={snapshotsLoading} onClick={() => setRefreshKey((n) => n + 1)}>
          <RefreshCw size={15} /> تحديث المصادر
        </button>
      </header>
      <OnyxSnapshotsState
        snapshotsLoading={snapshotsLoading}
        error={error}
        snapshots={snapshots}
        selectedId={selectedId}
        onSelect={setSelectedId}
        analyticsLoading={analyticsLoading}
        analyticsError={analyticsError}
        analytics={analytics}
      />
    </section>
  );
}
