import { supabase } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SAVED_PRODUCTS = 500;
const SAVED_CACHE_PREFIX = "aghbari:wishlist:v2:";
const PENDING_PREFIX = "aghbari:wishlist-pending:v1:";

type PendingSavedChanges = Record<string, boolean>;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const queuedWrites = new Map<string, Promise<void>>();

function browserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function savedProductCacheKey(profileId: string): string {
  return `${SAVED_CACHE_PREFIX}${profileId}`;
}

function pendingStorageKey(profileId: string): string {
  return `${PENDING_PREFIX}${profileId}`;
}

export function readPendingSavedProductChanges(
  profileId: string,
  storage: StorageLike | null = browserStorage(),
): PendingSavedChanges {
  if (!storage || !UUID_PATTERN.test(profileId)) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(pendingStorageKey(profileId)) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const valid: PendingSavedChanges = {};
    for (const [productId, saved] of Object.entries(parsed)) {
      if (UUID_PATTERN.test(productId) && typeof saved === "boolean" && Object.keys(valid).length < MAX_SAVED_PRODUCTS) {
        valid[productId] = saved;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

function writePendingSavedProductChange(
  profileId: string,
  productId: string,
  saved: boolean,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage || !UUID_PATTERN.test(profileId) || !UUID_PATTERN.test(productId)) return;
  const pending = readPendingSavedProductChanges(profileId, storage);
  pending[productId] = saved;
  try {
    storage.setItem(pendingStorageKey(profileId), JSON.stringify(pending));
  } catch {
    // Keep the optimistic UI state; a later online retry may still succeed in this tab.
  }
}

function clearPendingSavedProductChange(
  profileId: string,
  productId: string,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) return;
  const pending = readPendingSavedProductChanges(profileId, storage);
  delete pending[productId];
  try {
    if (Object.keys(pending).length) storage.setItem(pendingStorageKey(profileId), JSON.stringify(pending));
    else storage.removeItem(pendingStorageKey(profileId));
  } catch {
    // A stale replay is safe because the server operation has desired-state semantics.
  }
}

export async function fetchStorefrontSavedProductIds(): Promise<string[]> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("لا توجد شبكة؛ ستبقى المفضلة المحفوظة لهذا الحساب محليًا حتى عودة الاتصال.");
  }
  const { data, error } = await supabase.rpc("list_storefront_saved_products");
  if (error) throw new Error("تعذر تحميل المفضلة من الخادم: " + error.message);
  if (!Array.isArray(data) || data.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    throw new Error("أعاد الخادم قائمة مفضلة غير صالحة؛ تم إيقاف المزامنة.");
  }
  return [...new Set(data as string[])].slice(0, MAX_SAVED_PRODUCTS);
}

/**
 * Save the desired state, not a toggle. Per-profile/product requests are serialized
 * within this tab; network/auth failures are queued for replay when the connection returns.
 * The profile ID is only a local queue namespace. The RPC derives the real profile/tenant
 * from auth.uid() and this function checks the active auth user before issuing the call.
 */
export function setStorefrontSavedProduct(
  authUserId: string,
  profileId: string,
  productId: string,
  saved: boolean,
): Promise<boolean> {
  if (!UUID_PATTERN.test(authUserId) || !UUID_PATTERN.test(profileId) || !UUID_PATTERN.test(productId)) {
    return Promise.resolve(false);
  }

  const queueKey = `${profileId}:${productId}`;
  const previous = queuedWrites.get(queueKey) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        writePendingSavedProductChange(profileId, productId, saved);
        return false;
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || sessionData.session?.user.id !== authUserId) {
        writePendingSavedProductChange(profileId, productId, saved);
        return false;
      }

      const { data, error } = await supabase.rpc("set_storefront_saved_product", {
        p_product_id: productId,
        p_saved: saved,
      });
      if (error) throw error;
      const result = data as { product_id?: unknown; saved?: unknown } | null;
      if (!result || result.product_id !== productId || result.saved !== saved) {
        throw new Error("أعاد الخادم نتيجة حفظ مفضلة غير مطابقة للطلب.");
      }

      clearPendingSavedProductChange(profileId, productId);
      return true;
    } catch {
      writePendingSavedProductChange(profileId, productId, saved);
      return false;
    }
  });
  const queued = pending.then(() => undefined);
  queuedWrites.set(queueKey, queued);
  void queued.finally(() => {
    if (queuedWrites.get(queueKey) === queued) queuedWrites.delete(queueKey);
  });
  return pending;
}

/** Load canonical server state and replay any saved desired states after a reconnect. */
export async function syncStorefrontSavedProducts(
  authUserId: string,
  profileId: string,
): Promise<{ productIds: string[]; pendingCount: number }> {
  const serverIds = await fetchStorefrontSavedProductIds();
  const productIds = new Set(serverIds);
  const pending = readPendingSavedProductChanges(profileId);
  let pendingCount = 0;

  for (const [productId, saved] of Object.entries(pending)) {
    const applied = await setStorefrontSavedProduct(authUserId, profileId, productId, saved);
    if (saved) productIds.add(productId);
    else productIds.delete(productId);
    if (!applied) pendingCount += 1;
  }

  return { productIds: [...productIds].slice(0, MAX_SAVED_PRODUCTS), pendingCount };
}
