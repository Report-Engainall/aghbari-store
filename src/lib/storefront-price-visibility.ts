/**
 * Client presentation guards for the server-owned storefront price/privacy contract.
 *
 * These helpers never calculate prices. A price is displayable only when the exact
 * server policy value is boolean true and the RPC returned a finite numeric amount.
 * Order previews additionally require the server's explicit visible=true response
 * and complete server-priced lines; hidden/malformed payloads carry no amounts out.
 */

export type StorefrontPricePresentation =
  | { visible: false }
  | { visible: true; amount: number };

type ServerPricedLine = {
  product_id: string;
  name: string;
  quantity: number;
  original_unit_price: number;
  discount_per_unit: number;
  discount_amount: number;
  promotion_title: string | null;
  unit_price: number;
  line_total: number;
};

export type CustomerOrderPricingPresentation =
  | { visible: false }
  | {
      visible: true;
      items: readonly ServerPricedLine[];
      totalAmount: number;
      discountTotal: number;
      currency?: string;
      customerTierVisible: boolean;
      customerTierLabel?: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNonNegativeAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * A disabled price policy always suppresses the RPC's zero sentinel. Missing,
 * malformed, or unknown policy values fail closed. The server amount is preserved;
 * no client-side price fallback or computation is allowed here.
 */
export function resolveStorefrontPricePresentation(
  policyValue: unknown,
  serverUnitPrice: unknown,
): StorefrontPricePresentation {
  // A catalog zero is the hidden-price sentinel. Suppress it unconditionally,
  // including if a separately fetched policy setting is stale or disagrees.
  if (
    policyValue !== true
    || !isFiniteNonNegativeAmount(serverUnitPrice)
    || serverUnitPrice === 0
  ) {
    return { visible: false };
  }

  return { visible: true, amount: serverUnitPrice };
}

/** Only an explicit server/public-settings boolean enables the customer tier label. */
export function isCustomerTierVisible(policyValue: unknown): boolean {
  return policyValue === true;
}

function isServerPricedLine(value: unknown): value is ServerPricedLine {
  return isRecord(value)
    && typeof value.product_id === "string"
    && value.product_id.trim().length > 0
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && typeof value.quantity === "number"
    && Number.isFinite(value.quantity)
    && Number.isInteger(value.quantity)
    && value.quantity > 0
    && isFiniteNonNegativeAmount(value.original_unit_price)
    && isFiniteNonNegativeAmount(value.discount_per_unit)
    && isFiniteNonNegativeAmount(value.discount_amount)
    && (value.promotion_title === null
      || (typeof value.promotion_title === "string" && value.promotion_title.trim().length > 0))
    && (value.discount_per_unit === 0
      ? value.discount_amount === 0 && value.promotion_title === null
      : value.discount_amount > 0 && typeof value.promotion_title === "string")
    && value.discount_per_unit <= value.original_unit_price
    && isFiniteNonNegativeAmount(value.unit_price)
    && isFiniteNonNegativeAmount(value.line_total);
}

function hasCompleteServerPricedLines(value: unknown, itemCount: unknown): value is ServerPricedLine[] {
  if (
    !Array.isArray(value)
    || typeof itemCount !== "number"
    || !Number.isSafeInteger(itemCount)
    || itemCount <= 0
    || itemCount !== value.length
    || !value.every(isServerPricedLine)
  ) {
    return false;
  }
  return new Set(value.map((line) => line.product_id)).size === value.length;
}

/**
 * Maps a server preview into a safe presentation contract. This rejects client-hidden
 * responses even if unexpected financial keys are present, rejects incomplete visible
 * responses, and returns source amounts unchanged (never recomputed by the browser).
 */
export function resolveCustomerOrderPricingPresentation(
  policyValue: unknown,
  payload: unknown,
  expectedSurface?: "cart" | "orders",
): CustomerOrderPricingPresentation {
  if (
    policyValue !== true
    || !isRecord(payload)
    || payload.visible !== true
    || (payload.surface !== "cart" && payload.surface !== "orders")
    || (expectedSurface !== undefined && payload.surface !== expectedSurface)
    || payload.promotion_pricing_version !== 1
    || !hasCompleteServerPricedLines(payload.items, payload.item_count)
    || !isFiniteNonNegativeAmount(payload.discount_total)
    || typeof payload.currency !== "string"
    || !/^[A-Z]{3}$/.test(payload.currency)
    || !isFiniteNonNegativeAmount(payload.total_amount)
  ) {
    return { visible: false };
  }

  const customerTierLabel =
    typeof payload.customer_tier_label === "string" && payload.customer_tier_label.trim()
      ? payload.customer_tier_label
      : undefined;

  return {
    visible: true,
    // Whitelist only fields this presentation contract consumes. A future RPC field
    // such as base_price, unit_cost, margin, or tenant metadata must not flow through.
    items: payload.items.map((line) => ({
      product_id: line.product_id,
      name: line.name,
      quantity: line.quantity,
      original_unit_price: line.original_unit_price,
      discount_per_unit: line.discount_per_unit,
      discount_amount: line.discount_amount,
      promotion_title: line.promotion_title,
      unit_price: line.unit_price,
      line_total: line.line_total,
    })),
    totalAmount: payload.total_amount,
    discountTotal: payload.discount_total,
    currency: payload.currency,
    customerTierVisible: payload.customer_tier_visible === true && customerTierLabel !== undefined,
    ...(payload.customer_tier_visible === true && customerTierLabel !== undefined
      ? { customerTierLabel }
      : {}),
  };
}
