import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Empty, ErrorBox, Loading } from "@/components/AdminPages";
import { fetchOperationalTaskAssignees } from "@/lib/api";
import type { OperationalTaskAssignee } from "@/lib/types";
import {
  createCustomerServiceCase,
  fetchCustomerServiceCases,
  fetchCustomerServiceSlaPolicies,
  manageCustomerServiceCaseOperations,
  randomCaseRequestKey,
  setCustomerServiceSlaPolicy,
  updateCustomerServiceCase,
  type CustomerServiceCase,
  type CustomerServiceCaseStatus,
  type CustomerServiceCaseType,
  type CustomerServiceCasePriority,
  type CustomerServiceSlaPolicy,
} from "@/lib/customer-service-cases";
import { formatDateShort } from "@/lib/format";
import { CustomerServiceConversation } from "@/components/CustomerServiceConversation";

const typeLabels: Record<CustomerServiceCaseType,string> = {
  complaint: "شكوى", inquiry: "استفسار", service_request: "طلب خدمة",
  delivery_issue: "مشكلة تسليم", other: "أخرى",
};
const priorityLabels: Record<CustomerServiceCasePriority,string> = {
  low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة",
};
const statusLabels: Record<CustomerServiceCaseStatus,string> = {
  open: "مفتوحة", in_progress: "قيد المعالجة", waiting_customer: "بانتظار العميل",
  resolved: "تم الحل", closed: "مغلقة",
};
const eventLabels: Record<string,string> = {
  opened: "فتح الحالة", status_changed: "تغيير الحالة", priority_changed: "تغيير الأولوية",
  note_added: "إضافة ملاحظة", resolved: "حل الحالة", closed: "إغلاق الحالة",
  reopened: "إعادة فتح الحالة", assigned: "تغيير المسؤول", sla_updated: "تعديل مواعيد SLA",
  escalated: "تصعيد الحالة", customer_message_received: "استلام رد العميل", staff_reply_sent: "إرسال رد للعميل",
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
  return new Intl.DateTimeFormat("ar-YE", {
    dateStyle: "medium", timeStyle: "short",
  }).format(parsed);
}

function CustomerServiceCaseCard({
  item, onRefresh, assignees,
}: {
  item: CustomerServiceCase;
  onRefresh: () => Promise<void>;
  assignees: OperationalTaskAssignee[];
}) {
  const [status, setStatus] = useState<CustomerServiceCaseStatus>(item.status);
  const [note, setNote] = useState("");
  const [assignedTo, setAssignedTo] = useState(item.assigned_to_id || "");
  const [responseDueAt, setResponseDueAt] = useState(() => toLocalDateTime(item.response_due_at));
  const [resolutionDueAt, setResolutionDueAt] = useState(() => toLocalDateTime(item.resolution_due_at));
  const [escalationNote, setEscalationNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setStatus(item.status);
    setNote("");
    setAssignedTo(item.assigned_to_id || "");
    setResponseDueAt(toLocalDateTime(item.response_due_at));
    setResolutionDueAt(toLocalDateTime(item.resolution_due_at));
    setEscalationNote("");
  }, [item.id, item.status, item.assigned_to_id, item.response_due_at, item.resolution_due_at, item.escalation_level]);

  async function saveUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === item.status && !note.trim()) return;
    if ((status === "resolved" || status === "closed") && status !== item.status && !note.trim()) {
      setError("اكتب ملخص الحل قبل إنهاء الحالة.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateCustomerServiceCase({ caseId: item.id, status, note: note.trim() || null });
      setNote("");
      setNotice("حُفظ تحديث الحالة وسجل الحدث.");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث حالة خدمة العميل.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOperations(escalate: boolean) {
    if (!item.task_id) {
      setError("لا توجد مهمة تشغيلية مرتبطة بهذه الحالة؛ يلزم ربط المهمة قبل إسنادها.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await manageCustomerServiceCaseOperations({
        caseId: item.id,
        assignedTo: assignedTo || null,
        responseDueAt: fromLocalDateTime(responseDueAt),
        resolutionDueAt: fromLocalDateTime(resolutionDueAt),
        escalate,
        note: escalate ? escalationNote : null,
      });
      setEscalationNote("");
      setNotice(escalate ? "تم تصعيد الحالة وإشعار الإدارة." : "تم حفظ المسؤول ومواعيد SLA ومزامنتها مع المهمة.");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ إسناد الحالة ومواعيدها.");
    } finally {
      setSaving(false);
    }
  }

  const activeCase = item.status !== "resolved" && item.status !== "closed";
  const responseOverdue = activeCase && !item.first_response_at && Date.parse(item.response_due_at) < Date.now();
  const resolutionOverdue = activeCase && Date.parse(item.resolution_due_at) < Date.now();

  return (
    <article className="customer-service-case">
      <div className="customer-service-case-heading">
        <div>
          <strong>{item.subject}</strong>
          <div className="customer-service-case-meta">
            <span>{item.case_code}</span><span>{typeLabels[item.case_type]}</span>
            <span>الأولوية: {priorityLabels[item.priority]}</span>
            {item.escalation_level > 0 && <span className="customer-service-case-escalation">مستوى التصعيد {item.escalation_level}</span>}
          </div>
        </div>
        <span className={"customer-service-case-status status-" + item.status}>{statusLabels[item.status]}</span>
      </div>
      <p className="customer-service-case-description">{item.description}</p>
      <div className="customer-service-case-meta">
        <span>فتحها: {item.created_by_name}</span>
        <span>تاريخ الفتح: {formatDateShort(item.created_at)}</span>
        <span>المسؤول: {item.assigned_to_name}</span>
        {item.first_response_at && <span>أول استجابة: {formatDateTime(item.first_response_at)}</span>}
        {item.resolved_at && <span>حُلّت: {formatDateShort(item.resolved_at)}</span>}
        {item.closed_at && <span>أُغلقت: {formatDateShort(item.closed_at)}</span>}
      </div>

      <div className="customer-service-case-sla">
        <div className={responseOverdue ? "is-overdue" : ""}>
          <span>موعد أول استجابة</span>
          <strong>{formatDateTime(item.response_due_at)}</strong>
          <small>{item.first_response_at ? "تم تسجيل أول استجابة" : responseOverdue ? "تجاوز موعد الاستجابة" : "ضمن مهلة الاستجابة"}</small>
        </div>
        <div className={resolutionOverdue ? "is-overdue" : ""}>
          <span>موعد المعالجة النهائي</span>
          <strong>{formatDateTime(item.resolution_due_at)}</strong>
          <small>{item.status === "resolved" || item.status === "closed" ? "أُنجزت المعالجة" : resolutionOverdue ? "الحالة متأخرة عن الموعد" : "ضمن مهلة المعالجة"}</small>
        </div>
      </div>
      {item.escalated_at && <p className="customer-service-case-resolution">آخر تصعيد: {formatDateTime(item.escalated_at)}</p>}
      {item.resolution_note && <p className="customer-service-case-resolution">ملخص الحل: {item.resolution_note}</p>}

      <form className="customer-service-case-update" onSubmit={event => { void saveUpdate(event); }}>
        <label>
          <span>تحديث سير الحالة</span>
          <select value={status} disabled={saving} onChange={event => setStatus(event.target.value as CustomerServiceCaseStatus)}>
            {Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="customer-service-case-note">
          <span>ملاحظة أو ملخص الحل</span>
          <input value={note} maxLength={1000} disabled={saving}
            onChange={event => setNote(event.target.value)}
            placeholder="سبب التحديث أو نتيجة المعالجة؛ إلزامي عند الحل والإغلاق" />
        </label>
        <Button disabled={saving || (status === item.status && !note.trim())}>
          {saving ? "جارٍ الحفظ…" : "حفظ التحديث"}
        </Button>
      </form>

      {item.can_manage && (
        <div className="customer-service-case-manager">
          <div className="customer-service-case-manager-heading">
            <strong>إدارة المسؤول ومواعيد الخدمة</strong>
            <span>يُزامن موعد الحل مع استحقاق المهمة التشغيلية</span>
          </div>
          <div className="customer-service-case-manager-grid">
            <label>
              <span>الموظف المسؤول</span>
              <select value={assignedTo} disabled={saving || !activeCase} onChange={event => setAssignedTo(event.target.value)}>
                <option value="">إزالة الإسناد</option>
                {assignees.map(person => <option key={person.profile_id} value={person.profile_id}>{person.full_name}</option>)}
              </select>
            </label>
            <label>
              <span>آخر موعد للاستجابة الأولى</span>
              <input type="datetime-local" step={1} value={responseDueAt} disabled={saving || !activeCase}
                onChange={event => setResponseDueAt(event.target.value)} />
            </label>
            <label>
              <span>آخر موعد للحل</span>
              <input type="datetime-local" step={1} value={resolutionDueAt} disabled={saving || !activeCase}
                onChange={event => setResolutionDueAt(event.target.value)} />
            </label>
          </div>
          <div className="customer-service-case-manager-actions">
            <Button variant="secondary" disabled={saving || !activeCase || !item.task_id}
              onClick={() => { void saveOperations(false); }}>حفظ الإسناد والمواعيد</Button>
          </div>
          <div className="customer-service-case-escalate">
            <label>
              <span>سبب التصعيد للإدارة</span>
              <input value={escalationNote} maxLength={1000} disabled={saving || !activeCase}
                onChange={event => setEscalationNote(event.target.value)} placeholder="اذكر سبب التصعيد والإجراء المطلوب" />
            </label>
            <Button disabled={saving || !activeCase || !item.task_id || !escalationNote.trim()}
              onClick={() => { void saveOperations(true); }}>تصعيد الحالة وإشعار الإدارة</Button>
          </div>
        </div>
      )}

      {notice && <p className="customer-service-case-notice" role="status">{notice}</p>}
      {error && <ErrorBox message={error} />}
      <CustomerServiceConversation caseId={item.id} status={item.status} onReplied={onRefresh} />
      {item.events.length > 0 && (
        <details className="customer-service-case-history">
          <summary>سجل الأحداث ({item.events.length})</summary>
          <ol>
            {item.events.map(event => (
              <li key={event.id}>
                <strong>{eventLabels[event.event_type] || event.event_type}</strong>
                <span>{event.actor_name} · {formatDateShort(event.created_at)}</span>
                {event.note && <p>{event.note}</p>}
              </li>
            ))}
          </ol>
          <small>يعرض آخر 10 أحداث لهذه الحالة.</small>
        </details>
      )}
    </article>
  );
}

function CustomerServiceSlaSettings({ policies, onSaved }: {
  policies: CustomerServiceSlaPolicy[];
  onSaved: (policy: CustomerServiceSlaPolicy) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string,{response:string;resolution:string}>>({});
  const [savingPriority, setSavingPriority] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setDrafts(Object.fromEntries(policies.map(policy => [policy.priority, {
      response: String(policy.first_response_minutes),
      resolution: String(policy.resolution_minutes),
    }])));
  }, [policies]);

  async function save(policy: CustomerServiceSlaPolicy) {
    const draft = drafts[policy.priority];
    if (!draft) return;
    setSavingPriority(policy.priority);
    setError("");
    setNotice("");
    try {
      const saved = await setCustomerServiceSlaPolicy({
        priority: policy.priority,
        firstResponseMinutes: Number(draft.response),
        resolutionMinutes: Number(draft.resolution),
      });
      onSaved(saved);
      setNotice("حُفظت سياسة الأولوية " + priorityLabels[policy.priority] + ". ستطبق على الحالات الجديدة.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ سياسة SLA.");
    } finally {
      setSavingPriority("");
    }
  }

  return (
    <details className="customer-service-sla-settings">
      <summary>إعداد سياسات الاستجابة والحل حسب الأولوية</summary>
      <p className="report-note">الأوقات بالدقائق. تحفظ كإعدادات للمنظمة وتطبق على الحالات الجديدة فقط؛ لا تغيّر المواعيد المسجلة للحالات المفتوحة تلقائيًا.</p>
      <div className="customer-service-sla-policy-grid">
        {policies.map(policy => (
          <form key={policy.priority} onSubmit={event => { event.preventDefault(); void save(policy); }}>
            <strong>{priorityLabels[policy.priority]}</strong>
            <label>
              <span>مهلة الاستجابة الأولى</span>
              <input type="number" min={5} max={43200} step={5} required
                value={drafts[policy.priority]?.response ?? String(policy.first_response_minutes)}
                onChange={event => setDrafts(current => ({ ...current, [policy.priority]: {
                  response: event.target.value,
                  resolution: current[policy.priority]?.resolution ?? String(policy.resolution_minutes),
                }}))} />
            </label>
            <label>
              <span>مهلة الحل</span>
              <input type="number" min={5} max={43200} step={5} required
                value={drafts[policy.priority]?.resolution ?? String(policy.resolution_minutes)}
                onChange={event => setDrafts(current => ({ ...current, [policy.priority]: {
                  response: current[policy.priority]?.response ?? String(policy.first_response_minutes),
                  resolution: event.target.value,
                }}))} />
            </label>
            <Button disabled={savingPriority === policy.priority}>
              {savingPriority === policy.priority ? "جارٍ الحفظ…" : "حفظ السياسة"}
            </Button>
            <small>{policy.configured ? "سياسة مخصصة" : "القيمة الافتراضية"}</small>
          </form>
        ))}
      </div>
      {notice && <p className="customer-service-case-notice" role="status">{notice}</p>}
      {error && <ErrorBox message={error} />}
    </details>
  );
}

export function CustomerServiceCases({ customerId }: { customerId: string }) {
  const [items, setItems] = useState<CustomerServiceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [caseType, setCaseType] = useState<CustomerServiceCaseType>("inquiry");
  const [priority, setPriority] = useState<CustomerServiceCasePriority>("medium");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => randomCaseRequestKey());
  const [assignees, setAssignees] = useState<OperationalTaskAssignee[]>([]);
  const [policies, setPolicies] = useState<CustomerServiceSlaPolicy[]>([]);
  const [managerToolsAvailable, setManagerToolsAvailable] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchCustomerServiceCases(customerId, 50));
    } catch (cause) {
      setItems([]);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل حالات خدمة العميل.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchOperationalTaskAssignees(), fetchCustomerServiceSlaPolicies()])
      .then(([people, slaPolicies]) => {
        if (!active) return;
        setAssignees(people);
        setPolicies(slaPolicies);
        setManagerToolsAvailable(true);
      })
      .catch(() => {
        if (!active) return;
        setAssignees([]);
        setPolicies([]);
        setManagerToolsAvailable(false);
      });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const created = await createCustomerServiceCase({
        customerId, idempotencyKey, caseType, priority, subject, description,
      });
      setSubject("");
      setDescription("");
      setIdempotencyKey(randomCaseRequestKey());
      setNotice("فُتحت الحالة " + created.caseCode + " وأُنشئت لها مهمة في طابور المبيعات.");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر فتح حالة خدمة العميل.");
    } finally {
      setSaving(false);
    }
  }

  const saveCaseOperations = useCallback(async (input: {
    caseId: string; assignedTo: string | null; responseDueAt: string;
    resolutionDueAt: string; escalate?: boolean; note?: string | null;
  }) => {
    await manageCustomerServiceCaseOperations(input);
    await reload();
  }, [reload]);

  function updatePolicy(saved: CustomerServiceSlaPolicy) {
    setPolicies(current => current.map(policy => policy.priority === saved.priority ? saved : policy));
  }

  return (
    <section className="panel customer-service-cases">
      <div className="customer-service-cases-heading">
        <div>
          <h3>شكاوى واستفسارات وطلبات العملاء</h3>
          <p className="report-note">كل حالة لها رقم مستقل ومسار معالجة وسجل أحداث. تُنشأ مهمة تشغيلية مرتبطة بالحالة، وتُغلق المهمة عند حل الحالة أو إغلاقها.</p>
        </div>
        <Button variant="secondary" disabled={loading || saving} onClick={() => { void reload(); }}>تحديث الحالات</Button>
      </div>

      {managerToolsAvailable && policies.length > 0 && (
        <CustomerServiceSlaSettings policies={policies} onSaved={updatePolicy} />
      )}

      <form className="customer-service-case-form" onSubmit={event => { void submit(event); }}>
        <label>
          <span>نوع الحالة</span>
          <select value={caseType} disabled={saving} onChange={event => { setCaseType(event.target.value as CustomerServiceCaseType); setIdempotencyKey(randomCaseRequestKey()); }}>
            {Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>الأولوية</span>
          <select value={priority} disabled={saving} onChange={event => { setPriority(event.target.value as CustomerServiceCasePriority); setIdempotencyKey(randomCaseRequestKey()); }}>
            {Object.entries(priorityLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="customer-service-case-form-subject">
          <span>موضوع الحالة</span>
          <input value={subject} maxLength={200} required disabled={saving}
            onChange={event => { setSubject(event.target.value); setIdempotencyKey(randomCaseRequestKey()); }}
            placeholder="مثال: تأخر تسليم طلب أو استفسار عن منتج" />
        </label>
        <label className="customer-service-case-form-description">
          <span>تفاصيل الحالة</span>
          <textarea value={description} maxLength={4000} required rows={3} disabled={saving}
            onChange={event => { setDescription(event.target.value); setIdempotencyKey(randomCaseRequestKey()); }}
            placeholder="سجّل تفاصيل العميل وما يحتاجه فريق المعالجة" />
        </label>
        <div className="customer-service-case-form-submit">
          <Button disabled={saving || !subject.trim() || !description.trim()}>
            {saving ? "جارٍ فتح الحالة…" : "فتح حالة جديدة"}
          </Button>
        </div>
      </form>
      {notice && <p className="customer-service-case-notice" role="status">{notice}</p>}
      {error && <ErrorBox message={error} />}

      {loading ? <Loading /> : items.length === 0 ? (
        <Empty text="لا توجد حالات خدمة مسجلة لهذا العميل." />
      ) : (
        <div className="customer-service-case-list">
          {items.map(item => <CustomerServiceCaseCard key={item.id} item={item} onRefresh={reload} assignees={assignees} />)}
        </div>
      )}
      <p className="report-note">يعرض أحدث {items.length} حالة من حد 50 حالة لهذا العميل؛ يحتفظ سجل الأحداث بأحدث 10 أحداث لكل حالة في هذه الشاشة.</p>
    </section>
  );
}
