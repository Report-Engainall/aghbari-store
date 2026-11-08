import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Copy,
  Link2,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { Login } from "@/components/Login";
import { useAuth } from "@/lib/auth";
import {
  acceptCompanyInvitation,
  createCompanyInvitation,
  fetchCompanyMembershipWorkspace,
  revokeCompanyInvitation,
  revokeCompanyMember,
  type CompanyInvitation,
  type CompanyMember,
  type CompanyMemberRole,
  type CompanyMembershipWorkspace,
} from "@/lib/customer-company-members";

const roleOptions: Array<{
  id: CompanyMemberRole;
  label: string;
  details: string;
}> = [
  {
    id: "buyer",
    label: "مسؤول المشتريات",
    details: "الطلبات وعروض الأسعار وإعادة الطلب والعناوين.",
  },
  {
    id: "finance",
    label: "المحاسب",
    details: "قراءة الطلبات والفواتير وكشف الحساب.",
  },
  {
    id: "viewer",
    label: "مشاهد",
    details: "قراءة الطلبات وجهات الاتصال دون إنشاء طلبات.",
  },
];

const statusNames: Record<CompanyInvitation["status"], string> = {
  pending: "بانتظار القبول",
  accepted: "مقبولة",
  revoked: "ملغاة",
  expired: "منتهية",
};

const localDate = (value: string) =>
  new Date(value).toLocaleString("ar-YE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const panel: CSSProperties = {
  padding: 18,
  border: "1px solid #e0e8e7",
  borderRadius: 14,
  background: "#fff",
};

const button: CSSProperties = {
  border: 0,
  borderRadius: 9,
  padding: "10px 13px",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
};

function roleLabel(role: CompanyMemberRole): string {
  return roleOptions.find((option) => option.id === role)?.label ?? role;
}

function MemberRoleField({
  value,
  onChange,
}: {
  value: CompanyMemberRole;
  onChange: (value: CompanyMemberRole) => void;
}) {
  return (
    <label>
      الدور التجاري
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as CompanyMemberRole)}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          marginTop: 6,
          padding: 11,
          border: "1px solid #cbdad9",
          borderRadius: 9,
        }}
      >
        {roleOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label} — {option.details}
          </option>
        ))}
      </select>
    </label>
  );
}

function MemberEmailField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      بريد العضو
      <input
        type="email"
        autoComplete="email"
        dir="ltr"
        required
        maxLength={254}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          marginTop: 6,
          padding: 11,
          border: "1px solid #cbdad9",
          borderRadius: 9,
        }}
      />
    </label>
  );
}

function InvitationLinkPanel({
  inviteUrl,
  onCopy,
}: {
  inviteUrl: string;
  onCopy: () => void;
}) {
  if (!inviteUrl) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <label>
        رابط الدعوة — انسخه وشاركه يدويًا
        <input
          readOnly
          value={inviteUrl}
          onFocus={(event) => event.currentTarget.select()}
          dir="ltr"
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            marginTop: 6,
            padding: 11,
            border: "1px solid #cbdad9",
            borderRadius: 9,
          }}
        />
      </label>
      <button
        type="button"
        style={{ ...button, marginTop: 8, background: "#eef7f7" }}
        onClick={onCopy}
      >
        <Copy size={16} /> نسخ الرابط
      </button>
    </div>
  );
}

function InvitationFormSection({
  email,
  role,
  creating,
  loading,
  canCreate,
  inviteUrl,
  onEmailChange,
  onRoleChange,
  onSubmit,
  onCopy,
}: {
  email: string;
  role: CompanyMemberRole;
  creating: boolean;
  loading: boolean;
  canCreate: boolean;
  inviteUrl: string;
  onEmailChange: (value: string) => void;
  onRoleChange: (value: CompanyMemberRole) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCopy: () => void;
}) {
  return (
    <section style={{ ...panel, marginBottom: 18 }}>
      <h2
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 0,
        }}
      >
        <UserPlus size={20} /> دعوة عضو جديد
      </h2>
      <p style={{ color: "#526b70" }}>
        لا تُفعّل العضوية إلا بعد تسجيل الدخول بالبريد المطابق وقبول الرابط مرة
        واحدة. لا ينشئ الرابط حسابًا تلقائيًا ولا يمنح صلاحيات فريق الأغبري.
      </p>
      <form
        onSubmit={onSubmit}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
          gap: 12,
          alignItems: "end",
        }}
      >
        <MemberEmailField value={email} onChange={onEmailChange} />
        <MemberRoleField value={role} onChange={onRoleChange} />
        <button
          type="submit"
          disabled={creating || loading || !canCreate}
          style={{
            ...button,
            background: "#087f8d",
            color: "#fff",
            justifyContent: "center",
          }}
        >
          {creating ? "جارٍ إنشاء الدعوة..." : "إنشاء رابط دعوة"}
        </button>
      </form>
      <InvitationLinkPanel inviteUrl={inviteUrl} onCopy={onCopy} />
    </section>
  );
}

function WorkspaceHeader({
  companyName,
  loading,
  creating,
  busy,
  onRefresh,
}: {
  companyName?: string;
  loading: boolean;
  creating: boolean;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 20,
      }}
    >
      <div>
        <Link
          to="/addresses"
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <ArrowRight size={16} /> مساحة الحساب
        </Link>
        <h1 style={{ margin: "12px 0 4px" }}>أعضاء الشركة وصلاحياتهم</h1>
        <p style={{ margin: 0, color: "#526b70" }}>
          {companyName ?? "إدارة دعوات الدخول إلى حساب الشركة التجاري"}
        </p>
      </div>
      <button
        type="button"
        style={{
          ...button,
          background: "#fff",
          border: "1px solid #d5e4e5",
        }}
        disabled={loading || creating || busy}
        onClick={onRefresh}
      >
        <RefreshCw size={16} /> تحديث
      </button>
    </header>
  );
}

function WorkspaceFeedback({
  error,
  notice,
}: {
  error: string;
  notice: string;
}) {
  return (
    <>
      {error ? (
        <div
          role="alert"
          style={{
            ...panel,
            borderColor: "#d99",
            color: "#912727",
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          style={{
            ...panel,
            borderColor: "#a8d7c0",
            color: "#17684d",
            marginBottom: 14,
          }}
        >
          {notice}
        </div>
      ) : null}
    </>
  );
}

function MemberCard({
  member,
  busyId,
  disabled,
  onRevoke,
}: {
  member: CompanyMember;
  busyId: string | null;
  disabled: boolean;
  onRevoke: (member: CompanyMember) => void;
}) {
  const isActive = member.status === "active";
  const isBusy = busyId === member.profile_id;

  return (
    <article style={{ ...panel, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <strong>{member.full_name}</strong>
        <span>{isActive ? "نشط" : "ملغى"}</span>
      </div>
      <p
        dir="auto"
        style={{ overflowWrap: "anywhere", color: "#526b70" }}
      >
        {member.email ?? "لا يوجد بريد"}
      </p>
      <p>{roleLabel(member.member_role)}</p>
      <small style={{ color: "#526b70" }}>
        قُبلت الدعوة: {localDate(member.accepted_at)}
      </small>
      {isActive ? (
        <button
          type="button"
          style={{
            ...button,
            background: "#fff1f1",
            color: "#952a2a",
            marginTop: 12,
          }}
          disabled={disabled}
          onClick={() => onRevoke(member)}
        >
          <UserX size={15} />
          {isBusy ? "جارٍ الإلغاء..." : "إلغاء العضوية"}
        </button>
      ) : null}
    </article>
  );
}

function MembersSectionHeading() {
  return (
    <h2
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 0,
      }}
    >
      <Users size={20} /> عضويات الشركة
    </h2>
  );
}

function InvitationsSectionHeading() {
  return (
    <h2
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 0,
      }}
    >
      <Link2 size={20} /> سجل الدعوات
    </h2>
  );
}

function InvitationHistoryDisclosure() {
  return (
    <p style={{ color: "#526b70", fontSize: 13 }}>
      يعرض هذا القسم آخر 100 دعوة فقط. قد توجد دعوات أقدم محفوظة في سجل النظام
      وغير ظاهرة هنا؛ لا تعتبر القائمة سجلًا تاريخيًا كاملًا.
    </p>
  );
}

function MembersSection({
  members,
  loading,
  busyId,
  disabled,
  onRevoke,
}: {
  members: CompanyMember[];
  loading: boolean;
  busyId: string | null;
  disabled: boolean;
  onRevoke: (member: CompanyMember) => void;
}) {
  if (loading) {
    return (
      <section style={{ ...panel, marginBottom: 18 }}>
        <MembersSectionHeading />
        <p role="status">جارٍ تحميل العضويات...</p>
      </section>
    );
  }

  if (members.length === 0) {
    return (
      <section style={{ ...panel, marginBottom: 18 }}>
        <MembersSectionHeading />
        <p>لا توجد عضويات إضافية حتى الآن.</p>
      </section>
    );
  }

  return (
    <section style={{ ...panel, marginBottom: 18 }}>
      <MembersSectionHeading />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(265px,1fr))",
          gap: 12,
        }}
      >
        {members.map((member) => (
          <MemberCard
            key={member.profile_id}
            member={member}
            busyId={busyId}
            disabled={disabled}
            onRevoke={onRevoke}
          />
        ))}
      </div>
    </section>
  );
}

function InvitationRow({
  invitation,
  busyId,
  disabled,
  onRevoke,
}: {
  invitation: CompanyInvitation;
  busyId: string | null;
  disabled: boolean;
  onRevoke: (invitation: CompanyInvitation) => void;
}) {
  const isPending = invitation.status === "pending";
  const isBusy = busyId === invitation.invitation_id;

  return (
    <article
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        borderTop: "1px solid #e7eeee",
        paddingTop: 12,
      }}
    >
      <div>
        <strong dir="auto">{invitation.invited_email}</strong>
        <p style={{ margin: "4px 0" }}>
          {roleLabel(invitation.member_role)} · {statusNames[invitation.status]}
        </p>
        <small style={{ color: "#526b70" }}>
          تنتهي: {localDate(invitation.expires_at)}
        </small>
      </div>
      {isPending ? (
        <button
          type="button"
          style={{ ...button, background: "#fff1f1", color: "#952a2a" }}
          disabled={disabled}
          onClick={() => onRevoke(invitation)}
        >
          {isBusy ? "جارٍ الإلغاء..." : "إلغاء الدعوة"}
        </button>
      ) : null}
    </article>
  );
}

function InvitationsSection({
  invitations,
  loading,
  busyId,
  disabled,
  onRevoke,
}: {
  invitations: CompanyInvitation[];
  loading: boolean;
  busyId: string | null;
  disabled: boolean;
  onRevoke: (invitation: CompanyInvitation) => void;
}) {
  if (loading) {
    return (
      <section style={panel}>
        <InvitationsSectionHeading />
        <InvitationHistoryDisclosure />
        <p role="status">جارٍ تحميل سجل الدعوات...</p>
      </section>
    );
  }

  if (invitations.length === 0) {
    return (
      <section style={panel}>
        <InvitationsSectionHeading />
        <InvitationHistoryDisclosure />
        <p>لا توجد دعوات محفوظة.</p>
      </section>
    );
  }

  return (
    <section style={panel}>
      <InvitationsSectionHeading />
      <InvitationHistoryDisclosure />
      <div style={{ display: "grid", gap: 10 }}>
        {invitations.map((invitation) => (
          <InvitationRow
            key={invitation.invitation_id}
            invitation={invitation}
            busyId={busyId}
            disabled={disabled}
            onRevoke={onRevoke}
          />
        ))}
      </div>
    </section>
  );
}

function WorkspaceSecurityDisclosure() {
  return (
    <p style={{ marginTop: 16, color: "#526b70", fontSize: 12 }}>
      ضوابط الخادم: رمز سري أحادي الاستخدام، صلاحية 7 أيام، مطابقة بريد
      الحساب، منع ربط هوية لها سجل عميل مستقل، وإلغاء فوري للصلاحيات عند سحب
      العضوية. الإرسال عبر البريد غير مفعّل؛ شارك الرابط يدويًا.
    </p>
  );
}

export function CustomerCompanyMembersPage() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <main
        dir="rtl"
        className="storefront"
        role="status"
        style={{ padding: 24 }}
      >
        جارٍ التحقق من الجلسة...
      </main>
    );
  }

  if (!user) return <Login />;

  if (user.isStaff) {
    return (
      <main
        dir="rtl"
        className="storefront"
        role="alert"
        style={{ padding: 24 }}
      >
        <h1>إدارة أعضاء الشركة</h1>
        <p>
          هذه الشاشة لمالك حساب العميل فقط. استخدم إدارة مستخدمي النظام
          لصلاحيات فريق الأغبري.
        </p>
        <Link to="/">العودة إلى المتجر</Link>
      </main>
    );
  }

  return <CompanyMembersWorkspace />;
}

function CompanyMembersWorkspace() {
  const [data, setData] = useState<CompanyMembershipWorkspace | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyMemberRole>("buyer");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const createInFlightRef = useRef(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchCompanyMembershipWorkspace());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر تحميل أعضاء الشركة.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      createInFlightRef.current ||
      creating ||
      loading ||
      !data ||
      Boolean(error)
    ) {
      return;
    }

    createInFlightRef.current = true;
    setCreating(true);
    setError("");
    setNotice("");
    setInviteUrl("");

    try {
      const invite = await createCompanyInvitation(email, role);
      const url = new URL(
        "/company/accept-invitation",
        window.location.origin,
      );
      url.searchParams.set("token", invite.invitation_token);
      setInviteUrl(url.toString());
      setEmail("");
      setNotice(
        "أنشأ الخادم رابط دعوة صالحًا حتى " +
          localDate(invite.expires_at) +
          ". لم يُرسل بريد تلقائيًا؛ شارك الرابط يدويًا.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر إنشاء الدعوة.",
      );
    } finally {
      createInFlightRef.current = false;
      setCreating(false);
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice("تم نسخ رابط الدعوة إلى الحافظة.");
    } catch {
      setError("تعذر النسخ التلقائي. حدّد الرابط الظاهر وانسخه يدويًا.");
    }
  }

  async function revokeMember(member: CompanyMember) {
    if (loading || !data || Boolean(error) || busyId) return;
    if (
      !window.confirm(
        "إلغاء وصول " + member.full_name + " إلى بيانات الشركة والطلبات؟",
      )
    ) {
      return;
    }

    setBusyId(member.profile_id);
    setError("");
    setNotice("");

    try {
      await revokeCompanyMember(member.profile_id);
      setNotice("تم إلغاء العضوية من الخادم.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر إلغاء العضوية.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function revokeInvite(invitation: CompanyInvitation) {
    if (loading || !data || Boolean(error) || busyId) return;
    if (
      !window.confirm(
        "إلغاء الدعوة المعلقة إلى " + invitation.invited_email + "؟",
      )
    ) {
      return;
    }

    setBusyId(invitation.invitation_id);
    setError("");
    setNotice("");

    try {
      await revokeCompanyInvitation(invitation.invitation_id);
      setNotice("تم إلغاء الدعوة.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إلغاء الدعوة.");
    } finally {
      setBusyId(null);
    }
  }

  const canCreate = Boolean(data) && !error;
  const revokeDisabled = loading || !data || Boolean(error) || Boolean(busyId);

  return (
    <main
      dir="rtl"
      className="storefront"
      style={{ minHeight: "100vh", padding: 20, maxWidth: 1200, margin: "0 auto" }}
    >
      <WorkspaceHeader
        companyName={data?.company_name}
        loading={loading}
        creating={creating}
        busy={Boolean(busyId)}
        onRefresh={() => void load()}
      />
      <WorkspaceFeedback error={error} notice={notice} />
      <InvitationFormSection
        email={email}
        role={role}
        creating={creating}
        loading={loading}
        canCreate={canCreate}
        inviteUrl={inviteUrl}
        onEmailChange={setEmail}
        onRoleChange={setRole}
        onSubmit={(event) => void create(event)}
        onCopy={() => void copyLink()}
      />
      <MembersSection
        members={data?.members ?? []}
        loading={loading}
        busyId={busyId}
        disabled={revokeDisabled}
        onRevoke={(member) => void revokeMember(member)}
      />
      <InvitationsSection
        invitations={data?.invitations ?? []}
        loading={loading}
        busyId={busyId}
        disabled={revokeDisabled}
        onRevoke={(invitation) => void revokeInvite(invitation)}
      />
      <WorkspaceSecurityDisclosure />
    </main>
  );
}

function AcceptanceHeader() {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <ShieldCheck size={28} />
      <h1>قبول دعوة الشركة</h1>
    </header>
  );
}

function AcceptedInvitationView({
  accepted,
}: {
  accepted: { company_name: string; member_role: CompanyMemberRole };
}) {
  return (
    <section
      style={{
        padding: 20,
        border: "1px solid #a8d7c0",
        borderRadius: 12,
      }}
      role="status"
    >
      <h2>تم تفعيل العضوية</h2>
      <p>
        انضممت إلى {accepted.company_name} بدور {roleLabel(accepted.member_role)}.
      </p>
      <Link to="/">متابعة إلى متجر الأغبري</Link>
    </section>
  );
}

function InvitationAcceptanceForm({
  token,
  loading,
  error,
  onAccept,
}: {
  token: string;
  loading: boolean;
  error: string;
  onAccept: () => void;
}) {
  return (
    <section
      style={{
        padding: 20,
        border: "1px solid #e0e8e7",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <p>
        سيطابق الخادم بريد الجلسة مع البريد المدعو ويتحقق من صلاحية الرابط وعدم
        استخدامه سابقًا.
      </p>
      {error ? (
        <p role="alert" style={{ color: "#942727" }}>
          {error}
        </p>
      ) : null}
      {!token ? (
        <p role="alert">رابط الدعوة لا يحتوي على رمز صالح. اطلب رابطًا جديدًا.</p>
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={onAccept}
          style={{
            border: 0,
            borderRadius: 9,
            padding: "12px 16px",
            fontWeight: 800,
            background: "#087f8d",
            color: "#fff",
          }}
        >
          {loading
            ? "جارٍ التحقق وقبول الدعوة..."
            : "قبول الدعوة والانضمام للشركة"}
        </button>
      )}
    </section>
  );
}

function SignedOutInvitationView() {
  return (
    <main
      className="storefront"
      dir="rtl"
      style={{ minHeight: "100vh", padding: 20 }}
    >
      <h1>قبول دعوة الشركة</h1>
      <p>سجّل الدخول بالبريد المطابق للدعوة، ثم عد لقبولها.</p>
      <Login onDone={() => window.location.reload()} />
    </main>
  );
}

function StaffInvitationBlockedView() {
  return (
    <main
      className="storefront"
      dir="rtl"
      role="alert"
      style={{ padding: 24 }}
    >
      الدعوة مخصصة لحساب عميل وليست حساب فريق الأغبري.
    </main>
  );
}

function CompanyInvitationAcceptanceWorkspace({
  token,
  accepted,
  loading,
  error,
  onAccept,
}: {
  token: string;
  accepted: { company_name: string; member_role: CompanyMemberRole } | null;
  loading: boolean;
  error: string;
  onAccept: () => void;
}) {
  return (
    <main
      className="storefront"
      dir="rtl"
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: 24,
        minHeight: "100vh",
      }}
    >
      <AcceptanceHeader />
      {accepted ? (
        <AcceptedInvitationView accepted={accepted} />
      ) : (
        <InvitationAcceptanceForm
          token={token}
          loading={loading}
          error={error}
          onAccept={onAccept}
        />
      )}
    </main>
  );
}

export function CompanyInvitationAcceptancePage({
  initialToken,
}: {
  initialToken?: string;
} = {}) {
  const { user, ready } = useAuth();
  const [token, setToken] = useState(initialToken ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState<{
    company_name: string;
    member_role: CompanyMemberRole;
  } | null>(null);

  useEffect(() => {
    setToken(
      initialToken ?? new URLSearchParams(window.location.search).get("token") ?? "",
    );
  }, [initialToken]);

  async function accept() {
    if (!token || loading) return;

    setLoading(true);
    setError("");

    try {
      window.history.replaceState(null, "", "/company/accept-invitation");
      const result = await acceptCompanyInvitation(token);
      setAccepted({
        company_name: result.company_name,
        member_role: result.member_role,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر قبول الدعوة.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <main
        className="storefront"
        dir="rtl"
        role="status"
        style={{ padding: 24 }}
      >
        جارٍ التحقق من الجلسة...
      </main>
    );
  }

  if (!user) return <SignedOutInvitationView />;
  if (user.isStaff) return <StaffInvitationBlockedView />;

  return (
    <CompanyInvitationAcceptanceWorkspace
      token={token}
      accepted={accepted}
      loading={loading}
      error={error}
      onAccept={() => void accept()}
    />
  );
}
