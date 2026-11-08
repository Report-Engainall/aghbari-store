import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/format";
import { resolveStorefrontPricePresentation } from "@/lib/storefront-price-visibility";

export type StorefrontPricePresentationProps = {
  /** Exact public setting value; anything other than boolean true hides the price. */
  policyValue: unknown;
  /** Price returned by the server. This component never derives or recalculates it. */
  serverUnitPrice: unknown;
  /** Keep the existing card/detail CSS contract without changing the pricing policy. */
  className?: string;
  /** Optional unit suffix such as "لكل كرتون". */
  unitLabel?: ReactNode;
};

/**
 * Shared fail-closed renderer for public product prices.
 *
 * Hidden, malformed and zero-sentinel values render no price DOM at all. Callers
 * must pass the explicit server/public-settings policy and server-resolved amount;
 * this component must never be fed a client-derived tier or calculated price.
 */
export function StorefrontPricePresentation({
  policyValue,
  serverUnitPrice,
  className = "sf-product-price",
  unitLabel,
}: StorefrontPricePresentationProps) {
  const presentation = resolveStorefrontPricePresentation(policyValue, serverUnitPrice);

  if (!presentation.visible) return null;

  return (
    <div className={className}>
      <strong>{formatCurrency(presentation.amount)}</strong>
      {unitLabel == null ? null : <span>{unitLabel}</span>}
    </div>
  );
}
