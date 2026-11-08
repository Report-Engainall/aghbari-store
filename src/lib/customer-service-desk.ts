import { supabase } from "./supabase";
import type {
  CustomerServiceCasePriority,
  CustomerServiceCaseStatus,
  CustomerServiceCaseType,
} from "./customer-service-cases";

export type CustomerServiceQueueStatus = "active" | "all" | CustomerServiceCaseStatus;
export type CustomerServiceAssignmentFilter = "all" | "assigned" | "unassigned";

export interface CustomerServiceDeskCase {
  case_id: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  case_code: string;
  case_type: CustomerServiceCaseType;
  subject: string;
  description: string;
  priority: CustomerServiceCasePriority;
  status: CustomerServiceCaseStatus;
  created_at: string;
  updated_at: string;
  response_due_at: string;
  resolution_due_at: string;
  first_response_at: string | null;
  escalated_at: string | null;
  escalation_level: number;
  created_by_name: string;
  task_id: string | null;
  assigned_to_id: string | null;
  assigned_to_name: string;
  task_due_at: string | null;
}

export interface CustomerServiceDeskSummary {
  open_count: number;
  response_overdue_count: number;
  resolution_overdue_count: number;
  unassigned_count: number;
  urgent_count: number;
  high_count: number;
}

export interface CustomerServiceDeskCursor {
  createdAt: string;
  id: string;
}

export interface CustomerServiceDeskPage {
  items: CustomerServiceDeskCase[];
  summary: CustomerServiceDeskSummary;
  hasMore: boolean;
  nextCursor: CustomerServiceDeskCursor | null;
}

export interface CustomerServiceDeskFilters {
  status: CustomerServiceQueueStatus;
  priority: CustomerServiceCasePriority | "all";
  assignment: CustomerServiceAssignmentFilter;
  overdueOnly: boolean;
  search: string;
}

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;
const types = ["complaint", "inquiry", "service_request", "delivery_issue", "other"] as const;

function object(value: unknown, label: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("بيانات " + label + " غير صالحة.");
  }
  return value as Row;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("حقل " + label + " مفقود.");
  return value;
}
function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}
function date(value: unknown, label: string): string {
  const result = string(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error("تاريخ " + label + " غير صالح.");
  return result;
}
function nullableDate(value: unknown, label: string): string | null {
  return value === null ? null : date(value, label);
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error("قيمة " + label + " غير معروفة.");
  }
  return value as T;
}
function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("عدد " + label + " غير صالح.");
  }
  return value;
}

function parseQueueCase(value: unknown, index: number): CustomerServiceDeskCase {
  const row = object(value, "حالة قائمة الخدمة " + (index + 1));
  const caseId = string(row.case_id, "معرف الحالة");
  const customerId = string(row.customer_id, "معرف العميل");
  const taskId = nullableString(row.task_id, "معرف المهمة");
  const assigneeId = nullableString(row.assigned_to_id, "معرف المسؤول");
  if (!UUID.test(caseId) || !UUID.test(customerId) ||
      (taskId !== null && !UUID.test(taskId)) ||
      (assigneeId !== null && !UUID.test(assigneeId))) {
    throw new Error("مرجع الحالة أو العميل أو المهمة غير صالح.");
  }
  const level = row.escalation_level;
  if (typeof level !== "number" || !Number.isInteger(level) || level < 0 || level > 10) {
    throw new Error("مستوى تصعيد الحالة غير صالح.");
  }
  return {
    case_id: caseId,
    customer_id: customerId,
    customer_name: string(row.customer_name, "اسم العميل"),
    customer_code: typeof row.customer_code === "string" ? row.customer_code : "",
    case_code: string(row.case_code, "رقم الحالة"),
    case_type: enumValue(row.case_type, types, "نوع الحالة"),
    subject: string(row.subject, "موضوع الحالة"),
    description: string(row.description, "تفاصيل الحالة"),
    priority: enumValue(row.priority, priorities, "أولوية الحالة"),
    status: enumValue(row.status, statuses, "حالة سير العمل"),
    created_at: date(row.created_at, "تاريخ فتح الحالة"),
    updated_at: date(row.updated_at, "آخر تحديث للحالة"),
    response_due_at: date(row.response_due_at, "موعد الاستجابة"),
    resolution_due_at: date(row.resolution_due_at, "موعد الحل"),
    first_response_at: nullableDate(row.first_response_at, "وقت أول استجابة"),
    escalated_at: nullableDate(row.escalated_at, "وقت التصعيد"),
    escalation_level: level,
    created_by_name: string(row.created_by_name, "منشئ الحالة"),
    task_id: taskId,
    assigned_to_id: assigneeId,
    assigned_to_name: string(row.assigned_to_name, "المسؤول عن الحالة"),
    task_due_at: nullableDate(row.task_due_at, "استحقاق المهمة"),
  };
}

export async function fetchCustomerServiceDeskPage(input: {
  filters: CustomerServiceDeskFilters;
  cursor?: CustomerServiceDeskCursor | null;
  limit?: number;
}): Promise<CustomerServiceDeskPage> {
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("حجم صفحة مركز خدمة العملاء غير صالح.");
  }
  const { filters, cursor } = input;
  if (filters.status !== "active" && filters.status !== "all" && !statuses.includes(filters.status)) {
    throw new Error("مرشح حالة الخدمة غير صالح.");
  }
  if (filters.priority !== "all" && !priorities.includes(filters.priority)) {
    throw new Error("مرشح أولوية الخدمة غير صالح.");
  }
  if (!["all", "assigned", "unassigned"].includes(filters.assignment) ||
      typeof filters.overdueOnly !== "boolean" ||
      filters.search.trim().length > 160) {
    throw new Error("مرشحات مركز خدمة العملاء غير صالحة.");
  }
  if (cursor && (!UUID.test(cursor.id) || !Number.isFinite(Date.parse(cursor.createdAt)))) {
    throw new Error("مؤشر استكمال قائمة الحالات غير صالح.");
  }

  const { data, error } = await supabase.rpc("get_customer_service_work_queue", {
    p_status: filters.status,
    p_priority: filters.priority === "all" ? null : filters.priority,
    p_assignment_filter: filters.assignment,
    p_overdue_only: filters.overdueOnly,
    p_search: filters.search.trim() || null,
    p_after_created_at: cursor?.createdAt ?? null,
    p_after_id: cursor?.id ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  const result = object(data, "نتيجة مركز خدمة العملاء");
  if (!Array.isArray(result.items)) throw new Error("قائمة حالات الخدمة غير صالحة.");

  const summaryRow = object(result.summary, "ملخص مركز خدمة العملاء");
  const summary: CustomerServiceDeskSummary = {
    open_count: count(summaryRow.open_count, "الحالات المفتوحة"),
    response_overdue_count: count(summaryRow.response_overdue_count, "حالات تأخر الاستجابة"),
    resolution_overdue_count: count(summaryRow.resolution_overdue_count, "حالات تجاوز الحل"),
    unassigned_count: count(summaryRow.unassigned_count, "الحالات غير المسندة"),
    urgent_count: count(summaryRow.urgent_count, "الحالات العاجلة"),
    high_count: count(summaryRow.high_count, "الحالات عالية الأولوية"),
  };
  if (typeof result.has_more !== "boolean") throw new Error("مؤشر صفحات مركز الخدمة غير مكتمل.");

  let nextCursor: CustomerServiceDeskCursor | null = null;
  if (result.next_cursor !== null) {
    const cursorRow = object(result.next_cursor, "مؤشر الصفحة التالية");
    const id = string(cursorRow.id, "معرف آخر حالة");
    if (!UUID.test(id)) throw new Error("معرف الصفحة التالية غير صالح.");
    nextCursor = { id, createdAt: date(cursorRow.created_at, "تاريخ الصفحة التالية") };
  }
  if (result.has_more && !nextCursor) throw new Error("تعذر متابعة بقية حالات الخدمة.");

  return {
    items: result.items.map(parseQueueCase),
    summary,
    hasMore: result.has_more,
    nextCursor,
  };
}
