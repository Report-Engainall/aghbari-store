import { resolveCustomerOrderPricingPresentation } from "@/lib/storefront-price-visibility";

export type CustomerOrderPricingPresentationProps = {
  /** Use show_price_in_cart or show_price_in_orders from public server settings. */
  policyValue: unknown;
  /** Exact RPC payload from preview_customer_order_pricing; never client-calculated. */
  serverPayload: unknown;
  expectedSurface: "cart" | "orders";
  title?: string;
  className?: string;
};

function formatServerAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ar-YE", {
      style: "currency",
      currency,
      maximumFractionDigits: 3,
    }).format(amount);
  } catch {
    // The resolver already requires a bounded ISO-style code. Keep the raw source
    // value visible with its code rather than silently relabeling it as Yemeni rial.
    return `${new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(amount)} ${currency}`;
  }
}

/**
 * Fail-closed renderer for the cart and order-review surfaces.
 * It consumes only server-priced payload fields whitelisted by the resolver and
 * never derives line totals, customer tier, or order totals in the browser.
 */
export function CustomerOrderPricingPresentation({
  policyValue,
  serverPayload,
  expectedSurface,
  title = "ملخص الأسعار",
  className = "sf-order-pricing",
}: CustomerOrderPricingPresentationProps) {
  const presentation = resolveCustomerOrderPricingPresentation(
    policyValue,
    serverPayload,
    expectedSurface,
  );

  if (!presentation.visible) return null;

  return (
    <section className={className} aria-label={title}>
      {presentation.customerTierVisible && presentation.customerTierLabel ? (
        <p className="sf-order-pricing-tier">
          فئة العميل: <strong>{presentation.customerTierLabel}</strong>
        </p>
      ) : null}
      <ul className="sf-order-pricing-lines">
        {presentation.items.map((line) => (
          <li key={line.product_id}>
            <span className="sf-order-pricing-item">
              {line.name} × {line.quantity}
            </span>
            {line.discount_amount > 0 ? (
              <>
                <span className="sf-order-pricing-unit">
                  السعر قبل الحملة: {formatServerAmount(line.original_unit_price, presentation.currency ?? "YER")}
                </span>
                <span className="sf-order-pricing-discount">
                  خصم {line.promotion_title ? "«" + line.promotion_title + "»" : "الحملة"}: {formatServerAmount(line.discount_amount, presentation.currency ?? "YER")}
                </span>
              </>
            ) : null}
            <span className="sf-order-pricing-unit">
              سعر الوحدة بعد الخصم: {formatServerAmount(line.unit_price, presentation.currency ?? "YER")}
            </span>
            <span className="sf-order-pricing-line-total">
              {formatServerAmount(line.line_total, presentation.currency ?? "YER")}
            </span>
          </li>
        ))}
      </ul>
      {presentation.discountTotal > 0 ? (
        <div className="sf-order-pricing-total" aria-label="إجمالي خصم الحملات">
          <span>إجمالي خصم الحملات</span>
          <strong>{formatServerAmount(presentation.discountTotal, presentation.currency ?? "YER")}</strong>
        </div>
      ) : null}
      <div className="sf-order-pricing-total">
        <span>الإجمالي بعد الخصم</span>
        <strong>{formatServerAmount(presentation.totalAmount, presentation.currency ?? "YER")}</strong>
      </div>
    </section>
  );
}
