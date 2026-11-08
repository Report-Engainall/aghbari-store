import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, BellRing, CalendarClock, ClipboardList, Download, Filter,
  Headphones, Printer, RefreshCw, Search, ShieldAlert, UserRound, Users,
} from "lucide-react";
import { Button, Empty, ErrorBox, Loading } from "@/components/AdminPages";
import { useAuth } from "@/lib/auth";
import { CustomerServiceConversation } from "@/components/CustomerServiceConversation";
import { fetchOperationalTaskAssignees } from "@/lib/api";
import type { OperationalTaskAssignee } from "@/lib/types";
import {
  manageCustomerServiceCaseOperations,
  updateCustomerServiceCase,
  type CustomerServiceCasePriority,
  type CustomerServiceCaseStatus,
} from "@/lib/customer-service-cases";
import { projectCustomerServiceDeskPrintDocument, type CustomerServiceDeskPrintDocument } from "@/lib/customer-service-desk-print";
import { downloadCustomerServiceDeskWorkbookXlsx } from "@/lib/customer-service-desk-xlsx";
import { CustomerServiceDeskPrintSheet } from "@/components/CustomerServiceDeskPrintSheet";
import {
  fetchCustomerServiceDeskPage,
  type CustomerServiceAssignmentFilter,
  type CustomerServiceDeskCase,
  type CustomerServiceDeskCursor,
  type CustomerServiceDeskFilters,
  type CustomerServiceDeskSummary,
  type CustomerServiceQueueStatus,
} from "@/lib/customer-service-desk";

const priorityLabels: Record<CustomerServiceCasePriority,string> = {
  low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة",
};
const statusLabels: Record<CustomerServiceCaseStatus,string> = {
  open: "مفتوحة", in_progress: "قيد المعالجة", waiting_customer: "بانتظار العميل",
  resolved: "تم الحل", closed: "مغلقة",
};
const typeLabels: Record<string,string> = {
  complaint: "شكوى", inquiry: "استفسار", service_request: "طلب خدمة",
  delivery_issue: "مشكلة تسليم", other: "أخرى",
};

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
    "T" + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
}
function fromLocalDateTime(value: string): string {
  const parsed = new Date(value);
  if (!value || !Number.isFinite(parsed.getTime())) throw new Error("أدخل موعدًا صالحًا.");
  return parsed.toISOString();
}
function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "غير محدد";
  return new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}
function isActive(status: CustomerServiceCaseStatus): boolean {
  return status !== "resolved" && status !== "closed";
}

function Metric({ icon: Icon, label, value, tone = "default" }: {
  icon: typeof Headphones; label: string; value: number; tone?: "default" | "warning" | "danger";
}) {
  return <article className={"customer-service-desk-metric tone-" + tone}>
    <span><Icon size={17} />{label}</span><strong>{value.toLocaleString("ar-YE")}</strong>
  </article>;
}

function DeskCaseCard({ item, canManage, assignees, onRefresh, onOpenTask, onNotice }: {
  item: CustomerServiceDeskCase;
  canManage: boolean;
  assignees: OperationalTaskAssignee[];
  onRefresh: () => Promise<void>;
  onOpenTask: (taskId: string) => void;
  onNotice: (message: string) => void;
}) {
  const [status, setStatus] = useState<CustomerServiceCaseStatus>(item.status);
  const [statusNote, setStatusNote] = useState("");
  const [assignedTo, setAssignedTo] = useState(item.assigned_to_id || "");
  const [responseDueAt, setResponseDueAt] = useState(() => toLocalDateTime(item.response_due_at));
  const [resolutionDueAt, setResolutionDueAt] = useState(() => toLocalDateTime(item.resolution_due_at));
  const [escalationNote, setEscalationNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus(item.status);
    setStatusNote("");
    setAssignedTo(item.assigned_to_id || "");
    setResponseDueAt(toLocalDateTime(item.response_due_at));
    setResolutionDueAt(toLocalDateTime(item.resolution_due_at));
    setEscalationNote("");
  }, [item.case_id, item.status, item.assigned_to_id, item.response_due_at, item.resolution_due_at, item.escalation_level]);

  const active = isActive(item.status);
  const responseOverdue = active && !item.first_response_at && Date.parse(item.response_due_at) < Date.now();
  const resolutionOverdue = active && Date.parse(item.resolution_due_at) < Date.now();

  async function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === item.status && !statusNote.trim()) return;
    if ((status === "resolved" || status === "closed") && status !== item.status && !statusNote.trim()) {
      setError("يجب تسجيل نتيجة المعالجة قبل حل الحالة أو إغلاقها.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateCustomerServiceCase({ caseId: item.case_id, status, note: statusNote.trim() || null });
      onNotice("تم تحديث " + item.case_code + " وحُفظ سجل الإجراء.");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث الحالة.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOperations(escalate: boolean) {
    if (!item.task_id) {
      setError("لا توجد مهمة تشغيلية مرتبطة بالحالة.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await manageCustomerServiceCaseOperations({
        caseId: item.case_id,
        assignedTo: assignedTo || null,
        responseDueAt: fromLocalDateTime(responseDueAt),
        resolutionDueAt: fromLocalDateTime(resolutionDueAt),
        escalate,
        note: escalate ? escalationNote : null,
      });
      setEscalationNote("");
      onNotice(escalate ? "تم تصعيد " + item.case_code + " وإشعار الإدارة." : "تم تحديث مسؤول ومواعيد " + item.case_code + ".");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث إسناد الحالة ومواعيدها.");
    } finally {
      setSaving(false);
    }
  }

  return <article className="customer-service-desk-card">
    <div className="customer-service-desk-card-heading">
      <div className="customer-service-desk-case-title">
        <strong>{item.subject}</strong>
        <div className="customer-service-desk-meta">
          <span>{item.case_code}</span><span>{item.customer_name}</span>
          {item.customer_code && <span>{item.customer_code}</span>}
          <span>{typeLabels[item.case_type] || item.case_type}</span>
          <span>الأولوية: {priorityLabels[item.priority]}</span>
          {item.escalation_level > 0 && <span className="customer-service-desk-escalation">تصعيد {item.escalation_level}</span>}
        </div>
      </div>
      <span className={"customer-service-desk-status status-" + item.status}>{statusLabels[item.status]}</span>
    </div>
    <p className="customer-service-desk-description">{item.description}</p>
    <div className="customer-service-desk-deadlines">
      <div className={responseOverdue ? "is-overdue" : ""}>
        <span>الاستجابة الأولى</span><strong>{formatDateTime(item.response_due_at)}</strong>
        <small>{item.first_response_at ? "تمت: " + formatDateTime(item.first_response_at) : responseOverdue ? "متأخرة" : "بانتظار الاستجابة"}</small>
      </div>
      <div className={resolutionOverdue ? "is-overdue" : ""}>
        <span>موعد الحل</span><strong>{formatDateTime(item.resolution_due_at)}</strong>
        <small>{active ? resolutionOverdue ? "متأخر عن الموعد" : "قيد المهلة" : "أُنجزت المعالجة"}</small>
      </div>
      <div>
        <span>المسؤول</span><strong>{item.assigned_to_name}</strong>
        <small>{item.task_id ? "مرتبطة بمهمة تشغيلية" : "لم تُنشأ مهمة مرتبطة"}</small>
      </div>
      <div>
        <span>تاريخ الفتح</span><strong>{formatDateTime(item.created_at)}</strong>
        <small>فتحها: {item.created_by_name}</small>
      </div>
    </div>

    <form className="customer-service-desk-status-form" onSubmit={event => { void saveStatus(event); }}>
      <label><span>تحديث الحالة</span>
        <select value={status} disabled={saving} onChange={event => setStatus(event.target.value as CustomerServiceCaseStatus)}>
          {Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="customer-service-desk-status-note"><span>نتيجة أو ملاحظة الإجراء</span>
        <input value={statusNote} maxLength={1000} disabled={saving} onChange={event => setStatusNote(event.target.value)}
          placeholder="مطلوب عند الحل أو الإغلاق" />
      </label>
      <Button disabled={saving || (status === item.status && !statusNote.trim())}>{saving ? "جارٍ الحفظ…" : "حفظ الحالة"}</Button>
      {item.task_id && <button type="button" className="btn secondary" disabled={saving} onClick={() => onOpenTask(item.task_id!)}><ClipboardList size={15} /> المهمة</button>}
    </form>

    <CustomerServiceConversation caseId={item.case_id} status={item.status} onReplied={onRefresh} />
    {canManage && active && <details className="customer-service-desk-management">
      <summary><UserRound size={15} /> إسناد ومواعيد وتصعيد</summary>
      <div className="customer-service-desk-management-grid">
        <label><span>الموظف المسؤول</span>
          <select value={assignedTo} disabled={saving} onChange={event => setAssignedTo(event.target.value)}>
            <option value="">إزالة الإسناد</option>
            {assignees.map(person => <option key={person.profile_id} value={person.profile_id}>{person.full_name}</option>)}
          </select>
        </label>
        <label><span>آخر موعد للاستجابة</span>
          <input type="datetime-local" step={1} value={responseDueAt} disabled={saving} onChange={event => setResponseDueAt(event.target.value)} />
        </label>
        <label><span>آخر موعد للحل</span>
          <input type="datetime-local" step={1} value={resolutionDueAt} disabled={saving} onChange={event => setResolutionDueAt(event.target.value)} />
        </label>
      </div>
      <div className="customer-service-desk-management-actions">
        <Button variant="secondary" disabled={saving || !item.task_id} onClick={() => { void saveOperations(false); }}>حفظ الإسناد والمواعيد</Button>
        <label className="customer-service-desk-escalation-reason"><span>سبب التصعيد</span>
          <input value={escalationNote} maxLength={1000} disabled={saving} onChange={event => setEscalationNote(event.target.value)}
            placeholder="سبب واضح للإدارة" />
        </label>
        <Button disabled={saving || !item.task_id || !escalationNote.trim()} onClick={() => { void saveOperations(true); }}>
          <BellRing size={15} /> تصعيد للإدارة
        </Button>
      </div>
    </details>}
    {error && <ErrorBox message={error} />}
  </article>;
}

const defaultFilters: CustomerServiceDeskFilters = {
  status: "active", priority: "all", assignment: "all", overdueOnly: false, search: "",
};
const emptySummary: CustomerServiceDeskSummary = {
  open_count: 0, response_overdue_count: 0, resolution_overdue_count: 0,
  unassigned_count: 0, urgent_count: 0, high_count: 0,
};

export function CustomerServiceDesk({ onNotice, onOpenTask }: {
  onNotice: (message: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { user } = useAuth();
  const canManage = Boolean(user?.roles.some(role => role === "admin" || role === "manager"));
  const [filters, setFilters] = useState<CustomerServiceDeskFilters>(defaultFilters);
  const [searchDraft, setSearchDraft] = useState("");
  const [items, setItems] = useState<CustomerServiceDeskCase[]>([]);
  const [summary, setSummary] = useState<CustomerServiceDeskSummary>(emptySummary);
  const [cursor, setCursor] = useState<CustomerServiceDeskCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [assignees, setAssignees] = useState<OperationalTaskAssignee[]>([]);
  const [printDocument, setPrintDocument] = useState<CustomerServiceDeskPrintDocument | null>(null);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await fetchCustomerServiceDeskPage({ filters, limit: 50 });
      setItems(page.items);
      setSummary(page.summary);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (cause) {
      setItems([]);
      setCursor(null);
      setHasMore(false);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل طابور خدمة العملاء.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void loadFirstPage(); }, [loadFirstPage]);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    fetchOperationalTaskAssignees().then(rows => {
      if (active) setAssignees(rows);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل الموظفين للإسناد.");
    });
    return () => { active = false; };
  }, [canManage]);

  useEffect(() => {
    if (!printDocument || typeof window === "undefined" ||
        typeof document === "undefined" || typeof window.print !== "function") return;
    const body = document.body;
    const previousMode = body.getAttribute("data-print-mode");
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      if (previousMode === null) body.removeAttribute("data-print-mode");
      else body.setAttribute("data-print-mode", previousMode);
      window.removeEventListener("afterprint", restore);
      setPrintDocument(null);
    };
    body.setAttribute("data-print-mode", "customer-service-desk-report");
    window.addEventListener("afterprint", restore, { once: true });
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        setError("تعذر فتح نافذة طباعة تقرير خدمة العملاء.");
        restore();
      }
    }, 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", restore);
      if (!restored && body.getAttribute("data-print-mode") === "customer-service-desk-report") {
        if (previousMode === null) body.removeAttribute("data-print-mode");
        else body.setAttribute("data-print-mode", previousMode);
      }
    };
  }, [printDocument]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchCustomerServiceDeskPage({ filters, cursor, limit: 50 });
      setItems(current => {
        const seen = new Set(current.map(item => item.case_id));
        return [...current, ...page.items.filter(item => !seen.has(item.case_id))];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل بقية الحالات.");
    } finally {
      setLoadingMore(false);
    }
  }

  function updateFilter<K extends keyof CustomerServiceDeskFilters>(key: K, value: CustomerServiceDeskFilters[K]) {
    setFilters(current => ({ ...current, [key]: value }));
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateFilter("search", searchDraft.trim());
  }

  const activeCases = items.filter(item => isActive(item.status));

  function createReportDocument(): CustomerServiceDeskPrintDocument {
    return projectCustomerServiceDeskPrintDocument({ items, summary, filters, hasMore });
  }
  function exportServiceDeskReport() {
    setError("");
    if (!canManage) return;
    if (loading || items.length === 0) {
      setError("حمّل بيانات طابور خدمة العملاء قبل استخراج التقرير.");
      return;
    }
    try {
      downloadCustomerServiceDeskWorkbookXlsx(createReportDocument());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف Excel لطابور خدمة العملاء.");
    }
  }
  function printServiceDeskReport() {
    setError("");
    if (!canManage) return;
    if (loading || items.length === 0 || typeof window === "undefined" || typeof window.print !== "function") {
      setError("لا تتوفر لقطة بيانات صالحة أو وظيفة الطباعة في هذه البيئة.");
      return;
    }
    try {
      setPrintDocument(createReportDocument());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز تقرير طباعة خدمة العملاء.");
    }
  }

  return <>
  <section className="customer-service-desk" dir="rtl">
    <header className="customer-service-desk-hero">
      <div>
        <span><Headphones size={16} /> مركز خدمة العملاء</span>
        <h1>طابور خدمة العملاء الموحد</h1>
        <p>شكاوى واستفسارات وطلبات الخدمة من جميع العملاء في مساحة تشغيل واحدة، مع الاستحقاق والمسؤول وسجل المهمة المرتبطة.</p>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {canManage && <>
          <Button variant="secondary" disabled={loading || items.length === 0} onClick={exportServiceDeskReport}><Download size={15} /> تصدير Excel</Button>
          <Button variant="secondary" disabled={loading || items.length === 0} onClick={printServiceDeskReport}><Printer size={15} /> طباعة / PDF</Button>
        </>}
        <Button variant="secondary" disabled={loading} onClick={() => { void loadFirstPage(); }}><RefreshCw size={16} /> تحديث الطابور</Button>
      </div>
    </header>

    <div className="customer-service-desk-metrics">
      <Metric icon={Headphones} label="الحالات المفتوحة" value={summary.open_count} />
      <Metric icon={AlertTriangle} label="تجاوزت الاستجابة" value={summary.response_overdue_count} tone={summary.response_overdue_count ? "danger" : "default"} />
      <Metric icon={CalendarClock} label="تجاوزت موعد الحل" value={summary.resolution_overdue_count} tone={summary.resolution_overdue_count ? "danger" : "default"} />
      <Metric icon={UserRound} label="غير مسندة" value={summary.unassigned_count} tone={summary.unassigned_count ? "warning" : "default"} />
      <Metric icon={ShieldAlert} label="عاجلة" value={summary.urgent_count} tone={summary.urgent_count ? "warning" : "default"} />
    </div>

    <section className="customer-service-desk-filters">
      <div className="customer-service-desk-filter-heading"><Filter size={16} /><strong>تصفية طابور الحالات</strong><span>ملخص المؤشرات يعرض كامل الحالات المفتوحة في المؤسسة</span></div>
      <form className="customer-service-desk-search" onSubmit={applySearch}>
        <label><Search size={16} /><input value={searchDraft} onChange={event => setSearchDraft(event.target.value)}
          placeholder="ابحث برقم الحالة أو موضوعها أو اسم العميل أو كوده" maxLength={160} /></label>
        <Button disabled={loading}>بحث</Button>
      </form>
      <div className="customer-service-desk-filter-grid">
        <label><span>سير الحالة</span>
          <select value={filters.status} onChange={event => updateFilter("status",event.target.value as CustomerServiceQueueStatus)}>
            <option value="active">الحالات النشطة</option><option value="all">كل الحالات</option>
            <option value="open">مفتوحة</option><option value="in_progress">قيد المعالجة</option>
            <option value="waiting_customer">بانتظار العميل</option><option value="resolved">تم الحل</option><option value="closed">مغلقة</option>
          </select>
        </label>
        <label><span>الأولوية</span>
          <select value={filters.priority} onChange={event => updateFilter("priority",event.target.value as CustomerServiceCasePriority | "all")}>
            <option value="all">كل الأولويات</option><option value="urgent">عاجلة</option><option value="high">عالية</option>
            <option value="medium">متوسطة</option><option value="low">منخفضة</option>
          </select>
        </label>
        <label><span>الإسناد</span>
          <select value={filters.assignment} onChange={event => updateFilter("assignment",event.target.value as CustomerServiceAssignmentFilter)}>
            <option value="all">الكل</option><option value="assigned">مسندة إلى موظف</option><option value="unassigned">غير مسندة</option>
          </select>
        </label>
        <label className="customer-service-desk-overdue-filter">
          <input type="checkbox" checked={filters.overdueOnly} onChange={event => updateFilter("overdueOnly",event.target.checked)} />
          <span>المتأخرة فقط</span>
        </label>
      </div>
    </section>

    {error && <ErrorBox message={error} />}
    <div className="customer-service-desk-results-heading">
      <div><h2>الحالات</h2><span>المعروض {items.length.toLocaleString("ar-YE")} · نشطة في هذه الصفحة {activeCases.length.toLocaleString("ar-YE")}</span></div>
      {canManage && <span><Users size={15} /> أدوات الإسناد والتصعيد متاحة للمديرين</span>}
    </div>
    {loading ? <Loading /> : items.length === 0 ? (
      <Empty text="لا توجد حالات مطابقة للمرشحات الحالية." />
    ) : <div className="customer-service-desk-list">
      {items.map(item => <DeskCaseCard key={item.case_id} item={item} canManage={canManage}
        assignees={assignees} onRefresh={loadFirstPage} onOpenTask={onOpenTask} onNotice={onNotice} />)}
    </div>}
    {hasMore && <div className="customer-service-desk-more">
      <Button variant="secondary" disabled={loadingMore || loading} onClick={() => { void loadMore(); }}>
        {loadingMore ? "جارٍ تحميل المزيد…" : "تحميل الحالات الأقدم"}
      </Button>
    </div>}
    <p className="customer-service-desk-footnote">يستخدم المركز السجلات التشغيلية الأصلية للحالات ومهامها؛ لا ينشئ نسخة ثانية من بيانات العميل أو طابور إسناد موازيًا.</p>
  </section>
  {printDocument && typeof document !== "undefined"
    ? createPortal(<CustomerServiceDeskPrintSheet document={printDocument} />, document.body)
    : null}
  </>;
}
