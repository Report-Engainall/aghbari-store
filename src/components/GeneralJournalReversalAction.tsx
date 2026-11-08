import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Props = {
  entryId: string;
  disabled: boolean;
  onCreated: (status: "draft" | "posted") => void | Promise<void>;
};

export function GeneralJournalReversalAction({ entryId, disabled, onCreated }: Props) {
  const pending = useRef<{ reason: string; key: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function reverse() {
    const input = window.prompt("سبب عكس القيد المرحّل (5 أحرف على الأقل):");
    if (!input) return;
    const reason = input.trim();
    if (reason.length < 5) { setError("سبب العكس مطلوب بطول 5 أحرف على الأقل."); return; }
    if (!window.crypto?.randomUUID) { setError("المتصفح لا يدعم مفتاح منع التكرار الآمن؛ لم يُرسل الطلب."); return; }
    if (!pending.current || pending.current.reason !== reason) {
      pending.current = { reason, key: window.crypto.randomUUID() };
    }
    setSaving(true); setError("");
    let confirmedByServer: "draft" | "posted" | null = null;
    try {
      const { data, error: rpcError } = await supabase.rpc("reverse_general_journal_entry", {
        p_entry_id: entryId, p_reason: reason, p_idempotency_key: pending.current.key,
      });
      if (rpcError) throw new Error("تعذر إنشاء مسودة العكس. لم يُعلن ترحيل غير مؤكد.");
      if (!data || typeof data !== "object" || Array.isArray(data)
        || !("original_journal_entry_id" in data) || data.original_journal_entry_id !== entryId
        || !("reversal_journal_entry_id" in data) || typeof data.reversal_journal_entry_id !== "string"
        || !("status" in data) || (data.status !== "draft" && data.status !== "posted")
        || !("replayed" in data) || typeof data.replayed !== "boolean") {
        throw new Error("استجابة العكس لا تطابق القيد المطلوب.");
      }
      confirmedByServer = data.status;
      // Preserve pending.current until the caller has also completed its refresh.
      // If refresh fails, retrying the same reason reuses the server idempotency key.
      await onCreated(data.status);
      pending.current = null;
    } catch (cause) {
      setError(
        confirmedByServer
          ? "تم تأكيد العكس من الخادم، لكن تعذر تحديث دفتر الأستاذ. أعد المحاولة بالتعليل نفسه لإعادة التحقق."
          : cause instanceof Error ? cause.message : "تعذر إنشاء مسودة العكس."
      );
    } finally { setSaving(false); }
  }

  return <div className="no-print" style={{ display: "grid", gap: 6, marginTop: 10 }}>
    <button type="button" style={{ border: "1px solid var(--border, #d6dfe4)", borderRadius: 8, padding: "8px 11px", cursor: "pointer", font: "inherit", background: "var(--card, #fff)", color: "var(--foreground, #17242a)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }} onClick={() => void reverse()} disabled={disabled || saving}>
      <RotateCcw size={14} /> إنشاء مسودة عكس
    </button>
    {error && <p role="alert" style={{ color: "#9b2828", margin: 0 }}>{error}</p>}
  </div>;
}
