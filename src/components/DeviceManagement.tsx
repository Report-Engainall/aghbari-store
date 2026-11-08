import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Ban, CalendarClock, Clock3, LogOut, MonitorSmartphone,
  RefreshCw, ShieldCheck, UserRound,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

type CurrentSession = {
  sessionId: string | null;
  expiresAt: number | null;
  email: string;
  deviceLabel: string;
};

type OrganizationSession = {
  session_id: string;
  profile_id: string;
  display_name: string;
  email: string | null;
  created_at: string | null;
  last_activity_at: string | null;
  expires_at: string | null;
  user_agent: string | null;
  ip_address: string | null;
  is_current_session: boolean;
};

type SessionRpcResult = { data: unknown; error: { message?: string } | null };
type SessionRpc = (name: string, args?: Record<string, unknown>) => PromiseLike<SessionRpcResult>;
type OrganizationSessionCursor = {
  sessionId: string;
  activityAt: string;
  createdAt: string;
};

// Fetch one extra row as a sentinel; the server uses a stable activity/created/id cursor.
const ORGANIZATION_SESSION_PAGE_SIZE = 200;

// Session RPCs are introduced by the independently reviewed P2 migration. Keep the
// name boundary typed locally so this frontend can be merged without pretending the
// server endpoint already exists on main. Resolve the Supabase client lazily so routes
// that import DeviceManagement remain renderable in no-backend/unit-test environments.
async function callSessionRpc(name: string, args?: Record<string, unknown>): Promise<SessionRpcResult> {
  return await (supabase.rpc as unknown as SessionRpc)(name, args);
}

function browserLabel(userAgent: string): string {
  const platform = /Android/i.test(userAgent) ? 'Android'
    : /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS'
    : /Windows/i.test(userAgent) ? 'Windows'
    : /Macintosh|Mac OS/i.test(userAgent) ? 'macOS'
    : /Linux/i.test(userAgent) ? 'Linux' : 'جهاز غير محدد';
  const browser = /Edg\//i.test(userAgent) ? 'Microsoft Edge'
    : /Firefox\//i.test(userAgent) ? 'Firefox'
    : /Chrome\//i.test(userAgent) ? 'Chrome'
    : /Safari\//i.test(userAgent) ? 'Safari' : 'متصفح غير محدد';
  return platform + ' · ' + browser;
}

function sessionClaims(token: string): { sessionId: string | null; expiresAt: number | null } {
  try {
    const payload = token.split('.')[1];
    if (!payload) return { sessionId: null, expiresAt: null };
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const claims = JSON.parse(window.atob(padded)) as { session_id?: unknown; exp?: unknown };
    return {
      sessionId: typeof claims.session_id === 'string' ? claims.session_id : null,
      expiresAt: typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp : null,
    };
  } catch {
    return { sessionId: null, expiresAt: null };
  }
}

function parseOrganizationSession(value: unknown): OrganizationSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.session_id !== 'string' ||
    typeof row.profile_id !== 'string' ||
    typeof row.display_name !== 'string' ||
    !(typeof row.email === 'string' || row.email === null) ||
    !(typeof row.created_at === 'string' || row.created_at === null) ||
    !(typeof row.last_activity_at === 'string' || row.last_activity_at === null) ||
    !(typeof row.expires_at === 'string' || row.expires_at === null) ||
    !(typeof row.user_agent === 'string' || row.user_agent === null) ||
    !(typeof row.ip_address === 'string' || row.ip_address === null) ||
    typeof row.is_current_session !== 'boolean'
  ) return null;

  return {
    session_id: row.session_id,
    profile_id: row.profile_id,
    display_name: row.display_name,
    email: row.email,
    created_at: row.created_at,
    last_activity_at: row.last_activity_at,
    expires_at: row.expires_at,
    user_agent: row.user_agent,
    ip_address: row.ip_address,
    is_current_session: row.is_current_session,
  };
}

const DEVICE_SESSION_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return DEVICE_SESSION_UUID_PATTERN.test(value);
}

function hasUniqueRevokedSessionIds(
  value: unknown,
  expectedCount: number,
  currentSessionId: string,
): value is string[] {
  if (!Array.isArray(value) || value.length !== expectedCount) return false;
  if (!value.every(isUuid)) return false;
  if (new Set(value).size !== value.length) return false;
  return !value.includes(currentSessionId);
}

function parseOtherSessionRevocationCount(value: unknown, currentSessionId: string | null): number | null {
  if (!currentSessionId || !value || typeof value !== 'object' || Array.isArray(value)) return null;

  const result = value as Record<string, unknown>;
  if (result.current_session_id !== currentSessionId) return null;

  const count = result.revoked_count;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return null;
  if (!hasUniqueRevokedSessionIds(result.revoked_session_ids, count, currentSessionId)) return null;

  const revokedAt = result.revoked_at;
  if (typeof revokedAt !== 'string' || !Number.isFinite(Date.parse(revokedAt))) return null;
  return count;
}

function dateLabel(value: string | null): string {
  if (!value) return 'غير محدد في سجل المصادقة';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString('ar-YE', { dateStyle: 'medium', timeStyle: 'short' })
    : 'تاريخ غير صالح في سجل المصادقة';
}


function DeviceManagementHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <MonitorSmartphone size={24} aria-hidden="true" />
      <div>
        <h1 id="device-management-title" style={{ margin: 0 }}>الأجهزة والجلسات</h1>
        <p style={{ margin: '5px 0 0', lineHeight: 1.7 }}>
          الجلسة الحالية من خدمة المصادقة؛ وقائمة المؤسسة من سجل الجلسات الخادمي، إن كان عقده منشورًا.
        </p>
      </div>
    </div>
  );
}

function CurrentSessionCard({
  session,
  currentSessionInServerList,
}: {
  session: CurrentSession;
  currentSessionInServerList?: OrganizationSession;
}) {
  return (
    <article style={{ border: '1px solid #dcebed', borderRadius: 14, padding: 16, marginTop: 18 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <ShieldCheck size={21} aria-hidden="true" />
        <div>
          <strong>الجلسة الحالية</strong>
          <div style={{ fontSize: 13, color: '#71868a', marginTop: 3 }}>{session.deviceLabel}</div>
        </div>
        <span className="badge success" style={{ marginInlineStart: 'auto' }}>جلسة المتصفح الحالي</span>
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginTop: 18 }}>
        <div>
          <dt style={{ color: '#71868a', fontSize: 12 }}>الحساب</dt>
          <dd style={{ margin: '4px 0', overflowWrap: 'anywhere' }}>{session.email || 'بريد غير متاح'}</dd>
        </div>
        <div>
          <dt style={{ color: '#71868a', fontSize: 12 }}>معرّف الجلسة</dt>
          <dd style={{ margin: '4px 0', fontFamily: 'monospace' }}>
            {session.sessionId ? session.sessionId.slice(0, 8) + '…' : 'غير متاح'}
          </dd>
        </div>
        <div>
          <dt style={{ color: '#71868a', fontSize: 12 }}>انتهاء رمز الوصول</dt>
          <dd style={{ margin: '4px 0' }}>
            {session.expiresAt ? new Date(session.expiresAt * 1000).toLocaleString('ar-YE') : 'غير متاح'}
          </dd>
        </div>
        {currentSessionInServerList ? (
          <div>
            <dt style={{ color: '#71868a', fontSize: 12 }}>آخر نشاط مسجل خادميًا</dt>
            <dd style={{ margin: '4px 0' }}>{dateLabel(currentSessionInServerList.last_activity_at)}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

function DeviceManagementActions({
  session,
  loading,
  action,
  onRefresh,
  onSignOutOthers,
  onSignOutCurrent,
}: {
  session: CurrentSession | null;
  loading: boolean;
  action: string | null;
  onRefresh: () => void;
  onSignOutOthers: () => void;
  onSignOutCurrent: () => void;
}) {
  const disabled = loading || action !== null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
      <button type="button" className="btn btn-outline" onClick={onRefresh} disabled={disabled}>
        <RefreshCw size={16} /> تحديث الجلسة الحالية
      </button>
      <button
        type="button"
        className="btn primary"
        aria-label="تسجيل الخروج من الأجهزة الأخرى"
        onClick={onSignOutOthers}
        disabled={!session?.sessionId || disabled}
      >
        {action === 'others' ? <RefreshCw size={16} className="spin" /> : <ShieldCheck size={16} />}
        {action === 'others' ? 'جار إبطال الجلسات…' : 'الخروج من الجلسات الأخرى لهذا الحساب'}
      </button>
      <button
        type="button"
        className="btn btn-outline"
        aria-label="تسجيل الخروج من هذا الجهاز"
        onClick={onSignOutCurrent}
        disabled={!session || disabled}
      >
        <LogOut size={16} /> {action === 'current' ? 'جار تسجيل الخروج…' : 'تسجيل الخروج من هذا الجهاز'}
      </button>
    </div>
  );
}

function OrganizationSessionCard({
  item,
  currentProfileId,
  action,
  sessionsLoading,
  canManage,
  onRevoke,
}: {
  item: OrganizationSession;
  currentProfileId?: string;
  action: string | null;
  sessionsLoading: boolean;
  canManage: boolean;
  onRevoke: (item: OrganizationSession) => void;
}) {
  const isCurrentUser = item.profile_id === currentProfileId;
  const isBusy = action === item.session_id;
  const revokeDisabled = !canManage || item.is_current_session || isCurrentUser || action !== null || sessionsLoading;

  return (
    <article style={{ border: '1px solid var(--border, #dcebed)', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220, flex: '1 1 300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <UserRound size={17} aria-hidden="true" />
            <strong>{item.display_name}</strong>
            {item.is_current_session ? <span className="badge success">الجلسة الحالية</span> : null}
            {!item.is_current_session && isCurrentUser ? <span className="badge">جلسة أخرى لحسابك</span> : null}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: '#71868a', overflowWrap: 'anywhere' }}>
            {item.email ?? 'بريد غير متاح'}
          </div>
          <div style={{ marginTop: 5, fontSize: 12, color: '#71868a' }}>
            {item.user_agent ? browserLabel(item.user_agent) : 'نوع الجهاز غير محدد في سجل المصادقة'}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          aria-label={'إبطال جلسة ' + item.display_name}
          onClick={() => onRevoke(item)}
          disabled={revokeDisabled}
        >
          {isBusy ? <RefreshCw size={15} className="spin" /> : <Ban size={15} />}
          {isBusy ? 'جار الإبطال…' : isCurrentUser ? 'تُدار من إجراء حسابك' : 'إبطال هذه الجلسة'}
        </button>
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, margin: '14px 0 0' }}>
        <div><dt style={{ color: '#71868a', fontSize: 12 }}>آخر نشاط</dt><dd style={{ margin: '4px 0', fontSize: 13 }}>{dateLabel(item.last_activity_at)}</dd></div>
        <div><dt style={{ color: '#71868a', fontSize: 12 }}>تاريخ الإنشاء</dt><dd style={{ margin: '4px 0', fontSize: 13 }}>{dateLabel(item.created_at)}</dd></div>
        <div><dt style={{ color: '#71868a', fontSize: 12 }}>انتهاء الجلسة</dt><dd style={{ margin: '4px 0', fontSize: 13 }}>{dateLabel(item.expires_at)}</dd></div>
        {item.ip_address ? (
          <div><dt style={{ color: '#71868a', fontSize: 12 }}>عنوان الشبكة</dt><dd style={{ margin: '4px 0', fontSize: 13, fontFamily: 'monospace' }}>{item.ip_address}</dd></div>
        ) : null}
        <div><dt style={{ color: '#71868a', fontSize: 12 }}>معرّف الجلسة</dt><dd style={{ margin: '4px 0', fontFamily: 'monospace', fontSize: 12 }}>{item.session_id.slice(0, 8)}…</dd></div>
      </dl>
    </article>
  );
}

function OrganizationSessionList({
  sessions,
  loading,
  loadingMore,
  hasMore,
  error,
  canManage,
  action,
  currentProfileId,
  onRefresh,
  onLoadMore,
  onRevoke,
}: {
  sessions: OrganizationSession[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string;
  canManage: boolean;
  action: string | null;
  currentProfileId?: string;
  onRefresh: () => void;
  onLoadMore: () => void;
  onRevoke: (item: OrganizationSession) => void;
}) {
  if (!canManage) {
    return (
      <div role="note" className="privacy-note" style={{ marginTop: 12 }}>
        لا تملك صلاحية إدارة جلسات بقية مستخدمي المؤسسة. يمكنك فقط إدارة جلسات حسابك من إجراءات المصادقة أعلاه.
      </div>
    );
  }
  if (loading) return <p role="status" style={{ marginTop: 14 }}>جار تحميل سجل الجلسات من الخادم…</p>;
  if (error && sessions.length === 0) {
    return (
      <div role="alert" className="error-box" style={{ display: 'block', marginTop: 14 }}>
        {error}
        <button type="button" className="btn btn-outline" onClick={onRefresh} disabled={action !== null}>
          <RefreshCw size={14} /> إعادة المحاولة
        </button>
      </div>
    );
  }
  if (sessions.length === 0) {
    return <div role="status" className="privacy-note" style={{ marginTop: 14 }}>لم يُرجع الخادم جلسات نشطة ضمن النطاق المصرح به.</div>;
  }

  return (
    <>
      {error ? <div role="alert" className="error-box" style={{ display: 'block', marginTop: 14 }}>{error}</div> : null}
      <p role="status" className="privacy-note" style={{ marginTop: 14 }}>
        تم تحميل {sessions.length.toLocaleString('ar-YE')} جلسة نشطة من سجل الخادم.
        {hasMore ? ' قد توجد جلسات أخرى؛ تابع التحميل لإكمال الجرد.' : ' اكتمل تحميل جميع الجلسات التي أعادها الخادم.'}
      </p>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {sessions.map((item) => (
          <OrganizationSessionCard
            key={item.session_id}
            item={item}
            currentProfileId={currentProfileId}
            action={action}
            sessionsLoading={loading || loadingMore}
            canManage={canManage}
            onRevoke={onRevoke}
          />
        ))}
      </div>
      {hasMore ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button type="button" className="btn btn-outline" onClick={onLoadMore} disabled={loadingMore || action !== null}>
            {loadingMore ? <RefreshCw size={14} className="spin" /> : <MonitorSmartphone size={14} />}
            {loadingMore ? 'جار تحميل الجلسات…' : 'تحميل المزيد من الجلسات'}
          </button>
        </div>
      ) : null}
    </>
  );
}

function OrganizationSessionsSection({
  sessions,
  loading,
  loadingMore,
  hasMore,
  error,
  canManage,
  action,
  currentProfileId,
  onRefresh,
  onLoadMore,
  onRevoke,
}: {
  sessions: OrganizationSession[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string;
  canManage: boolean;
  action: string | null;
  currentProfileId?: string;
  onRefresh: () => void;
  onLoadMore: () => void;
  onRevoke: (item: OrganizationSession) => void;
}) {
  return (
    <section aria-labelledby="organization-session-list-title" style={{ marginTop: 24, borderTop: '1px solid var(--border, #dcebed)', paddingTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 id="organization-session-list-title" style={{ margin: 0, fontSize: 18 }}>جلسات المؤسسة المسجلة خادميًا</h2>
          <p style={{ margin: '5px 0 0', color: '#71868a', fontSize: 13, lineHeight: 1.7 }}>
            تظهر السجلات التي يعيدها الخادم فقط. الجلسة الحالية وجلسات حسابك الأخرى لا تُبطل من هذه القائمة؛ استخدم إجراء «الخروج من الجلسات الأخرى لهذا الحساب» لجلسات حسابك.
          </p>
        </div>
        <button type="button" className="btn btn-outline" onClick={onRefresh} disabled={loading || action !== null || !canManage}>
          <RefreshCw size={16} /> تحديث القائمة
        </button>
      </div>
      <OrganizationSessionList
        sessions={sessions}
        loading={loading}
        error={error}
        canManage={canManage}
        action={action}
        currentProfileId={currentProfileId}
        onRefresh={onRefresh}
        onLoadMore={onLoadMore}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onRevoke={onRevoke}
      />
    </section>
  );
}

function DeviceManagementPrivacyNote() {
  return (
    <>
      <p style={{ fontSize: 12, color: '#71868a', lineHeight: 1.8, marginTop: 14 }}>
        إبطال الجلسة يتم عبر أمر خادمي مقيّد بالمؤسسة ويسجل في سجل التدقيق. قد تبقى رموز وصول صدرت سابقًا صالحة خارج نطاق نقاط التطبيق التي تتحقق من الجلسة حتى انتهاء مدتها؛ لا يُعرض الإجراء كإبطال لتوكنات خارج آلية الخادم.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: '#71868a' }}>
        <AlertTriangle size={14} aria-hidden="true" /> لا تُعرض أو تُخزّن رموز الوصول أو التجديد في سجل الأجهزة.
      </div>
    </>
  );
}

export function DeviceManagement({ onNotice }: { onNotice: (message: string) => void }) {
  const { user } = useAuth();
  const canManageOrganizationSessions = Boolean(user?.roles.includes('admin'));
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [organizationSessions, setOrganizationSessions] = useState<OrganizationSession[]>([]);
  const [organizationSessionsCursor, setOrganizationSessionsCursor] = useState<OrganizationSessionCursor | null>(null);
  const [organizationSessionsHasMore, setOrganizationSessionsHasMore] = useState(false);
  const [organizationSessionsLoadingMore, setOrganizationSessionsLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [action, setAction] = useState<'others' | 'current' | string | null>(null);
  const [error, setError] = useState('');
  const [sessionsError, setSessionsError] = useState('');
  const revocationInFlight = useRef(false);
  const otherSessionsInFlight = useRef(false);
  // Prevent a slow pre-revocation response from restoring stale rows over a newer list.
  const organizationSessionsRequestId = useRef(0);
  const organizationSessionsLoadMoreInFlight = useRef(false);
  const currentSignOutInFlight = useRef(false);

  const loadOrganizationSessions = useCallback(async (cursor: OrganizationSessionCursor | null = null) => {
    const isFirstPage = cursor === null;
    const requestId = isFirstPage
      ? ++organizationSessionsRequestId.current
      : organizationSessionsRequestId.current;
    if (!canManageOrganizationSessions) {
      setOrganizationSessions([]);
      setOrganizationSessionsCursor(null);
      setOrganizationSessionsHasMore(false);
      setSessionsError('قائمة جلسات المؤسسة وإبطال جلسة مستخدم آخر متاحان لمدير النظام فقط.');
      setSessionsLoading(false);
      setOrganizationSessionsLoadingMore(false);
      return;
    }
    if (isFirstPage) {
      setSessionsLoading(true);
      setOrganizationSessionsCursor(null);
      setOrganizationSessionsHasMore(false);
      setOrganizationSessionsLoadingMore(false);
      setSessionsError('');
    } else {
      if (organizationSessionsLoadMoreInFlight.current) return;
      organizationSessionsLoadMoreInFlight.current = true;
      setOrganizationSessionsLoadingMore(true);
      setSessionsError('');
    }
    try {
      const { data, error: rpcError } = await callSessionRpc('list_organization_sessions', {
        p_limit: ORGANIZATION_SESSION_PAGE_SIZE + 1,
        p_after_activity_at: cursor?.activityAt ?? null,
        p_after_created_at: cursor?.createdAt ?? null,
        p_after_session_id: cursor?.sessionId ?? null,
      });
      if (rpcError) throw new Error(rpcError.message || 'تعذر تأكيد استجابة الخادم.');
      if (!Array.isArray(data) || data.length > ORGANIZATION_SESSION_PAGE_SIZE + 1) {
        throw new Error('أعاد الخادم صفحة جلسات بصيغة أو حجم غير صالح.');
      }
      const rows = data.map(parseOrganizationSession);
      if (rows.some((row) => row === null)) {
        throw new Error('أعاد الخادم سجل جلسة ناقصًا؛ لم تُعرض بيانات غير مؤكدة.');
      }
      const parsed = rows.filter((row): row is OrganizationSession => row !== null);
      const ids = new Set<string>();
      for (const row of parsed) {
        if (ids.has(row.session_id)) throw new Error('أعاد الخادم معرّفات جلسات مكررة داخل الصفحة؛ أُوقف عرض البيانات.');
        ids.add(row.session_id);
      }
      const pageRows = parsed.slice(0, ORGANIZATION_SESSION_PAGE_SIZE);
      const hasMore = parsed.length > ORGANIZATION_SESSION_PAGE_SIZE;
      const last = pageRows[pageRows.length - 1];
      if (hasMore && (!last || !last.created_at || !last.last_activity_at)) {
        throw new Error('تعذر بناء مؤشر الصفحة التالية من سجل جلسة ناقص.');
      }
      if (requestId !== organizationSessionsRequestId.current) return;

      if (isFirstPage) setOrganizationSessions(pageRows);
      else {
        setOrganizationSessions((current) => {
          const existingIds = new Set(current.map((row) => row.session_id));
          return [...current, ...pageRows.filter((row) => !existingIds.has(row.session_id))];
        });
      }
      setOrganizationSessionsHasMore(hasMore);
      setOrganizationSessionsCursor(hasMore && last ? {
        sessionId: last.session_id,
        activityAt: last.last_activity_at!,
        createdAt: last.created_at!,
      } : null);
      setSessionsError('');
    } catch {
      if (requestId !== organizationSessionsRequestId.current) return;
      if (isFirstPage) setOrganizationSessions([]);
      setSessionsError(isFirstPage
        ? 'تعذر تحميل قائمة الجلسات المركزية من الخادم. لم تُستنتج أجهزة من المتصفح؛ أعد المحاولة بعد التحقق من نشر عقد الجلسات.'
        : 'تعذر تحميل الصفحة التالية من سجل الجلسات؛ بقيت الصفحات السابقة محفوظة. أعد المحاولة للمتابعة.');
    } finally {
      if (isFirstPage) {
        if (requestId === organizationSessionsRequestId.current) setSessionsLoading(false);
      } else {
        organizationSessionsLoadMoreInFlight.current = false;
        if (requestId === organizationSessionsRequestId.current) setOrganizationSessionsLoadingMore(false);
      }
    }
  }, [canManageOrganizationSessions]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) {
        setSession(null);
        setError('لا توجد جلسة دخول نشطة لهذا المتصفح. سجّل الدخول من جديد.');
        setOrganizationSessions([]);
        setOrganizationSessionsCursor(null);
        setOrganizationSessionsHasMore(false);
        return;
      }
      const claims = sessionClaims(data.session.access_token);
      setSession({
        sessionId: claims.sessionId,
        expiresAt: data.session.expires_at ?? claims.expiresAt,
        email: data.session.user.email ?? '',
        // This label describes only the current browser, not an inventory of devices.
        deviceLabel: browserLabel(typeof navigator === 'undefined' ? '' : navigator.userAgent),
      });
    } catch {
      setSession(null);
      setError('تعذر قراءة جلسة المصادقة الحالية. أعد المحاولة قبل تنفيذ أي إجراء.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadOrganizationSessions(); }, [loadOrganizationSessions]);

  async function signOutOthers() {
    if (!session?.sessionId || loading || action !== null || otherSessionsInFlight.current) return;
    // Lock synchronously before awaiting the server RPC to prevent rapid duplicate revocation.
    otherSessionsInFlight.current = true;
    setAction('others');
    setError('');
    try {
      const { data, error: revokeError } = await callSessionRpc('revoke_other_auth_sessions');
      if (revokeError) throw new Error(revokeError.message || 'تعذر إبطال الجلسات الأخرى عبر الخادم.');
      const revokedCount = parseOtherSessionRevocationCount(data, session.sessionId);
      if (revokedCount === null) {
        throw new Error('استجابة إبطال الجلسات الأخرى لا تطابق الجلسة الحالية أو قائمة الجلسات المحذوفة.');
      }
      onNotice('أكد الخادم إبطال ' + revokedCount + ' جلسة أخرى لهذا الحساب؛ هذا الإجراء لا يخص بقية مستخدمي المؤسسة.');
      await Promise.all([load(), loadOrganizationSessions()]);
    } catch {
      setError('تعذر تأكيد إبطال الجلسات الأخرى لهذا الحساب عبر الخادم؛ لم تُعرض رسالة نجاح. أعد التحميل وتحقق من الحالة قبل المحاولة مجددًا.');
    } finally {
      otherSessionsInFlight.current = false;
      setAction(null);
    }
  }

  async function signOutCurrent() {
    if (!session || loading || action !== null || currentSignOutInFlight.current) return;
    currentSignOutInFlight.current = true;
    setAction('current');
    setError('');
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
      // Clear auth-derived details immediately after acknowledgement; do not leave a
      // stale session card or enable a second logout while the route redirect settles.
      setSession(null);
      setOrganizationSessions([]);
      setOrganizationSessionsCursor(null);
      setOrganizationSessionsHasMore(false);
      setSessionsError('');
      onNotice('تم تسجيل الخروج من هذا الجهاز.');
    } catch {
      setError('تعذر تسجيل الخروج من هذا الجهاز.');
    } finally {
      currentSignOutInFlight.current = false;
      setAction(null);
    }
  }

  async function revokeOrganizationSession(target: OrganizationSession) {
    // Organization-level revocation must never target a sibling session owned by the current auth user.
    // Those sessions are revoked only through the self-scoped bulk RPC, which retains the live caller session.
    if (
      !canManageOrganizationSessions ||
      target.is_current_session ||
      target.profile_id === user?.profileId ||
      action !== null ||
      revocationInFlight.current
    ) return;
    if (!window.confirm('إبطال جلسة ' + target.display_name + (target.email ? ' (' + target.email + ')' : '') + '؟ ستُرفض طلبات التطبيق التي تعتمد على هذه الجلسة بعد تأكيد الخادم.')) return;
    // Lock synchronously before awaiting the RPC so duplicate events cannot revoke twice.
    if (revocationInFlight.current) return;
    revocationInFlight.current = true;
    setAction(target.session_id);
    setSessionsError('');
    try {
      const { data, error: rpcError } = await callSessionRpc('revoke_organization_session', {
        p_session_id: target.session_id,
      });
      if (rpcError) throw new Error(rpcError.message || 'رفض الخادم إبطال الجلسة.');
      const acknowledgement = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : null;
      if (
        !acknowledgement ||
        acknowledgement.session_id !== target.session_id ||
        acknowledgement.revoked !== true ||
        typeof acknowledgement.revoked_at !== 'string' ||
        !Number.isFinite(Date.parse(acknowledgement.revoked_at))
      ) {
        throw new Error('لم يؤكد الخادم إبطال الجلسة المستهدفة بإقرار صالح.');
      }
      onNotice('أكد الخادم إبطال الجلسة المحددة لمستخدم المؤسسة، وسُجل الإجراء في سجل التدقيق.');
      await loadOrganizationSessions();
    } catch {
      setSessionsError('تعذر تأكيد إبطال الجلسة المحددة. لم تُعرض رسالة نجاح؛ أعد تحميل السجل وتحقق من الحالة قبل المحاولة مجددًا.');
    } finally {
      revocationInFlight.current = false;
      setAction(null);
    }
  }


  const currentSessionInServerList = organizationSessions.find((item) => item.is_current_session);

  return (
    <section className="panel" dir="rtl" aria-labelledby="device-management-title" style={{ padding: 22 }}>
      <DeviceManagementHeader />
      {error ? <div role="alert" className="error-box" style={{ display: 'block', marginTop: 14 }}>{error}</div> : null}
      {loading ? (
        <p role="status" style={{ marginTop: 18 }}>جار قراءة جلسة الدخول…</p>
      ) : session ? (
        <CurrentSessionCard session={session} currentSessionInServerList={currentSessionInServerList} />
      ) : null}
      <DeviceManagementActions
        session={session}
        loading={loading}
        action={action}
        onRefresh={() => void load()}
        onSignOutOthers={() => void signOutOthers()}
        onSignOutCurrent={() => void signOutCurrent()}
      />
      <OrganizationSessionsSection
        sessions={organizationSessions}
        loading={sessionsLoading}
        loadingMore={organizationSessionsLoadingMore}
        hasMore={organizationSessionsHasMore}
        error={sessionsError}
        canManage={canManageOrganizationSessions}
        action={action}
        currentProfileId={user?.profileId}
        onRefresh={() => void loadOrganizationSessions()}
        onLoadMore={() => {
          if (organizationSessionsCursor) void loadOrganizationSessions(organizationSessionsCursor);
        }}
        onRevoke={(target) => void revokeOrganizationSession(target)}
      />
      <DeviceManagementPrivacyNote />
    </section>
  );
}
