import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileSpreadsheet, RefreshCw, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { downloadCustomerReturnReviewWorkbookXlsx } from "@/lib/customer-return-review-xlsx";
import { supabase } from "@/lib/supabase";

type ReviewDecision = "approved" | "rejected";
type ReturnReason = "damaged" | "wrong_item" | "missing_item" | "quality" | "other";
type ReturnLine = { item_code: string | null; product_name: string; unit: string | null; requested_quantity: number };
type ReturnReviewRow = {
  id: string; request_number: string; status: "submitted" | "under_review";
  reason: ReturnReason; notes: string | null; created_at: string; order_id: string;
  order_number: string; customer_name: string; customer_code: string; items: ReturnLine[];
};

const reasonLabels: Record<string, string> = {
  damaged: "الصنف تالف", wrong_item: "صنف غير صحيح", missing_item: "كمية ناقصة",
  quality: "مشكلة جودة", other: "سبب آخر",
};
const panel: React.CSSProperties = {
  marginTop: 22, border: "1px solid #dce7e8", borderRadius: 14, padding: 16,
  background: "var(--card, #fff)", display: "grid", gap: 13,
};
const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  border: "1px solid #ccdadd", borderRadius: 8, color: "#21383d",
  background: "#fff", font: "inherit",
};
const button: React.CSSProperties = {
  border: "1px solid #ccdadd", borderRadius: 8, padding: "8px 11px",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  background: "#fff", color: "#24464a", font: "inherit", fontWeight: 750, cursor: "pointer",
};
const good: React.CSSProperties = { ...button, borderColor: "#18825c", background: "#18825c", color: "#fff" };
const bad: React.CSSProperties = { ...button, borderColor: "#b42318", background: "#b42318", color: "#fff" };
const muted: React.CSSProperties = { margin: 0, color: "#64787c", fontSize: 13, lineHeight: 1.7 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("بيانات المراجعة غير مكتملة: " + fieldName);
  return value;
}
function readReviewRows(value: unknown): ReturnReviewRow[] {
  if (!Array.isArray(value)) throw new Error("أعاد الخادم قائمة مرتجعات غير صالحة.");
  return value.map((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.items)) throw new Error("سجل مراجعة مرتجع غير صالح.");
    const status = requiredString(entry.status, "status");
    if (status !== "submitted" && status !== "under_review") throw new Error("تتضمن قائمة المراجعة حالة غير متوقعة.");
    const reason = requiredString(entry.reason, "reason");
    if (!Object.prototype.hasOwnProperty.call(reasonLabels, reason)) throw new Error("تتضمن قائمة المراجعة سبب مرتجع غير معتمد.");
    const items = entry.items.map((line): ReturnLine => {
      if (!isRecord(line)) throw new Error("تفاصيل صنف المرتجع غير صالحة.");
      const quantity = Number(line.requested_quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("كمية صنف المرتجع غير صالحة.");
      return {
        item_code: typeof line.item_code === "string" ? line.item_code : null,
        product_name: requiredString(line.product_name, "product_name"),
        unit: typeof line.unit === "string" ? line.unit : null,
        requested_quantity: quantity,
      };
    });
    return {
      id: requiredString(entry.id, "id"),
      request_number: requiredString(entry.request_number, "request_number"),
      status,
      reason: reason as ReturnReason,
      notes: typeof entry.notes === "string" ? entry.notes : null,
      created_at: requiredString(entry.created_at, "created_at"),
      order_id: requiredString(entry.order_id, "order_id"),
      order_number: requiredString(entry.order_number, "order_number"),
      customer_name: requiredString(entry.customer_name, "customer_name"),
      customer_code: requiredString(entry.customer_code, "customer_code"),
      items,
    };
  });
}

function ReturnReviewCard({
  row,
  note,
  busy,
  onNoteChange,
  onDecide,
}: {
  row: ReturnReviewRow;
  note: string;
  busy: boolean;
  onNoteChange: (id: string, value: string) => void;
  onDecide: (row: ReturnReviewRow, decision: ReviewDecision) => void;
}) {
  const reasonIsValid = note.trim().length >= 5;
  return (
    <article key={row.id} style={{ display: "grid", gap: 10, padding: 14, border: "1px solid #e1e9ea", borderRadius: 11 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{row.request_number}</h3>
          <p style={muted}>الطلب {row.order_number} · العميل {row.customer_name} ({row.customer_code})</p>
        </div>
        <span style={{ background: "#fff4df", color: "#805413", borderRadius: 20, padding: "4px 9px", fontSize: 12, fontWeight: 800 }}>
          {row.status === "submitted" ? "مرسل للمراجعة" : "قيد المراجعة"}
        </span>
      </div>
      <p style={{ ...muted, marginTop: -3 }}>السبب: {reasonLabels[row.reason] ?? row.reason} · {new Date(row.created_at).toLocaleString("ar-YE")}</p>
      <ReturnReviewItems items={row.items} />
      {row.notes && <p style={{ ...muted, borderInlineStart: "3px solid #cbdadd", paddingInlineStart: 10 }}>ملاحظة العميل: {row.notes}</p>}
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 750 }}>
        مبرر القرار (مطلوب)
        <textarea
          rows={2}
          maxLength={1000}
          minLength={5}
          aria-label={"مبرر قرار " + row.request_number}
          value={note}
          onChange={(event) => onNoteChange(row.id, event.target.value)}
          style={{ ...field, resize: "vertical" }}
          disabled={busy}
        />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={good} disabled={busy || !reasonIsValid} onClick={() => onDecide(row, "approved")}>
          <CheckCircle2 size={16} /> قبول وتحويل للفحص
        </button>
        <button type="button" style={bad} disabled={busy || !reasonIsValid} onClick={() => onDecide(row, "rejected")}>
          <XCircle size={16} /> رفض مع السبب
        </button>
      </div>
    </article>
  );
}

function ReturnReviewItems({ items }: { items: ReturnLine[] }) {
  return (
    <ul style={{ margin: 0, paddingInlineStart: 24 }}>
      {items.map((item, index) => (
        <li key={(item.item_code ?? item.product_name) + "-" + index} style={{ fontSize: 13 }}>
          {item.product_name} — الرمز {item.item_code ?? "غير مسجل"} — {item.requested_quantity.toLocaleString("ar-YE")} {item.unit ?? ""}
        </li>
      ))}
    </ul>
  );
}

export function CustomerReturnReviewQueue({ onNotice }: { onNotice: (message: string) => void }) {
  const [rows, setRows] = useState<ReturnReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const { user } = useAuth();
  const canExport = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));

  function exportCurrentQueue() {
    if (!canExport || rows.length === 0) return;
    try {
      const downloaded = downloadCustomerReturnReviewWorkbookXlsx({ rows, roles: user?.roles ?? [] });
      if (!downloaded) throw new Error("هذا المتصفح لا يدعم تنزيل ملفات Excel.");
      setError("");
      onNotice("تم تصدير " + rows.length + " طلب مراجعة من القائمة الحالية (حتى 50 طلباً أعادها الخادم). الملف يتضمن تفاصيل الأصناف، ولا يمثل السجل التاريخي الكامل.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر إنشاء ملف مراجعة المرتجعات.";
      setError(message);
      onNotice(message);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("list_customer_return_review_queue", { p_limit: 50 });
      if (rpcError) throw new Error(rpcError.message || "تعذر تحميل قائمة مراجعة المرتجعات.");
      setRows(readReviewRows(data));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل قائمة مراجعة المرتجعات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(row: ReturnReviewRow, decision: ReviewDecision) {
    const note = (notes[row.id] ?? "").trim();
    if (note.length < 5 || note.length > 1000) {
      setError("اكتب مبررًا واضحًا للقبول أو الرفض من 5 إلى 1000 حرف.");
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("review_customer_return_request", {
        p_return_request_id: row.id,
        p_decision: decision,
        p_review_note: note,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر حفظ قرار المرتجع.");
      if (!isRecord(data) || data.status !== decision || typeof data.request_number !== "string") {
        throw new Error("لم يؤكد الخادم قرار المرتجع كما طُلب.");
      }
      onNotice(
        decision === "approved"
          ? "تمت الموافقة على " + data.request_number + " وإنشاء مهمة استلام وفحص للمخزن. لم يتغير المخزون أو الحساب تلقائيًا."
          : "تم رفض " + data.request_number + " مع حفظ مبرر القرار.",
      );
      setNotes((current) => { const next = { ...current }; delete next[row.id]; return next; });
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر حفظ قرار المرتجع.";
      setError(message);
      onNotice(message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section style={panel} dir="rtl" aria-labelledby="return-review-heading">
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 id="return-review-heading" style={{ margin: 0, fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}>
            <ClipboardCheck size={19} /> مراجعة طلبات المرتجعات
          </h2>
          <p style={{ ...muted, marginTop: 5 }}>
            القرار يتطلب مبررًا مدققًا. الموافقة تنشئ مهمة استلام وفحص؛ لا تسجل ردًا ماليًا أو حركة مخزون قبل الاستلام الفعلي.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {canExport && <button type="button" style={button} onClick={exportCurrentQueue} disabled={loading || busyId !== null || rows.length === 0}>
            <FileSpreadsheet size={15} /> تصدير قائمة المراجعة الحالية
          </button>}
          <button type="button" style={button} onClick={() => void load()} disabled={loading || busyId !== null}>
            <RefreshCw size={15} /> تحديث
          </button>
        </div>
      </header>

      {loading && <p role="status" style={muted}>جارٍ تحميل الطلبات المفتوحة...</p>}
      {error && <p role="alert" style={{ ...muted, color: "#a32929", padding: 10, borderRadius: 8, background: "#fff1f1" }}>{error}</p>}
      {!loading && !error && rows.length === 0 && <p style={muted}>لا توجد طلبات مرتجع بانتظار القرار.</p>}

      {rows.map((row) => (
        <ReturnReviewCard
          key={row.id}
          row={row}
          note={notes[row.id] ?? ""}
          busy={busyId === row.id}
          onNoteChange={(id, value) => setNotes((current) => ({ ...current, [id]: value }))}
          onDecide={decide}
        />
      ))}
    </section>
  );
}

