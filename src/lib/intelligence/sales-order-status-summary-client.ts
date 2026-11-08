import { supabase } from "@/lib/supabase";
import {
  parseSalesOrderStatusSnapshot,
  type SalesOrderStatusSnapshot,
} from "./sales-order-status-summary";

export type SalesOrderStatusFetchResult =
  | { ok: true; snapshot: SalesOrderStatusSnapshot }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

function mapFailure(error: unknown): SalesOrderStatusFetchResult {
  const failure = error as { code?: string; message?: string };
  if (failure?.code === "42501" || failure?.code === "28000" || failure?.code === "PGRST301") {
    return { ok: false, status: "DENIED", message: "لا تملك صلاحية قراءة ملخص طلبات البيع." };
  }
  if (failure?.code === "PGRST202" || failure?.code === "42883" ||
      /function .* does not exist|could not find the function/i.test(failure?.message ?? "")) {
    return { ok: false, status: "UNAVAILABLE", message: "مصدر ملخص طلبات البيع غير متاح قبل تطبيق ترحيل المساعد الإداري." };
  }
  return { ok: false, status: "ERROR", message: "تعذر قراءة ملخص طلبات البيع من المصدر المعتمد." };
}

/** Aggregate-only read: no customer identity, order UUID, line, payment or amount leaves PostgreSQL. */
export async function fetchSalesOrderStatusSnapshot(): Promise<SalesOrderStatusFetchResult> {
  try {
    const { data, error } = await supabase.rpc("fetch_intelligence_sales_order_status_summary");
    if (error) return mapFailure(error);
    const snapshot = parseSalesOrderStatusSnapshot(data);
    if (!snapshot) {
      return { ok: false, status: "ERROR", message: "استجابة ملخص الطلبات ناقصة أو لا تطابق عقد المصدر؛ لم تُنشأ بيانات بديلة." };
    }
    return { ok: true, snapshot };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بخدمة ملخص طلبات البيع." };
  }
}
