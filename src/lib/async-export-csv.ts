export const ASYNC_EXPORT_BUCKET = "async-export-artifacts";
export const ASYNC_EXPORT_MAX_ORDERS = 1000;
export const ASYNC_EXPORT_MAX_ITEMS = 10000;
export const ASYNC_EXPORT_MAX_BYTES = 25 * 1024 * 1024;
export const ASYNC_EXPORT_DOWNLOAD_TTL_SECONDS = 60;
export const ASYNC_EXPORT_RETENTION_DAYS = 7;

export type OrdersExportFilters = { date_from: string; date_to: string };

export type AsyncOrderCsvRow = {
  orderNumber: string;
  createdAt: string;
  status: string;
  customerCode: string;
  customerName: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number | string;
  unitPrice: number | string;
  discount: number | string;
  lineTotal: number | string;
  orderTotal: number | string;
};

export function validateOrdersExportFilters(value: unknown): OrdersExportFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("يجب تحديد فترة صحيحة للتصدير.");
  }
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort();
  if (keys.length !== 2 || keys[0] !== "date_from" || keys[1] !== "date_to") {
    throw new Error("مرشحات التصدير غير مدعومة.");
  }
  const from = input.date_from;
  const to = input.date_to;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof from !== "string" || typeof to !== "string" || !isoDate.test(from) || !isoDate.test(to)) {
    throw new Error("يجب أن يكون التاريخ بصيغة YYYY-MM-DD.");
  }
  const fromMs = Date.parse(from + "T00:00:00.000Z");
  const toMs = Date.parse(to + "T00:00:00.000Z");
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)
      || new Date(fromMs).toISOString().slice(0, 10) !== from
      || new Date(toMs).toISOString().slice(0, 10) !== to) {
    throw new Error("أحد تاريخي التصدير غير صالح.");
  }
  const span = (toMs - fromMs) / 86400000;
  if (span < 0 || span > 365) {
    throw new Error("فترة التصدير يجب ألا تتجاوز 366 يومًا.");
  }
  return { date_from: from, date_to: to };
}

function textCell(value: unknown): string {
  let text = String(value ?? "").split("\u0000").join("").replace(/\r\n?/g, "\n");
  // Prevent spreadsheet formula execution in user-controlled text cells.
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function numberCell(value: number | string, label: string, allowZero = true): string {
  if ((typeof value !== "number" && typeof value !== "string")
      || (typeof value === "string" && value.trim() === "")) {
    throw new Error("قيمة " + label + " غير صالحة.");
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed === 0)) {
    throw new Error("قيمة " + label + " غير صالحة.");
  }
  return String(parsed);
}

const HEADERS = [
  "رقم الطلب", "تاريخ الطلب", "الحالة", "رقم العميل", "اسم العميل",
  "رقم الصنف", "اسم الصنف", "الوحدة", "الكمية", "سعر الوحدة",
  "الخصم", "صافي البند", "إجمالي الطلب",
] as const;

export function buildOrdersCsv(rows: readonly AsyncOrderCsvRow[]): string {
  const lines = [HEADERS.map(textCell).join(",")];
  for (const row of rows) {
    lines.push([
      textCell(row.orderNumber), textCell(row.createdAt), textCell(row.status),
      textCell(row.customerCode), textCell(row.customerName), textCell(row.itemCode),
      textCell(row.itemName), textCell(row.unit),
      numberCell(row.quantity, "الكمية", false),
      numberCell(row.unitPrice, "سعر الوحدة"),
      numberCell(row.discount, "الخصم"),
      numberCell(row.lineTotal, "صافي البند"),
      numberCell(row.orderTotal, "إجمالي الطلب"),
    ].join(","));
  }
  // UTF-8 BOM improves Arabic column-name display in desktop spreadsheet applications.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

export function exportJobIdempotencyKey(): string {
  return "orders-csv-" + crypto.randomUUID();
}
