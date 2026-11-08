import { supabase } from "@/lib/supabase";

export type AiGatewayProvider = "openai_compatible" | "gemini";
export type AiGatewayBudgetFailureStatus = "DENIED" | "UNAVAILABLE" | "ERROR";

export interface AiGatewayBudgetSnapshot {
  configured: boolean;
  enabled: boolean;
  fallbackEnabled: boolean;
  primaryProvider: AiGatewayProvider;
  primaryModel: string;
  fallbackProvider: AiGatewayProvider;
  fallbackModel: string;
  limits: {
    dailyCost: number;
    monthlyCost: number;
    perRequestCost: number;
    dailyTokens: number;
    monthlyTokens: number;
  };
  usage: {
    todayCost: number;
    monthCost: number;
    todayTokens: number;
    monthTokens: number;
    activeReservedCost: number;
    activeReservedTodayTokens: number;
    activeReservedMonthTokens: number;
  };
  keysStoredInDatabase: false;
}

export type AiGatewayBudgetResult =
  | { ok: true; status: "READY"; data: AiGatewayBudgetSnapshot; readAt: string }
  | { ok: false; status: AiGatewayBudgetFailureStatus; message: string };

type UnknownRecord = Record<string, unknown>;
function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}
function bool(value: unknown): value is boolean {
  return typeof value === "boolean";
}
function provider(value: unknown): value is AiGatewayProvider {
  return value === "openai_compatible" || value === "gemini";
}
function model(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.trim().length <= 160 && value.trim() === value;
}
function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= 0 && value <= 1_000_000_000_000 ? value : null;
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 ? value : null;
}

export function parseAiGatewayBudgetSnapshot(value: unknown): AiGatewayBudgetSnapshot | null {
  const raw = record(value);
  if (!raw) return null;

  const configured = raw.configured;
  const enabled = raw.ai_enabled;
  const fallbackEnabled = raw.fallback_enabled;
  if (!bool(configured) || !bool(enabled) || !bool(fallbackEnabled) ||
      !provider(raw.primary_provider) || !provider(raw.fallback_provider) ||
      !model(raw.primary_model) || !model(raw.fallback_model) ||
      raw.keys_stored_in_database !== false || (!configured && enabled)) {
    return null;
  }

  const dailyCost = amount(raw.daily_cost_limit);
  const monthlyCost = amount(raw.monthly_cost_limit);
  const perRequestCost = amount(raw.per_request_cost_limit);
  const dailyTokens = count(raw.daily_token_limit);
  const monthlyTokens = count(raw.monthly_token_limit);
  const todayCost = amount(raw.today_cost);
  const monthCost = amount(raw.month_cost);
  const todayTokens = count(raw.today_tokens);
  const monthTokens = count(raw.month_tokens);
  const activeReservedCost = amount(raw.reserved_cost);
  const activeReservedTodayTokens = count(raw.reserved_today_tokens);
  const activeReservedMonthTokens = count(raw.reserved_month_tokens);

  if ([dailyCost, monthlyCost, perRequestCost, dailyTokens, monthlyTokens, todayCost,
    monthCost, todayTokens, monthTokens, activeReservedCost, activeReservedTodayTokens,
    activeReservedMonthTokens].some(item => item === null)) {
    return null;
  }

  if ((dailyCost as number) > (monthlyCost as number) ||
      (perRequestCost as number) > (dailyCost as number) ||
      (perRequestCost as number) > (monthlyCost as number) ||
      (dailyTokens as number) > (monthlyTokens as number) ||
      (enabled && ((dailyCost as number) <= 0 || (monthlyCost as number) <= 0 ||
        (perRequestCost as number) <= 0 || (dailyTokens as number) <= 0 ||
        (monthlyTokens as number) <= 0))) {
    return null;
  }

  return {
    configured,
    enabled,
    fallbackEnabled,
    primaryProvider: raw.primary_provider,
    primaryModel: raw.primary_model,
    fallbackProvider: raw.fallback_provider,
    fallbackModel: raw.fallback_model,
    limits: {
      dailyCost: dailyCost as number,
      monthlyCost: monthlyCost as number,
      perRequestCost: perRequestCost as number,
      dailyTokens: dailyTokens as number,
      monthlyTokens: monthlyTokens as number,
    },
    usage: {
      todayCost: todayCost as number,
      monthCost: monthCost as number,
      todayTokens: todayTokens as number,
      monthTokens: monthTokens as number,
      activeReservedCost: activeReservedCost as number,
      activeReservedTodayTokens: activeReservedTodayTokens as number,
      activeReservedMonthTokens: activeReservedMonthTokens as number,
    },
    keysStoredInDatabase: false,
  };
}

function safeFailure(error: unknown): Extract<AiGatewayBudgetResult, { ok: false }> {
  const raw = record(error);
  if (raw?.code === "42501" || raw?.code === "PGRST301") {
    return {
      ok: false,
      status: "DENIED",
      message: "بيانات تشغيل الذكاء محجوبة؛ تتطلب صلاحية مدير أو مدير مؤسسة فعّالة.",
    };
  }
  if (raw?.code === "PGRST202" || raw?.code === "42883") {
    return {
      ok: false,
      status: "UNAVAILABLE",
      message: "عقد ملخص ميزانية الذكاء غير متاح في قاعدة البيانات المرتبطة.",
    };
  }
  return {
    ok: false,
    status: "UNAVAILABLE",
    message: "تعذر تحميل ملخص تشغيل بوابة الذكاء من المصدر المعتمد.",
  };
}

/** Reads only the existing manager/admin aggregate RPC; it never exposes tenant IDs, base URLs, or secrets. */
export async function fetchAiGatewayBudget(): Promise<AiGatewayBudgetResult> {
  try {
    const { data, error } = await supabase.rpc("get_ai_gateway_budget");
    if (error) return safeFailure(error);
    const snapshot = parseAiGatewayBudgetSnapshot(data);
    if (!snapshot) {
      return {
        ok: false,
        status: "ERROR",
        message: "استجابة بوابة الذكاء لا تطابق عقد الملخص؛ أُوقف العرض.",
      };
    }
    return { ok: true, status: "READY", data: snapshot, readAt: new Date().toISOString() };
  } catch {
    return {
      ok: false,
      status: "UNAVAILABLE",
      message: "تعذر الاتصال بملخص بوابة الذكاء.",
    };
  }
}
