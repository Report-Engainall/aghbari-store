import { supabase } from "@/lib/supabase";

export interface CustomerServiceIntelligenceSummary {
  openCount: number;
  responseOverdueCount: number;
  resolutionOverdueCount: number;
  unassignedCount: number;
  urgentCount: number;
  highCount: number;
}

export interface CustomerServiceIntelligenceSnapshot {
  asOf: string;
  scope: "ALL_ACTIVE_CASES_IN_CURRENT_ORGANIZATION";
  completePopulation: true;
  summary: CustomerServiceIntelligenceSummary;
}

export type CustomerServiceIntelligenceResult =
  | { ok: true; data: CustomerServiceIntelligenceSnapshot }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

type Row = Record<string, unknown>;
function object(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null;
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function exactKeys(value: Row, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

/** Strictly parses the aggregate-only tenant RPC; case/customer detail is not accepted. */
export function parseCustomerServiceIntelligenceSnapshot(
  value: unknown,
): CustomerServiceIntelligenceSnapshot | null {
  const root = object(value);
  const summary = object(root?.summary);
  if (
    !root ||
    !summary ||
    !exactKeys(root, ["as_of", "scope", "complete_population", "summary"]) ||
    !exactKeys(summary, ["open_count", "response_overdue_count", "resolution_overdue_count", "unassigned_count", "urgent_count", "high_count"]) ||
    !timestamp(root.as_of) ||
    root.scope !== "ALL_ACTIVE_CASES_IN_CURRENT_ORGANIZATION" ||
    root.complete_population !== true ||
    !count(summary.open_count) ||
    !count(summary.response_overdue_count) ||
    !count(summary.resolution_overdue_count) ||
    !count(summary.unassigned_count) ||
    !count(summary.urgent_count) ||
    !count(summary.high_count) ||
    summary.response_overdue_count > summary.open_count ||
    summary.resolution_overdue_count > summary.open_count ||
    summary.unassigned_count > summary.open_count ||
    summary.urgent_count > summary.open_count ||
    summary.high_count > summary.open_count
  ) {
    return null;
  }

  return {
    asOf: root.as_of,
    scope: "ALL_ACTIVE_CASES_IN_CURRENT_ORGANIZATION",
    completePopulation: true,
    summary: {
      openCount: summary.open_count,
      responseOverdueCount: summary.response_overdue_count,
      resolutionOverdueCount: summary.resolution_overdue_count,
      unassignedCount: summary.unassigned_count,
      urgentCount: summary.urgent_count,
      highCount: summary.high_count,
    },
  };
}

function mapFailure(error: unknown): Extract<CustomerServiceIntelligenceResult, { ok: false }> {
  const row = object(error);
  const code = typeof row?.code === "string" ? row.code : "";
  const message = typeof row?.message === "string" ? row.message : "";
  if (code === "42501" || code === "28000" || code === "PGRST301") {
    return {
      ok: false,
      status: "DENIED",
      message: "يتطلب ملخص خدمة العملاء حساب موظف نشطاً داخل المؤسسة الحالية.",
    };
  }
  if (
    code === "PGRST202" ||
    code === "42883" ||
    /function .* does not exist|could not find the function/i.test(message)
  ) {
    return {
      ok: false,
      status: "UNAVAILABLE",
      message: "مصدر ملخص خدمة العملاء غير مطبق في قاعدة البيانات المتصلة بعد.",
    };
  }
  return {
    ok: false,
    status: "UNAVAILABLE",
    message: "تعذر قراءة ملخص خدمة العملاء من المصدر المعتمد.",
  };
}

export async function fetchCustomerServiceIntelligenceSummary(): Promise<CustomerServiceIntelligenceResult> {
  try {
    const { data, error } = await supabase.rpc("get_customer_service_work_queue_summary");
    if (error) return mapFailure(error);
    const snapshot = parseCustomerServiceIntelligenceSnapshot(data);
    if (!snapshot) {
      return {
        ok: false,
        status: "ERROR",
        message: "أعاد مصدر خدمة العملاء ملخصاً غير مكتمل أو غير متوازن؛ لم تُعرض أرقام بديلة.",
      };
    }
    return { ok: true, data: snapshot };
  } catch {
    return {
      ok: false,
      status: "UNAVAILABLE",
      message: "تعذر الاتصال بملخص خدمة العملاء.",
    };
  }
}
