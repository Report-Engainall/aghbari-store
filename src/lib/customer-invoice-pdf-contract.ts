export type CustomerInvoicePdfPayload = {
  invoice: unknown;
  lines: unknown[];
  customer: Record<string, unknown>;
  financial_details_visible: boolean;
  customer_tier_visible: boolean;
};

const TOP_LEVEL_KEYS = [
  "invoice", "lines", "customer", "financial_details_visible", "customer_tier_visible",
] as const;
const INVOICE_BASE_KEYS = [
  "id", "invoice_number", "customer_id", "status", "issued_at", "due_at", "currency",
] as const;
const INVOICE_FINANCIAL_KEYS = ["subtotal", "tax_amount", "total_amount"] as const;
const LINE_BASE_KEYS = ["id", "item_code", "description", "unit", "quantity"] as const;
const LINE_FINANCIAL_KEYS = ["unit_price", "line_total"] as const;
const CUSTOMER_KEYS = ["customer_code", "business_name", "contact_name", "tier_label"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set<string>(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

/**
 * Validate the exact server projection before invoice data reaches the PDF renderer.
 * Hidden money and tier values must be absent from the payload, not only hidden at render time.
 */
export function parseCustomerInvoicePdfPayload(value: unknown): CustomerInvoicePdfPayload | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, TOP_LEVEL_KEYS) ||
    typeof value.financial_details_visible !== "boolean" ||
    typeof value.customer_tier_visible !== "boolean" ||
    !isRecord(value.invoice) ||
    !Array.isArray(value.lines) ||
    !isRecord(value.customer)
  ) {
    return null;
  }

  const invoice = value.invoice;
  const customer = value.customer;
  if (
    !hasOnlyKeys(invoice, [...INVOICE_BASE_KEYS, ...INVOICE_FINANCIAL_KEYS]) ||
    !hasOnlyKeys(customer, CUSTOMER_KEYS)
  ) {
    return null;
  }

  const tierPayloadValid = value.customer_tier_visible
    ? typeof customer.tier_label === "string" && customer.tier_label.trim().length > 0
    : !Object.prototype.hasOwnProperty.call(customer, "tier_label");
  if (!tierPayloadValid) return null;

  const invoiceFinancialPayloadValid = value.financial_details_visible
    ? true
    : !INVOICE_FINANCIAL_KEYS.some((key) => Object.prototype.hasOwnProperty.call(invoice, key));
  if (!invoiceFinancialPayloadValid) return null;

  for (const candidate of value.lines) {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, [...LINE_BASE_KEYS, ...LINE_FINANCIAL_KEYS])
    ) {
      return null;
    }
    const lineFinancialPayloadValid = value.financial_details_visible
      ? true
      : !LINE_FINANCIAL_KEYS.some((key) => Object.prototype.hasOwnProperty.call(candidate, key));
    if (!lineFinancialPayloadValid) return null;
  }

  return {
    invoice,
    lines: value.lines,
    customer,
    financial_details_visible: value.financial_details_visible,
    customer_tier_visible: value.customer_tier_visible,
  };
}
