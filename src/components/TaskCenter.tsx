import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock3, Filter,
  ListTodo, Play, Plus, Printer, RefreshCw, Search, UserCheck, X,
} from 'lucide-react';
import { assignOperationalTask, assignOperationalTasks, cancelOperationalTask, createOperationalTask, fetchOperationalTaskAssignees, fetchOperationalTasks, refreshOperationalTasks, setOperationalTaskStatus, updateManualOperationalTask, updateOperationalTaskDetails, updateOperationalTasksDetails } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { OperationalTask, OperationalTaskAssignee, OperationalTaskRole, OperationalTaskStatus } from '@/lib/types';
import { prioritizeOperationalTasks, suggestOperationalTaskAssignee, type OperationalTaskAssigneeSuggestion } from '@/lib/intelligence/task-prioritization';
import { filterTasksForPrint, operationalTaskPrintTitle, projectOperationalTaskPrintRow } from '@/lib/task-print';
import { CustomerReturnReviewQueue } from '@/components/CustomerReturnReviewQueue';
import { CustomerReturnReceiptQueue } from '@/components/CustomerReturnReceiptQueue';
import { CustomerReturnCreditMemoQueue } from '@/components/CustomerReturnCreditMemoQueue';
import { TaskQualityReviewCenter, TaskQualityReviewForm } from '@/components/intelligence';

const roleLabels: Record<OperationalTaskRole, string> = {
  sales: 'المبيعات', accountant: 'المحاسبة والتحصيل', warehouse: 'أمين المخزن',
  purchasing: 'مدير المشتريات', management: 'الإدارة', operations: 'العمليات والبيانات',
};
const statusLabels: Record<string, string> = { pending: 'بانتظار التنفيذ', in_progress: 'قيد التنفيذ', completed: 'مكتملة', cancelled: 'ملغاة' };
const priorityLabels: Record<string, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'مرتفعة', critical: 'حرجة' };
const entityLabels: Record<string, string> = {
  orders: 'طلب',
  customer_invoices: 'فاتورة',
  inventory_balances: 'رصيد مخزون',
  sales_quotes: 'عرض سعر',
  import_jobs: 'عملية استيراد',
  purchase_orders: 'أمر شراء',
  purchase_receipts: 'إيصال استلام شراء',
  stock_count_sessions: 'جلسة جرد',
  customer_return_requests: 'طلب إرجاع',
  customer_return_receipts: 'استلام مرتجع',
  customer_return_credit_memos: 'إشعار دائن لمرتجع',
  customer_interactions: 'متابعة عميل 360',
};

function dateText(value: string | null | undefined): string {
  if (!value) return 'غير محدد في المصدر';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'تاريخ غير صالح' :
    date.toLocaleString('ar-YE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function dateTimeInputValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function isLate(task: Pick<OperationalTask, 'due_at' | 'status'>): boolean {
  return Boolean(task.due_at && new Date(task.due_at).getTime() < Date.now() && !['completed','cancelled'].includes(task.status));
}
function roleOptionsFor(roles: string[]): OperationalTaskRole[] {
  if (roles.includes('admin') || roles.includes('manager')) return ['sales','accountant','warehouse','purchasing','management','operations'];
  if (roles.includes('accountant') && !roles.some((role) => ['staff'].includes(role))) return ['accountant'];
  return ['sales','warehouse','purchasing','operations'];
}

function canAssignToRole(userRoles: string[], taskRole: OperationalTaskRole): boolean {
  if (taskRole === 'accountant') return userRoles.some((role) => ['admin','manager','accountant'].includes(role));
  if (taskRole === 'management') return userRoles.some((role) => ['admin','manager'].includes(role));
  return userRoles.some((role) => ['admin','manager','staff'].includes(role));
}

function matchesTaskSearch(task: OperationalTask, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return true;
  const searchableValues = [
    task.id,
    task.title,
    task.description ?? '',
    task.source_entity_id ?? '',
    task.resolution_note ?? '',
  ];
  return searchableValues.some((value) => value.toLocaleLowerCase().includes(needle));
}

function matchesTaskCreationRange(
  task: OperationalTask,
  createdFrom: string,
  createdTo: string,
): boolean {
  const createdAt = new Date(task.created_at).getTime();
  if (createdFrom && createdAt < new Date(`${createdFrom}T00:00:00`).getTime()) return false;
  if (createdTo && createdAt >= new Date(`${createdTo}T23:59:59.999`).getTime() + 1) return false;
  return true;
}

function matchesTaskDueRange(task: OperationalTask, dueFrom: string, dueTo: string): boolean {
  if (!dueFrom && !dueTo) return true;
  if (!task.due_at) return false;
  const dueAt = new Date(task.due_at).getTime();
  if (!Number.isFinite(dueAt)) return false;
  if (dueFrom && dueAt < new Date(`${dueFrom}T00:00:00`).getTime()) return false;
  if (dueTo && dueAt >= new Date(`${dueTo}T23:59:59.999`).getTime() + 1) return false;
  return true;
}

type TaskCreateFormProps = {
  title: string;
  description: string;
  newRole: OperationalTaskRole;
  allowedRoles: OperationalTaskRole[];
  eligibleAssignees: OperationalTaskAssignee[];
  assignedTo: string;
  assigneesLoading: boolean;
  assigneesError: string;
  workloadSuggestion: OperationalTaskAssigneeSuggestion | null;
  onUseWorkloadSuggestion: (profileId: string) => void;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueAt: string;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onRoleChange: (value: OperationalTaskRole) => void;
  onAssigneeChange: (value: string) => void;
  onPriorityChange: (value: TaskCreateFormProps['priority']) => void;
  onDueAtChange: (value: string) => void;
};



function renderTaskAssigneeOptions(assignees: OperationalTaskAssignee[]) {
  return assignees.map((assignee) => (
    <option key={assignee.profile_id} value={assignee.profile_id}>
      {assignee.full_name}{assignee.email ? ' — ' + assignee.email : ''}
    </option>
  ));
}

function TaskCreateFields({ allowedRoles, newRole, onRoleChange, eligibleAssignees, assignedTo, assigneesLoading, assigneesError, onAssigneeChange, priority, onPriorityChange, dueAt, onDueAtChange }: Pick<TaskCreateFormProps, 'allowedRoles' | 'newRole' | 'onRoleChange' | 'eligibleAssignees' | 'assignedTo' | 'assigneesLoading' | 'assigneesError' | 'onAssigneeChange' | 'priority' | 'onPriorityChange' | 'dueAt' | 'onDueAtChange'>) {
  return (
    <div className="task-create-grid">
      <label>الدور المستهدف<select value={newRole} onChange={(event) => onRoleChange(event.target.value as OperationalTaskRole)}>
        {allowedRoles.map((role) => <option value={role} key={role}>{roleLabels[role]}</option>)}
      </select></label>
      <label>الموظف المسؤول
        <select value={assignedTo} onChange={(event) => onAssigneeChange(event.target.value)} disabled={assigneesLoading || Boolean(assigneesError)}>
          <option value="">تبقى في قائمة الدور حتى يستلمها موظف</option>
          {renderTaskAssigneeOptions(eligibleAssignees)}
        </select>
        {assigneesLoading && <small>جارٍ تحميل موظفي المؤسسة المصرح لهم…</small>}
        {assigneesError && <small role="status">{assigneesError} يمكنك حفظ المهمة غير مسندة؛ يتحقق الخادم من أي إسناد لاحق.</small>}
        {!assigneesLoading && !assigneesError && eligibleAssignees.length === 0 && <small>لا يوجد موظف نشط بدور متوافق؛ ستبقى المهمة في قائمة الدور.</small>}
      </label>
      <label>الأولوية<select value={priority} onChange={(event) => onPriorityChange(event.target.value as TaskCreateFormProps['priority'])}>
        <option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">مرتفعة</option><option value="critical">حرجة</option>
      </select></label>
      <label>الموعد (اختياري)<input type="datetime-local" value={dueAt} onChange={(event) => onDueAtChange(event.target.value)} /></label>
    </div>
  );
}

function TaskCreateActions({ busy, title, onClose }: { busy: boolean; title: string; onClose: () => void }) {
  return (
    <div className="task-form-actions">
      <button type="submit" className="btn primary" disabled={busy || !title.trim()}>{busy ? 'جارٍ الحفظ…' : 'حفظ المهمة'}</button>
      <button type="button" className="btn secondary" onClick={onClose}>إلغاء</button>
    </div>
  );
}


function TaskCreateForm({
  title, description, newRole, allowedRoles, eligibleAssignees, assignedTo,
  assigneesLoading, assigneesError, workloadSuggestion, onUseWorkloadSuggestion, priority, dueAt, busy, onSubmit, onClose,
  onTitleChange, onDescriptionChange, onRoleChange, onAssigneeChange,
  onPriorityChange, onDueAtChange,
}: TaskCreateFormProps) {
  return (
    <form className="panel task-create-form" onSubmit={onSubmit}>
      <div className="panel-head">
        <div><h2>إسناد مهمة جديدة</h2><p>تُحفظ حسب الدور وتظهر في قائمته مع تدقيق الإنشاء.</p></div>
        <button type="button" className="btn ghost" aria-label="إغلاق نموذج المهمة" onClick={onClose}><X size={16} /></button>
      </div>
      <label>عنوان المهمة<input required maxLength={240} value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="اكتب الإجراء المطلوب" /></label>
      <label>التفاصيل<textarea maxLength={2000} rows={3} value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="الإجراء أو المرجع التشغيلي" /></label>
      {workloadSuggestion && (
        <div className="rounded-xl border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <strong>اقتراح توزيع بحسب عبء العمل</strong>
              <p className="mt-1 text-sm">{workloadSuggestion.assignee.full_name} — {workloadSuggestion.openTaskCount.toLocaleString('ar-YE')} مهمة مفتوحة، منها {workloadSuggestion.overdueTaskCount.toLocaleString('ar-YE')} متأخرة.</p>
              <p className="mt-1 text-xs text-muted-foreground">العبء المرجح: {workloadSuggestion.weightedLoad.toLocaleString('ar-YE')} نقطة؛ مهمة واحدة = 1، وتضاف أوزان للأولوية والتأخر. الحساب من المهام الظاهرة فقط.</p>
            </div>
            <button type="button" className="btn secondary" disabled={busy || assignedTo === workloadSuggestion.assignee.profile_id}
              onClick={() => onUseWorkloadSuggestion(workloadSuggestion.assignee.profile_id)}>
              استخدام الاقتراح
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">اقتراح غير ملزم؛ لا يتغير الإسناد حتى تحفظ المهمة أو تؤكد الإسناد يدوياً.</p>
        </div>
      )}
      <TaskCreateFields
        allowedRoles={allowedRoles}
        newRole={newRole}
        onRoleChange={onRoleChange}
        eligibleAssignees={eligibleAssignees}
        assignedTo={assignedTo}
        assigneesLoading={assigneesLoading}
        assigneesError={assigneesError}
        onAssigneeChange={onAssigneeChange}
        priority={priority}
        onPriorityChange={onPriorityChange}
        dueAt={dueAt}
        onDueAtChange={onDueAtChange}
      />
      <TaskCreateActions busy={busy} title={title} onClose={onClose} />
    </form>
  );
}

export function TaskCenter({ onNotice, initialTaskId = null, onInitialTaskApplied }: { onNotice: (message: string) => void; initialTaskId?: string | null; onInitialTaskApplied?: () => void }) {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canManage = roles.includes('admin') || roles.includes('manager');
  const allowedRoles = useMemo(() => roleOptionsFor(roles), [roles]);
  const financeOnly = roles.includes('accountant') && !roles.some((role) => ['admin','manager','staff'].includes(role));
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState<OperationalTaskRole | 'all'>(financeOnly ? 'accountant' : 'all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | OperationalTaskStatus>('open');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high' | 'critical'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'unassigned' | string>('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [newRole, setNewRole] = useState<OperationalTaskRole>(canManage ? 'sales' : (allowedRoles[0] ?? 'operations'));
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [dueAt, setDueAt] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [assignees, setAssignees] = useState<OperationalTaskAssignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assigneesError, setAssigneesError] = useState('');
  const [assigneeDrafts, setAssigneeDrafts] = useState<Record<string, string>>({});
  const [taskDetailDrafts, setTaskDetailDrafts] = useState<Record<string, { priority: OperationalTask['priority']; dueAt: string }>>({});
  const [manualTaskDrafts, setManualTaskDrafts] = useState<Record<string, { title: string; description: string }>>({});
  const [editingManualTaskId, setEditingManualTaskId] = useState<string | null>(null);
  const [cancellationDrafts, setCancellationDrafts] = useState<Record<string, string>>({});
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);
  const [bulkAssigneeDraft, setBulkAssigneeDraft] = useState('');
  const [completionDrafts, setCompletionDrafts] = useState<Record<string, string>>({});
  const [bulkDetailsPriority, setBulkDetailsPriority] = useState<OperationalTask['priority']>('medium');
  const [bulkDetailsDueAt, setBulkDetailsDueAt] = useState('');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [qualityRefreshToken, setQualityRefreshToken] = useState(0);

  const loadTasks = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const rows = await fetchOperationalTasks();
      setTasks(rows);
      const availableIds = new Set(rows.map((task) => task.id));
      setSelectedTaskIds((current) => {
        const retained = new Set([...current].filter((id) => availableIds.has(id)));
        return retained.size === current.size ? current : retained;
      });
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل مهام التشغيل.'); }
    finally { setLoading(false); }
  }, []);
  const refreshQualityAfterReview = useCallback(async () => {
    await loadTasks();
    setQualityRefreshToken((current) => current + 1);
  }, [loadTasks]);
  useEffect(() => { void loadTasks(); }, [loadTasks]);
  useEffect(() => {
    if (!initialTaskId || loading) return;
    const target = tasks.find((task) => task.id === initialTaskId);
    setSearch(target?.title ?? initialTaskId);
    onInitialTaskApplied?.();
  }, [initialTaskId, loading, tasks, onInitialTaskApplied]);
  useEffect(() => {
    if (!canManage) return;
    let active = true;
    setAssigneesLoading(true);
    setAssigneesError('');
    void fetchOperationalTaskAssignees()
      .then((rows) => { if (active) setAssignees(rows); })
      .catch((cause: unknown) => {
        if (active) setAssigneesError(cause instanceof Error ? cause.message : 'تعذر تحميل موظفي المؤسسة.');
      })
      .finally(() => { if (active) setAssigneesLoading(false); });
    return () => { active = false; };
  }, [canManage]);

  const eligibleAssignees = useMemo(
    () => assignees.filter((assignee) => canAssignToRole(assignee.roles, newRole)),
    [assignees, newRole],
  );

  const workloadSuggestion = useMemo(
    () => suggestOperationalTaskAssignee(tasks, eligibleAssignees, Date.now()),
    [tasks, eligibleAssignees],
  );
  const assigneeById = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.profile_id, assignee])),
    [assignees],
  );
  function assignedLabel(task: OperationalTask): string {
    if (!task.assigned_to) return 'حسب الدور — غير مستلمة';
    if (task.assigned_to === user?.profileId) return 'أنت';
    const assignee = assigneeById.get(task.assigned_to);
    if (assignee) return assignee.full_name;
    return 'مسند لموظف آخر';
  }


  const [printScope, setPrintScope] = useState<OperationalTaskRole | 'all' | 'filtered' | 'selected'>('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set());

  // One shared predicate applies all non-role filters to both screen and print output.
  const matchesNonRoleFilters = useCallback((task: OperationalTask) => {
    if (statusFilter === 'open' && ['completed','cancelled'].includes(task.status)) return false;
    if (statusFilter !== 'all' && statusFilter !== 'open' && task.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    if (assigneeFilter === 'unassigned' && task.assigned_to) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && task.assigned_to !== assigneeFilter) return false;
    if (!matchesTaskCreationRange(task, createdFrom, createdTo)) return false;
    if (!matchesTaskDueRange(task, dueFrom, dueTo)) return false;
    if (overdueOnly && !isLate(task)) return false;
    return matchesTaskSearch(task, search);
  }, [statusFilter,priorityFilter,assigneeFilter,createdFrom,createdTo,dueFrom,dueTo,overdueOnly,search]);

  // Apply the same authorized role scope to cards, print output and every summary metric.
  const roleScopedTasks = useMemo(
    () => tasks.filter((task) => allowedRoles.includes(task.task_role)),
    [tasks,allowedRoles],
  );
  const filteredWithoutRole = useMemo(
    () => roleScopedTasks.filter(matchesNonRoleFilters),
    [roleScopedTasks,matchesNonRoleFilters],
  );
  const filtered = useMemo(
    () => filteredWithoutRole.filter((task) => roleFilter === 'all' || task.task_role === roleFilter),
    [filteredWithoutRole,roleFilter],
  );
  const printable = useMemo(
    () => filterTasksForPrint(
      printScope === 'selected' ? roleScopedTasks : filteredWithoutRole,
      printScope,
      allowedRoles,
      filtered,
      selectedTaskIds,
    ).map((task) => projectOperationalTaskPrintRow(task, assignedLabel(task))),
    [roleScopedTasks,filteredWithoutRole,filtered,printScope,allowedRoles,selectedTaskIds,assigneeById,user?.profileId],
  );
  const printScopeLabel = printScope === 'filtered'
    ? 'النتائج المفلترة الحالية'
    : printScope === 'all'
      ? 'كل المهام المسموحة'
      : printScope === 'selected'
        ? 'المهام المحددة'
        : roleLabels[printScope];

  const printableSummary = useMemo(() => ({
    total: printable.length,
    open: printable.filter((task) => !['completed','cancelled'].includes(task.status)).length,
    late: printable.filter(isLate).length,
    critical: printable.filter((task) => task.priority === 'critical').length,
    completed: printable.filter((task) => task.status === 'completed').length,
  }), [printable]);
  const printableRoleSummary = useMemo(
    () => allowedRoles.map((role) => ({
      role,
      total: printable.filter((task) => task.task_role === role).length,
      open: printable.filter((task) => task.task_role === role && !['completed','cancelled'].includes(task.status)).length,
      late: printable.filter((task) => task.task_role === role && isLate(task)).length,
    })).filter((row) => row.total > 0),
    [allowedRoles,printable],
  );

  function toggleTaskSelection(taskId: string, checked: boolean) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }

  function selectFilteredTasks() {
    setSelectedTaskIds((current) => new Set([...current, ...filtered.map((task) => task.id)]));
  }

  function clearTaskSelection() {
    setSelectedTaskIds(new Set());
    if (printScope === 'selected') setPrintScope('filtered');
  }

  const selectedOpenTaskIds = useMemo(
    () => tasks
      .filter((task) => selectedTaskIds.has(task.id) && !['completed','cancelled'].includes(task.status))
      .map((task) => task.id),
    [tasks,selectedTaskIds],
  );

  const openCount = roleScopedTasks.filter((task) => !['completed','cancelled'].includes(task.status)).length;
  const lateCount = roleScopedTasks.filter(isLate).length;
  const completedCount = roleScopedTasks.filter((task) => task.status === 'completed').length;

  const todayAttention = useMemo(
    () => prioritizeOperationalTasks(roleScopedTasks, Date.now(), 5),
    [roleScopedTasks],
  );

  function focusAttentionTask(task: OperationalTask) {
    setRoleFilter(task.task_role);
    setStatusFilter('open');
    setPriorityFilter('all');
    setAssigneeFilter('all');
    setCreatedFrom(''); setCreatedTo(''); setDueFrom(''); setDueTo('');
    setOverdueOnly(false);
    setSearch(task.id);
  }


  async function performStatus(task: OperationalTask, status: OperationalTaskStatus, resolutionNote?: string): Promise<boolean> {
    setBusy(true); setError('');
    try {
      await setOperationalTaskStatus(task.id,status,resolutionNote?.trim() || undefined);
      onNotice(status==='completed'?'تم إغلاق المهمة وحفظ نتيجة التنفيذ.':status==='in_progress'?'تم استلام المهمة وتعيينها للمستخدم الحالي.':'تم تحديث حالة المهمة.');
      await loadTasks();
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر تحديث المهمة.';
      setError(message); onNotice(message);
      return false;
    } finally { setBusy(false); }
  }

  function beginTaskCompletion(task: OperationalTask) {
    setCompletionDrafts((current) => ({ ...current, [task.id]: current[task.id] ?? '' }));
    setCompletingTaskId(task.id);
  }

  function closeTaskCompletion(taskId: string) {
    setCompletionDrafts((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    setCompletingTaskId((current) => current === taskId ? null : current);
  }

  async function confirmTaskCompletion(task: OperationalTask) {
    const result = (completionDrafts[task.id] ?? '').trim();
    if (!result) return;
    const saved = await performStatus(task,'completed',result);
    if (saved) closeTaskCompletion(task.id);
  }

  function taskAssigneeDraft(task: OperationalTask): string {
    return Object.prototype.hasOwnProperty.call(assigneeDrafts, task.id)
      ? assigneeDrafts[task.id]
      : task.assigned_to ?? '';
  }

  async function saveTaskAssignee(task: OperationalTask) {
    const selectedAssignee = taskAssigneeDraft(task);
    if (selectedAssignee === (task.assigned_to ?? '')) return;
    setBusy(true); setError('');
    try {
      await assignOperationalTask(task.id, selectedAssignee || null);
      setAssigneeDrafts((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      await loadTasks();
      onNotice(selectedAssignee
        ? 'تم تحديث مسؤول المهمة وتسجيل التغيير في سجل التدقيق.'
        : 'أعيدت المهمة إلى قائمة الدور وسُجل إلغاء الإسناد.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر تحديث مسؤول المهمة.';
      setError(message); onNotice(message);
    } finally { setBusy(false); }
  }

  async function saveBulkTaskAssignment() {
    const taskIds = selectedOpenTaskIds;
    if (taskIds.length < 1) {
      setError('لا توجد مهام مفتوحة ضمن التحديد الحالي؛ المهام المكتملة والملغاة لا تقبل إعادة الإسناد.');
      return;
    }
    if (taskIds.length > 100) {
      setError('تسمح العملية الجماعية بإسناد 100 مهمة كحد أقصى في الدفعة الواحدة.');
      return;
    }
    setBusy(true); setError('');
    try {
      const result = await assignOperationalTasks(taskIds, bulkAssigneeDraft || null);
      setSelectedTaskIds(new Set());
      setBulkAssigneeDraft('');
      await loadTasks();
      onNotice(
        'تمت مراجعة '+result.processed_count.toLocaleString('ar-YE')+
        ' مهمة ضمن معاملة واحدة؛ تغيّر إسناد '+result.changed_count.toLocaleString('ar-YE')+' مهمة وسُجلت تغييراتها.'
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر إسناد المهام المحددة.';
      setError(message); onNotice(message);
    } finally { setBusy(false); }
  }

  function taskDetailsDraft(task: OperationalTask) {
    return taskDetailDrafts[task.id] ?? {
      priority: task.priority,
      dueAt: dateTimeInputValue(task.due_at),
    };
  }

  async function saveBulkTaskDetails() {
    const taskIds = selectedOpenTaskIds;
    if (taskIds.length < 1 || taskIds.length > 100) {
      setError('اختر من مهمة واحدة إلى 100 مهمة مفتوحة لتحديثها دفعة واحدة.');
      return;
    }
    if (!bulkDetailsDueAt) {
      setError('حدد موعد الاستحقاق المشترك قبل تنفيذ تحديث المجموعة.');
      return;
    }
    setBusy(true); setError('');
    try {
      const result = await updateOperationalTasksDetails(
        taskIds,
        bulkDetailsPriority,
        new Date(bulkDetailsDueAt).toISOString(),
      );
      setSelectedTaskIds(new Set());
      setBulkDetailsDueAt('');
      await loadTasks();
      onNotice(
        'تم تحديث '+result.processed_count.toLocaleString('ar-YE')+
        ' مهمة؛ تغيرت الأولوية أو المواعيد في '+result.changed_count.toLocaleString('ar-YE')+' مهمة.'
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر تحديث المهام المحددة.';
      setError(message); onNotice(message);
    } finally { setBusy(false); }
  }

  async function saveTaskDetails(task: OperationalTask) {
    const draft = taskDetailsDraft(task);
    const nextDueAt = draft.dueAt ? new Date(draft.dueAt).toISOString() : null;
    const sameDueAt = nextDueAt === null
      ? task.due_at === null
      : task.due_at !== null && Date.parse(nextDueAt) === Date.parse(task.due_at);
    if (draft.priority === task.priority && sameDueAt) return;

    setBusy(true); setError('');
    try {
      await updateOperationalTaskDetails(task.id, draft.priority, nextDueAt);
      setTaskDetailDrafts((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      await loadTasks();
      onNotice('تم تحديث أولوية المهمة وموعد استحقاقها وتسجيل التغيير.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر تحديث تفاصيل المهمة.';
      setError(message); onNotice(message);
    } finally { setBusy(false); }
  }

  function beginManualTaskEdit(task: OperationalTask) {
    setManualTaskDrafts((current) => ({
      ...current,
      [task.id]: { title: task.title, description: task.description ?? '' },
    }));
    setEditingManualTaskId(task.id);
  }

  function cancelManualTaskEdit(taskId: string) {
    setManualTaskDrafts((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    setEditingManualTaskId((current) => current === taskId ? null : current);
  }

  async function saveManualTaskEdit(task: OperationalTask) {
    const draft = manualTaskDrafts[task.id] ?? { title: task.title, description: task.description ?? '' };
    setBusy(true); setError('');
    try {
      await updateManualOperationalTask(task.id, draft.title, draft.description);
      cancelManualTaskEdit(task.id);
      await loadTasks();
      onNotice('تم حفظ نص المهمة اليدوية وتسجيل التغيير في سجل التدقيق.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر تحديث نص المهمة اليدوية.';
      setError(message); onNotice(message);
    } finally { setBusy(false); }
  }

  function closeTaskCancellation(taskId: string) {
    setCancellationDrafts((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    setCancellingTaskId((current) => current === taskId ? null : current);
  }

  async function confirmTaskCancellation(task: OperationalTask) {
    const reason = (cancellationDrafts[task.id] ?? '').trim();
    if (!reason) return;
    setBusy(true); setError('');
    try {
      await cancelOperationalTask(task.id, reason);
      closeTaskCancellation(task.id);
      await loadTasks();
      onNotice('أُلغيت المهمة وحُفظ السبب في سجل المهمة والتدقيق.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر إلغاء المهمة.';
      setError(message); onNotice(message);
    } finally { setBusy(false); }
  }

  async function refreshFromSources() {
    setBusy(true); setError('');
    try {
      const result = await refreshOperationalTasks(); await loadTasks();
      onNotice('اكتملت مصالحة المهام مع '+result.source_records_refreshed.toLocaleString('ar-YE')+' سجل مصدر؛ بصمة الحدث تمنع التكرار.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر مزامنة المهام.';
      setError(message); onNotice(message);
    } finally { setBusy(false); }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!title.trim()) return;
    setBusy(true); setError('');
    try {
      await createOperationalTask({ title,description,taskRole:newRole,priority,dueAt:dueAt?new Date(dueAt).toISOString():null,assignedTo:assignedTo || null });
      setTitle(''); setDescription(''); setDueAt(''); setAssignedTo(''); setShowCreate(false);
      await loadTasks(); onNotice('حُفظت المهمة الجديدة مع سجل تدقيق.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر إنشاء المهمة.';
      setError(message); onNotice(message);
    } finally { setBusy(false); }
  }

  return <section className="task-center" dir="rtl">
    <div className="task-center-hero">
      <div><span className="task-center-eyebrow"><ClipboardList size={15} /> متابعة التنفيذ</span>
        <h1>مركز المهام التشغيلية</h1>
        <p>مهام ناتجة من الطلبات والمشتريات وإيصالات الاستلام والجرد وفروقات المخزون والفواتير والإشعارات الدائنة وعروض الأسعار والاستيراد المحفوظة فعليًا، مع تسجيل الإنجاز والطباعة حسب الدور.</p>
      </div>
      <div className="task-center-toolbar">
        <button className="btn secondary" type="button" onClick={() => void loadTasks()} disabled={busy}><RefreshCw size={16} /> تحديث</button>
        {canManage && <button className="btn secondary" type="button" onClick={() => void refreshFromSources()} disabled={busy}><RefreshCw size={16} /> مصالحة مع حركة النظام</button>}
        {canManage && <button className="btn primary" type="button" onClick={() => setShowCreate((visible) => !visible)}><Plus size={16} /> مهمة يدوية</button>}
        <button className="btn secondary" type="button" onClick={selectFilteredTasks} disabled={loading || filtered.length === 0}>
          <ListTodo size={16} /> تحديد النتائج الحالية ({filtered.length.toLocaleString('ar-YE')})
        </button>
        {canManage && selectedOpenTaskIds.length > 0 && selectedTaskIds.size > 0 && (
          <div className="task-bulk-details">
            <label>
              <span>أولوية المهام المحددة</span>
              <select
                aria-label="الأولوية المشتركة للمهام المحددة"
                value={bulkDetailsPriority}
                disabled={busy}
                onChange={(event) => setBulkDetailsPriority(event.target.value as OperationalTask['priority'])}
              >
                <option value="low">منخفضة</option>
                <option value="medium">متوسطة</option>
                <option value="high">مرتفعة</option>
                <option value="critical">حرجة</option>
              </select>
            </label>
            <label>
              <span>موعد الاستحقاق المشترك</span>
              <input
                type="datetime-local"
                aria-label="موعد الاستحقاق المشترك للمهام المحددة"
                value={bulkDetailsDueAt}
                required
                disabled={busy}
                onChange={(event) => setBulkDetailsDueAt(event.target.value)}
              />
            </label>
            <button
              className="btn primary"
              type="button"
              disabled={busy || loading || selectedOpenTaskIds.length > 100 || !bulkDetailsDueAt}
              onClick={() => void saveBulkTaskDetails()}
            >تطبيق الأولوية والموعد على المجموعة</button>
            <small>يتطلب هذا الإجراء موعدًا جديدًا صريحًا؛ لا يمسح المواعيد الحالية بصمت.</small>
          </div>
        )}
        {canManage && selectedTaskIds.size > 0 && (
          <div className="task-bulk-assignment">
            <label>
              <span>إسناد {selectedOpenTaskIds.length.toLocaleString('ar-YE')} من {selectedTaskIds.size.toLocaleString('ar-YE')} مهمة محددة</span>
              <select
                aria-label="الموظف لإسناد المهام المحددة"
                value={bulkAssigneeDraft}
                disabled={busy || assigneesLoading || Boolean(assigneesError)}
                onChange={(event) => setBulkAssigneeDraft(event.target.value)}
              >
                <option value="">إعادتها إلى قوائم الأدوار</option>
                {assignees.map((assignee) => (
                  <option key={assignee.profile_id} value={assignee.profile_id}>
                    {assignee.full_name} — {assignee.roles.map((role) => roleLabels[role as OperationalTaskRole] ?? role).join('، ')}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn primary"
              type="button"
              disabled={busy || loading || assigneesLoading || Boolean(assigneesError) || selectedOpenTaskIds.length === 0 || selectedOpenTaskIds.length > 100}
              onClick={() => void saveBulkTaskAssignment()}
            >تنفيذ الإسناد الجماعي</button>
            {selectedTaskIds.size > 100 && <small role="status">قسّم التحديد إلى دفعات لا تتجاوز 100 مهمة.</small>}
            {assigneesError && <small role="status">تعذر تحميل الموظفين النشطين؛ لم يُسمح بالإسناد الجماعي.</small>}
          </div>
        )}
        <button className="btn secondary" type="button" onClick={clearTaskSelection} disabled={selectedTaskIds.size === 0}>
          إلغاء التحديد ({selectedTaskIds.size.toLocaleString('ar-YE')})
        </button>
        <label className="task-print-scope">
          <span>نطاق الطباعة</span>
          <select value={printScope} onChange={(event) => setPrintScope(event.target.value as OperationalTaskRole | 'all' | 'filtered' | 'selected')}>
            <option value="filtered">النتائج المفلترة الحالية</option>
            <option value="all">الكل — الأدوار المسموحة</option>
            <option value="selected">المهام المحددة ({selectedTaskIds.size.toLocaleString('ar-YE')})</option>
            {allowedRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
          </select>
        </label>
        <button className="btn primary" type="button" onClick={() => window.print()} disabled={printable.length===0 || (printScope === 'selected' && selectedTaskIds.size === 0)}>
          <Printer size={16} /> {printScope === 'selected' ? 'طباعة المهام المحددة' : 'طباعة ' + printScopeLabel}
        </button>
      </div>
    </div>
    {canManage ? <TaskQualityReviewCenter refreshToken={qualityRefreshToken} /> : null}
    <div className="task-center-metrics">
      <article><span><ListTodo size={19} /> المهام المفتوحة</span><strong>{openCount.toLocaleString('ar-YE')}</strong></article>
      <article><span><AlertTriangle size={19} /> متأخرة حسب موعد المصدر</span><strong>{lateCount.toLocaleString('ar-YE')}</strong></article>
      <article><span><CheckCircle2 size={19} /> مكتملة</span><strong>{completedCount.toLocaleString('ar-YE')}</strong></article>
      <article><span><ClipboardList size={19} /> النتائج الحالية</span><strong>{filtered.length.toLocaleString('ar-YE')}</strong></article>
    </div>
    <section className="panel p-4" aria-labelledby="task-today-heading">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="task-today-heading" className="text-lg font-semibold">ماذا ينبغي أن أفعل الآن؟</h2>
          <p className="mt-1 text-sm text-muted-foreground">أهم خمس مهام مفتوحة ضمن الأدوار المسموح بها لحسابك، مرتبة من مواعيد المصدر وأولويته.</p>
        </div>
        <span className="text-xs text-muted-foreground">ترتيب حتمي — لا ينشئ مهام ولا يغيّر حالتها</span>
      </header>
      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">جارٍ تحميل المهام الفعلية…</p>
      ) : todayAttention.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">لا توجد مهام مفتوحة ضمن الأدوار التي يحق لحسابك رؤيتها.</p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {todayAttention.map(({ task, whyNow, nextStep }) => (
            <article key={task.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={'task-role-badge ' + task.task_role}>{roleLabels[task.task_role]}</span>
                <span className={'task-priority-badge ' + task.priority}>{priorityLabels[task.priority] ?? 'غير مصنفة'}</span>
                <span className={'task-status-badge ' + task.status}>{statusLabels[task.status] ?? task.status}</span>
              </div>
              <h3 className="mt-2 font-semibold">{task.title}</h3>
              <p className="mt-1 text-sm">{whyNow}</p>
              <p className="mt-1 text-xs text-muted-foreground">الموعد المسجل: {dateText(task.due_at)}</p>
              <p className="mt-1 text-xs text-muted-foreground">الخطوة التالية: {nextStep}</p>
              <button className="btn secondary mt-3" type="button" onClick={() => focusAttentionTask(task)}>
                فتح المهمة وإجراءها
              </button>
            </article>
          ))}
        </div>
      )}
    </section>

    {showCreate && canManage && (
      <TaskCreateForm
        title={title}
        description={description}
        newRole={newRole}
        allowedRoles={allowedRoles}
        eligibleAssignees={eligibleAssignees}
        assignedTo={assignedTo}
        assigneesLoading={assigneesLoading}
        assigneesError={assigneesError}
        workloadSuggestion={workloadSuggestion}
        onUseWorkloadSuggestion={setAssignedTo}
        priority={priority}
        dueAt={dueAt}
        busy={busy}
        onSubmit={(event) => { void submitTask(event); }}
        onClose={() => setShowCreate(false)}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onRoleChange={(role) => {
          setNewRole(role);
          if (assignedTo && !assignees.some((assignee) => assignee.profile_id === assignedTo && canAssignToRole(assignee.roles, role))) {
            setAssignedTo('');
          }
        }}
        onAssigneeChange={setAssignedTo}
        onPriorityChange={setPriority}
        onDueAtChange={setDueAt}
      />
    )}
    <section className="panel task-filters">
      <label className="task-search"><span><Search size={16} /> بحث</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="عنوان المهمة أو التفاصيل أو مرجع المصدر" /></label>
      <label><span><Filter size={16} /> الدور</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}><option value="all">كل الأدوار المتاحة للحساب</option>{allowedRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
      <label><span><ListTodo size={16} /> الحالة</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="open">المفتوحة فقط</option><option value="pending">بانتظار التنفيذ</option><option value="in_progress">قيد التنفيذ</option><option value="completed">مكتملة</option><option value="cancelled">ملغاة</option><option value="all">كل الحالات</option></select></label>
      <label><span>الأولوية</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}><option value="all">كل الأولويات</option><option value="critical">حرجة</option><option value="high">مرتفعة</option><option value="medium">متوسطة</option><option value="low">منخفضة</option></select></label>
      <label><span><UserCheck size={16} /> المسؤول</span><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">كل المسؤولين</option><option value="unassigned">غير مسندة</option>{assignees.filter((assignee) => assignee.profile_id && tasks.some((task) => task.assigned_to === assignee.profile_id)).map((assignee) => <option key={assignee.profile_id} value={assignee.profile_id}>{assignee.full_name}</option>)}</select></label>
      <label><span>من تاريخ الإنشاء</span><input type="date" value={createdFrom} max={createdTo || undefined} onChange={(event) => setCreatedFrom(event.target.value)} /></label>
      <label><span>إلى تاريخ الإنشاء</span><input type="date" value={createdTo} min={createdFrom || undefined} onChange={(event) => setCreatedTo(event.target.value)} /></label>
      <label><span>من موعد الاستحقاق</span><input type="date" value={dueFrom} max={dueTo || undefined} onChange={(event) => setDueFrom(event.target.value)} /></label>
      <label><span>إلى موعد الاستحقاق</span><input type="date" value={dueTo} min={dueFrom || undefined} onChange={(event) => setDueTo(event.target.value)} /></label>
      <label className="task-overdue-filter"><input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} /><span>المتأخرة فقط</span></label>
    </section>
    {error && <div className="task-center-error" role="alert"><AlertTriangle size={17} /> {error}</div>}
    {loading ? <div className="panel task-center-empty">جارٍ تحميل المهام المقيّدة بصلاحيات حسابك…</div> : filtered.length===0 ? (
      <div className="panel task-center-empty"><ClipboardList size={30} /><strong>لا توجد مهام مطابقة للفلاتر</strong><span>غيّر الفلاتر أو نفّذ المصالحة مع سجلات التشغيل المحفوظة.</span></div>
    ) : <div className="task-center-list">{filtered.map((task) => {
      const late=isLate(task);
      const source=task.source_entity_type?(entityLabels[task.source_entity_type]??task.source_entity_type):'مهمة يدوية';
      const sourceId=task.source_entity_id?task.source_entity_id.slice(0,8):'—';
      const assigned=assignedLabel(task);
      const compatibleTaskAssignees = assignees.filter((assignee) => canAssignToRole(assignee.roles, task.task_role));
      const selectedAssignee = taskAssigneeDraft(task);
      const currentAssigneeMissing = Boolean(task.assigned_to && !compatibleTaskAssignees.some((assignee) => assignee.profile_id === task.assigned_to));
      return <article className="panel task-card" key={task.id}>
        <div className={'task-priority-line '+task.priority} />
        <div className="task-card-main">
          <div className="task-card-top">
            <label className="task-select-toggle">
              <input type="checkbox" checked={selectedTaskIds.has(task.id)} onChange={(event) => toggleTaskSelection(task.id,event.target.checked)} aria-label={'تحديد المهمة للطباعة: ' + task.title} />
              <span>تحديد للطباعة</span>
            </label>
            <span className={'task-role-badge '+task.task_role}>{roleLabels[task.task_role]}</span>
            <span className={'task-status-badge '+task.status}>{statusLabels[task.status]??task.status}</span>
            <span className={'task-priority-badge '+task.priority}>{priorityLabels[task.priority]??task.priority}</span>
            {late&&<span className="task-late-badge"><AlertTriangle size={13}/> متأخرة</span>}</div>
          {editingManualTaskId === task.id ? (
            <div className="task-card-text-editor">
              <label>
                <span>عنوان المهمة اليدوية</span>
                <input
                  aria-label={'عنوان المهمة المعدّل: ' + task.title}
                  maxLength={240}
                  value={manualTaskDrafts[task.id]?.title ?? task.title}
                  disabled={busy}
                  onChange={(event) => setManualTaskDrafts((current) => ({
                    ...current,
                    [task.id]: { title: event.target.value, description: current[task.id]?.description ?? task.description ?? '' },
                  }))}
                />
              </label>
              <label>
                <span>تفاصيل المهمة</span>
                <textarea
                  aria-label={'تفاصيل المهمة المعدّلة: ' + task.title}
                  rows={3}
                  maxLength={2000}
                  value={manualTaskDrafts[task.id]?.description ?? task.description ?? ''}
                  disabled={busy}
                  onChange={(event) => setManualTaskDrafts((current) => ({
                    ...current,
                    [task.id]: { title: current[task.id]?.title ?? task.title, description: event.target.value },
                  }))}
                />
              </label>
              <div className="task-card-text-actions">
                <button type="button" className="btn primary" disabled={busy || !(manualTaskDrafts[task.id]?.title ?? task.title).trim()} onClick={() => void saveManualTaskEdit(task)}>حفظ النص</button>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => cancelManualTaskEdit(task.id)}>إلغاء تعديل النص</button>
              </div>
            </div>
          ) : (
            <>
              <h2>{task.title}</h2><p>{task.description??'لا توجد تفاصيل إضافية مسجلة.'}</p>
              {canManage && task.task_type === 'manual_operational_task' && !task.source_entity_type && !task.source_entity_id && !['completed','cancelled'].includes(task.status) && (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy || (editingManualTaskId !== null && editingManualTaskId !== task.id)}
                  onClick={() => beginManualTaskEdit(task)}
                >تعديل نص المهمة</button>
              )}
            </>
          )}
          <div className="task-card-metadata">
            <span><CalendarClock size={14}/> الموعد: {dateText(task.due_at)}</span>
            <span><UserCheck size={14}/> المسؤول: {assigned}</span>
            <span><ClipboardList size={14}/> المصدر: {source} {sourceId!=='—'?'#'+sourceId:''}</span>
            <span><Clock3 size={14}/> أُنشئت: {dateText(task.created_at)}</span>
            {task.completed_at&&<span><CheckCircle2 size={14}/> أُنجزت: {dateText(task.completed_at)}</span>}
            {task.resolution_note&&<span className="task-resolution">{task.resolution_note}</span>}
          </div>
        </div>
        {canManage && (
          <div className="task-card-quality-review" style={{ marginTop: 14 }}>
            <TaskQualityReviewForm
              key={task.id}
              taskId={task.id}
              taskUpdatedAt={task.updated_at}
              onSaved={refreshQualityAfterReview}
            />
          </div>
        )}
        <div className="task-card-actions">
          {canManage && !['completed','cancelled'].includes(task.status) && (() => {
            const draft = taskDetailsDraft(task);
            const nextDueAt = draft.dueAt ? new Date(draft.dueAt).toISOString() : null;
            const sameDueAt = nextDueAt === null
              ? task.due_at === null
              : task.due_at !== null && Date.parse(nextDueAt) === Date.parse(task.due_at);
            const unchanged = draft.priority === task.priority && sameDueAt;
            return (
              <div className="task-card-detail-editor">
                <label>
                  <span>الأولوية</span>
                  <select
                    aria-label={'أولوية المهمة: ' + task.title}
                    value={draft.priority}
                    disabled={busy}
                    onChange={(event) => setTaskDetailDrafts((current) => ({
                      ...current,
                      [task.id]: { ...taskDetailsDraft(task), priority: event.target.value as OperationalTask['priority'] },
                    }))}
                  >
                    <option value="low">منخفضة</option>
                    <option value="medium">متوسطة</option>
                    <option value="high">مرتفعة</option>
                    <option value="critical">حرجة</option>
                  </select>
                </label>
                <label>
                  <span>موعد الاستحقاق</span>
                  <input
                    type="datetime-local"
                    aria-label={'موعد استحقاق المهمة: ' + task.title}
                    value={draft.dueAt}
                    disabled={busy}
                    onChange={(event) => setTaskDetailDrafts((current) => ({
                      ...current,
                      [task.id]: { ...taskDetailsDraft(task), dueAt: event.target.value },
                    }))}
                  />
                </label>
                <button type="button" className="btn secondary" disabled={busy || unchanged} onClick={() => void saveTaskDetails(task)}>حفظ التفاصيل</button>
              </div>
            );
          })()}
          {canManage && !['completed','cancelled'].includes(task.status) && (
            <label className="task-card-assignment">
              <span>تعديل إسناد المهمة</span>
              <select
                aria-label={'المسؤول الجديد للمهمة: ' + task.title}
                value={selectedAssignee}
                disabled={busy || assigneesLoading || Boolean(assigneesError)}
                onChange={(event) => setAssigneeDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
              >
                <option value="">إعادتها إلى قائمة الدور</option>
                {currentAssigneeMissing && <option value={task.assigned_to!}>المسؤول الحالي غير موجود ضمن الموظفين النشطين</option>}
                {compatibleTaskAssignees.map((assignee) => (
                  <option key={assignee.profile_id} value={assignee.profile_id}>{assignee.full_name}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn secondary"
                disabled={busy || assigneesLoading || Boolean(assigneesError) || selectedAssignee === (task.assigned_to ?? '')}
                onClick={() => void saveTaskAssignee(task)}
              >حفظ الإسناد</button>
              {assigneesError && <small role="status">تعذر تحميل الموظفين المصرح لهم؛ لم يُسمح بتغيير الإسناد.</small>}
            </label>
          )}
          {canManage && !['completed','cancelled'].includes(task.status) && (
            cancellingTaskId === task.id ? (
              <div className="task-card-cancel-editor">
                <label>
                  <span>سبب الإلغاء — حقل إلزامي</span>
                  <textarea
                    aria-label={'سبب إلغاء المهمة: ' + task.title}
                    rows={2}
                    maxLength={1000}
                    value={cancellationDrafts[task.id] ?? ''}
                    disabled={busy}
                    onChange={(event) => setCancellationDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                  />
                </label>
                <button type="button" className="btn danger" disabled={busy || !(cancellationDrafts[task.id] ?? '').trim()} onClick={() => void confirmTaskCancellation(task)}>تأكيد الإلغاء</button>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => closeTaskCancellation(task.id)}>تراجع</button>
              </div>
            ) : (
              <button type="button" className="btn danger" disabled={busy || cancellingTaskId !== null} onClick={() => setCancellingTaskId(task.id)}>إلغاء المهمة</button>
            )
          )}
          {task.status==='pending'&&<button type="button" className="btn secondary" disabled={busy || completingTaskId !== null} onClick={() => void performStatus(task,'in_progress')}><Play size={15}/> استلام</button>}
          {['pending','in_progress'].includes(task.status) && completingTaskId !== task.id && (
            <button type="button" className="btn primary" disabled={busy || completingTaskId !== null} onClick={() => beginTaskCompletion(task)}>
              <CheckCircle2 size={15}/> {task.status==='pending'?'إنجاز مباشر':'إنجاز'}
            </button>
          )}
          {completingTaskId === task.id && (
            <div className="task-card-completion-editor">
              <label>
                <span>ملخص التنفيذ والنتيجة — مطلوب للإغلاق</span>
                <textarea
                  aria-label={'نتيجة تنفيذ المهمة: ' + task.title}
                  rows={3}
                  maxLength={1000}
                  value={completionDrafts[task.id] ?? ''}
                  disabled={busy}
                  onChange={(event) => setCompletionDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                  placeholder="سجّل ما تم تنفيذه والنتيجة أو الإجراء المتبقي"
                />
              </label>
              <button type="button" className="btn primary" disabled={busy || !(completionDrafts[task.id] ?? '').trim()} onClick={() => void confirmTaskCompletion(task)}>حفظ النتيجة وإغلاق المهمة</button>
              <button type="button" className="btn secondary" disabled={busy} onClick={() => closeTaskCompletion(task.id)}>إلغاء</button>
            </div>
          )}
          {canManage&&['completed','cancelled'].includes(task.status)&&<button type="button" className="btn secondary" disabled={busy} onClick={() => void performStatus(task,'pending')}><RefreshCw size={15}/> إعادة فتح</button>}
        </div>
      </article>;
    })}</div>}
    <div className="operational-task-print" dir="rtl" aria-hidden="true">
      <header><h1>{operationalTaskPrintTitle()}</h1>
        <p>تاريخ الطباعة: {new Date().toLocaleString('ar-YE')}</p>
        <p>نطاق الطباعة: {printScopeLabel} — فلتر الدور على الشاشة: {roleFilter==='all'?'كل الأدوار المسموحة':roleLabels[roleFilter]} — الحالة: {statusFilter==='open'?'المفتوحة':statusLabels[statusFilter]??'كل الحالات'} — الأولوية: {priorityFilter==='all'?'كل الأولويات':priorityLabels[priorityFilter]} — العدد: {printable.length}</p>
        <p>المسؤول: {assigneeFilter==='all'?'كل المسؤولين':assigneeFilter==='unassigned'?'غير مسندة':assigneeById.get(assigneeFilter)?.full_name??'الموظف المحدد'} — فترة الإنشاء: {createdFrom||'بلا بداية'} إلى {createdTo||'بلا نهاية'} — موعد الاستحقاق: {dueFrom||'بلا بداية'} إلى {dueTo||'بلا نهاية'}{overdueOnly?' — المتأخرة فقط':''}</p>
        {search.trim()&&<p>بحث: {search.trim()}</p>}</header>
      <section className="task-print-summary">
        <h2>الملخص التنفيذي للكشف</h2>
        <div className="task-print-summary-cards">
          <div><span>إجمالي المهام المطبوعة</span><strong>{printableSummary.total.toLocaleString('ar-YE')}</strong></div>
          <div><span>المفتوحة</span><strong>{printableSummary.open.toLocaleString('ar-YE')}</strong></div>
          <div><span>المتأخرة</span><strong>{printableSummary.late.toLocaleString('ar-YE')}</strong></div>
          <div><span>الحرجة</span><strong>{printableSummary.critical.toLocaleString('ar-YE')}</strong></div>
          <div><span>المكتملة</span><strong>{printableSummary.completed.toLocaleString('ar-YE')}</strong></div>
        </div>
        {canManage && <table className="task-print-role-summary">
          <thead><tr><th>الدور</th><th>إجمالي المهام</th><th>المفتوحة</th><th>المتأخرة</th></tr></thead>
          <tbody>{printableRoleSummary.map((row) => <tr key={row.role}>
            <td>{roleLabels[row.role]}</td><td>{row.total.toLocaleString('ar-YE')}</td>
            <td>{row.open.toLocaleString('ar-YE')}</td><td>{row.late.toLocaleString('ar-YE')}</td>
          </tr>)}</tbody>
        </table>}
      </section>
      <table><thead><tr><th>#</th><th>المهمة والإجراء</th><th>الدور</th><th>الأولوية</th><th>الحالة</th><th>الموعد المسجل</th><th>المصدر</th><th>المسؤول</th></tr></thead>
        <tbody>{printable.map((task,index) => <tr key={task.id}><td>{index+1}</td><td><strong>{task.title}</strong><br/>{task.description??'—'}{task.resolution_note?<><br/>النتيجة: {task.resolution_note}</>:null}</td>
          <td>{roleLabels[task.task_role]}</td><td>{priorityLabels[task.priority]??task.priority}</td><td>{statusLabels[task.status]??task.status}</td><td>{dateText(task.due_at)}</td>
          <td>{task.source_entity_type?entityLabels[task.source_entity_type]??task.source_entity_type:'يدوية'}</td><td>{task.assigned_label}</td></tr>)}</tbody>
      </table>
      <footer>تعرض هذه القائمة سجلات التشغيل الحالية؛ لا تُنشأ مواعيد غير مسجلة في المصدر.</footer>
    </div>
    {canManage && <CustomerReturnReviewQueue onNotice={onNotice} />}
    {(canManage || roles.includes('staff')) && <CustomerReturnReceiptQueue onNotice={onNotice} />}
    {roles.some((role) => ['admin','manager','accountant'].includes(role)) && <CustomerReturnCreditMemoQueue onNotice={onNotice} />}
  </section>;
}