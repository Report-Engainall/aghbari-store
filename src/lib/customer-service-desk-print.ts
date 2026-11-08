import type {
  CustomerServiceDeskCase,
  CustomerServiceDeskFilters,
  CustomerServiceDeskSummary,
} from "@/lib/customer-service-desk";

export type CustomerServiceDeskPrintDocument = {
  generatedAt: string;
  filters: {
    status: string;
    priority: string;
    assignment: string;
    overdueOnly: boolean;
    search: string;
  };
  fullOpenSummary: CustomerServiceDeskSummary;
  loadedCount: number;
  hasMore: boolean;
  cases: Array<{
    caseCode: string;
    customerName: string;
    customerCode: string;
    subject: string;
    caseType: string;
    priority: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    responseDueAt: string;
    firstResponseAt: string | null;
    responseOverdue: boolean;
    resolutionDueAt: string;
    resolutionOverdue: boolean;
    escalationLevel: number;
    assignedToName: string;
    taskDueAt: string | null;
    hasLinkedTask: boolean;
  }>;
};

const statusLabels: Record<CustomerServiceDeskCase["status"], string> = {
  open: "مفتوحة",
  in_progress: "قيد المعالجة",
  waiting_customer: "بانتظار العميل",
  resolved: "تم الحل",
  closed: "مغلقة",
};
const priorityLabels: Record<CustomerServiceDeskCase["priority"], string> = {
  low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة",
};
const typeLabels: Record<CustomerServiceDeskCase["case_type"], string> = {
  complaint: "شكوى", inquiry: "استفسار", service_request: "طلب خدمة",
  delivery_issue: "مشكلة تسليم", other: "أخرى",
};

function safeText(value: string, label: string, max = 500): string {
  if (typeof value !== "string" || value.length > max) {
    throw new Error("حقل " + label + " غير صالح في كشف خدمة العملاء.");
  }
  return value.trim();
}
function requiredText(value: string, label: string, max = 500): string {
  const result = safeText(value, label, max);
  if (!result) throw new Error("حقل " + label + " مفقود في كشف خدمة العملاء.");
  return result;
}
function date(value: string, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("تاريخ " + label + " غير صالح في كشف خدمة العملاء.");
  }
  return new Date(value).toISOString();
}
function nullableDate(value: string | null, label: string): string | null {
  return value === null ? null : date(value, label);
}
function statusFilter(value: CustomerServiceDeskFilters["status"]): string {
  if (value === "active") return "الحالات النشطة";
  if (value === "all") return "كل الحالات";
  return statusLabels[value];
}
function priorityFilter(value: CustomerServiceDeskFilters["priority"]): string {
  return value === "all" ? "كل الأولويات" : priorityLabels[value];
}

/** Builds a staff-only report from the exact queue pages already loaded by the authorized work-queue RPC. */
export function projectCustomerServiceDeskPrintDocument(input: {
  items: CustomerServiceDeskCase[];
  summary: CustomerServiceDeskSummary;
  filters: CustomerServiceDeskFilters;
  hasMore: boolean;
  generatedAt?: string;
}): CustomerServiceDeskPrintDocument {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  if (!Array.isArray(input.items) || !input.summary || !input.filters ||
      !Number.isFinite(Date.parse(generatedAt)) ||
      typeof input.hasMore !== "boolean") {
    throw new Error("لقطة طابور خدمة العملاء غير مكتملة؛ أوقف إنشاء التقرير.");
  }
  const summaryKeys: Array<keyof CustomerServiceDeskSummary> = [
    "open_count", "response_overdue_count", "resolution_overdue_count",
    "unassigned_count", "urgent_count", "high_count",
  ];
  for (const key of summaryKeys) {
    const value = input.summary[key];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("مؤشر SLA غير صالح في ملخص خدمة العملاء.");
    }
  }
  const seen = new Set<string>();
  const cases = input.items.map((row) => {
    const key = requiredText(row.case_id, "معرف الحالة");
    if (seen.has(key)) throw new Error("تكررت حالة في لقطة التقرير؛ أوقف التصدير.");
    seen.add(key);
    const active = row.status !== "resolved" && row.status !== "closed";
    const createdAt = date(row.created_at, "فتح الحالة");
    const updatedAt = date(row.updated_at, "آخر تحديث");
    const responseDueAt = date(row.response_due_at, "موعد الاستجابة");
    const firstResponseAt = nullableDate(row.first_response_at, "أول استجابة");
    const resolutionDueAt = date(row.resolution_due_at, "موعد الحل");
    const now = Date.parse(generatedAt);
    return {
      caseCode: requiredText(row.case_code, "رقم الحالة", 80),
      customerName: requiredText(row.customer_name, "اسم العميل", 240),
      customerCode: safeText(row.customer_code, "كود العميل", 80),
      subject: requiredText(row.subject, "موضوع الحالة", 200),
      caseType: typeLabels[row.case_type],
      priority: priorityLabels[row.priority],
      status: statusLabels[row.status],
      createdAt,
      updatedAt,
      responseDueAt,
      firstResponseAt,
      responseOverdue: active && firstResponseAt === null && Date.parse(responseDueAt) < now,
      resolutionDueAt,
      resolutionOverdue: active && Date.parse(resolutionDueAt) < now,
      escalationLevel: row.escalation_level,
      assignedToName: requiredText(row.assigned_to_name, "المسؤول", 240),
      taskDueAt: nullableDate(row.task_due_at, "استحقاق المهمة"),
      hasLinkedTask: row.task_id !== null,
    };
  });
  return {
    generatedAt,
    filters: {
      status: statusFilter(input.filters.status),
      priority: priorityFilter(input.filters.priority),
      assignment: input.filters.assignment === "all" ? "جميع الحالات" :
        input.filters.assignment === "assigned" ? "المسندة فقط" : "غير المسندة فقط",
      overdueOnly: input.filters.overdueOnly,
      search: safeText(input.filters.search, "البحث", 160),
    },
    fullOpenSummary: { ...input.summary },
    loadedCount: cases.length,
    hasMore: input.hasMore,
    cases,
  };
}
