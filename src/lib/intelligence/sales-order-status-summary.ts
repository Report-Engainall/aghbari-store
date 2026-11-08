export type SalesOrderStatusIntent =
  | "SALES_ORDERS_OVERVIEW"
  | "SALES_ORDERS_OPEN"
  | "SALES_ORDERS_PROCESSING"
  | "SALES_ORDERS_SHIPPED"
  | "SALES_ORDERS_CANCELLED";

export type SalesOrderStatusKey =
  | "draft" | "pending" | "confirmed" | "processing"
  | "shipped" | "delivered" | "cancelled";

export interface SalesOrderStatusSnapshot {
  status: "READY" | "PARTIAL" | "EMPTY";
  asOf: string;
  scope: "CURRENT_ORGANIZATION_STAFF_ORDER_STATUS_AGGREGATE";
  totalCount: number;
  completePopulation: boolean;
  unknownStatusCount: number;
  countsByStatus: Record<SalesOrderStatusKey, number>;
}

export interface SalesOrderStatusSummary {
  kind: "SALES_ORDER_STATUS";
  state: SalesOrderStatusSnapshot["status"];
  intent: SalesOrderStatusIntent;
  answer: string;
  sourceRpc: "fetch_intelligence_sales_order_status_summary";
  asOf: string;
  totalCount: number;
  completePopulation: boolean;
  unknownStatusCount: number;
  matchingCount: number;
  countsByStatus: Record<SalesOrderStatusKey, number>;
}

type PlainRecord = Record<string, unknown>;
const STATUS_KEYS: SalesOrderStatusKey[] = [
  "draft", "pending", "confirmed", "processing", "shipped", "delivered", "cancelled",
];

function record(value: unknown): PlainRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as PlainRecord : null;
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** Rejects incomplete or inconsistent aggregates rather than replacing them with zero. */
export function parseSalesOrderStatusSnapshot(value: unknown): SalesOrderStatusSnapshot | null {
  const raw = record(value);
  const counts = record(raw?.countsByStatus);
  if (!raw || !counts || !timestamp(raw.asOf) ||
      raw.scope !== "CURRENT_ORGANIZATION_STAFF_ORDER_STATUS_AGGREGATE" ||
      !count(raw.totalCount) || !count(raw.unknownStatusCount) ||
      typeof raw.completePopulation !== "boolean" ||
      (raw.status !== "READY" && raw.status !== "PARTIAL" && raw.status !== "EMPTY")) return null;

  const parsed = {} as Record<SalesOrderStatusKey, number>;
  for (const key of STATUS_KEYS) {
    if (!count(counts[key])) return null;
    parsed[key] = counts[key] as number;
  }
  const knownTotal = STATUS_KEYS.reduce((sum, key) => sum + parsed[key], 0);
  const completePopulation = raw.unknownStatusCount === 0;
  const expectedStatus = raw.totalCount === 0 ? "EMPTY" : completePopulation ? "READY" : "PARTIAL";
  if (knownTotal + raw.unknownStatusCount !== raw.totalCount ||
      raw.completePopulation !== completePopulation ||
      raw.status !== expectedStatus) return null;

  return {
    status: raw.status,
    asOf: raw.asOf,
    scope: "CURRENT_ORGANIZATION_STAFF_ORDER_STATUS_AGGREGATE",
    totalCount: raw.totalCount,
    completePopulation,
    unknownStatusCount: raw.unknownStatusCount,
    countsByStatus: parsed,
  };
}

export function resolveSalesOrderStatusIntent(
  intent: SalesOrderStatusIntent,
  snapshot: SalesOrderStatusSnapshot,
): SalesOrderStatusSummary {
  const counts = snapshot.countsByStatus;
  const openCount = counts.draft + counts.pending + counts.confirmed + counts.processing + counts.shipped;
  const matchingCount =
    intent === "SALES_ORDERS_OPEN" ? openCount :
    intent === "SALES_ORDERS_PROCESSING" ? counts.processing :
    intent === "SALES_ORDERS_SHIPPED" ? counts.shipped :
    intent === "SALES_ORDERS_CANCELLED" ? counts.cancelled : snapshot.totalCount;

  const detail =
    intent === "SALES_ORDERS_OPEN"
      ? "الطلبات المفتوحة (مسودة أو بانتظار المعالجة أو مؤكدة أو قيد المعالجة أو مشحونة)"
      : intent === "SALES_ORDERS_PROCESSING"
        ? "الطلبات قيد المعالجة"
        : intent === "SALES_ORDERS_SHIPPED"
          ? "الطلبات المشحونة"
          : intent === "SALES_ORDERS_CANCELLED"
            ? "الطلبات الملغاة"
            : "ملخص حالات طلبات البيع";

  const answer = snapshot.status === "EMPTY"
    ? "لا توجد طلبات بيع في المؤسسة ضمن لقطة المصدر الحالية."
    : intent === "SALES_ORDERS_OVERVIEW"
      ? "تحتوي اللقطة على " + snapshot.totalCount + " طلباً: " +
        counts.draft + " مسودة، " + counts.pending + " بانتظار المعالجة، " +
        counts.confirmed + " مؤكدة، " + counts.processing + " قيد المعالجة، " +
        counts.shipped + " مشحونة، " + counts.delivered + " مسلّمة، و" +
        counts.cancelled + " ملغاة."
      : "عدد " + detail + " في اللقطة الحالية: " + matchingCount + ".";

  return {
    kind: "SALES_ORDER_STATUS",
    state: snapshot.status,
    intent,
    answer,
    sourceRpc: "fetch_intelligence_sales_order_status_summary",
    asOf: snapshot.asOf,
    totalCount: snapshot.totalCount,
    completePopulation: snapshot.completePopulation,
    unknownStatusCount: snapshot.unknownStatusCount,
    matchingCount,
    countsByStatus: counts,
  };
}
