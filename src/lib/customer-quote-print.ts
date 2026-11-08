export type CustomerQuotePrintQuoteSource = {
  quote_number?: unknown;
  status?: unknown;
  notes?: unknown;
  response_note?: unknown;
  created_at?: unknown;
  quoted_at?: unknown;
  valid_until?: unknown;
};

export type CustomerQuotePrintLineSource = {
  item_code?: unknown;
  product_name_snapshot?: unknown;
  unit_snapshot?: unknown;
  requested_quantity?: unknown;
  quoted_unit_price?: unknown;
  // Intentionally accepted as an unknown source field but never projected.
  target_unit_price?: unknown;
};

export type CustomerQuotePrintItem = {
  itemCode: string | null;
  productName: string;
  unit: string | null;
  quantity: number;
  quotedUnitPrice: number;
};

export type CustomerQuotePrintDocument = {
  quoteNumber: string;
  statusLabel: string;
  createdAt: string;
  quotedAt: string | null;
  validUntil: string | null;
  customerNotes: string | null;
  responseNote: string | null;
  items: CustomerQuotePrintItem[];
};

const STATUS_LABELS: Record<string, string> = {
  quoted: "تم التسعير",
  accepted: "مقبول",
};

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown, allowZero: boolean): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const valueAsNumber = Number(value);
  if (!Number.isFinite(valueAsNumber) || (allowZero ? valueAsNumber < 0 : valueAsNumber <= 0)) return null;
  return valueAsNumber;
}

/**
 * Customer quote print projection.
 * Only a server-priced quote can be printed; target prices, row IDs and raw rows never leave this DTO.
 */
export function projectCustomerQuotePrintDocument(
  quote: CustomerQuotePrintQuoteSource,
  sourceLines: readonly CustomerQuotePrintLineSource[],
): CustomerQuotePrintDocument | null {
  const status = textOrNull(quote.status);
  const quoteNumber = textOrNull(quote.quote_number);
  if (!quoteNumber || !status || !Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) || sourceLines.length === 0) return null;

  const items: CustomerQuotePrintItem[] = [];
  for (const line of sourceLines) {
    const quantity = finiteNumber(line.requested_quantity, false);
    const quotedUnitPrice = finiteNumber(line.quoted_unit_price, true);
    const productName = textOrNull(line.product_name_snapshot);
    if (quantity === null || quotedUnitPrice === null || !productName) return null;
    items.push({
      itemCode: textOrNull(line.item_code),
      productName,
      unit: textOrNull(line.unit_snapshot),
      quantity,
      quotedUnitPrice,
    });
  }

  return {
    quoteNumber,
    statusLabel: STATUS_LABELS[status],
    createdAt: textOrNull(quote.created_at) ?? "",
    quotedAt: textOrNull(quote.quoted_at),
    validUntil: textOrNull(quote.valid_until),
    customerNotes: textOrNull(quote.notes),
    responseNote: textOrNull(quote.response_note),
    items,
  };
}
