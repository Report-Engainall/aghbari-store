import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, ScrollText, Search, ShieldCheck } from 'lucide-react';
import { AdminPage, Button, Empty, ErrorBox, Loading, TableWrap } from '@/components/AdminPages';
import { useAuth } from '@/lib/auth';
import { getCurrentTenantScope, supabase } from '@/lib/supabase';

const AUDIT_PAGE_SIZE = 200;

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

const actionLabels: Record<string, string> = {
  'catalog.category_renamed': 'إعادة تسمية تصنيف',
  'pricing_rule.created': 'إنشاء قاعدة تسعير',
  'pricing_rule.updated': 'تعديل قاعدة تسعير',
  'pricing_rule.deleted': 'حذف قاعدة تسعير',
  'operational_task.created': 'إنشاء مهمة تشغيلية',
  'operational_task.status_changed': 'تغيير حالة مهمة',
  'onyx_export.prepared': 'تجهيز تصدير أونكس',
  'customer_address.created': 'إضافة عنوان عميل',
  'customer_address.updated': 'تعديل عنوان عميل',
  'customer_address.deleted': 'حذف عنوان عميل',
};

function dateLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '—';
  return new Date(timestamp).toLocaleString('ar-YE', { dateStyle: 'medium', timeStyle: 'short' });
}

function AuditLogAccessDenied() {
  return (
    <section className="panel" role="alert">
      <ShieldCheck size={24} />
      <h2>الصلاحية غير متاحة</h2>
      <p>تقتصر قراءة سجل التدقيق على مدير المؤسسة ومدير النظام، ويفرض الخادم النطاق نفسه بواسطة RLS.</p>
    </section>
  );
}

function AuditLogFilters({
  search,
  onSearchChange,
  actionFilter,
  onActionFilterChange,
  actions,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  actionFilter: string;
  onActionFilterChange: (value: string) => void;
  actions: string[];
}) {
  return (
    <section className="panel no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, marginBottom: 16 }}>
      <label style={{ display: 'grid', gap: 6 }}>
        <span><Search size={14} style={{ verticalAlign: 'middle' }} /> بحث في الإجراء أو الكيان أو المعرّف</span>
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="بحث داخل سجلات الصفحة الحالية" />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>نوع الإجراء</span>
        <select value={actionFilter} onChange={(event) => onActionFilterChange(event.target.value)}>
          <option value="all">كل الإجراءات</option>
          {actions.map((action) => <option value={action} key={action}>{actionLabels[action] ?? action}</option>)}
        </select>
      </label>
    </section>
  );
}

function AuditLogRowView({ row }: { row: AuditLogRow }) {
  const isDeletion = row.action.includes('deleted') || row.action.includes('delete');
  return (
    <tr>
      <td>{dateLabel(row.created_at)}</td>
      <td><span className={`badge ${isDeletion ? 'warning' : 'info'}`}>{actionLabels[row.action] ?? row.action}</span></td>
      <td>{row.entity_type ?? '—'}</td>
      <td><code>{row.entity_id ? row.entity_id.slice(0, 8) : '—'}</code></td>
      <td><code>{row.actor_id ? row.actor_id.slice(0, 8) : 'نظام'}</code></td>
    </tr>
  );
}

function AuditLogRows({ rows }: { rows: AuditLogRow[] }) {
  return <tbody>{rows.map((row) => <AuditLogRowView key={row.id} row={row} />)}</tbody>;
}

function AuditLogTable({ rows, loadedCount }: { rows: AuditLogRow[]; loadedCount: number }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div><h2>الأحداث المسجلة</h2><p>{rows.length} نتيجة من {loadedCount} سجل محمّل</p></div>
      </div>
      <TableWrap>
        <table>
          <thead>
            <tr><th>التاريخ</th><th>الإجراء</th><th>نوع الكيان</th><th>معرّف الكيان</th><th>منفّذ الحدث</th></tr>
          </thead>
          <AuditLogRows rows={rows} />
        </table>
      </TableWrap>
    </section>
  );
}

function AuditLogContent({
  loading,
  error,
  rows,
  loadedCount,
}: {
  loading: boolean;
  error: string;
  rows: AuditLogRow[];
  loadedCount: number;
}) {
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (rows.length === 0) return <Empty text="لا توجد سجلات مطابقة للفلاتر الحالية." />;
  return <AuditLogTable rows={rows} loadedCount={loadedCount} />;
}

function AuditLogPagination({
  page,
  pageCount,
  loading,
  onPrevious,
  onNext,
}: {
  page: number;
  pageCount: number;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <>
      <Button variant="outline" onClick={onPrevious} disabled={loading || page <= 1}>السابق</Button>
      <span role="status" aria-label="صفحة سجل التدقيق">{'صفحة ' + page + ' من ' + pageCount}</span>
      <Button variant="outline" onClick={onNext} disabled={loading || page >= pageCount}>التالي</Button>
    </>
  );
}

function AuditLogToolbar({
  canReadAudit,
  loading,
  page,
  pageCount,
  filteredCount,
  onReload,
  onPrevious,
  onNext,
  onPrint,
}: {
  canReadAudit: boolean;
  loading: boolean;
  page: number;
  pageCount: number;
  filteredCount: number;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Button variant="secondary" onClick={onReload} disabled={loading}><RefreshCw size={16} /> تحديث</Button>
      {canReadAudit && (
        <AuditLogPagination
          page={page}
          pageCount={pageCount}
          loading={loading}
          onPrevious={onPrevious}
          onNext={onNext}
        />
      )}
      <Button variant="outline" onClick={onPrint} disabled={!canReadAudit || loading || filteredCount === 0}>
        <Printer size={16} /> طباعة النتائج الحالية
      </Button>
    </div>
  );
}

type AuditLogBodyProps = {
  canReadAudit: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  actionFilter: string;
  onActionFilterChange: (value: string) => void;
  actions: string[];
  loading: boolean;
  error: string;
  rows: AuditLogRow[];
  loadedCount: number;
};

function AuditLogBody(props: AuditLogBodyProps) {
  if (!props.canReadAudit) return <AuditLogAccessDenied />;

  return (
    <>
      <AuditLogFilters
        search={props.search}
        onSearchChange={props.onSearchChange}
        actionFilter={props.actionFilter}
        onActionFilterChange={props.onActionFilterChange}
        actions={props.actions}
      />
      <AuditLogContent
        loading={props.loading}
        error={props.error}
        rows={props.rows}
        loadedCount={props.loadedCount}
      />
    </>
  );
}

function auditLogStatusNote(input: {
  canReadAudit: boolean;
  loading: boolean;
  totalCount: number | null;
  page: number;
  pageCount: number;
}): string {
  if (!input.canReadAudit) return "يتطلب العرض صلاحية مدير أو مدير النظام";
  if (input.loading) return "جارٍ تحميل سجل التدقيق...";
  if (input.totalCount === null) return "تعذر تأكيد إجمالي سجل التدقيق.";
  return "إجمالي السجلات في المؤسسة: " +
    input.totalCount.toLocaleString("ar-YE") +
    " — الصفحة " + input.page + " من " + input.pageCount;
}

export function AdminAuditLog({ initialSearch }: { initialSearch?: string } = {}) {
  const { user } = useAuth();
  const canReadAudit = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(initialSearch ?? '');
  useEffect(() => { if (initialSearch?.trim()) setSearch(initialSearch); }, [initialSearch]);
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!canReadAudit) {
      setRows([]);
      setTotalCount(0);
      setError('سجل التدقيق متاح للمدير ومدير النظام فقط.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { organizationId } = await getCurrentTenantScope();
      const { data, error: queryError, count } = await supabase
        .from('audit_logs')
        .select('id,actor_id,action,entity_type,entity_id,created_at', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range((page - 1) * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE - 1);

      if (queryError) throw queryError;
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
        throw new Error('لم يؤكد الخادم العدد الإجمالي لسجل التدقيق.');
      }

      const nextPageCount = Math.max(1, Math.ceil(count / AUDIT_PAGE_SIZE));
      setTotalCount(count);
      if (page > nextPageCount) {
        setRows([]);
        setPage(nextPageCount);
        return;
      }
      setRows((data ?? []) as AuditLogRow[]);
    } catch {
      setError('تعذر تحميل سجل التدقيق. حاول التحديث.');
      setRows([]);
      setTotalCount(null);
    } finally {
      setLoading(false);
    }
  }, [canReadAudit, page]);

  useEffect(() => { void load(); }, [load]);

  const actions = useMemo(
    () => [...new Set(rows.map((row) => row.action))].sort((a, b) => a.localeCompare(b, 'ar')),
    [rows],
  );
  const pageCount = totalCount === null ? 1 : Math.max(1, Math.ceil(totalCount / AUDIT_PAGE_SIZE));
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ar');
    return rows.filter((row) => {
      if (actionFilter !== 'all' && row.action !== actionFilter) return false;
      if (!needle) return true;
      return [row.id, row.action, row.entity_type ?? '', row.entity_id ?? '', row.actor_id ?? '']
        .some((value) => value.toLocaleLowerCase('ar').includes(needle));
    });
  }, [rows, search, actionFilter]);

  const note = auditLogStatusNote({ canReadAudit, loading, totalCount, page, pageCount });

  return (
    <AdminPage
      eyebrow="الحوكمة والأمان"
      title="سجل التدقيق"
      description="عرض أحداث التغيير المسجلة فعليًا للمؤسسة؛ لا تُعرض قيم الحقول القديمة أو الجديدة في هذه الشاشة."
      icon={ScrollText}
      note={note}
      toolbar={
        <AuditLogToolbar
          canReadAudit={canReadAudit}
          loading={loading}
          page={page}
          pageCount={pageCount}
          filteredCount={filtered.length}
          onReload={() => void load()}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => Math.min(pageCount, value + 1))}
          onPrint={() => window.print()}
        />
      }
    >
      <AuditLogBody
        canReadAudit={canReadAudit}
        search={search}
        onSearchChange={setSearch}
        actionFilter={actionFilter}
        onActionFilterChange={setActionFilter}
        actions={actions}
        loading={loading}
        error={error}
        rows={filtered}
        loadedCount={rows.length}
      />
    </AdminPage>
  );
}
