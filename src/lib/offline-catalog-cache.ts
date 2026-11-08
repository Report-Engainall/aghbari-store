/**
 * Offline product catalogs are tenant-derived reads, not global public assets.
 * Keep each catalog and its freshness marker in an account-specific namespace.
 */
const PROFILE_CATALOG_PREFIX = "aghbari:catalog:v2:profile:";
const FNV64_OFFSET_BASIS = 14695981039346656037n;
const FNV64_PRIME = 1099511628211n;
const FNV64_MASK = (1n << 64n) - 1n;

export const LEGACY_OFFLINE_CATALOG_KEY = "aghbari:catalog:v1";
export const LEGACY_OFFLINE_CATALOG_SYNC_KEY = "aghbari:catalog:last-server-sync:v1";

export type OfflineCatalogCacheKeys = {
  catalogKey: string;
  lastServerSyncKey: string;
  scopeKey: string;
};

export type OfflineCatalogTenantScope = {
  profileId: string;
  organizationId: string;
  warehouseId: string | null;
  isStaff: boolean;
};

type OfflineCatalogStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function offlineCatalogCacheKeys(
  profileId: string | null | undefined,
): OfflineCatalogCacheKeys | null {
  const normalizedProfileId = profileId?.trim();
  if (!normalizedProfileId) return null;

  const prefix = `${PROFILE_CATALOG_PREFIX}${encodeURIComponent(normalizedProfileId)}`;
  return {
    catalogKey: `${prefix}:items`,
    lastServerSyncKey: `${prefix}:last-server-sync`,
    scopeKey: `${prefix}:scope-fingerprint`,
  };
}

/** A stable compact scope marker; it is not an access token or authorization credential. */
export function offlineCatalogScopeFingerprint(scope: OfflineCatalogTenantScope): string {
  const canonicalScope = JSON.stringify([
    scope.profileId.trim(),
    scope.organizationId.trim(),
    scope.warehouseId?.trim() || null,
    Boolean(scope.isStaff),
  ]);
  let hash = FNV64_OFFSET_BASIS;
  for (const character of canonicalScope) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * FNV64_PRIME) & FNV64_MASK;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

/**
 * Check the stored catalog against the latest server-derived scope. A missing or
 * changed marker invalidates old rows before they can be rendered for this scope.
 * Returns true only when the existing marker already matched.
 */
export function reconcileOfflineCatalogScope(
  storage: OfflineCatalogStorage,
  scope: OfflineCatalogTenantScope,
): boolean {
  const keys = offlineCatalogCacheKeys(scope.profileId);
  if (!keys || !scope.organizationId.trim()) return false;

  const nextFingerprint = offlineCatalogScopeFingerprint(scope);
  let previousFingerprint: string | null;
  try {
    previousFingerprint = storage.getItem(keys.scopeKey);
  } catch {
    clearOfflineCatalogCache(storage, scope.profileId);
    return false;
  }

  if (previousFingerprint === nextFingerprint) return true;

  clearOfflineCatalogCache(storage, scope.profileId);
  try {
    storage.setItem(keys.scopeKey, nextFingerprint);
  } catch {
    // Without a durable scope marker, subsequent reads remain fail-closed.
  }
  return false;
}

export function clearOfflineCatalogCache(
  storage: Pick<Storage, "removeItem">,
  profileId: string | null | undefined,
): void {
  const keys = offlineCatalogCacheKeys(profileId);
  if (!keys) return;

  for (const key of [keys.catalogKey, keys.lastServerSyncKey, keys.scopeKey]) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage may be disabled or quota-restricted. The UI still fails closed by scope.
    }
  }
}

export function clearLegacyOfflineCatalogCache(
  storage: Pick<Storage, "removeItem">,
): void {
  for (const key of [LEGACY_OFFLINE_CATALOG_KEY, LEGACY_OFFLINE_CATALOG_SYNC_KEY]) {
    try {
      storage.removeItem(key);
    } catch {
      // Old unscoped data is never read by the current implementation.
    }
  }
}
