import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Link2, Mail, RefreshCw, ShieldCheck, UserPlus, UserX, X } from "lucide-react";
import {
  createCustomerActivationInvitation,
  fetchCustomerActivationWorkspace,
  revokeCustomerActivationInvitation,
  type CustomerActivationInvitation,
  type CustomerActivationWorkspace,
} from "@/lib/customer-activation-invitations";

export type CustomerActivationCandidate = {
  id: string;
  business_name: string;
  status: string;
  email?: string | null;
  profile_id?: string | null;
  customer_code?: string | null;
};

const statusLabels = {
  pending: "بانتظار التفعيل",
  accepted: "تم التفعيل",
  revoked: "ملغاة",
  expired: "منتهية",
} satisfies Record<CustomerActivationInvitation["status"], string>;

const dateLabel = (value: string) =>
  new Date(value).toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" });

function InvitationDialogHeader({
  customer,
  busy,
  onClose,
}: {
  customer: CustomerActivationCandidate;
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 18 }}>
      <div>
        <p style={{ margin: "0 0 6px", color: "var(--muted-foreground, #61736f)", fontSize: 12 }}>إدارة العملاء / تفعيل الحساب</p>
        <h2 id="customer-activation-title" style={{ margin: 0, fontSize: 23 }}>دعوة العميل للدخول</h2>
        <p style={{ margin: "7px 0 0", color: "var(--muted-foreground, #61736f)" }}>
          {customer.business_name}{customer.customer_code ? " · " + customer.customer_code : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        aria-label="إغلاق نافذة دعوة التفعيل"
        style={{ border: "1px solid var(--border, #d5e1df)", borderRadius: 9, padding: 8, background: "transparent", cursor: "pointer" }}
      >
        <X size={18} />
      </button>
    </header>
  );
}

function InvitationCreationForm({
  customer,
  email,
  onEmailChange,
  onSubmit,
  busy,
  loading,
  canInvite,
  inviteUrl,
  onCopy,
}: {
  customer: CustomerActivationCandidate;
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  loading: boolean;
  canInvite: boolean;
  inviteUrl: string;
  onCopy: () => void;
}) {
  const hasSavedEmail = Boolean(customer.email?.trim());
  const submitDisabled = busy || loading || !canInvite || !email.trim();

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, padding: 16, border: "1px solid var(--border, #d9e3e2)", borderRadius: 12 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 17 }}>
        <UserPlus size={18} /> إنشاء رابط جديد
      </h3>
      {customer.status !== "approved" ? (
        <p style={{ margin: 0, color: "#9a6414" }}>اعتمد سجل العميل أولًا؛ التفعيل متاح للعملاء المعتمدين فقط.</p>
      ) : null}
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
        البريد الإلكتروني للعميل
        <span style={{ position: "relative", display: "block" }}>
          <Mail size={16} style={{ position: "absolute", right: 11, top: 12, color: "#627774" }} />
          <input
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            dir="ltr"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            readOnly={hasSavedEmail}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid var(--border, #cbd8d6)",
              borderRadius: 9,
              padding: "10px 35px 10px 11px",
              background: hasSavedEmail ? "var(--muted, #f6f8f7)" : "var(--background, #fff)",
              font: "inherit",
            }}
          />
        </span>
        {hasSavedEmail ? (
          <small style={{ color: "var(--muted-foreground, #61736f)", fontWeight: 400 }}>
            يلزم استخدام البريد المحفوظ في سجل العميل؛ لا يُسمح بتغييره من نافذة الدعوة.
          </small>
        ) : (
          <small style={{ color: "var(--muted-foreground, #61736f)", fontWeight: 400 }}>
            سيتم حفظ البريد عند قبول الدعوة فقط، بعد مطابقته مع جلسة المستخدم المؤكدة.
          </small>
        )}
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="submit"
          disabled={submitDisabled}
          style={{
            border: 0,
            borderRadius: 9,
            padding: "11px 15px",
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            cursor: submitDisabled ? "not-allowed" : "pointer",
            background: "#087f8d",
            color: "#fff",
            opacity: submitDisabled ? .55 : 1,
          }}
        >
          <Link2 size={16} /> {busy ? "جارٍ المعالجة..." : "إنشاء رابط تفعيل صالح 72 ساعة"}
        </button>
      </div>
      {inviteUrl ? (
        <div style={{ display: "grid", gap: 9, marginTop: 5 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
            رابط التفعيل — انسخه وشاركه يدويًا
            <input
              readOnly
              value={inviteUrl}
              dir="ltr"
              onFocus={(event) => event.currentTarget.select()}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid var(--border, #cbd8d6)",
                borderRadius: 9,
                padding: 11,
                background: "var(--background, #fff)",
                font: "inherit",
              }}
            />
          </label>
          <div>
            <button
              type="button"
              onClick={onCopy}
              style={{ border: "1px solid var(--border, #d5e1df)", borderRadius: 9, padding: "9px 12px", background: "var(--muted, #f6f8f7)", cursor: "pointer", display: "inline-flex", gap: 7, alignItems: "center" }}
            >
              <Copy size={16} /> نسخ الرابط
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}


function InvitationWorkspaceLoading() {
  return <p role="status" style={{ display: "flex", alignItems: "center", gap: 8 }}><RefreshCw size={16} /> جارٍ تحميل حالة ربط العميل وسجل الدعوات...</p>;
}

function InvitationWorkspaceLoadError({ loading, busy, onRetry }: { loading: boolean; busy: boolean; onRetry: () => void }) {
  return (
    <div role="alert" style={{ padding: 14, border: "1px solid #e8b5b5", borderRadius: 11 }}>
      تعذر التحقق من حالة ربط حساب العميل. لن يُسمح بإنشاء دعوة حتى يُحمّل سجل الدعوات بنجاح.
      <button type="button" onClick={onRetry} disabled={loading || busy} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginInlineStart: 10, border: "1px solid var(--border, #d5e1df)", borderRadius: 8, padding: "7px 9px", background: "transparent", cursor: "pointer" }}>
        <RefreshCw size={14} /> إعادة المحاولة
      </button>
    </div>
  );
}

function InvitationAlreadyLinkedNotice() {
  return <div role="status" style={{ padding: 14, border: "1px solid #b8d8c8", borderRadius: 11 }}>هذا السجل مرتبط بالفعل بحساب مستخدم. لا يمكن إنشاء دعوة تفعيل ثانية.</div>;
}

function InvitationWorkspaceView({
  customer,
  currentWorkspace,
  loading,
  busy,
  canInvite,
  email,
  onEmailChange,
  onSubmit,
  inviteUrl,
  onCopy,
  onRetry,
}: {
  customer: CustomerActivationCandidate;
  currentWorkspace: CustomerActivationWorkspace | null;
  loading: boolean;
  busy: boolean;
  canInvite: boolean;
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  inviteUrl: string;
  onCopy: () => void;
  onRetry: () => void;
}) {
  if (loading) return <InvitationWorkspaceLoading />;

  if (!currentWorkspace) return <InvitationWorkspaceLoadError loading={loading} busy={busy} onRetry={onRetry} />;

  if (currentWorkspace.is_linked) return <InvitationAlreadyLinkedNotice />;

  return (
    <InvitationCreationForm
      customer={customer}
      email={email}
      onEmailChange={onEmailChange}
      onSubmit={onSubmit}
      busy={busy}
      loading={loading}
      canInvite={canInvite}
      inviteUrl={inviteUrl}
      onCopy={onCopy}
    />
  );
}

function InvitationHistoryRow({
  invitation,
  busy,
  onRevoke,
}: {
  invitation: CustomerActivationInvitation;
  busy: boolean;
  onRevoke: (invitation: CustomerActivationInvitation) => void;
}) {
  const canRevoke = invitation.status === "pending" && Date.parse(invitation.expires_at) > Date.now();

  return (
    <article style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid var(--border, #e6ecea)", paddingTop: 10 }}>
      <div>
        <strong dir="ltr" style={{ display: "block", overflowWrap: "anywhere" }}>{invitation.invited_email}</strong>
        <p style={{ margin: "4px 0", fontSize: 13 }}>{statusLabels[invitation.status]}</p>
        <small style={{ color: "var(--muted-foreground, #61736f)" }}>تنتهي: {dateLabel(invitation.expires_at)}</small>
      </div>
      {canRevoke ? (
        <button
          type="button"
          onClick={() => onRevoke(invitation)}
          disabled={busy}
          style={{ border: 0, borderRadius: 8, padding: "8px 10px", background: "#fff0f0", color: "#922b2b", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}
        >
          <UserX size={15} /> إلغاء الدعوة
        </button>
      ) : null}
    </article>
  );
}

function InvitationHistoryBody({
  currentWorkspace,
  loading,
  workspaceLoadFailed,
  busy,
  onRevoke,
}: {
  currentWorkspace: CustomerActivationWorkspace | null;
  loading: boolean;
  workspaceLoadFailed: boolean;
  busy: boolean;
  onRevoke: (invitation: CustomerActivationInvitation) => void;
}) {
  if (loading) {
    return (
      <p role="status" style={{ margin: 0, color: "var(--muted-foreground, #61736f)" }}>
        جارٍ تحديث سجل الدعوات؛ لن نعرض النتائج السابقة قبل اكتمال التحقق.
      </p>
    );
  }

  if (workspaceLoadFailed || !currentWorkspace) {
    return (
      <p role="status" style={{ margin: 0, color: "var(--muted-foreground, #61736f)" }}>
        تعذر تأكيد سجل الدعوات الحالي؛ أُخفي السجل السابق. اضغط تحديث لإعادة المحاولة.
      </p>
    );
  }

  if (currentWorkspace.invitations.length === 0) {
    return <p style={{ margin: 0, color: "var(--muted-foreground, #61736f)" }}>لا توجد دعوات محفوظة لهذا السجل.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 9 }}>
      {currentWorkspace.invitations.map((invitation) => (
        <InvitationHistoryRow
          key={invitation.invitation_id}
          invitation={invitation}
          busy={busy}
          onRevoke={onRevoke}
        />
      ))}
    </div>
  );
}

function InvitationHistoryPanel({
  currentWorkspace,
  loading,
  workspaceLoadFailed,
  busy,
  onRefresh,
  onRevoke,
}: {
  currentWorkspace: CustomerActivationWorkspace | null;
  loading: boolean;
  workspaceLoadFailed: boolean;
  busy: boolean;
  onRefresh: () => void;
  onRevoke: (invitation: CustomerActivationInvitation) => void;
}) {
  return (
    <section style={{ marginTop: 17, padding: 16, border: "1px solid var(--border, #d9e3e2)", borderRadius: 12 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 17 }}>سجل الدعوات</h3>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || busy}
          style={{ border: "1px solid var(--border, #d5e1df)", borderRadius: 8, padding: "7px 9px", background: "transparent", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          <RefreshCw size={14} /> تحديث
        </button>
      </header>
      <InvitationHistoryBody
        currentWorkspace={currentWorkspace}
        loading={loading}
        workspaceLoadFailed={workspaceLoadFailed}
        busy={busy}
        onRevoke={onRevoke}
      />
    </section>
  );
}

export function CustomerActivationInvitationDialog({
  customer,
  onClose,
}: {
  customer: CustomerActivationCandidate;
  onClose: () => void;
}) {
  const [workspace, setWorkspace] = useState<CustomerActivationWorkspace | null>(null);
  const [workspaceCustomerId, setWorkspaceCustomerId] = useState<string | null>(null);
  const [workspaceLoadFailed, setWorkspaceLoadFailed] = useState(false);
  const [email, setEmail] = useState(customer.email?.trim() ?? "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const createInFlightRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const dialogRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  const currentWorkspace = workspaceCustomerId === customer.id ? workspace : null;

  busyRef.current = busy;
  onCloseRef.current = onClose;

  const load = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    setError("");
    setWorkspaceLoadFailed(false);
    try {
      const nextWorkspace = await fetchCustomerActivationWorkspace(customer.id);
      if (requestId !== loadRequestIdRef.current) return;
      if (nextWorkspace.customer_id !== customer.id) {
        throw new Error("تعذر التحقق من تطابق سجل الدعوات مع العميل المحدد.");
      }
      setWorkspace(nextWorkspace);
      setWorkspaceCustomerId(customer.id);
    } catch (cause) {
      if (requestId === loadRequestIdRef.current) {
        setWorkspaceLoadFailed(true);
        setError(cause instanceof Error ? cause.message : "تعذر تحميل سجل الدعوات.");
      }
    } finally {
      if (requestId === loadRequestIdRef.current) setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => {
    setEmail(customer.email?.trim() ?? "");
    setInviteUrl("");
    setError("");
    setNotice("");
  }, [customer.id, customer.email]);

  useEffect(() => {
    void load();
    return () => { loadRequestIdRef.current += 1; };
  }, [load]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(", ");
    const dialog = dialogRef.current;

    const getFocusableElements = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
        .filter((element) => !element.closest('[hidden], [aria-hidden="true"]'));

    const firstFocusable = getFocusableElements()[0];
    (firstFocusable ?? dialog)?.focus({ preventScroll: true });

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog?.focus({ preventScroll: true });
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const focusIsOutsideDialog = !dialog?.contains(activeElement);

      if (event.shiftKey && (activeElement === first || focusIsOutsideDialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || focusIsOutsideDialog)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      if (previouslyFocused?.isConnected && !previouslyFocused.hasAttribute("disabled")) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createInFlightRef.current || busy || loading || !currentWorkspace || currentWorkspace.is_linked || workspaceLoadFailed) return;
    createInFlightRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setInviteUrl("");
    try {
      const invitation = await createCustomerActivationInvitation(customer.id, email, 72);
      setInviteUrl(invitation.url);
      setNotice("أنشأ الخادم رابط تفعيل لمرة واحدة حتى " + dateLabel(invitation.expires_at) + ". لم يُرسل بريد تلقائيًا؛ شارك الرابط يدويًا.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء رابط التفعيل.");
    } finally {
      createInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice("تم نسخ رابط التفعيل إلى الحافظة.");
    } catch {
      setError("تعذر النسخ التلقائي. حدّد الرابط الظاهر وانسخه يدويًا.");
    }
  }

  async function revoke(invitation: CustomerActivationInvitation) {
    if (
      busy ||
      loading ||
      workspaceLoadFailed ||
      !currentWorkspace?.invitations.some((row) => row.invitation_id === invitation.invitation_id) ||
      !window.confirm("إلغاء رابط التفعيل المعلق إلى " + invitation.invited_email + "؟")
    ) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await revokeCustomerActivationInvitation(invitation.invitation_id);
      setNotice("أُلغي رابط التفعيل في الخادم.");
      setInviteUrl("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إلغاء رابط التفعيل.");
    } finally {
      setBusy(false);
    }
  }

  const canInvite = customer.status === "approved" && currentWorkspace !== null &&
    !currentWorkspace.is_linked && !workspaceLoadFailed && !error;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeItems: "center", padding: 14, background: "rgba(15,23,42,.55)" }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-activation-title"
        tabIndex={-1}
        dir="rtl"
        style={{ width: "min(760px, 100%)", maxHeight: "min(88vh, 900px)", overflow: "auto", background: "var(--card, #fff)", color: "var(--foreground, #152b2b)", border: "1px solid var(--border, #d9e3e2)", borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,.26)", padding: 22 }}
      >
        <InvitationDialogHeader customer={customer} busy={busy} onClose={onClose} />
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 13, border: "1px solid #d8e5e1", borderRadius: 12, background: "rgba(8,127,141,.055)", marginBottom: 14 }}>
          <ShieldCheck size={20} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
            لا يُربط الحساب بملف العميل إلا بعد تسجيل الدخول أو إنشاء الحساب بالبريد المطابق، وتأكيد البريد، وقبول الرابط مرة واحدة. الرابط سري؛ شاركه مع العميل فقط. لا يتم إرسال بريد تلقائي.
          </p>
        </div>
        {error ? <div role="alert" style={{ padding: 11, borderRadius: 9, border: "1px solid #e8b5b5", color: "#922b2b", marginBottom: 12 }}>{error}</div> : null}
        {notice ? <div role="status" style={{ padding: 11, borderRadius: 9, border: "1px solid #c7dfd2", color: "#17684d", marginBottom: 12 }}>{notice}</div> : null}
        <InvitationWorkspaceView
          customer={customer}
          currentWorkspace={currentWorkspace}
          loading={loading}
          busy={busy}
          canInvite={canInvite}
          email={email}
          onEmailChange={setEmail}
          onSubmit={createInvite}
          inviteUrl={inviteUrl}
          onCopy={() => void copyInviteLink()}
          onRetry={() => void load()}
        />
        <InvitationHistoryPanel
          currentWorkspace={currentWorkspace}
          loading={loading}
          workspaceLoadFailed={workspaceLoadFailed}
          busy={busy}
          onRefresh={() => void load()}
          onRevoke={revoke}
        />
        <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--muted-foreground, #61736f)", margin: "13px 0 0" }}>
          ضوابط الخادم: عزل المؤسسة، موافقة العميل، تحقق البريد المؤكد، صلاحية محدودة، تخزين بصمة الرمز فقط، سجل تدقيق، ومنع إعادة الربط. لا يمكن للرابط تغيير الأسعار أو حالة العميل أو أي صلاحية تشغيلية.
        </p>
      </section>
    </div>
  );
}
