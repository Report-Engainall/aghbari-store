import { supabase } from "@/lib/supabase";
import { fetchOperationalTaskQualityMetrics } from "./task-quality-reviews-client";
import {
  parseTaskPerformanceScorecard,
  type TaskPerformanceScorecard,
} from "./task-performance-scorecard";

export type TaskPerformanceScorecardFetchResult =
  | { ok: true; scorecard: TaskPerformanceScorecard }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

function mapFailure(error: unknown): TaskPerformanceScorecardFetchResult {
  const failure = error as { code?: string; message?: string };
  if (failure?.code === "42501" || failure?.code === "28000" ||
      failure?.code === "PGRST301") {
    return {
      ok: false,
      status: "DENIED",
      message: "لا تملك صلاحية قراءة بطاقة أداء المهام ضمن نطاق أدوارك.",
    };
  }
  if (failure?.code === "PGRST202" || failure?.code === "42883" ||
      /function .* does not exist|could not find the function/i.test(failure?.message ?? "")) {
    return {
      ok: false,
      status: "UNAVAILABLE",
      message: "بطاقة الأداء غير متاحة قبل تطبيق ترحيل محرك أداء المهام.",
    };
  }
  return {
    ok: false,
    status: "ERROR",
    message: "تعذر تحميل بطاقة الأداء من مصدر المهام المعتمد.",
  };
}

/**
 * Loads the base scorecard and manager-reviewed quality evidence independently.
 * A pending quality migration never fabricates zero metrics or hides the base scorecard.
 */
export async function fetchTaskPerformanceScorecard(): Promise<TaskPerformanceScorecardFetchResult> {
  try {
    const [response, quality] = await Promise.all([
      supabase.rpc("fetch_task_performance_scorecard"),
      fetchOperationalTaskQualityMetrics(),
    ]);
    if (response.error) return mapFailure(response.error);
    const raw = response.data;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, status: "ERROR", message: "استجابة بطاقة الأداء غير صالحة؛ لم تُستخدم بيانات بديلة." };
    }
    const scorecard = parseTaskPerformanceScorecard({
      ...(raw as Record<string, unknown>),
      quality,
    });
    if (!scorecard) {
      return { ok: false, status: "ERROR", message: "استجابة بطاقة الأداء لا تطابق عقد المصدر أو لا تتوازن أعدادها؛ لم تُستخدم بيانات بديلة." };
    }
    return { ok: true, scorecard };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بمصادر بطاقة الأداء؛ لم تُستخدم بيانات محلية بديلة." };
  }
}
