import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bell, Check, ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import { fetchNotifications, fetchOlderNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import type { Notification } from '@/lib/types';

function notificationDestination(notification: Notification, isStaff: boolean): 'order' | 'task' | 'service-case' | null {
  if (notification.entity_type === 'order' && typeof notification.entity_id === 'string') return 'order';
  if (isStaff && notification.entity_type === 'ai_task' && typeof notification.entity_id === 'string') return 'task';
  if (notification.entity_type === 'customer_service_case' && typeof notification.entity_id === 'string') return 'service-case';
  return null;
}

function NotificationItem({
  notification,
  isStaff,
  busy,
  onOpen,
  onRead,
}: {
  notification: Notification;
  isStaff: boolean;
  busy: boolean;
  onOpen: (notification: Notification) => void;
  onRead: (notificationId: string) => void;
}) {
  const destination = notificationDestination(notification, isStaff);

  return (
    <article
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      style={{ display: 'grid', gap: 10, borderInlineStart: notification.is_read ? '3px solid var(--border)' : '3px solid var(--primary)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" className="mt-1 rounded-full bg-muted p-2 text-primary"><Bell size={17} /></span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{notification.title}</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--muted-foreground)', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{notification.body || 'لا توجد تفاصيل إضافية.'}</p>
            <time dateTime={notification.created_at} style={{ display: 'block', marginTop: 8, color: 'var(--muted-foreground)', fontSize: 11 }}>
              {formatDate(notification.created_at)}
            </time>
          </div>
        </div>
        {!notification.is_read && <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">جديد</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {destination && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onOpen(notification)}>
            <ExternalLink size={14} /> {destination === 'order' ? 'فتح تفاصيل الطلب' : destination === 'task' ? 'فتح المهمة' : isStaff ? 'فتح مكتب خدمة العملاء' : 'فتح مركز خدمة العملاء'}
          </button>
        )}
        {!notification.is_read && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onRead(notification.id)}>
            <Check size={14} /> تعليم كمقروء
          </button>
        )}
      </div>
    </article>
  );
}

export function CustomerNotificationCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useFetch(
    () => user ? fetchNotifications() : Promise.resolve([]),
    [user?.profileId],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [query, setQuery] = useState('');
  const [olderNotifications, setOlderNotifications] = useState<Notification[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  useEffect(() => {
    setOlderNotifications([]);
    setHasMoreOlder(true);
    setFilter('all');
    setQuery('');
  }, [user?.profileId]);

  const latestNotifications = data ?? [];
  const knownNotificationIds = new Set(latestNotifications.map((item) => item.id));
  const notifications = [...latestNotifications, ...olderNotifications.filter((item) => !knownNotificationIds.has(item.id))];
  const unread = notifications.filter((item) => !item.is_read).length;
  const normalizedQuery = query.trim().toLocaleLowerCase('ar');
  const filteredNotifications = notifications.filter((item) => {
    const matchesReadState = filter === 'all' || (filter === 'unread' ? !item.is_read : item.is_read);
    if (!matchesReadState) return false;
    if (!normalizedQuery) return true;
    return [item.title, item.body ?? '', item.type].join(' ').toLocaleLowerCase('ar').includes(normalizedQuery);
  });

  // Poll only while the customer notification page is visible and the browser is online.
  // This provides a safe delivery fallback when realtime transport is unavailable.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refetch();
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [refetch]);

  async function loadOlder() {
    if (loadingOlder || !hasMoreOlder || notifications.length === 0) return;
    const cursor = notifications[notifications.length - 1];
    setLoadingOlder(true);
    setActionError('');
    try {
      const page = await fetchOlderNotifications({ createdAt: cursor.created_at, id: cursor.id });
      const loadedIds = new Set(notifications.map((item) => item.id));
      const additions = page.filter((item) => !loadedIds.has(item.id));
      setOlderNotifications((current) => [...current, ...additions]);
      setHasMoreOlder(page.length === 30);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر تحميل التنبيهات الأقدم.');
    } finally {
      setLoadingOlder(false);
    }
  }

  async function markAllRead() {
    setBusyId('__all__');
    setActionError('');
    try {
      await markAllNotificationsRead();
      setOlderNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      await refetch();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر تعليم التنبيهات كمقروءة.');
    } finally {
      setBusyId(null);
    }
  }

  async function markRead(notificationId: string) {
    setBusyId(notificationId);
    setActionError('');
    try {
      await markNotificationRead(notificationId);
      setOlderNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, is_read: true } : item));
      await refetch();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة التنبيه.');
    } finally {
      setBusyId(null);
    }
  }

  async function openDestination(notification: Notification) {
    const destination = notificationDestination(notification, Boolean(user?.isStaff));
    if (!destination || !notification.entity_id) return;
    setBusyId(notification.id);
    setActionError('');
    try {
      if (!notification.is_read) {
        await markNotificationRead(notification.id);
        setOlderNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
      }
      if (destination === 'order') {
        await navigate({ to: '/orders/$id', params: { id: notification.entity_id } });
      } else if (destination === 'task') {
        await navigate({ to: '/admin/tasks' });
      } else {
        await navigate({ to: user?.isStaff ? '/admin/service-desk' : '/service-cases' });
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر فتح العنصر المرتبط بالتنبيه.');
    } finally {
      setBusyId(null);
    }
  }

  if (!user) {
    return (
      <main className="storefront" dir="rtl" style={{ paddingTop: 32, paddingBottom: 40 }}>
        <section className="rounded-xl border border-border bg-card p-8 text-center">
          <Bell size={28} style={{ margin: '0 auto 10px', color: 'var(--muted-foreground)' }} />
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>تنبيهات الحساب</h1>
          <p style={{ margin: '8px 0 16px', color: 'var(--muted-foreground)', fontSize: 13 }}>سجّل الدخول لعرض التنبيهات المرتبطة بحسابك.</p>
          <Link to="/login" className="btn btn-primary">تسجيل الدخول</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="storefront" dir="rtl" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 23, fontWeight: 900 }}>التنبيهات</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
            {notifications.length.toLocaleString('ar-YE')} محمّل — {unread.toLocaleString('ar-YE')} غير مقروء
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {unread > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { void markAllRead(); }} disabled={busyId === '__all__'}>
              <Check size={14} /> تعليم الكل كمقروء
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { void refetch(); }} disabled={loading}>
            <RefreshCw size={15} /> تحديث
          </button>
        </div>
      </header>

      <section className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-4" aria-label="البحث وتصفية التنبيهات">
        <label className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">ابحث في التنبيهات المحمّلة</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
            placeholder="ابحث في عنوان التنبيه أو تفاصيله..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {query ? <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="مسح البحث" onClick={() => setQuery('')}><X size={15}/></button> : null}
        </label>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="حالة القراءة">
          {([
            { value: 'all', label: 'الكل', count: notifications.length },
            { value: 'unread', label: 'غير مقروء', count: unread },
            { value: 'read', label: 'مقروء', count: notifications.length - unread },
          ] as const).map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={filter === item.value ? 'rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground' : 'rounded-full border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted'}
            >
              {item.label} ({item.count.toLocaleString('ar-YE')})
            </button>
          ))}
          <span className="ms-auto text-xs text-muted-foreground" aria-live="polite">
            المعروض: {filteredNotifications.length.toLocaleString('ar-YE')} من {notifications.length.toLocaleString('ar-YE')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">تُحمّل التنبيهات بصفحات متتابعة من 30 عنصرًا للحساب الحالي. استخدم «تحميل الأقدم» للوصول إلى بقية السجل المتاح.</p>
      </section>

      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      {loading ? (
        <div role="status" className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">جار تحميل التنبيهات...</div>
      ) : error ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => { void refetch(); }}>إعادة المحاولة</button>
        </section>
      ) : notifications.length === 0 ? (
        <section className="rounded-xl border border-border bg-card p-8 text-center">
          <Bell size={28} style={{ margin: '0 auto 10px', color: 'var(--muted-foreground)' }} />
          <p style={{ margin: 0, fontWeight: 700 }}>لا توجد تنبيهات حالياً.</p>
          <p style={{ margin: '6px 0 0', color: 'var(--muted-foreground)', fontSize: 12 }}>ستظهر هنا تحديثات الطلبات والإجراءات المرتبطة بحسابك.</p>
        </section>
      ) : filteredNotifications.length === 0 ? (
        <section className="rounded-xl border border-border bg-card p-8 text-center" role="status">
          <Search size={26} style={{ margin: '0 auto 10px', color: 'var(--muted-foreground)' }} />
          <p style={{ margin: 0, fontWeight: 700 }}>لا توجد تنبيهات تطابق البحث والتصفية.</p>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => { setQuery(''); setFilter('all'); }}>مسح البحث والتصفية</button>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredNotifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              isStaff={Boolean(user?.isStaff)}
              busy={busyId === notification.id}
              onOpen={(item) => { void openDestination(item); }}
              onRead={(id) => { void markRead(id); }}
            />
          ))}
        </div>
      )}
      {notifications.length > 0 && hasMoreOlder ? (
        <div className="mt-4 flex justify-center">
          <button type="button" className="btn btn-secondary" onClick={() => { void loadOlder(); }} disabled={loadingOlder}>
            <RefreshCw size={15} className={loadingOlder ? 'animate-spin' : ''} />
            {loadingOlder ? 'جار تحميل التنبيهات الأقدم...' : 'تحميل التنبيهات الأقدم'}
          </button>
        </div>
      ) : null}
      {notifications.length > 0 && !hasMoreOlder ? (
        <p role="status" className="mt-4 text-center text-xs text-muted-foreground">وصلت إلى نهاية سجل التنبيهات المتاح لهذا الحساب.</p>
      ) : null}
      <p style={{ marginTop: 14, color: 'var(--muted-foreground)', fontSize: 11 }}>
        تظهر التنبيهات التي أرسلها النظام إلى ملف الحساب الحالي فقط. بيانات العملاء الآخرين غير متاحة من هذه الصفحة.
      </p>
    </main>
  );
}
