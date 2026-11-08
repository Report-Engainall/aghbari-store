import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, ShieldCheck, UserCog } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Profile = {
  profile_id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  roles: string[];
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  manager: 'مدير',
  staff: 'موظف تشغيل',
  accountant: 'محاسب',
  customer: 'عميل',
  customer_manager: 'مسؤول العملاء',
};
const FALLBACK_ROLES = [
  { value: 'staff', label: 'موظف تشغيل — صلاحيات تشغيلية' },
  { value: 'accountant', label: 'محاسب — صلاحيات مالية' },
] as const;
const sorted = (roles: string[]) => Array.from(new Set(roles)).sort();

function normalizeOrganizationProfiles(data: unknown): Profile[] {
  if (!Array.isArray(data)) return [];
  return (data as Profile[])
    .filter((profile) =>
      typeof profile.profile_id === 'string' &&
      typeof profile.full_name === 'string' &&
      Array.isArray(profile.roles) &&
      profile.is_active === true,
    )
    .map((profile) => ({ ...profile, roles: sorted(profile.roles) }));
}

function roleUpdateErrorMessage(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : '';
  if (detail.includes('outside the current organization')) {
    return 'رفض الخادم التعديل لأن الحساب خارج المؤسسة الحالية أو غير نشط.';
  }
  if (detail.includes('cannot change their own roles')) {
    return 'لا يمكنك تعديل أدوار حسابك الحالي.';
  }
  return 'رفض الخادم تغيير الأدوار أو تعذر تأكيده. لم تُعرض رسالة نجاح.';
}

function CustomerManagerRoleHeading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <ShieldCheck size={22} aria-hidden="true" />
      <div>
        <h2 id="customer-manager-role-title" style={{ margin: 0 }}>إسناد وإدارة دور مسؤول العملاء</h2>
        <p style={{ margin: '5px 0 0', lineHeight: 1.7 }}>
          تعمل هذه الواجهة عبر RPC مقيد بالمؤسسة ويسجل تغييرات الأدوار. لا يمكن تعديل دور حسابك الحالي.
        </p>
      </div>
    </div>
  );
}

function CustomerManagerRoleSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'block', margin: '14px 0' }}>
      <span style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}>بحث بالاسم أو البريد</span>
      <input
        aria-label="البحث عن مستخدم لإسناد دور مسؤول العملاء"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={254}
        placeholder="اسم المستخدم أو البريد الإلكتروني"
        style={{ width: '100%', maxWidth: 460, padding: '10px 12px', border: '1px solid #d5e7e9', borderRadius: 9 }}
      />
    </label>
  );
}

function CustomerManagerRoleFeedback({
  error,
  loading,
  onRetry,
}: {
  error: string;
  loading: boolean;
  onRetry: () => void;
}) {
  if (!error) return null;
  return (
    <div role="alert" className="error-box" style={{ display: 'block', marginBottom: 12 }}>
      {error}
      <button type="button" className="btn btn-outline" onClick={onRetry} disabled={loading}>
        <RefreshCw size={14} /> إعادة المحاولة
      </button>
    </div>
  );
}

function ProfileRoleBadges({ roles }: { roles: string[] }) {
  if (roles.length === 0) return <span className="badge warning">دون دور مسند</span>;
  return (
    <>
      {roles.map((role) => (
        <span className="badge info" key={role}>{ROLE_LABELS[role] ?? role}</span>
      ))}
    </>
  );
}

function ProfileFallbackRoleSelect({
  profile,
  value,
  disabled,
  onChange,
}: {
  profile: Profile;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'block', marginTop: 10 }}>
      <span style={{ display: 'block', marginBottom: 5 }}>الدور البديل بعد الإزالة</span>
      <select
        aria-label={'الدور البديل بعد إزالة مسؤول العملاء من ' + profile.full_name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={{ width: '100%', maxWidth: 360, padding: 8 }}
      >
        <option value="">اختر دورًا بديلًا — مطلوب</option>
        {FALLBACK_ROLES.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ProfileRoleActionButton({
  profile,
  assigned,
  self,
  customer,
  busy,
  saving,
  needsAlternative,
  hasFallback,
  onUpdate,
}: {
  profile: Profile;
  assigned: boolean;
  self: boolean;
  customer: boolean;
  busy: boolean;
  saving: boolean;
  needsAlternative: boolean;
  hasFallback: boolean;
  onUpdate: (profile: Profile, enable: boolean) => void;
}) {
  if (!assigned) {
    return (
      <button
        type="button"
        className="btn primary"
        aria-label={'إسناد مسؤول العملاء إلى ' + profile.full_name}
        disabled={self || customer || busy || saving}
        onClick={() => onUpdate(profile, true)}
      >
        <UserCog size={16} /> {busy ? 'جار الحفظ…' : 'إسناد مسؤول العملاء'}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-outline"
      aria-label={'إزالة دور مسؤول العملاء من ' + profile.full_name}
      disabled={self || busy || saving || (needsAlternative && !hasFallback)}
      onClick={() => onUpdate(profile, false)}
    >
      <Check size={16} /> {busy ? 'جار الحفظ…' : 'إزالة دور مسؤول العملاء'}
    </button>
  );
}

function ProfileRoleNotes({
  assigned,
  self,
  customer,
  needsAlternative,
}: {
  assigned: boolean;
  self: boolean;
  customer: boolean;
  needsAlternative: boolean;
}) {
  if (self) return <span role="note">لا يمكن تعديل أدوار حسابك الحالي.</span>;
  if (!assigned && customer) return <span role="note">حساب العميل لا يمكن دمجه مع دور داخلي.</span>;
  if (needsAlternative) return <span role="note">اختر البديل؛ لا تُرفع الصلاحيات تلقائيًا.</span>;
  return null;
}

function CustomerManagerProfileCard({
  profile,
  currentProfileId,
  savingId,
  fallback,
  onFallbackChange,
  onUpdate,
}: {
  profile: Profile;
  currentProfileId: string;
  savingId: string | null;
  fallback: Record<string, string>;
  onFallbackChange: (profileId: string, role: string) => void;
  onUpdate: (profile: Profile, enable: boolean) => void;
}) {
  const assigned = profile.roles.includes('customer_manager');
  const self = profile.profile_id === currentProfileId;
  const customer = profile.roles.includes('customer');
  const otherRoles = profile.roles.filter((role) => role !== 'customer_manager');
  const needsAlternative = assigned && otherRoles.length === 0;
  const busy = savingId === profile.profile_id;
  const fallbackRole = fallback[profile.profile_id] ?? '';

  return (
    <article style={{ border: '1px solid #dcebed', borderRadius: 12, padding: 13, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong>{profile.full_name}</strong>
          <div style={{ color: '#71868a', fontSize: 12 }}>{profile.email ?? 'بريد غير مسجل'}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          <ProfileRoleBadges roles={profile.roles} />
        </div>
      </div>
      {needsAlternative && !self ? (
        <ProfileFallbackRoleSelect
          profile={profile}
          value={fallbackRole}
          disabled={busy}
          onChange={(value) => onFallbackChange(profile.profile_id, value)}
        />
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <ProfileRoleActionButton
          profile={profile}
          assigned={assigned}
          self={self}
          customer={customer}
          busy={busy}
          saving={savingId !== null}
          needsAlternative={needsAlternative}
          hasFallback={Boolean(fallbackRole)}
          onUpdate={onUpdate}
        />
        <ProfileRoleNotes
          assigned={assigned}
          self={self}
          customer={customer}
          needsAlternative={needsAlternative}
        />
      </div>
    </article>
  );
}

function CustomerManagerProfileList({
  profiles,
  loading,
  currentProfileId,
  savingId,
  fallback,
  onFallbackChange,
  onUpdate,
}: {
  profiles: Profile[];
  loading: boolean;
  currentProfileId: string;
  savingId: string | null;
  fallback: Record<string, string>;
  onFallbackChange: (profileId: string, role: string) => void;
  onUpdate: (profile: Profile, enable: boolean) => void;
}) {
  if (loading) return <p role="status">جار تحميل مستخدمي المؤسسة…</p>;
  if (profiles.length === 0) return <p role="status">لا توجد حسابات نشطة مطابقة في المؤسسة الحالية.</p>;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {profiles.map((profile) => (
        <CustomerManagerProfileCard
          key={profile.profile_id}
          profile={profile}
          currentProfileId={currentProfileId}
          savingId={savingId}
          fallback={fallback}
          onFallbackChange={onFallbackChange}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

export function CustomerManagerRoleAssignment({
  currentProfileId,
  onNotice,
}: {
  currentProfileId: string;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [fallback, setFallback] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('list_organization_user_roles');
      if (rpcError) throw rpcError;
      setRows(normalizeOrganizationProfiles(data));
    } catch {
      setError('تعذر تحميل حسابات المؤسسة. تحقق من صلاحيات المدير واتصال الخادم.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return rows.filter((profile) =>
      !needle ||
      (profile.full_name + ' ' + (profile.email ?? '')).toLocaleLowerCase().includes(needle),
    );
  }, [rows, query]);

  async function updateRole(profile: Profile, enable: boolean) {
    if (savingId !== null || profile.profile_id === currentProfileId) return;

    const currentRoles = sorted(profile.roles);
    if (enable && currentRoles.includes('customer')) {
      setError('لا يمكن دمج حساب العميل مع دور داخلي؛ لم يُجر أي تغيير.');
      return;
    }

    const nextRoles = enable
      ? sorted([...currentRoles, 'customer_manager'])
      : currentRoles.filter((role) => role !== 'customer_manager');

    if (!enable && nextRoles.length === 0) {
      const alternative = fallback[profile.profile_id];
      if (!FALLBACK_ROLES.some((option) => option.value === alternative)) {
        setError('اختر دورًا بديلًا صراحة قبل إزالة الدور الوحيد؛ لن تُمنح صلاحيات أوسع تلقائيًا.');
        return;
      }
      nextRoles.push(alternative);
    }

    setSavingId(profile.profile_id);
    setError('');

    try {
      const { data, error: rpcError } = await supabase.rpc('set_organization_user_roles', {
        p_profile_id: profile.profile_id,
        p_roles: nextRoles,
      });
      if (rpcError) throw rpcError;

      const result = data as { profile_id?: string; roles?: unknown } | null;
      const responseRoles = Array.isArray(result?.roles)
        ? sorted(result.roles.filter((role): role is string => typeof role === 'string'))
        : null;
      if (
        !result ||
        result.profile_id !== profile.profile_id ||
        !responseRoles ||
        JSON.stringify(responseRoles) !== JSON.stringify(nextRoles)
      ) {
        throw new Error('unconfirmed server result');
      }

      onNotice(
        (enable ? 'تم إسناد دور مسؤول العملاء إلى ' : 'تم تحديث أدوار ') +
        profile.full_name + ' بعد تأكيد الخادم.',
      );
      await load();
    } catch (cause) {
      setError(roleUpdateErrorMessage(cause));
    } finally {
      setSavingId(null);
    }
  }

  const updateFallback = (profileId: string, role: string) => {
    setFallback((current) => ({ ...current, [profileId]: role }));
  };

  return (
    <section className="panel" dir="rtl" aria-labelledby="customer-manager-role-title" style={{ marginTop: 18, padding: 20 }}>
      <CustomerManagerRoleHeading />
      <CustomerManagerRoleSearch value={query} onChange={setQuery} />
      <CustomerManagerRoleFeedback error={error} loading={loading} onRetry={() => void load()} />
      <CustomerManagerProfileList
        profiles={visible}
        loading={loading}
        currentProfileId={currentProfileId}
        savingId={savingId}
        fallback={fallback}
        onFallbackChange={updateFallback}
        onUpdate={(profile, enable) => void updateRole(profile, enable)}
      />
    </section>
  );
}
