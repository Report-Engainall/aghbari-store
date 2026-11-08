import { supabase } from "@/lib/supabase";
import {
  parseTaskIntelligenceReport,
  type TaskIntelligenceReport,
  type TaskIntelligenceReportKind,
} from "./task-intelligence-reports";
import { fetchOperationalTaskQualityMetrics } from "./task-quality-reviews-client";

export type TaskIntelligenceReportFetchResult =
  | { ok: true; report: TaskIntelligenceReport }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}
function addUtcDays(value: Date, days: number): Date {
  const result = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
function reportWindow(kind: TaskIntelligenceReportKind): { from: string; to: string } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (kind === "DAILY" || kind === "MANAGER") return { from: day(today), to: day(today) };
  if (kind === "WEEKLY") return { from: day(addUtcDays(today, -6)), to: day(today) };
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { from: day(monthStart), to: day(today) };
}
function mapFailure(error: unknown): TaskIntelligenceReportFetchResult {
  const failure = error as { code?: string; message?: string };
  if (failure?.code === "42501" || failure?.code === "28000" || failure?.code === "PGRST301") {
    return { ok: false, status: "DENIED", message: "لا تملك صلاحية قراءة تقرير المهام المطلوب." };
  }
  if (failure?.code === "PGRST202" || failure?.code === "42883" ||
    /function .* does not exist|could not find the function/i.test(failure?.message ?? "")) {
    return { ok: false, status: "UNAVAILABLE", message: "خدمة تقارير المهام غير متاحة قبل تطبيق ترحيل القسم 58." };
  }
  return { ok: false, status: "ERROR", message: "تعذر تحميل تقرير المهام من مصدر التطبيق المعتمد." };
}

export async function fetchTaskIntelligenceReport(
  kind: TaskIntelligenceReportKind,
): Promise<TaskIntelligenceReportFetchResult> {
  const period = reportWindow(kind);
  const { data, error } = await supabase.rpc("fetch_task_intelligence_report", {
    p_report_kind: kind,
    p_from: period.from,
    p_to: period.to,
  });
  if (error) return mapFailure(error);
  const report = parseTaskIntelligenceReport(data, kind);
  if (!report) {
    return {
      ok: false,
      status: "ERROR",
      message: "استجابة تقرير المهام ناقصة أو لا تطابق عقد المصدر؛ لم تُنشأ بيانات بديلة.",
    };
  }
  // The manager-only quality reader is a separate latest-review snapshot,
  // not part of the report's daily task window.
  const qualityReviewSnapshot = kind === "MANAGER"
    ? await fetchOperationalTaskQualityMetrics()
    : null;
  return { ok: true, report: { ...report, qualityReviewSnapshot } };
}
