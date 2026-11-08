import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { CustomerOrderPricingPresentation } from "@/components/CustomerOrderPricingPresentation";
import { resolveCustomerOrderPricingPresentation } from "@/lib/storefront-price-visibility";
import { retryRead } from "@/lib/retry";

export type CustomerOrderPricingPreviewItem = {
  product_id: string;
  quantity: number;
};
export type CustomerOrderPricingSurface = "cart" | "orders";

type PreviewAttempt =
  | { signature: string; status: "loading" }
  | { signature: string; status: "ready"; payload: unknown }
  | { signature: string; status: "hidden" }
  | { signature: string; status: "error" }
  | { signature: string; status: "auth-required" };

type PreviewResult =
  | { status: "ready"; payload: unknown }
  | { status: "hidden" }
  | { status: "error" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidPreviewItem(value: unknown): value is CustomerOrderPricingPreviewItem {
  if (!isRecord(value)) return false;
  if (typeof value.product_id !== "string" || !value.product_id.trim()) return false;
  return typeof value.quantity === "number" &&
    Number.isSafeInteger(value.quantity) &&
    value.quantity > 0;
}

function parsePreviewItems(signature: string): CustomerOrderPricingPreviewItem[] | null {
  try {
    const value: unknown = JSON.parse(signature);
    if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
    if (!value.every(isValidPreviewItem)) return null;
    return value;
  } catch {
    return null;
  }
}

async function fetchPreviewResult(
  items: CustomerOrderPricingPreviewItem[],
  surface: CustomerOrderPricingSurface,
  isActive: () => boolean,
): Promise<PreviewResult> {
  try {
    const data = await retryRead(async () => {
      if (!isActive()) throw new Error("pricing preview request cancelled");
      const { data, error } = await supabase.rpc("preview_customer_order_pricing", {
        p_items: items,
        p_surface: surface,
      });
      if (error) throw error;
      return data;
    });

    const presentation = resolveCustomerOrderPricingPresentation(true, data, surface);
    if (presentation.visible) return { status: "ready", payload: data };

    if (isRecord(data) && data.visible === false && data.surface === surface) {
      return { status: "hidden" };
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

function PreviewStatusMessage({
  status,
  onRetry,
}: {
  status: "loading" | "auth-required" | "hidden" | "error";
  onRetry: () => void;
}) {
  if (status === "loading") {
    return <p role="status">جار جلب مراجعة الأسعار من الخادم؛ لم تُعرض أي مبالغ محلية.</p>;
  }
  if (status === "auth-required") {
    return <p role="status">سجّل الدخول أولًا؛ لن تُعرض الأسعار دون معاينة خادمية مرتبطة بحسابك.</p>;
  }
  if (status === "hidden") {
    return <p role="status">لم يسمح إعداد الخادم بعرض الأسعار على هذه الشاشة؛ لم تُعرض أي مبالغ.</p>;
  }

  return (
    <div role="alert">
      تعذر التحقق من أسعار هذه الشاشة من الخادم؛ تم إخفاء المبالغ. أعد المحاولة.
      <button type="button" className="sf-btn-secondary" style={{ marginInlineStart: 10 }} onClick={onRetry}>
        إعادة المحاولة
      </button>
    </div>
  );
}

function PreviewAttemptView({
  attempt,
  signature,
  policyValue,
  surface,
  title,
  onRetry,
}: {
  attempt: PreviewAttempt | null;
  signature: string;
  policyValue: unknown;
  surface: CustomerOrderPricingSurface;
  title: string;
  onRetry: () => void;
}) {
  const current = attempt?.signature === signature ? attempt : null;
  const wrapperStyle = {
    marginTop: 12,
    padding: 12,
    border: "1px solid #d8e6e8",
    borderRadius: 10,
    background: "#f8fbfc",
    color: "#344b52",
  } as const;

  if (!current || current.status !== "ready") {
    const status = current?.status ?? "loading";
    return (
      <div style={wrapperStyle}>
        <PreviewStatusMessage status={status} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <CustomerOrderPricingPresentation
        policyValue={policyValue}
        serverPayload={current.payload}
        expectedSurface={surface}
        title={title}
      />
    </div>
  );
}

/**
 * Fetches a tenant/tier-aware price preview from the server for one customer surface.
 * No price is derived from catalog data in the browser. False/malformed policy values,
 * stale payloads, denied RPCs and malformed server responses all fail closed.
 */
export function CustomerOrderPricingPreview({
  items,
  policyValue,
  surface,
  title,
}: {
  items: readonly CustomerOrderPricingPreviewItem[];
  policyValue: unknown;
  surface: CustomerOrderPricingSurface;
  title: string;
}) {
  const { user } = useAuth();
  const [retry, setRetry] = useState(0);
  const [attempt, setAttempt] = useState<PreviewAttempt | null>(null);
  const signature = JSON.stringify(items.map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity,
  })));
  const identitySignature = JSON.stringify({
    userId: user?.id ?? null,
    profileId: user?.profileId ?? null,
    roles: [...(user?.roles ?? [])].sort(),
    isStaff: user?.isStaff === true,
  });
  const requestSignature = surface + ":" + signature + ":" + identitySignature;

  useEffect(() => {
    let active = true;

    if (policyValue !== true || items.length === 0) {
      setAttempt(null);
      return () => { active = false; };
    }

    if (!user?.profileId) {
      setAttempt({ signature: requestSignature, status: "auth-required" });
      return () => { active = false; };
    }

    const parsedItems = parsePreviewItems(signature);
    if (!parsedItems) {
      setAttempt({ signature: requestSignature, status: "error" });
      return () => { active = false; };
    }

    setAttempt({ signature: requestSignature, status: "loading" });
    void fetchPreviewResult(parsedItems, surface, () => active)
      .then((result) => {
        if (active) setAttempt({ signature: requestSignature, ...result });
      })
      .catch(() => {
        if (active) setAttempt({ signature: requestSignature, status: "error" });
      });

    return () => { active = false; };
  }, [requestSignature, signature, items.length, policyValue, surface, identitySignature, retry, user?.profileId]);

  if (policyValue !== true || items.length === 0) return null;

  return (
    <PreviewAttemptView
      attempt={attempt}
      signature={requestSignature}
      policyValue={policyValue}
      surface={surface}
      title={title}
      onRetry={() => setRetry((value) => value + 1)}
    />
  );
}
