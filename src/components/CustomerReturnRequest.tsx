import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ClipboardCheck, RefreshCw, RotateCcw, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  buildCustomerReturnLines,
  createReturnIdempotencyKey,
  readCustomerReturnSummary,
  readReturnMutationResult,
  type CustomerReturnReason,
  type CustomerReturnSummary,
} from "@/lib/customer-returns";

const panel: React.CSSProperties = {
  marginTop: 18, padding: 18, border: "1px solid #d9e5e7", borderRadius: 14,
  background: "var(--card, #fff)", display: "grid", gap: 14,
};
const field: React.CSSProperties = {
  width: "100%", minWidth: 0, boxSizing: "border-box", padding: "9px 11px",
  border: "1px solid #ccdadd", borderRadius: 8, color: "#21383d",
  background: "#fff", font: "inherit",
};
const button: React.CSSProperties = {
  border: "1px solid #cbdadd", borderRadius: 8, padding: "9px 12px",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  gap: 7, background: "#fff", color: "#185f61", font: "inherit",
  fontWeight: 750, cursor: "pointer",
};
const primary: React.CSSProperties = {
  ...button, borderColor: "#087f8d", background: "#087f8d", color: "#fff",
};
const muted: React.CSSProperties = { margin: 0, color: "#64787c", lineHeight: 1.7, fontSize: 13 };

const reasonLabels: Record<CustomerReturnReason, string> = {
  damaged: "الصنف تالف",
  wrong_item: "صنف أو مقاس غير صحيح",
  missing_item: "كمية ناقصة",
  quality: "مشكلة جودة",
  other: "سبب آخر",
};
const statusLabels: Record<string, string> = {
  submitted: "مرسل للمراجعة",
  under_review: "قيد المراجعة",
  approved: "مقبول — بانتظار الاستلام والفحص",
  rejected: "مرفوض",
  received: "تم استلام المرتجع",
  closed: "مغلق",
  cancelled: "ملغى",
};

type IdempotentAttempt = { fingerprint: string; key: string };

const RETURN_ATTEMPT_STORAGE_PREFIX = "aghbari:return-attempt:v1:";
const RETURN_ATTEMPT_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

async function fingerprintReturnAttempt(value: unknown): Promise<string | null> {
  try {
    if (typeof globalThis.crypto?.subtle?.digest !== "function") return null;
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function readPersistedReturnAttempt(orderId: string, fingerprint: string): IdempotentAttempt | null {
  try {
    const raw = window.sessionStorage.getItem(RETURN_ATTEMPT_STORAGE_PREFIX + orderId);
    if (!raw || raw.length > 512) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (value.fingerprint !== fingerprint || typeof value.key !== "string" ||
        !RETURN_ATTEMPT_KEY_PATTERN.test(value.key)) return null;
    return { fingerprint, key: value.key };
  } catch {
    return null;
  }
}

function persistReturnAttempt(orderId: string, attempt: IdempotentAttempt): void {
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[0-9a-f]{64}$/i.test(attempt.fingerprint) ||
      !RETURN_ATTEMPT_KEY_PATTERN.test(attempt.key)) return;
  try {
    window.sessionStorage.setItem(
      RETURN_ATTEMPT_STORAGE_PREFIX + orderId,
      JSON.stringify({ fingerprint: attempt.fingerprint, key: attempt.key }),
    );
  } catch {
    // Storage can be disabled or full. The in-memory key still protects retries until reload.
  }
}

function clearPersistedReturnAttempt(orderId: string, key?: string): void {
  try {
    const storageKey = RETURN_ATTEMPT_STORAGE_PREFIX + orderId;
    if (key) {
      const current = readPersistedReturnAttemptByKey(orderId);
      if (current?.key !== key) return;
    }
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // The server idempotency contract remains authoritative when browser storage is unavailable.
  }
}

function readPersistedReturnAttemptByKey(orderId: string): IdempotentAttempt | null {
  try {
    const raw = window.sessionStorage.getItem(RETURN_ATTEMPT_STORAGE_PREFIX + orderId);
    if (!raw || raw.length > 512) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (typeof value.fingerprint !== "string" || !/^[0-9a-f]{64}$/i.test(value.fingerprint) ||
        typeof value.key !== "string" || !RETURN_ATTEMPT_KEY_PATTERN.test(value.key)) return null;
    return { fingerprint: value.fingerprint, key: value.key };
  } catch {
    return null;
  }
}

export function CustomerReturnRequest({ orderId, orderStatus }: { orderId: string; orderStatus: string }) {
  const [summary, setSummary] = useState<CustomerReturnSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<CustomerReturnReason | "">("");
  const [notes, setNotes] = useState("");
  const attemptRef = useRef<IdempotentAttempt | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("list_my_customer_return_requests", {
        p_order_id: orderId,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر تحميل طلبات الإرجاع.");
      setSummary(readCustomerReturnSummary(data));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل طلبات الإرجاع.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  async function cancelRequest(requestId: string, cancellationReason: string): Promise<boolean> {
    if (busy) return false;
    const normalizedReason = cancellationReason.trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 500) {
      setError("اكتب سبب سحب طلب الإرجاع بين 3 و500 حرف.");
      return false;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc("cancel_customer_return_request", {
        p_return_request_id: requestId,
        p_reason: normalizedReason,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر سحب طلب الإرجاع.");
      const result = readReturnMutationResult(data);
      if (result.status !== "cancelled") throw new Error("لم يؤكد الخادم إلغاء طلب الإرجاع.");
      setNotice(
        (result.idempotent_replay ? "تم تأكيد السحب السابق: " : "تم سحب طلب الإرجاع: ") +
        result.request_number + ". أُعيدت الكميات إلى المتاح لطلب جديد.",
      );
      await loadSummary();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر سحب طلب الإرجاع.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!summary || summary.order_status !== "delivered" || orderStatus !== "delivered") {
      setError("لا يمكن طلب إرجاع قبل تأكيد تسليم الطلب.");
      return;
    }
    if (!reason) {
      setError("اختر سبب الإرجاع.");
      return;
    }
    let lines;
    try {
      lines = buildCustomerReturnLines(drafts, summary.returnable_items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "راجع كميات الإرجاع.");
      return;
    }
    const trimmedNotes = notes.trim();
    const payload = { orderId, reason, notes: trimmedNotes, lines };
    const fingerprint = await fingerprintReturnAttempt(payload);
    const inMemoryAttempt = attemptRef.current?.fingerprint === (fingerprint ?? JSON.stringify(payload))
      ? attemptRef.current
      : null;
    const persistedAttempt = fingerprint ? readPersistedReturnAttempt(orderId, fingerprint) : null;
    const attempt = inMemoryAttempt ?? persistedAttempt ?? {
      fingerprint: fingerprint ?? JSON.stringify(payload),
      key: createReturnIdempotencyKey(),
    };
    attemptRef.current = attempt;
    if (fingerprint) persistReturnAttempt(orderId, attempt);

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc("request_customer_return", {
        p_order_id: orderId,
        p_lines: lines,
        p_reason: reason,
        p_notes: trimmedNotes || null,
        p_idempotency_key: attempt.key,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر إرسال طلب الإرجاع.");
      const result = readReturnMutationResult(data);
      setNotice(
        (result.idempotent_replay ? "تم التحقق من الطلب السابق: " : "تم تسجيل طلب الإرجاع: ") +
        result.request_number + ". سيظهر القرار بعد المراجعة.",
      );
      attemptRef.current = null;
      clearPersistedReturnAttempt(orderId, attempt.key);
      setDrafts({});
      setReason("");
      setNotes("");
      await loadSummary();
    } catch (cause) {
      // Keep this attempt's key so a retry with the same payload cannot create a duplicate.
      setError(cause instanceof Error ? cause.message : "تعذر إرسال طلب الإرجاع.");
    } finally {
      setBusy(false);
    }
  }


type ReturnableItem = CustomerReturnSummary["returnable_items"][number];

function CustomerReturnItemRow({
  item,
  value,
  disabled,
  onChange,
}: {
  item: ReturnableItem;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid #e3ebec",
        borderRadius: 10,
        padding: 12,
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(125px,180px)",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <strong>{item.product_name}</strong>
        <p style={{ ...muted, marginTop: 3 }}>
          الرمز: {item.item_code || "غير مسجل"} · الوحدة: {item.unit || "غير محددة"}
        </p>
        <p style={{ ...muted, marginTop: 3 }}>
          الكمية في الطلب: {item.ordered_quantity.toLocaleString("ar-YE")} · سبق طلب إرجاعها:{" "}
          {item.already_requested_quantity.toLocaleString("ar-YE")} · المتاح:{" "}
          <strong>{item.remaining_quantity.toLocaleString("ar-YE")}</strong>
        </p>
      </div>
      <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 750 }}>
        كمية الإرجاع
        <input
          aria-label={"كمية الإرجاع: " + item.product_name}
          type="number"
          inputMode="decimal"
          min="0"
          max={item.remaining_quantity}
          step="0.001"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={field}
          disabled={disabled}
        />
      </label>
    </div>
  );
}

function CustomerReturnReasonField({
  value,
  disabled,
  onChange,
}: {
  value: CustomerReturnReason | "";
  disabled: boolean;
  onChange: (value: CustomerReturnReason | "") => void;
}) {
  return (
    <label style={{ display: "grid", gap: 6, fontWeight: 750, fontSize: 13 }}>
      سبب الإرجاع <span aria-hidden="true">*</span>
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value as CustomerReturnReason | "")}
        style={field}
        disabled={disabled}
      >
        <option value="">اختر السبب</option>
        {Object.entries(reasonLabels).map(([reason, label]) => (
          <option key={reason} value={reason}>{label}</option>
        ))}
      </select>
    </label>
  );
}

function CustomerReturnNotesField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 6, fontWeight: 750, fontSize: 13 }}>
      تفاصيل إضافية (اختياري)
      <textarea
        value={value}
        maxLength={1000}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        style={{ ...field, resize: "vertical" }}
        disabled={disabled}
      />
      <span style={{ ...muted, textAlign: "left" }}>{value.length}/1000</span>
    </label>
  );
}

function CustomerReturnForm({
  available,
  drafts,
  reason,
  notes,
  busy,
  onDraftChange,
  onReasonChange,
  onNotesChange,
  onSubmit,
  onClear,
}: {
  available: ReturnableItem[];
  drafts: Record<string, string>;
  reason: CustomerReturnReason | "";
  notes: string;
  busy: boolean;
  onDraftChange: (itemId: string, value: string) => void;
  onReasonChange: (value: CustomerReturnReason | "") => void;
  onNotesChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
}) {
  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 10 }}>
        {available.map((item) => (
          <CustomerReturnItemRow
            key={item.order_item_id}
            item={item}
            value={drafts[item.order_item_id] ?? ""}
            disabled={busy}
            onChange={(value) => onDraftChange(item.order_item_id, value)}
          />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 12,
        }}
      >
        <CustomerReturnReasonField
          value={reason}
          onChange={onReasonChange}
          disabled={busy}
        />
        <CustomerReturnNotesField
          value={notes}
          onChange={onNotesChange}
          disabled={busy}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" }}>
        <button type="submit" style={primary} disabled={busy}>
          {busy ? <RefreshCw size={16} /> : <Send size={16} />}
          {busy ? "جارٍ إرسال الطلب..." : "إرسال طلب الإرجاع"}
        </button>
        <button type="button" style={button} disabled={busy} onClick={onClear}>
          إفراغ النموذج
        </button>
      </div>
    </form>
  );
}

function CustomerReturnStatusMessages({
  loading,
  error,
  notice,
  canRequest,
  hasAvailableItems,
  currentStatus,
}: {
  loading: boolean;
  error: string;
  notice: string;
  canRequest: boolean;
  hasAvailableItems: boolean;
  currentStatus: string;
}) {
  return (
    <>
      {loading ? <p role="status" style={muted}>جارٍ تحميل أهلية الإرجاع وسجل الطلبات...</p> : null}
      {error ? (
        <p role="alert" style={{ ...muted, color: "#a32929", background: "#fff1f1", padding: 10, borderRadius: 8 }}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" style={{ color: "#17684d", background: "#edf9f2", padding: 10, borderRadius: 8, margin: 0 }}>
          {notice}
        </p>
      ) : null}
      {!loading && !canRequest ? (
        <p style={muted}>
          يمكن فتح طلب إرجاع بعد أن تصبح حالة الطلب «تم التسليم» فقط. الحالة الحالية: {currentStatus}.
        </p>
      ) : null}
      {!loading && canRequest && !hasAvailableItems ? (
        <p style={muted}>
          لا توجد كميات إضافية متاحة لطلب إرجاعها. يتم احتساب الطلبات المرسلة والمقبولة لمنع تكرار الكمية.
        </p>
      ) : null}
    </>
  );
}

function CustomerReturnHistoryLine({
  item,
}: {
  item: CustomerReturnSummary["requests"][number]["items"][number];
}) {
  return (
    <li style={{ fontSize: 13 }}>
      {item.product_name}: {item.requested_quantity.toLocaleString("ar-YE")} {item.unit ?? ""}
    </li>
  );
}

function CustomerReturnHistoryCard({
  request,
  busy,
  onCancelRequest,
}: {
  request: CustomerReturnSummary["requests"][number];
  busy: boolean;
  onCancelRequest: (requestId: string, reason: string) => Promise<boolean>;
}) {
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const rejected = request.status === "rejected";
  const cancelled = request.status === "cancelled";

  async function submitCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const completed = await onCancelRequest(request.id, cancelReason);
    if (completed) {
      setShowCancelForm(false);
      setCancelReason("");
    }
  }

  return (
    <article style={{ border: "1px solid #e3ebec", borderRadius: 10, padding: 12, display: "grid", gap: 7 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <strong>{request.request_number}</strong>
        <span
          style={{
            padding: "3px 8px",
            borderRadius: 20,
            background: rejected || cancelled ? "#fff1f1" : "#eef7f5",
            color: rejected || cancelled ? "#a32929" : "#17684d",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {statusLabels[request.status]}
        </span>
      </div>
      <p style={muted}>
        السبب: {reasonLabels[request.reason]} · التاريخ: {new Date(request.created_at).toLocaleString("ar-YE")}
      </p>
      <CustomerReturnHistoryItems items={request.items} />
      {request.notes ? <p style={muted}>تفاصيل العميل: {request.notes}</p> : null}
      {request.review_note ? (
        <p style={{ ...muted, color: "#3e5e61" }}>ملاحظة القرار: {request.review_note}</p>
      ) : null}
      {request.customer_cancellation_reason ? (
        <p style={{ ...muted, color: "#8a3030" }}>سبب سحب العميل: {request.customer_cancellation_reason}</p>
      ) : null}
      {request.customer_cancelled_at ? (
        <p style={muted}>تاريخ السحب: {new Date(request.customer_cancelled_at).toLocaleString("ar-YE")}</p>
      ) : null}
      {request.status === "submitted" && !showCancelForm ? (
        <button
          type="button"
          style={{ ...button, justifySelf: "start", color: "#9a3434", borderColor: "#e6c2c2" }}
          disabled={busy}
          onClick={() => setShowCancelForm(true)}
        >
          سحب طلب الإرجاع
        </button>
      ) : null}
      {request.status === "submitted" && showCancelForm ? (
        <form onSubmit={(event) => void submitCancellation(event)} style={{ display: "grid", gap: 8, padding: 10, border: "1px solid #ead2d2", borderRadius: 9 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 750 }}>
            سبب سحب طلب الإرجاع
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              minLength={3}
              maxLength={500}
              rows={2}
              required
              disabled={busy}
              style={{ ...field, resize: "vertical" }}
              placeholder="اكتب سبب السحب..."
            />
          </label>
          <p style={muted}>لا يتاح السحب إلا قبل بدء مراجعة الإدارة. إذا بدأت المراجعة، تواصل مع فريق المراجعة.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" style={{ ...primary, background: "#9a3434", borderColor: "#9a3434" }} disabled={busy || cancelReason.trim().length < 3}>
              {busy ? "جارٍ سحب الطلب..." : "تأكيد سحب الطلب"}
            </button>
            <button type="button" style={button} disabled={busy} onClick={() => { setShowCancelForm(false); setCancelReason(""); }}>تراجع</button>
          </div>
        </form>
      ) : null}
      {request.status === "under_review" ? (
        <p style={muted}>بدأت مراجعة الطلب؛ لم يعد السحب الذاتي متاحًا.</p>
      ) : null}
    </article>
  );
}

function CustomerReturnHistoryItems({ items }: { items: CustomerReturnSummary["requests"][number]["items"] }) {
  return (
    <ul style={{ margin: 0, paddingInlineStart: 22 }}>
      {items.map((item) => <CustomerReturnHistoryLine key={item.order_item_id} item={item} />)}
    </ul>
  );
}

function CustomerReturnHistory({
  requests,
  busy,
  onCancelRequest,
}: {
  requests: CustomerReturnSummary["requests"];
  busy: boolean;
  onCancelRequest: (requestId: string, reason: string) => Promise<boolean>;
}) {
  if (requests.length === 0) return null;

  return (
    <section
      aria-label="سجل طلبات الإرجاع"
      style={{ display: "grid", gap: 10, borderTop: "1px solid #e3ebec", paddingTop: 14 }}
    >
      <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 7 }}>
        <ClipboardCheck size={17} /> سجل طلبات الإرجاع
      </h3>
      {requests.map((request) => (
        <CustomerReturnHistoryCard
          key={request.id}
          request={request}
          busy={busy}
          onCancelRequest={onCancelRequest}
        />
      ))}
    </section>
  );
}

function CustomerReturnPolicyNote() {
  return (
    <p style={{ ...muted, display: "flex", gap: 7, alignItems: "flex-start" }}>
      <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 3 }} />
      لا تُغيّر هذه الشاشة المخزون أو الفاتورة أو رصيد العميل تلقائيًا. بعد الاستلام والفحص الفعلي تُسجل حركة المخزون والإشعار الدائن عبر مساراتها المخوّلة.
    </p>
  );
}

  const canRequest = orderStatus === "delivered" && summary?.order_status === "delivered";
  const available = (summary?.returnable_items ?? []).filter((item) => item.remaining_quantity > 0);

  return (
    <section style={panel} aria-labelledby="customer-return-heading" dir="rtl">
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            id="customer-return-heading"
            style={{ margin: 0, fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}
          >
            <RotateCcw size={19} /> طلب إرجاع / مرتجع
          </h2>
          <p style={{ ...muted, marginTop: 5 }}>
            يُرسل الطلب إلى الإدارة للمراجعة. الموافقة لا تعني استلام البضاعة أو إصدار إشعار دائن أو رد مالي.
          </p>
        </div>
        <button type="button" style={button} onClick={() => void loadSummary()} disabled={loading || busy}>
          <RefreshCw size={15} /> تحديث الحالة
        </button>
      </header>

      <CustomerReturnStatusMessages
        loading={loading}
        error={error}
        notice={notice}
        canRequest={canRequest}
        hasAvailableItems={available.length > 0}
        currentStatus={statusLabels[summary?.order_status ?? orderStatus] ?? (summary?.order_status ?? orderStatus)}
      />

      {!loading && canRequest && available.length > 0 ? (
        <CustomerReturnForm
          available={available}
          drafts={drafts}
          reason={reason}
          notes={notes}
          busy={busy}
          onDraftChange={(itemId, value) => setDrafts((current) => ({ ...current, [itemId]: value }))}
          onReasonChange={setReason}
          onNotesChange={setNotes}
          onSubmit={(event) => void submit(event)}
          onClear={() => {
            setDrafts({});
            setReason("");
            setNotes("");
            setError("");
            const previousKey = attemptRef.current?.key;
            attemptRef.current = null;
            clearPersistedReturnAttempt(orderId, previousKey);
          }}
        />
      ) : null}

      <CustomerReturnHistory
        requests={summary?.requests ?? []}
        busy={busy}
        onCancelRequest={cancelRequest}
      />
      <CustomerReturnPolicyNote />
    </section>
  );
}
