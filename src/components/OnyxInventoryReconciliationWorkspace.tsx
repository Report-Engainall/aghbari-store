import { useState, type CSSProperties } from "react";
import { Database, RefreshCw, Scale, X } from "lucide-react";
import { fetchOnyxSnapshots, type OnyxSnapshotSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { OnyxInventoryReconciliationActions } from "@/components/OnyxInventoryReconciliationActions";

const overlayStyle: CSSProperties = {
  position: "fixed", inset: 0, zIndex: 1500, display: "grid", placeItems: "center",
  padding: 16, background: "rgba(8, 18, 16, .62)",
};
const dialogStyle: CSSProperties = {
  width: "min(1040px, 100%)", maxHeight: "92vh", overflow: "auto",
  padding: 18, border: "1px solid var(--border, #d6e1da)", borderRadius: 16,
  background: "var(--card, #fff)", color: "var(--foreground, #17221c)",
  boxShadow: "0 24px 80px rgba(0,0,0,.28)",
};
const launcherStyle: CSSProperties = {
  position: "fixed", insetInlineEnd: 18, bottom: 18, zIndex: 1200,
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  padding: "11px 15px", border: "1px solid #174d37", borderRadius: 999,
  background: "#174d37", color: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,.18)",
  font: "inherit", fontWeight: 750, cursor: "pointer",
};
const controlStyle: CSSProperties = {
  width: "100%", minWidth: 0, padding: "10px 12px", border: "1px solid var(--border, #cbd5ce)",
  borderRadius: 8, background: "var(--background, #fff)", color: "var(--foreground, #17221c)",
  font: "inherit", boxSizing: "border-box",
};
const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  padding: "8px 11px", border: "1px solid var(--border, #cbd5ce)", borderRadius: 8,
  background: "var(--card, #fff)", color: "var(--foreground, #17221c)", font: "inherit",
  cursor: "pointer",
};
const errorStyle: CSSProperties = {
  padding: 12, borderRadius: 8, border: "1px solid #d97757", background: "#fff5f0",
  color: "#8c3219", lineHeight: 1.7,
};

function snapshotLabel(snapshot: OnyxSnapshotSummary): string {
  const source = snapshot.source_file_name?.trim() || "ملف مصدر بلا اسم";
  return `${source} — الإصدار ${snapshot.snapshot_version}`;
}


function ReconciliationWorkspaceHeader({ onClose }: { onClose: () => void }) {
  return (
    <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div>
        <h2 id="onyx-reconciliation-workspace-title" style={{ margin: "0 0 6px", fontSize: 21 }}>مصالحة المخزون مع لقطة أونكس المعتمدة</h2>
        <p style={{ margin: 0, color: "var(--muted-foreground, #64736a)", lineHeight: 1.7, fontSize: 13 }}>
          المعاينة لا تغيّر الرصيد. التطبيق والتراجع التعويضي يخضعان لفحص الخادم والقفل والصلاحيات وسجل الحركات.
        </p>
      </div>
      <button type="button" onClick={onClose} style={secondaryButtonStyle} aria-label="إغلاق مصالحة مخزون أونكس"><X size={17} /> إغلاق</button>
    </header>
  );
}

function ReconciliationSnapshotPicker({ snapshots, selectedSnapshotId, loading, onSelect, onRefresh }: {
  snapshots: OnyxSnapshotSummary[];
  selectedSnapshotId: string;
  loading: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "end", margin: "18px 0" }}>
      <label style={{ display: "grid", gap: 7, fontWeight: 700, fontSize: 13 }}>
        لقطة Onyx الجاهزة للمصالحة
        <select style={controlStyle} value={selectedSnapshotId} onChange={(event) => onSelect(event.target.value)} disabled={loading || snapshots.length === 0}>
          <option value="">اختر لقطة محفوظة</option>
          {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshotLabel(snapshot)}</option>)}
        </select>
      </label>
      <button type="button" style={secondaryButtonStyle} onClick={onRefresh} disabled={loading}>
        <RefreshCw size={15} aria-hidden="true" />{loading ? "جارٍ التحديث…" : "تحديث اللقطات"}
      </button>
    </div>
  );
}

function ReconciliationWorkspaceStatus({ loading, error, snapshotCount, onRetry }: {
  loading: boolean;
  error: string;
  snapshotCount: number;
  onRetry: () => void;
}) {
  if (loading) return <p role="status">جارٍ تحميل اللقطات المحفوظة من قاعدة البيانات…</p>;
  if (error) {
    return (
      <div role="alert" style={errorStyle}>
        <p style={{ margin: "0 0 8px" }}>{error}</p>
        <button type="button" style={secondaryButtonStyle} onClick={onRetry}>إعادة المحاولة</button>
      </div>
    );
  }
  if (snapshotCount === 0) {
    return (
      <div role="status" style={{ display: "flex", gap: 10, alignItems: "center", padding: 15, border: "1px dashed var(--border, #cbd5ce)", borderRadius: 10 }}>
        <Database size={20} aria-hidden="true" />
        لا توجد لقطة Onyx بحالة جاهزة في المؤسسة الحالية. أكمل الاستيراد والتحقق أولًا؛ لن تُنشأ بيانات افتراضية للمصالحة.
      </div>
    );
  }
  return null;
}

function ReconciliationSnapshotMetadata({ snapshot }: { snapshot: OnyxSnapshotSummary }) {
  const metadata = [
    ["المصدر", snapshot.source_file_name || "غير مسجل في المصدر"],
    ["الفترة", snapshot.period_key || "غير محددة في المصدر"],
    ["الإصدار", String(snapshot.snapshot_version)],
    ["صفوف المصدر", snapshot.row_count.toLocaleString("ar-YE")],
    ["جودة البيانات", snapshot.data_quality_score.toLocaleString("ar-YE", { maximumFractionDigits: 1 }) + "/100"],
    ["وقت الحفظ", new Date(snapshot.created_at).toLocaleString("ar-YE")],
  ];
  return (
    <section aria-label="بيانات اللقطة المختارة" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 9, marginBottom: 14 }}>
      {metadata.map(([label, value]) => (
        <div key={label} style={{ padding: 10, border: "1px solid var(--border, #d6e1da)", borderRadius: 9, minWidth: 0 }}>
          <div style={{ color: "var(--muted-foreground, #64736a)", fontSize: 11, marginBottom: 4 }}>{label}</div>
          <strong style={{ display: "block", overflowWrap: "anywhere", fontSize: 13 }}>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function ReconciliationWorkspaceContent({ loading, snapshots, selectedSnapshotId, selectedSnapshot, error, onClose, onSelect, onRefresh }: {
  loading: boolean;
  snapshots: OnyxSnapshotSummary[];
  selectedSnapshotId: string;
  selectedSnapshot: OnyxSnapshotSummary | null;
  error: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <ReconciliationWorkspaceHeader onClose={onClose} />
      <ReconciliationSnapshotPicker snapshots={snapshots} selectedSnapshotId={selectedSnapshotId} loading={loading} onSelect={onSelect} onRefresh={onRefresh} />
      <ReconciliationWorkspaceStatus loading={loading} error={error} snapshotCount={snapshots.length} onRetry={onRefresh} />
      {selectedSnapshot && <ReconciliationSnapshotMetadata snapshot={selectedSnapshot} />}
      {selectedSnapshot && <OnyxInventoryReconciliationActions key={selectedSnapshot.id} snapshotId={selectedSnapshot.id} />}
    </>
  );
}

function ReconciliationWorkspaceDialog({ loading, snapshots, selectedSnapshotId, selectedSnapshot, error, onClose, onSelect, onRefresh }: {
  loading: boolean;
  snapshots: OnyxSnapshotSummary[];
  selectedSnapshotId: string;
  selectedSnapshot: OnyxSnapshotSummary | null;
  error: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div style={overlayStyle} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="onyx-reconciliation-workspace-title" style={dialogStyle} dir="rtl">
        <ReconciliationWorkspaceContent
          loading={loading}
          snapshots={snapshots}
          selectedSnapshotId={selectedSnapshotId}
          selectedSnapshot={selectedSnapshot}
          error={error}
          onClose={onClose}
          onSelect={onSelect}
          onRefresh={onRefresh}
        />
      </section>
    </div>
  );
}

export function OnyxInventoryReconciliationWorkspace() {
  const { ready, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<OnyxSnapshotSummary[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [error, setError] = useState("");

  const canManage = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));
  if (!ready || !canManage) return null;

  async function loadSnapshots() {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchOnyxSnapshots();
      setSnapshots(rows);
      setSelectedSnapshotId((current) => rows.some((snapshot) => snapshot.id === current)
        ? current : rows[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل لقطات Onyx المعتمدة.");
    } finally {
      setLoading(false);
    }
  }

  function openWorkspace() {
    setOpen(true);
    void loadSnapshots();
  }

  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null;

  return (
    <>
      <button type="button" style={launcherStyle} onClick={openWorkspace} aria-haspopup="dialog">
        <Scale size={17} aria-hidden="true" />
        مصالحة مخزون أونكس
      </button>
      {open && (
        <ReconciliationWorkspaceDialog
          loading={loading}
          snapshots={snapshots}
          selectedSnapshotId={selectedSnapshotId}
          selectedSnapshot={selectedSnapshot}
          error={error}
          onClose={() => setOpen(false)}
          onSelect={setSelectedSnapshotId}
          onRefresh={() => void loadSnapshots()}
        />
      )}
    </>
  );
}
