import { useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Link2, ShieldCheck, UserRound } from "lucide-react";
import { Login } from "@/components/Login";
import { acceptCustomerActivationInvitation } from "@/lib/customer-activation-invitations";
import { useAuth } from "@/lib/auth";

const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

const activationShell: CSSProperties = {
  minHeight: "100vh",
  maxWidth: 760,
  margin: "0 auto",
  padding: 22,
  boxSizing: "border-box",
};

const activationPanel: CSSProperties = {
  border: "1px solid #dce7e5",
  borderRadius: 15,
  padding: 22,
  background: "#fff",
  boxShadow: "0 10px 40px rgba(18,55,51,.06)",
};

type AcceptedInvitation = { business_name: string; email: string };

function InvalidInvitationTokenView() {
  return (
    <main dir="rtl" className="storefront" style={activationShell}>
      <section style={activationPanel} role="alert">
        <h1>رابط تفعيل غير صالح</h1>
        <p>تحقق من الرابط الذي أرسله فريق متجر الأغبري أو اطلب رابطًا جديدًا.</p>
        <Link to="/">العودة إلى المتجر</Link>
      </section>
    </main>
  );
}

function SessionLoadingView() {
  return (
    <main dir="rtl" className="storefront" style={activationShell}>
      <p role="status">جارٍ التحقق من جلسة الحساب...</p>
    </main>
  );
}

function CustomerRegistrationView() {
  return (
    <main dir="rtl" className="storefront" style={{ ...activationShell, maxWidth: 1120 }}>
      <header style={{ margin: "5px 0 18px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <ShieldCheck size={27} />
          <h1 style={{ margin: 0 }}>تفعيل حساب عميل</h1>
        </div>
        <p style={{ color: "#536b68", lineHeight: 1.8 }}>
          أنشئ حسابًا أو سجّل الدخول بالبريد الإلكتروني الذي سجّله موظف الأغبري في دعوتك. سيحتفظ رابط تأكيد البريد بمسار التفعيل حتى تستطيع العودة لقبول الدعوة.
        </p>
      </header>
      <section style={activationPanel}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <UserRound size={19} />
          <strong>بيانات الحساب</strong>
        </div>
        <Login initialMode="register" onDone={() => window.location.reload()} />
      </section>
    </main>
  );
}

function StaffAccountBlockedView() {
  return (
    <main dir="rtl" className="storefront" style={activationShell}>
      <section style={activationPanel} role="alert">
        <h1>الدعوة مخصصة لحساب عميل</h1>
        <p>
          أنت مسجّل الدخول بحساب فريق تشغيل. سجّل الخروج وافتح الرابط بحساب العميل الذي استلم الدعوة. رابط التفعيل لا يمنح صلاحيات موظف.
        </p>
      </section>
    </main>
  );
}

function AcceptedInvitationView({ accepted }: { accepted: AcceptedInvitation }) {
  return (
    <main dir="rtl" className="storefront" style={activationShell}>
      <section style={{ ...activationPanel, borderColor: "#b6d9c7" }} role="status">
        <CheckCircle2 size={32} color="#21784d" />
        <h1>تم تفعيل حساب العميل</h1>
        <p>تم ربط حساب {accepted.email} بسجل {accepted.business_name} بواسطة الخادم.</p>
        <p>حالة اعتماد العميل وسياسات الأسعار والصلاحيات لم تتغير بهذا الرابط.</p>
        <Link to="/">متابعة إلى متجر الأغبري</Link>
      </section>
    </main>
  );
}

function ActivationConfirmationView({
  email,
  busy,
  error,
  onAccept,
}: {
  email: string;
  busy: boolean;
  error: string;
  onAccept: () => void;
}) {
  return (
    <main dir="rtl" className="storefront" style={activationShell}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link2 size={26} />
          <h1 style={{ margin: 0 }}>قبول دعوة تفعيل الحساب</h1>
        </div>
        <p style={{ color: "#536b68", lineHeight: 1.8 }}>
          سيطابق الخادم البريد المؤكد مع عنوان الدعوة ويربط حسابك بسجل عميل واحد فقط. لا يمكن للرابط تغيير رصيد العميل أو شريحة الأسعار أو منح أدوار فريق التشغيل.
        </p>
      </header>
      <section style={activationPanel}>
        <div style={{ display: "grid", gap: 7, marginBottom: 18 }}>
          <strong>الحساب الحالي</strong>
          <span dir="ltr" style={{ justifySelf: "start", overflowWrap: "anywhere" }}>{email}</span>
          <small style={{ color: "#536b68" }}>
            إذا لم يكن هذا هو البريد الذي تلقى الدعوة، سجّل الخروج ثم ادخل بالبريد الصحيح.
          </small>
        </div>
        {error ? (
          <div role="alert" style={{ border: "1px solid #e7b7b7", color: "#922b2b", padding: 11, borderRadius: 9, marginBottom: 12 }}>
            {error}
          </div>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          style={{
            border: 0,
            borderRadius: 10,
            padding: "12px 16px",
            background: "#087f8d",
            color: "#fff",
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? .6 : 1,
          }}
        >
          <ShieldCheck size={17} />
          {busy ? "جارٍ التحقق وربط الحساب..." : "التحقق من الدعوة وتفعيل الحساب"}
        </button>
      </section>
    </main>
  );
}

export function CustomerActivationInvitationPage({ token }: { token: string }) {
  const { user, ready } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState<AcceptedInvitation | null>(null);
  const validToken = TOKEN_PATTERN.test(token);

  async function accept() {
    if (busy || !validToken || !user || user.isStaff) return;
    setBusy(true);
    setError("");
    try {
      // Remove the bearer token from the visible URL before any network request.
      // Keep it in component state/props so a transient error can be retried without re-exposing it.
      window.history.replaceState(null, "", window.location.origin + "/");
      const result = await acceptCustomerActivationInvitation(token);
      setAccepted({ business_name: result.business_name, email: result.email });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تفعيل حساب العميل.");
    } finally {
      setBusy(false);
    }
  }

  if (!validToken) return <InvalidInvitationTokenView />;
  if (!ready) return <SessionLoadingView />;
  if (!user) return <CustomerRegistrationView />;
  if (user.isStaff) return <StaffAccountBlockedView />;
  if (accepted) return <AcceptedInvitationView accepted={accepted} />;

  return (
    <ActivationConfirmationView
      email={user.email}
      busy={busy}
      error={error}
      onAccept={() => void accept()}
    />
  );
}
