import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Minus, Plus, Search, ShoppingCart, Trash2,
  Package, Tag, Phone, MapPin, Mail, Check, ChevronLeft, Menu, ClipboardList,
  Heart, GitCompare, ArrowRight, SlidersHorizontal,
} from 'lucide-react';
import { fetchProducts, fetchCategories, fetchStorefrontPromotions, fetchSettingsMap, fetchStorefrontAnnouncements } from '@/lib/api';
import { fetchStorefrontCatalogPage, type StorefrontCatalogPage } from '@/lib/storefront-catalog';
import { recordStorefrontUnavailableProductSearch } from '@/lib/intelligence/unavailable-product-search-demand-client';
import { useFetch } from '@/lib/useFetch';
import { formatNumber } from '@/lib/format';
import { StorefrontPricePresentation } from '@/components/StorefrontPricePresentation';
import { resolveStorefrontPricePresentation } from '@/lib/storefront-price-visibility';
import { CustomerOrderPricingPreview } from '@/components/CustomerOrderPricingPreview';
import { matchesArabicCatalogSearch, normalizeCatalogSearchQuery, MAX_CATALOG_SEARCH_LENGTH, normalizeSavedProductIds, sanitizePublicCatalogCache, validateQuickOrderLines } from '@/lib/commerce-utils';
import { loadOfflineCartDraft, offlineCartStorageKey, saveOfflineCartDraft } from '@/lib/offline-cart';
import { fetchCustomerCart, saveCustomerCart } from '@/lib/customer-cart';
import type { ProductWithInventory, Category, Promotion } from '@/lib/types';
import { StorefrontAnnouncementSlider } from '@/components/StorefrontAnnouncementSlider';
import { useAuth } from '@/lib/auth';
import { Link, useNavigate } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchCustomerAddresses, type CustomerAddress } from '@/lib/customer-addresses';
import { readPendingSavedProductChanges, savedProductCacheKey, setStorefrontSavedProduct, syncStorefrontSavedProducts } from '@/lib/saved-products';
import { fetchProductUnitOptions, type ProductAlternateUnit } from '@/lib/product-unit-conversions';

const PUBLIC_CATALOG_CACHE_KEY = 'aghbari:catalog:public:v2';

type CartItem = { product: ProductWithInventory; quantity: number };
type ProductUnitSelection = { unit_name: string; base_units_per_unit: number; selected_quantity: number };
type StorefrontProductsSnapshot =
  | ({ mode: 'paged'; identityKey: string } & StorefrontCatalogPage)
  | { mode: 'full'; items: ProductWithInventory[]; identityKey: string; publicCacheable: boolean };

function pendingCartProduct(productId: string): ProductWithInventory {
  return {
    id: productId, name: 'صنف محفوظ — جار تحديث بياناته', name_en: null, item_code: '', sku: null, barcode: null,
    category_id: null, brand_id: null, unit: 'وحدة', description: null, image_url: null, is_active: false, is_featured: false,
    sort_order: 0, stock_quantity: 0, reserved_quantity: 0, min_stock_level: 0, status: 'pending',
  };
}

function nextOrderQuantity(currentQuantity: number, minimum: number, multiple: number): number {
  if (currentQuantity < minimum) return minimum;
  return (currentQuantity - minimum) % multiple === 0
    ? currentQuantity + multiple
    : minimum + (Math.floor((currentQuantity - minimum) / multiple) + 1) * multiple;
}

function mergeProductIntoCart(
  previous: CartItem[],
  product: ProductWithInventory,
  requestedQuantity: number | undefined,
  minimum: number,
  multiple: number,
  available: number | null,
): CartItem[] {
  const existing = previous.find((item) => item.product.id === product.id);
  const latestCurrentQuantity = existing?.quantity ?? 0;
  const latestNextQuantity = requestedQuantity ?? nextOrderQuantity(latestCurrentQuantity, minimum, multiple);
  if (available !== null && latestNextQuantity > available) return previous;
  if (!existing) return [...previous, { product, quantity: latestNextQuantity }];
  return previous.map((item) => item.product.id === product.id
    ? { ...item, quantity: latestNextQuantity }
    : item);
}
type StoreView = 'shop' | 'product' | 'wishlist' | 'compare' | 'matrix' | 'cart' | 'checkout' | 'confirm';
export type StorefrontInitialView = 'shop' | 'product' | 'wishlist' | 'compare' | 'cart' | 'checkout';

function readSavedProductIds(key: string, maxItems: number): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeSavedProductIds(JSON.parse(window.localStorage.getItem(key) || '[]') as unknown, maxItems);
  } catch {
    return [];
  }
}

type StorefrontProps = {
  onExit: () => void;
  initialView?: StorefrontInitialView;
  initialProductId?: string;
  initialQuery?: string;
  initialCategoryId?: string;
  initialAvailableOnly?: boolean;
};

/**
 * Remount all storefront-local data and UI state whenever the authenticated identity
 * or effective role changes. Keep this boundary inside Storefront: route components
 * may render outside AuthProvider in test/server route contexts.
 */
export function Storefront(props: StorefrontProps) {
  const { user, ready } = useAuth();
  const identityKey = JSON.stringify({
    ready,
    userId: user?.id ?? null,
    profileId: user?.profileId ?? null,
    roles: Array.isArray(user?.roles) ? [...user.roles].sort() : [],
    isStaff: user?.isStaff === true,
  });
  return <StorefrontSession key={identityKey} {...props} />;
}

function describeCustomerCartSyncState(state: string, isOnline: boolean): string {
  if (state === 'loading') return 'جار مزامنة سلة حسابك الآمنة مع الخادم...';
  if (state === 'synced') return 'تم حفظ سلتك في حسابك؛ ستظهر عند الدخول من جهاز آخر.';
  if (state === 'error') return 'تعذر استرجاع السلة المحفوظة؛ بقيت مسودتك المحلية دون استبدال.';
  if (state === 'pending') {
    return isOnline
      ? 'السلة المحلية محفوظة، لكن تأكيد المزامنة مع الخادم ما زال معلقًا.'
      : 'أنت غير متصل؛ تُحفظ التغييرات محليًا وستُعاد المزامنة عند الاتصال.';
  }
  return 'سلة الحساب تُزامن تلقائيًا عند فتحها أو تعديلها.';
}

function StorefrontSession({ onExit, initialView = 'shop', initialProductId, initialQuery, initialCategoryId, initialAvailableOnly }: StorefrontProps) {
  const { user, ready: authReady } = useAuth();
  const effectiveRoles = Array.isArray(user?.roles) ? [...user.roles].sort() : [];
  const storefrontIdentityKey = JSON.stringify({
    authReady,
    userId: user?.id ?? null,
    profileId: user?.profileId ?? null,
    roles: effectiveRoles,
    isStaff: user?.isStaff === true,
  });
  const navigate = useNavigate();
  const [view, setView] = useState<StoreView>(initialView);
  const [query, setQuery] = useState(() => normalizeCatalogSearchQuery(initialQuery ?? ''));
  const [activeCat, setActiveCat] = useState<string>(initialCategoryId ?? '');
  const [availableOnly, setAvailableOnly] = useState<boolean>(initialAvailableOnly ?? false);
  const [catalogPage, setCatalogPage] = useState(1);
  const [debouncedQuery, setDebouncedQuery] = useState(() => normalizeCatalogSearchQuery(initialQuery ?? ''));
  const isPagedView = initialView === 'shop' && view === 'shop';
  const { data: productSnapshot, loading: productsLoading, error: productsError, refetch: refetchProducts } =
    useFetch<StorefrontProductsSnapshot>(async () => {
      // The Supabase session is authoritative. useAuth can briefly lag a sign-in,
      // sign-out, account switch, or token refresh; all catalog modes fail closed on mismatch.
      const emptySnapshot = (): StorefrontProductsSnapshot => isPagedView
        ? { mode: 'paged', identityKey: storefrontIdentityKey, page: catalogPage, pageSize: 24, totalCount: 0, totalPages: 0, items: [] }
        : { mode: 'full', items: [], identityKey: storefrontIdentityKey, publicCacheable: false };
      if (!authReady) return emptySnapshot();

      const expectedAuthUserId = user?.id ?? null;
      const anonymousContext = !expectedAuthUserId && !user?.profileId;
      if (!anonymousContext && !expectedAuthUserId) {
        throw new Error('هوية المستخدم غير مكتملة؛ لم يتم تحميل بيانات الكتالوج.');
      }

      const readSessionUserId = async () => {
        const response = await supabase.auth.getSession();
        if (!response || response.error) throw new Error('تعذر التحقق من جلسة المستخدم.');
        return response.data?.session?.user?.id ?? null;
      };
      const assertLiveIdentity = (sessionUserId: string | null, phase: 'before' | 'after') => {
        if (
          (anonymousContext && sessionUserId !== null) ||
          (!anonymousContext && sessionUserId !== expectedAuthUserId) ||
          (phase === 'after' && (!authReady || (user?.id ?? null) !== expectedAuthUserId))
        ) {
          throw new Error(phase === 'before'
            ? 'جلسة المصادقة لا تطابق هوية العرض الحالية؛ لم يتم تحميل بيانات الكتالوج.'
            : 'تغيرت جلسة المصادقة أثناء تحميل الكتالوج؛ أُهملت النتائج لمنع خلط المؤسسات.');
        }
      };

      let sessionUserBefore: string | null;
      try {
        sessionUserBefore = await readSessionUserId();
      } catch {
        throw new Error('تعذر التحقق من جلسة المستخدم؛ أعد المحاولة بعد اكتمال المصادقة.');
      }
      assertLiveIdentity(sessionUserBefore, 'before');

      if (isPagedView) {
        const page = await fetchStorefrontCatalogPage({
          search: debouncedQuery,
          categoryId: activeCat || null,
          page: catalogPage,
          pageSize: 24,
          availableOnly,
        });
        let sessionUserAfter: string | null;
        try {
          sessionUserAfter = await readSessionUserId();
        } catch {
          throw new Error('تعذر إعادة التحقق من جلسة المستخدم بعد تحميل الكتالوج.');
        }
        assertLiveIdentity(sessionUserAfter, 'after');
        return { mode: 'paged', identityKey: storefrontIdentityKey, ...page };
      }

      const items = await fetchProducts();
      let sessionUserAfter: string | null;
      try {
        sessionUserAfter = await readSessionUserId();
      } catch {
        throw new Error('تعذر إعادة التحقق من جلسة المستخدم بعد تحميل الكتالوج.');
      }
      assertLiveIdentity(sessionUserAfter, 'after');
      return { mode: 'full', items, identityKey: storefrontIdentityKey, publicCacheable: anonymousContext };
    }, [view, catalogPage, debouncedQuery, activeCat, availableOnly, initialView, storefrontIdentityKey]);
  // useFetch retains its previous result while a new request is pending or fails.
  // Only use data produced under the current session/role identity.
  const snapshotMatchesIdentity = productSnapshot?.identityKey === storefrontIdentityKey;
  const liveProducts = productSnapshot && snapshotMatchesIdentity && !productsError ? productSnapshot.items : null;
  const pageInfo = productSnapshot?.mode === 'paged' && snapshotMatchesIdentity && !productsError ? productSnapshot : null;
  const [cachedProducts, setCachedProducts] = useState<ProductWithInventory[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      // The former v1 cache had no public/tenant provenance. Purge it rather than
      // risk showing a previous authenticated organization's stock on a later session.
      window.localStorage.removeItem('aghbari:catalog:v1');
      const cachedRaw = window.localStorage.getItem(PUBLIC_CATALOG_CACHE_KEY);
      if (cachedRaw === null) return [];
      const value = JSON.parse(cachedRaw) as unknown;
      const safe = sanitizePublicCatalogCache(value);
      window.localStorage.setItem(PUBLIC_CATALOG_CACHE_KEY, JSON.stringify(safe));
      return safe;
    } catch { return []; }
  });
  const cachedProductsRef = useRef(cachedProducts);
  // Shared public cache is guest-only. Authenticated or not-yet-resolved sessions
  // must not fall back to globally cached products/inventory from another tenant.
  const products = isPagedView || !authReady || Boolean(user?.profileId)
    ? (liveProducts ?? [])
    : (liveProducts ?? cachedProducts);
  const {
    data: categories,
    loading: categoriesLoading,
    error: categoriesError,
    refetch: refetchCategories,
  } = useFetch(fetchCategories);
  const { data: promotions } = useFetch(fetchStorefrontPromotions);
  const { data: settings } = useFetch(fetchSettingsMap);
  const { data: storefrontAnnouncements, error: storefrontAnnouncementsError } = useFetch(fetchStorefrontAnnouncements);
  const cartStorageKey = offlineCartStorageKey(user?.profileId);
  const wishlistStorageKey = user?.profileId ? savedProductCacheKey(user.profileId) : 'aghbari:wishlist:v1';
  const [cartState, setCartState] = useState<{ storageKey: string; items: CartItem[] }>({ storageKey: '', items: [] });
  const cartMutationRevisionRef = useRef(0);
  const cartRestored = cartState.storageKey === cartStorageKey;
  const cart = cartRestored ? cartState.items : [];
  function setCart(next: CartItem[] | ((previous: CartItem[]) => CartItem[])) {
    cartMutationRevisionRef.current += 1;
    setCartState((current) => {
      const previous = current.storageKey === cartStorageKey ? current.items : [];
      const items = typeof next === 'function' ? next(previous) : next;
      return { storageKey: cartStorageKey, items };
    });
  }
  const [matrixQuantities, setMatrixQuantities] = useState<Record<string, string>>({});
  const [matrixFeedback, setMatrixFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [cartActionNotice, setCartActionNotice] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [lastOrderNo, setLastOrderNo] = useState('');
  const [lastOrderId, setLastOrderId] = useState('');
  // Store only the selected ID. Resolve product details from the current identity-bound
  // catalog so stale tenant objects cannot survive while auth or network requests change.
  const [selectedProductState, setSelectedProductState] = useState<{
    identityKey: string;
    productId: string | null;
  }>({ identityKey: '', productId: null });
  const selectedProduct = selectedProductState.identityKey === storefrontIdentityKey && selectedProductState.productId
    ? products.find((product) => product.id === selectedProductState.productId) ?? null
    : null;
  const [wishlistState, setWishlistState] = useState<{ scopeKey: string; ids: string[] }>({ scopeKey: '', ids: [] });
  const wishlist = wishlistState.scopeKey === wishlistStorageKey ? wishlistState.ids : [];
  const setWishlist = useCallback((next: string[] | ((previous: string[]) => string[])) => {
    setWishlistState((current) => {
      const previous = current.scopeKey === wishlistStorageKey ? current.ids : [];
      const ids = typeof next === 'function' ? next(previous) : next;
      return { scopeKey: wishlistStorageKey, ids };
    });
  }, [wishlistStorageKey]);
  const [compare, setCompare] = useState<string[]>(() => readSavedProductIds('aghbari:compare:v1', 3));
  const [savedListNotice, setSavedListNotice] = useState('');
  const [wishlistHydratedFor, setWishlistHydratedFor] = useState('');
  const [wishlistSyncState, setWishlistSyncState] = useState<'loading' | 'local' | 'synced' | 'pending'>('loading');
  const wishlistRevisionRef = useRef(0);
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const previousOnlineRef = useRef(isOnline);
  const unavailableSearchObservationKeysRef = useRef(new Set<string>());
  const [customerCartHydratedFor, setCustomerCartHydratedFor] = useState('');
  const [customerCartSyncState, setCustomerCartSyncState] = useState<'idle' | 'loading' | 'synced' | 'pending' | 'error'>('idle');
  const [customerCartRetryCount, setCustomerCartRetryCount] = useState(0);
  const persistentCartProfileId = user && !user.isStaff && Array.isArray(user.roles) && user.roles.includes('customer') ? user.profileId : '';

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setQuery(normalizeCatalogSearchQuery(initialQuery ?? ''));
    setCatalogPage(1);
  }, [initialQuery]);

  useEffect(() => {
    setActiveCat(initialCategoryId ?? '');
    setCatalogPage(1);
  }, [initialCategoryId]);

  useEffect(() => {
    setAvailableOnly(initialAvailableOnly ?? false);
    setCatalogPage(1);
  }, [initialAvailableOnly]);

  useEffect(() => {
    setCatalogPage(1);
  }, [debouncedQuery, activeCat, availableOnly]);

  useEffect(() => {
    cachedProductsRef.current = cachedProducts;
  }, [cachedProducts]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  useEffect(() => {
    const normalizedQuery = normalizeCatalogSearchQuery(query).trim();
    if (!authReady || !persistentCartProfileId || !user?.id || user.isStaff ||
        !Array.isArray(user.roles) || !user.roles.includes('customer') ||
        !isPagedView || view !== 'shop' || !isOnline ||
        availableOnly || normalizedQuery.length < 2 ||
        normalizedQuery !== debouncedQuery.trim() ||
        productsLoading || productsError ||
        !pageInfo || pageInfo.page !== catalogPage ||
        pageInfo.identityKey !== storefrontIdentityKey) return;

    const unavailableIds = pageInfo.items
      .filter(product => product.inventory &&
        typeof product.inventory.quantity_available === 'number' &&
        product.inventory.quantity_available === 0)
      .map(product => product.id);

    if (!unavailableIds.length) return;
    const key = [
      storefrontIdentityKey,
      normalizedQuery,
      activeCat,
      catalogPage,
      unavailableIds.slice().sort().join(','),
    ].join('|');
    if (unavailableSearchObservationKeysRef.current.has(key)) return;
    unavailableSearchObservationKeysRef.current.add(key);
    if (unavailableSearchObservationKeysRef.current.size > 200) {
      const oldest = unavailableSearchObservationKeysRef.current.values().next().value;
      if (oldest) unavailableSearchObservationKeysRef.current.delete(oldest);
    }

    // The RPC rechecks the exact search, same-tenant product IDs and current zero
    // availability before persisting a pseudonymous daily observation. No query or
    // customer identifier is stored by the tracking contract.
    void recordStorefrontUnavailableProductSearch({
      search: normalizedQuery,
      categoryId: activeCat || null,
      productIds: unavailableIds,
    });
  }, [
    authReady, persistentCartProfileId, user?.id, user?.isStaff, user?.roles,
    isPagedView, view, isOnline, availableOnly, query, debouncedQuery,
    productsLoading, productsError, pageInfo, catalogPage, storefrontIdentityKey, activeCat,
  ]);

  useEffect(() => {
    // Only cache full-catalog data explicitly fetched for the current confirmed guest identity.
    if (
      !liveProducts ||
      productSnapshot?.mode !== 'full' ||
      productSnapshot.publicCacheable !== true ||
      productSnapshot.identityKey !== storefrontIdentityKey ||
      !authReady ||
      user?.id ||
      user?.profileId
    ) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (
        cancelled ||
        error ||
        data?.session !== null ||
        !authReady ||
        user?.id ||
        user?.profileId
      ) return;
      const safeCatalog = sanitizePublicCatalogCache(liveProducts);
      cachedProductsRef.current = safeCatalog;
      setCachedProducts(safeCatalog);
      try { window.localStorage.setItem(PUBLIC_CATALOG_CACHE_KEY, JSON.stringify(safeCatalog)); } catch { /* storage is optional */ }
    }).catch(() => {
      // If session provenance cannot be confirmed, do not populate shared cache.
    });
    return () => { cancelled = true; };
  }, [liveProducts, productSnapshot, storefrontIdentityKey, authReady, user?.id, user?.profileId]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setWishlistHydratedFor('');
    const cached = readSavedProductIds(wishlistStorageKey, 500);
    const revisionAtStart = wishlistRevisionRef.current;
    setWishlist(cached);

    if (!user?.id || !user.profileId) {
      setWishlistSyncState('local');
      setWishlistHydratedFor(wishlistStorageKey);
      return () => { cancelled = true; };
    }

    setWishlistSyncState('loading');
    void syncStorefrontSavedProducts(user.id, user.profileId).then(({ productIds, pendingCount }) => {
      if (cancelled) return;
      setWishlistHydratedFor(wishlistStorageKey);
      if (revisionAtStart !== wishlistRevisionRef.current) return;
      setWishlist(productIds);
      setWishlistSyncState(pendingCount > 0 ? 'pending' : 'synced');
    }).catch(() => {
      if (cancelled) return;
      setWishlistHydratedFor(wishlistStorageKey);
      if (revisionAtStart !== wishlistRevisionRef.current) return;
      setWishlist(cached);
      setWishlistSyncState('pending');
    });

    return () => { cancelled = true; };
  }, [authReady, user?.id, user?.profileId, wishlistStorageKey, setWishlist]);

  useEffect(() => {
    const cameOnline = !previousOnlineRef.current && isOnline;
    previousOnlineRef.current = isOnline;
    if (!cameOnline || !authReady || !user?.id || !user.profileId || wishlistHydratedFor !== wishlistStorageKey) return;

    let cancelled = false;
    const revisionAtStart = wishlistRevisionRef.current;
    setWishlistSyncState('loading');
    void syncStorefrontSavedProducts(user.id, user.profileId).then(({ productIds, pendingCount }) => {
      if (cancelled || revisionAtStart !== wishlistRevisionRef.current) return;
      setWishlist(productIds);
      setWishlistSyncState(pendingCount > 0 ? 'pending' : 'synced');
    }).catch(() => {
      if (!cancelled && revisionAtStart === wishlistRevisionRef.current) setWishlistSyncState('pending');
    });
    return () => { cancelled = true; };
  }, [isOnline, authReady, user?.id, user?.profileId, wishlistHydratedFor, wishlistStorageKey, setWishlist]);

  useEffect(() => {
    if (!authReady || wishlistHydratedFor !== wishlistStorageKey || wishlistState.scopeKey !== wishlistStorageKey) return;
    try { window.localStorage.setItem(wishlistStorageKey, JSON.stringify(wishlist)); } catch { /* cache is optional; server remains authoritative */ }
  }, [authReady, wishlist, wishlistHydratedFor, wishlistStorageKey, wishlistState.scopeKey]);

  useEffect(() => {
    try { window.localStorage.setItem('aghbari:compare:v1', JSON.stringify(compare)); } catch { /* saved preferences are optional */ }
  }, [compare]);

  useEffect(() => {
    if (initialView !== 'product' || !initialProductId || !products.length) return;
    setSelectedProductState({
      identityKey: storefrontIdentityKey,
      productId: products.some((product) => product.id === initialProductId) ? initialProductId : null,
    });
  }, [initialView, initialProductId, products, storefrontIdentityKey]);

  useEffect(() => {
    if (isPagedView || productsLoading || productsError || !cartRestored || !cart.length) return;
    let changed = false;
    const resolved = cart.map((item) => {
      const product = products.find((candidate) => candidate.id === item.product.id);
      if (product && product !== item.product) {
        changed = true;
        return { ...item, product };
      }
      return item;
    });
    if (changed) setCart(resolved);
  }, [isPagedView, productsLoading, productsError, cartRestored, cart, products]);

  useEffect(() => {
    if (cartRestored || typeof window === 'undefined') return;
    if (!products.length && (productsLoading || productsError)) return;
    const draft = loadOfflineCartDraft(window.localStorage, user?.profileId);
    const restored = draft
      .map(({ product_id, quantity }) => ({
        product: products.find((product) => product.id === product_id) ?? (isPagedView ? pendingCartProduct(product_id) : null),
        quantity,
      }))
      .filter((line): line is CartItem => Boolean(line.product));
    setCart(restored);
  }, [products, cartStorageKey, cartRestored, productsLoading, productsError, user?.profileId]);

  useEffect(() => {
    if (!cartRestored || typeof window === 'undefined') return;
    saveOfflineCartDraft(
      window.localStorage,
      user?.profileId,
      cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
    );
  }, [cart, cartRestored, cartStorageKey, user?.profileId]);

  useEffect(() => {
    if (isPagedView) return;
    if (!authReady) return;
    if (!persistentCartProfileId) {
      setCustomerCartHydratedFor('');
      setCustomerCartSyncState('idle');
      return;
    }
    if (!cartRestored || productsLoading || productsError || !isOnline) {
      if (!isOnline) setCustomerCartSyncState('pending');
      return;
    }
    if (customerCartHydratedFor === persistentCartProfileId) return;

    let cancelled = false;
    const revisionAtStart = cartMutationRevisionRef.current;
    setCustomerCartSyncState('loading');
    void fetchCustomerCart().then((snapshot) => {
      if (cancelled) return;
      // If the customer edits while the remote read is in flight, keep their latest local state
      // and let the write effect below persist it, rather than restoring an obsolete snapshot.
      if (revisionAtStart !== cartMutationRevisionRef.current) {
        setCustomerCartHydratedFor(persistentCartProfileId);
        setCustomerCartSyncState('pending');
        return;
      }
      const quantities = new Map<string, number>();
      for (const line of snapshot.items) quantities.set(line.product_id, line.quantity);
      // LocalStorage normally mirrors the last server state. max(), not sum(), avoids doubling it.
      for (const item of cart) {
        quantities.set(item.product.id, Math.max(quantities.get(item.product.id) ?? 0, item.quantity));
      }
      const merged = [...quantities.entries()]
        .map(([productId, quantity]) => ({ product: products.find((product) => product.id === productId), quantity }))
        .filter((line): line is CartItem => Boolean(line.product));
      setCart(merged);
      setCustomerCartHydratedFor(persistentCartProfileId);
      setCustomerCartSyncState('pending');
    }).catch(() => {
      if (!cancelled) setCustomerCartSyncState('error');
    });

    return () => { cancelled = true; };
  }, [
    authReady, persistentCartProfileId, cartRestored, productsLoading, productsError,
    isOnline, customerCartHydratedFor, customerCartRetryCount, products, cart,
  ]);

  useEffect(() => {
    if (!authReady || !persistentCartProfileId || !cartRestored || !isOnline
        || customerCartHydratedFor !== persistentCartProfileId) return;

    const revisionAtStart = cartMutationRevisionRef.current;
    const snapshot = cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity }));
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCustomerCartSyncState('loading');
      void saveCustomerCart(snapshot).then(() => {
        if (cancelled) return;
        setCustomerCartSyncState(revisionAtStart === cartMutationRevisionRef.current ? 'synced' : 'pending');
      }).catch(() => {
        if (!cancelled) setCustomerCartSyncState('pending');
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [authReady, persistentCartProfileId, cartRestored, isOnline, customerCartHydratedFor, cart]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  function addToCart(product: ProductWithInventory, requestedQuantity?: number, unitSelection?: ProductUnitSelection) {
    const minimum = Number.isSafeInteger(product.min_order_quantity) && Number(product.min_order_quantity) >= 1
      ? Number(product.min_order_quantity) : 1;
    const multiple = Number.isSafeInteger(product.order_quantity_multiple) && Number(product.order_quantity_multiple) >= 1
      ? Number(product.order_quantity_multiple) : 1;
    const available = typeof product.inventory?.quantity_available === 'number' && Number.isFinite(product.inventory.quantity_available)
      ? Math.max(0, Math.floor(product.inventory.quantity_available))
      : null;
    const explicitQuantityValid = requestedQuantity === undefined || (
      Number.isSafeInteger(requestedQuantity) &&
      requestedQuantity >= minimum &&
      (requestedQuantity - minimum) % multiple === 0
    );
    if (!explicitQuantityValid) {
      setCartActionNotice(`الكمية المطلوبة يجب أن تبدأ من الحد الأدنى (${minimum}) وتزيد بمضاعف (${multiple}) ${product.unit}.`);
      return;
    }
    const currentQuantity = cart.find((item) => item.product.id === product.id)?.quantity ?? 0;
    const nextQuantity = requestedQuantity ?? nextOrderQuantity(currentQuantity, minimum, multiple);
    if (available !== null && nextQuantity > available) {
      setCartActionNotice(`لا يمكن إضافة «${product.name}»: الكمية المطلوبة (${nextQuantity}) تتجاوز المتاح (${available} ${product.unit}).`);
      return;
    }

    setCartActionNotice(unitSelection
      ? `أُضيف ${formatNumber(unitSelection.selected_quantity)} ${unitSelection.unit_name} إلى السلة، بما يعادل ${formatNumber(requestedQuantity ?? 0)} ${product.unit}. تُراجع الكمية والأسعار والتوفر من الخادم قبل اعتماد الطلب.`
      : null);
    // The order/cart contract deliberately stores base units. Alternate-unit quantities
    // are converted before this point and continue through the same stock/pricing RPCs.
    setCart((previous) => mergeProductIntoCart(previous, product, requestedQuantity, minimum, multiple, available));
  }
  function updateQty(productId: string, delta: number) {
    const existingItem = cart.find((item) => item.product.id === productId);
    if (!existingItem) return;
    if (delta > 0) {
      const minimum = Number.isSafeInteger(existingItem.product.min_order_quantity) && Number(existingItem.product.min_order_quantity) >= 1
        ? Number(existingItem.product.min_order_quantity) : 1;
      const multiple = Number.isSafeInteger(existingItem.product.order_quantity_multiple) && Number(existingItem.product.order_quantity_multiple) >= 1
        ? Number(existingItem.product.order_quantity_multiple) : 1;
      const availableRaw = existingItem.product.inventory?.quantity_available;
      const available = typeof availableRaw === 'number' && Number.isFinite(availableRaw)
        ? Math.max(0, Math.floor(availableRaw))
        : null;
      const next = nextOrderQuantity(existingItem.quantity, minimum, multiple);
      if (available !== null && next > available) {
        setCartActionNotice(`لا يمكن زيادة «${existingItem.product.name}»: الكمية التالية (${next}) تتجاوز المتاح (${available} ${existingItem.product.unit}).`);
        return;
      }
    }

    setCartActionNotice(null);
    setCart((prev) => prev.map((item) => {
      if (item.product.id !== productId) return item;
      const minimum = Number.isSafeInteger(item.product.min_order_quantity) && Number(item.product.min_order_quantity) >= 1
        ? Number(item.product.min_order_quantity) : 1;
      const multiple = Number.isSafeInteger(item.product.order_quantity_multiple) && Number(item.product.order_quantity_multiple) >= 1
        ? Number(item.product.order_quantity_multiple) : 1;
      let next = 0;
      if (delta > 0) {
        next = nextOrderQuantity(item.quantity, minimum, multiple);
        const availableRaw = item.product.inventory?.quantity_available;
        const available = typeof availableRaw === 'number' && Number.isFinite(availableRaw)
          ? Math.max(0, Math.floor(availableRaw))
          : null;
        if (available !== null && next > available) return item;
      } else if (item.quantity > minimum) {
        next = minimum + Math.max(0, Math.ceil((item.quantity - minimum) / multiple) - 1) * multiple;
      }
      return { ...item, quantity: next };
    }).filter((item) => item.quantity > 0));
  }
  function removeFromCart(productId: string) { setCart((prev) => prev.filter((i) => i.product.id !== productId)); }
  function addMatrixSelection() {
    const selected = filtered.flatMap((product) => {
      const raw = matrixQuantities[product.id] ?? '';
      if (!raw.trim()) return [];
      return [{ product, quantity: Number(raw) }];
    });
    const validation = validateQuickOrderLines(selected.map(({ product, quantity }) => ({
      product_id: product.id,
      product_name: product.name,
      quantity,
      available: Math.max(0, Math.floor(Number(product.inventory?.quantity_available ?? 0))),
      already_in_cart: cart.find((item) => item.product.id === product.id)?.quantity ?? 0,
      min_order_quantity: product.min_order_quantity ?? 1,
      order_quantity_multiple: product.order_quantity_multiple ?? 1,
    })));
    if (!validation.valid) {
      const message = validation.reason === 'empty'
        ? 'أدخل كمية صحيحة لصنف واحد على الأقل.'
        : validation.reason === 'invalid_quantity'
          ? `الكمية المطلوبة للصنف «${validation.product_name ?? ''}» غير صحيحة. أدخل عددًا صحيحًا أكبر من صفر.`
          : validation.reason === 'order_policy'
            ? `كمية الصنف «${validation.product_name ?? ''}» لا تطابق الحد الأدنى أو مضاعف العبوة المحدد.`
            : `الكمية المطلوبة للصنف «${validation.product_name ?? ''}» تتجاوز المخزون الظاهر بما في ذلك الكمية الموجودة في السلة.`;
      setMatrixFeedback({ kind: 'error', message });
      return;
    }
    setCart((previous) => {
      const next = new Map(previous.map((item) => [item.product.id, { ...item }]));
      for (const line of selected) {
        const existing = next.get(line.product.id);
        next.set(line.product.id, { product: line.product, quantity: (existing?.quantity ?? 0) + line.quantity });
      }
      return [...next.values()];
    });
    setMatrixQuantities((previous) => ({ ...previous, ...Object.fromEntries(selected.map(({ product }) => [product.id, ''])) }));
    setMatrixFeedback({ kind: 'success', message: `تمت إضافة ${selected.length} أصناف إلى السلة. سيُعاد احتساب الأسعار والمخزون من الخادم قبل اعتماد الطلب.` });
  }
  function toggleWishlist(productId: string) {
    const saved = !wishlist.includes(productId);
    wishlistRevisionRef.current += 1;
    setWishlist((prev) => normalizeSavedProductIds(saved ? [...prev, productId] : prev.filter((id) => id !== productId), 500));
    setSavedListNotice('');
    if (!authReady || !user?.id || !user.profileId) return;

    void setStorefrontSavedProduct(user.id, user.profileId, productId, saved).then((applied) => {
      if (!applied) {
        setWishlistSyncState('pending');
        return;
      }
      setWishlistSyncState(Object.keys(readPendingSavedProductChanges(user.profileId)).length ? 'pending' : 'synced');
    });
  }
  function toggleCompare(productId: string) {
    if (compare.includes(productId)) {
      setCompare((prev) => prev.filter((id) => id !== productId));
      setSavedListNotice('');
      return;
    }
    if (compare.length >= 3) {
      setSavedListNotice('يمكن مقارنة ثلاثة أصناف فقط. أزل صنفًا من المقارنة قبل إضافة صنف آخر.');
      return;
    }
    setCompare((prev) => normalizeSavedProductIds([...prev, productId], 3));
    setSavedListNotice('');
  }
  function openProduct(product: ProductWithInventory) {
    void navigate({ to: '/product/$id', params: { id: product.id } });
  }

  const serverPageActive = Boolean(
    isPagedView && pageInfo && !productsLoading && !productsError && isOnline && query === debouncedQuery
  );
  const filtered = useMemo(() => {
    let list = products ?? [];
    if (!serverPageActive) {
      if (activeCat) list = list.filter((p) => p.category_id === activeCat);
      if (query.trim()) list = list.filter((p) => matchesArabicCatalogSearch(p, query));
      if (availableOnly) list = list.filter((p) => typeof p.inventory?.quantity_available === 'number' && Number.isFinite(p.inventory.quantity_available) && p.inventory.quantity_available > 0);
    }
    return list;
  }, [products, activeCat, query, availableOnly, serverPageActive]);
  const catalogCount = serverPageActive && pageInfo ? pageInfo.totalCount : products.length;

  const tickerMessages = (settings?.ticker_messages as string[]) ?? [];
  const tickerEnabled = settings?.ticker_enabled as boolean ?? true;

  return (
    <div className="storefront" dir="rtl">
      <header className="sf-header">
        <div className="sf-header-inner">
          <div className="sf-brand"><div className="sf-brand-icon"><Activity size={22} /></div><div><strong>{(settings?.store_name as string) ?? 'الأغبري'}</strong><span>{(settings?.store_tagline as string) ?? 'مواد غذائية بالجملة'}</span></div></div>
          {user?.isStaff === true && (
            <button className="sf-admin-btn" onClick={onExit}><Activity size={16} /> لوحة التحكم</button>
          )}
          <div className="sf-search"><Search size={17} /><input value={query} maxLength={MAX_CATALOG_SEARCH_LENGTH} onChange={(e) => { setQuery(normalizeCatalogSearchQuery(e.target.value)); setCatalogPage(1); }} placeholder="ابحث عن منتج..." /></div>
          <div className="sf-header-links"><Link to="/search/advanced" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', fontSize: 11, fontWeight: 700 }}><SlidersHorizontal size={15} /> بحث متقدم</Link><button onClick={() => void navigate({ to: '/wishlist' })}><Heart size={16} /> المفضلة <b>{wishlist.length}</b></button><button onClick={() => void navigate({ to: '/compare' })}><GitCompare size={16} /> مقارنة</button><button onClick={() => { setMatrixFeedback(null); setView('matrix'); }}><ClipboardList size={16} /> طلب سريع</button><Link to="/orders" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', fontSize: 11, fontWeight: 700 }}><FileText size={16} /> طلباتي</Link>{!user && <Link to="/login" style={{ color: '#0b97a5', fontWeight: 800, fontSize: 11 }}>دخول</Link>}</div>
          <button className="sf-cart-btn" onClick={() => void navigate({ to: '/cart' })}><ShoppingCart size={20} /> {cartCount > 0 && <b>{cartCount}</b>}</button>
          <button className="sf-mobile-toggle" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={22} /></button>
        </div>
      </header>

      {cartActionNotice && (() => {
        const isSuccess = cartActionNotice.startsWith('أُضيف ');
        const tone = isSuccess
          ? { color: '#17684d', background: '#edf9f2', border: '1px solid #b7d9ce' }
          : { color: '#8a2525', background: '#fff4f4', border: '1px solid #efc5c5' };
        return (
          <div role={isSuccess ? 'status' : 'alert'} aria-live={isSuccess ? 'polite' : 'assertive'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 16px', ...tone, borderBottom: tone.border, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
            <span>{cartActionNotice}</span>
            <button type="button" aria-label="إغلاق التنبيه" onClick={() => setCartActionNotice(null)} style={{ border: `1px solid ${isSuccess ? '#9cc8b4' : '#dba4a4'}`, borderRadius: 14, padding: '3px 9px', background: '#fff', color: tone.color }}>إغلاق</button>
          </div>
        );
      })()}

      {storefrontAnnouncementsError && <div className="sf-announcement-error" role="status">تعذر تحميل إعلانات المتجر الحالية؛ بقية الكتالوج متاحة.</div>}
      <StorefrontAnnouncementSlider announcements={storefrontAnnouncements ?? []} />

      {tickerEnabled && tickerMessages.length > 0 && (
        <div className="sf-ticker"><div className="sf-ticker-track">{tickerMessages.map((msg, i) => <span key={i}>{msg}</span>)}</div></div>
      )}

      <nav className={`sf-cats ${mobileMenu ? 'open' : ''}`}>
        <button className={activeCat === '' ? 'active' : ''} onClick={() => { setActiveCat(''); setCatalogPage(1); setMobileMenu(false); }}>كل المنتجات</button>
        {categories?.map((c: Category) => <button key={c.id} className={activeCat === c.id ? 'active' : ''} onClick={() => { setActiveCat(c.id); setCatalogPage(1); setMobileMenu(false); }}>{c.name}</button>)}
      </nav>

      {availableOnly && (
        <div role="status" className="sf-catalog-filter-notice" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, padding: '9px 16px', color: '#174b50', background: '#eaf6f4', borderBottom: '1px solid #c8e5e0', fontSize: 12 }}>
          <span>فلتر فعّال: أصناف ذات رصيد متاح معروف أكبر من صفر.</span>
          <button type="button" aria-label="إلغاء فلتر المتوفر فقط" onClick={() => {
            setAvailableOnly(false);
            void navigate({ to: '/catalog', search: {
              ...(query.trim() ? { q: query.trim() } : {}),
              ...(activeCat ? { category: activeCat } : {}),
            } });
          }} style={{ border: '1px solid #83bdb4', borderRadius: 16, padding: '4px 10px', background: '#fff', color: '#174b50', fontWeight: 800 }}>
            إظهار كل الأصناف المطابقة
          </button>
        </div>
      )}

      <div aria-label="أدوات الحساب التجاري" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', padding: '10px 16px', borderBottom: '1px solid #e4eeee', background: '#fff' }}>
        {[['/invoices', 'الفواتير'], ['/statement', 'كشف الحساب'], ['/quotes', 'عروض الأسعار'], ['/reorder', 'إعادة الطلب'], ['/barcode', 'ماسح الباركود'], ['/assistant', 'المساعد الذكي'], ['/offline', 'دون اتصال']].map(([to, label]) => <Link key={to} to={to as never} style={{ textDecoration: 'none', color: '#0b7b89', border: '1px solid #d8e9e9', borderRadius: 18, padding: '6px 12px', fontSize: 11, fontWeight: 800 }}>{label}</Link>)}
      </div>

      {!isOnline && <div role="status" style={{ padding: '10px 16px', background: '#fff4df', color: '#7c4a05', borderBottom: '1px solid #efd7a5', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
        أنت غير متصل حاليًا. يعرض المتجر آخر نسخة محلية متاحة؛ قد تتغير الأسعار والأرصدة، ولن يُعتمد أي طلب حتى يعود الاتصال ويتحقق الخادم من البيانات الحالية.
      </div>}
      {productsError && products.length > 0 && <div role="status" style={{ padding: '10px 16px', background: '#fff9e9', color: '#7c4a05', borderBottom: '1px solid #ead7a8', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
        تعذر تحديث الكتالوج؛ تظهر نسخة محفوظة قديمة وقد تختلف الأسعار والأرصدة. <button type="button" onClick={() => void refetchProducts()} disabled={productsLoading} style={{ textDecoration: 'underline', marginInlineStart: 8 }}>إعادة المحاولة</button>
      </div>}
      {categoriesLoading && !categories && (
        <div
          role="status"
          style={{
            padding: '8px 16px',
            color: '#42666b',
            textAlign: 'center',
            fontSize: 12,
          }}
        >
          جار تحميل التصنيفات...
        </div>
      )}
      {categoriesError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 10,
            padding: '8px 16px',
            color: '#7c4a05',
            textAlign: 'center',
            fontSize: 12,
          }}
        >
          <span>
            تعذر تحميل التصنيفات: {categoriesError}. يمكنك البحث بالاسم أو رمز الصنف مؤقتًا.
          </span>
          <button
            type="button"
            className="sf-btn-secondary"
            aria-label="إعادة تحميل التصنيفات"
            disabled={categoriesLoading}
            onClick={() => void refetchCategories()}
          >
            {categoriesLoading ? 'جار إعادة تحميل التصنيفات...' : 'إعادة تحميل التصنيفات'}
          </button>
        </div>
      )}

      <main className="sf-main">
        {view === 'shop' && (
          <>
            <section className="sf-hero" style={{ background: `linear-gradient(120deg, ${(settings?.theme_primary as string) ?? '#087f8d'}, ${(settings?.theme_accent as string) ?? '#0eaa97'})` }}>
              <div><span className="sf-hero-kicker">عرض خاص</span><h1>{(settings?.hero_title as string) ?? 'الأغبري — موردك الموثوق'}</h1><p>{(settings?.hero_subtitle as string) ?? 'مواد غذائية بالجملة بأسعار تنافسية وتوصيل سريع'}</p></div>
              <div className="sf-hero-badge"><Package size={28} /><div><strong>{productsLoading && !products.length ? '…' : formatNumber(catalogCount)}</strong><span>{productsLoading && !products.length ? 'جار تحميل الكتالوج' : 'منتج في الكتالوج'}</span></div></div>
            </section>

            {promotions && promotions.filter((p: Promotion) => p.is_active).length > 0 && (
              <section className="sf-promos">{promotions.filter((p) => p.is_active).map((p: Promotion) => <div className="sf-promo" key={p.id}><Tag size={16} /> <strong>{p.title}</strong> <span>حملة ترويجية</span></div>)}</section>
            )}

            <section className="sf-products">
              <div className="sf-products-head"><div><h2>المنتجات</h2><span>{productsLoading && !products.length ? 'جار تحميل الكتالوج...' : `${formatNumber(serverPageActive && pageInfo ? pageInfo.totalCount : filtered.length)} صنف حسب بحثك وتصنيفك`}</span></div><div className="sf-discovery-links"><button onClick={() => void navigate({ to: '/wishlist' })}><Heart size={15} /> المفضلة</button><button onClick={() => void navigate({ to: '/compare' })}><GitCompare size={15} /> المقارنة ({compare.length}/3)</button><button onClick={() => { setMatrixFeedback(null); setView('matrix'); }}><ClipboardList size={15} /> طلب سريع</button></div></div>
              {productsLoading && !products.length
                ? <div className="sf-empty" role="status"><Package size={30} /><span>جار تحميل كتالوج المنتجات...</span></div>
                : productsError && !products.length
                  ? <div className="sf-empty" role="alert"><Package size={30} /><strong>تعذر تحميل الكتالوج</strong><small>{productsError}</small><button type="button" className="sf-btn-secondary" onClick={() => void refetchProducts()}>إعادة المحاولة</button></div>
                  : <ProductGrid
                    products={filtered}
                    priceVisibilityPolicy={settings?.show_price_on_cards}
                    wishlist={wishlist}
                    compare={compare}
                    emptyTitle={(serverPageActive && pageInfo ? pageInfo.totalCount : products.length) === 0 ? 'لا توجد أصناف منشورة حالياً' : 'لا توجد منتجات مطابقة'}
                    emptyDescription={(serverPageActive && pageInfo ? pageInfo.totalCount : products.length) === 0
                      ? 'لا توجد أصناف نشطة متاحة للعرض في المتجر حالياً. يُرجى التواصل مع إدارة المتجر إذا كنت تتوقع ظهور المنتجات.'
                      : 'جرّب تغيير البحث أو التصنيف'}
                    onOpen={openProduct}
                    onAdd={addToCart}
                    onWishlist={toggleWishlist}
                    onCompare={toggleCompare}
                  />}
              {serverPageActive && pageInfo && pageInfo.totalPages > 1 && (
                <nav aria-label="صفحات الكتالوج" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '18px 10px' }}>
                  <button type="button" className="sf-btn-secondary" disabled={productsLoading || pageInfo.page <= 1} onClick={() => setCatalogPage((current) => Math.max(1, current - 1))}>
                    <ChevronLeft size={15} /> السابقة
                  </button>
                  <span role="status" aria-live="polite">صفحة {pageInfo.page} من {pageInfo.totalPages} · {formatNumber(pageInfo.totalCount)} صنف</span>
                  <button type="button" className="sf-btn-secondary" disabled={productsLoading || pageInfo.page >= pageInfo.totalPages} onClick={() => setCatalogPage((current) => Math.min(pageInfo.totalPages, current + 1))}>
                    التالية <ChevronLeft size={15} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                </nav>
              )}
            </section>
          </>
        )}

        {savedListNotice && <div role="status" className="sf-form-error" style={{ marginBottom: 12 }}>{savedListNotice}</div>}
        {user?.profileId && wishlistSyncState === 'pending' && <div role="status" className="sf-form-error" style={{ marginBottom: 12 }}>بعض تغييرات المفضلة لم تصل إلى الخادم بعد؛ حُفظت في هذا الجهاز وستُعاد مزامنتها عند عودة الاتصال أو استقرار الجلسة.</div>}
        {view === 'product' && (selectedProduct
          ? <ProductDetail
              product={selectedProduct}
              relatedProducts={(products ?? []).filter((candidate) =>
                selectedProduct.category_id !== null
                && candidate.id !== selectedProduct.id
                && candidate.category_id === selectedProduct.category_id
              ).slice(0, 4)}
              priceVisibilityPolicy={settings?.show_price_on_cards}
              inWishlist={wishlist.includes(selectedProduct.id)}
              inCompare={compare.includes(selectedProduct.id)}
              initialQuantity={cart.find((item) => item.product.id === selectedProduct.id)?.quantity ?? null}
              onBack={() => void navigate({ to: '/' })}
              onAdd={(quantity, unitSelection) => addToCart(selectedProduct, quantity, unitSelection)}
              onWishlist={() => toggleWishlist(selectedProduct.id)}
              onCompare={() => toggleCompare(selectedProduct.id)}
              onOpenRelated={openProduct}
            />
          : productsLoading ? <div className="sf-empty" role="status">جار تحميل تفاصيل المنتج...</div>
            : productsError ? <div className="sf-empty" role="alert"><strong>تعذر تحميل تفاصيل المنتج</strong><small>{productsError}</small><button type="button" onClick={() => void refetchProducts()}>إعادة المحاولة</button></div>
              : <div className="sf-empty" role="alert"><strong>المنتج غير متاح</strong><small>تعذر العثور على المنتج ضمن الكتالوج الحالي.</small><button type="button" onClick={() => void navigate({ to: '/' })}>العودة للمتجر</button></div>)}
        {view === 'wishlist' && <CollectionView title="المفضلة" priceVisibilityPolicy={settings?.show_price_on_cards} icon={Heart} products={products.filter((p) => wishlist.includes(p.id))} wishlist={wishlist} compare={compare} loading={productsLoading} error={productsError} onRetry={() => void refetchProducts()} onOpen={openProduct} onAdd={addToCart} onWishlist={toggleWishlist} onCompare={toggleCompare} onBack={() => void navigate({ to: '/' })} empty="لا توجد منتجات محفوظة في المفضلة ضمن الكتالوج الحالي" />}
        {view === 'compare' && <CollectionView title="مقارنة المنتجات" priceVisibilityPolicy={settings?.show_price_on_cards} icon={GitCompare} products={products.filter((p) => compare.includes(p.id))} wishlist={wishlist} compare={compare} loading={productsLoading} error={productsError} onRetry={() => void refetchProducts()} onOpen={openProduct} onAdd={addToCart} onWishlist={toggleWishlist} onCompare={toggleCompare} onBack={() => void navigate({ to: '/' })} empty="اختر حتى ثلاثة منتجات من الكتالوج للمقارنة" />}
        {view === 'matrix' && <QuickOrderMatrix products={filtered} quantities={matrixQuantities} alreadyInCart={Object.fromEntries(cart.map((item) => [item.product.id, item.quantity]))} feedback={matrixFeedback} onQuantityChange={(id, value) => { setMatrixQuantities((previous) => ({ ...previous, [id]: value })); setMatrixFeedback(null); }} onAddSelected={addMatrixSelection} onBack={() => setView('shop')} onCart={() => void navigate({ to: '/cart' })} />}

        {view === 'cart' && (!cartRestored ? (
          <section className="sf-cart-page">
            <h2>سلة المشتريات</h2>
            <div className="sf-empty" role={productsError ? 'alert' : 'status'}>
              <span>{productsLoading ? 'جار استعادة السلة المحلية...' : productsError ? 'تعذر استعادة تفاصيل السلة من الكتالوج الحالي.' : 'جار استعادة السلة...'}</span>
              {productsError && <><small>{productsError}</small><button type="button" className="sf-btn-secondary" onClick={() => void refetchProducts()}>إعادة المحاولة</button></>}
            </div>
          </section>
        ) : (
          <section className="sf-cart-page">
            <h2>سلة المشتريات</h2>
            {persistentCartProfileId && (
              <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '10px 0', padding: 12, borderRadius: 10, border: '1px solid #d8e6e8', background: '#f7fafb', color: '#344b52', fontSize: 12 }}>
                <span>{describeCustomerCartSyncState(customerCartSyncState, isOnline)}</span>
                {(customerCartSyncState === 'pending' || customerCartSyncState === 'error') && (
                  <button type="button" className="sf-btn-secondary" disabled={!isOnline} onClick={() => {
                    setCustomerCartHydratedFor('');
                    setCustomerCartSyncState('idle');
                    setCustomerCartRetryCount((current) => current + 1);
                  }}>إعادة المزامنة</button>
                )}
              </div>
            )}
            {!cart.length ? <div className="sf-empty"><ShoppingCart size={30} /><span>سلتك فارغة</span><button className="sf-link" onClick={() => void navigate({ to: '/' })}>تصفح المنتجات</button></div> :
            <>
              <div className="sf-cart-list">
                {cart.map((item) => (
                  <div className="sf-cart-row" key={item.product.id}>
                    <div className="sf-cart-info"><div className="sf-cart-img"><Package size={20} /></div><div><strong>{item.product.name}</strong><span>الوحدة: {item.product.unit}</span></div></div>
                    <div className="sf-cart-qty"><button aria-label={`تقليل كمية ${item.product.name}`} onClick={() => updateQty(item.product.id, -1)}><Minus size={14} /></button><span>{item.quantity}</span><button aria-label={`زيادة كمية ${item.product.name}`} onClick={() => updateQty(item.product.id, 1)}><Plus size={14} /></button></div>
                    <button className="sf-cart-remove" aria-label={`حذف ${item.product.name} من السلة`} onClick={() => removeFromCart(item.product.id)}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <CustomerOrderPricingPreview
                items={cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity }))}
                policyValue={settings?.show_price_in_cart}
                surface="cart"
                title="ملخص أسعار السلة"
              />
              {settings?.show_price_in_cart !== true && <div role="note" style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#f2f7f8', color: '#536b70' }}>سيُراجع الطلب ويُعتمد من جهة الإدارة. إظهار الأسعار والإجماليات معطّل في إعدادات المتجر لهذه الشاشة.</div>}
              <div className="sf-cart-actions"><button className="sf-btn-secondary" onClick={() => void navigate({ to: '/' })}>متابعة التسوق</button><button className="sf-btn-primary" onClick={() => void navigate({ to: '/checkout' })}>إتمام الطلب <ChevronLeft size={16} /></button></div>
            </>
            }
          </section>
        ))}

        {view === 'checkout' && (!cartRestored ? (
          <section className="sf-checkout"><div className="sf-empty" role={productsError ? 'alert' : 'status'}><span>{productsLoading ? 'جار استعادة سلة الطلب...' : productsError ? 'تعذر استعادة السلة.' : 'جار استعادة سلة الطلب...'}</span>{productsError && <><small>{productsError}</small><button type="button" onClick={() => void refetchProducts()}>إعادة المحاولة</button></>}</div></section>
        ) : !cart.length ? (
          <section className="sf-checkout"><h2>لا توجد أصناف لإتمام الطلب</h2><p>أضف الأصناف إلى السلة أولاً. لن يتم إنشاء طلب فارغ.</p><button className="sf-btn-primary" onClick={() => void navigate({ to: '/' })}>العودة إلى المتجر</button></section>
        ) : <Checkout cart={cart} priceVisibilityPolicy={settings?.show_price_in_orders} onBack={() => void navigate({ to: '/cart' })} onComplete={(order) => { setLastOrderNo(order.order_number); setLastOrderId(order.id); setView('confirm'); setCart([]); }} />)}
        {view === 'confirm' && <OrderConfirm orderNo={lastOrderNo} orderId={lastOrderId} onContinue={() => void navigate({ to: '/' })} />}
      </main>

      <footer className="sf-footer">
        <div className="sf-footer-inner">
          <div className="sf-footer-brand"><Activity size={20} /> <strong>{(settings?.store_name as string) ?? 'الأغبري'}</strong></div>
          <div className="sf-footer-info"><Phone size={15} /> {(settings?.store_phone as string) || 'رقم الهاتف غير مهيأ'}</div>
          <div className="sf-footer-info"><Mail size={15} /> {(settings?.store_email as string) || 'البريد الإلكتروني غير مهيأ'}</div>
          <div className="sf-footer-info"><MapPin size={15} /> {(settings?.store_address as string) || 'عنوان المتجر غير مهيأ'}</div>
        </div>
      </footer>
    </div>
  );
}

export function ProductGrid({
  products,
  priceVisibilityPolicy,
  wishlist,
  compare,
  emptyTitle,
  emptyDescription,
  onOpen,
  onAdd,
  onWishlist,
  onCompare,
}: {
  products: ProductWithInventory[];
  priceVisibilityPolicy: unknown;
  wishlist: string[];
  compare: string[];
  emptyTitle: string;
  emptyDescription: string;
  onOpen: (product: ProductWithInventory) => void;
  onAdd: (product: ProductWithInventory) => void;
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
}) {
  if (!products.length) {
    return <div className="sf-empty" role="status"><Package size={30} /><strong>{emptyTitle}</strong><small>{emptyDescription}</small></div>;
  }

  return (
    <div className="sf-product-grid">
      {products.map((product) => {
        const qty = product.inventory?.quantity_available ?? 0;
        const minimum = Number.isSafeInteger(product.min_order_quantity) && Number(product.min_order_quantity) >= 1
          ? Number(product.min_order_quantity) : 1;
        const out = qty <= 0;
        const belowMinimum = qty > 0 && qty < minimum;
        const liked = wishlist.includes(product.id);
        const compared = compare.includes(product.id);

        return (
          <article className="sf-product-card" key={product.id}>
            <div className="sf-product-img" onClick={() => onOpen(product)}>
              {product.image_url ? <img src={product.image_url} alt={product.name} /> : <Package size={36} />}
              <div className="sf-card-actions">
                <button
                  aria-label="إضافة للمفضلة"
                  className={liked ? 'active' : ''}
                  onClick={(event) => { event.stopPropagation(); onWishlist(product.id); }}
                >
                  <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
                </button>
                <button
                  aria-label="إضافة للمقارنة"
                  className={compared ? 'active' : ''}
                  onClick={(event) => { event.stopPropagation(); onCompare(product.id); }}
                >
                  <GitCompare size={16} />
                </button>
              </div>
            </div>
            <button className="sf-product-body sf-product-open" onClick={() => onOpen(product)}>
              <h3>{product.name}</h3>
              {product.name_en ? <small dir="auto" style={{ display: 'block', marginTop: 3, color: '#62797e', fontWeight: 500 }}>{product.name_en}</small> : null}
              <p>{product.category?.name ?? 'غير مصنف'} · {product.item_code}</p>
              {product.sku ? <small dir="ltr" style={{ display: 'block', marginTop: 3, color: '#62797e', fontWeight: 600, textAlign: 'right' }}>SKU: {product.sku}</small> : null}
              <StorefrontPricePresentation
                policyValue={priceVisibilityPolicy}
                serverUnitPrice={product.display_price}
                className="sf-product-price"
                unitLabel={product.unit}
              />
              <div className="sf-product-stock">
                {out
                  ? <span className="sf-out">نفد المخزون</span>
                  : <span className={belowMinimum ? "sf-out" : "sf-in"}>{formatNumber(qty)} متوفر{belowMinimum ? ' — أقل من الحد الأدنى' : ''}</span>}
              </div>
            </button>
            <button className="sf-add-btn" disabled={out || belowMinimum} onClick={() => onAdd(product)}>
              {out ? 'غير متوفر' : belowMinimum ? 'الكمية المتاحة أقل من الحد الأدنى' : <><Plus size={16} /> أضف للسلة</>}
            </button>
          </article>
        );
      })}
    </div>
  );
}

export function ProductDetail({
  product,
  relatedProducts = [],
  priceVisibilityPolicy,
  inWishlist,
  inCompare,
  initialQuantity,
  onBack,
  onAdd,
  onWishlist,
  onCompare,
  onOpenRelated,
}: {
  product: ProductWithInventory;
  relatedProducts: ProductWithInventory[];
  priceVisibilityPolicy: unknown;
  inWishlist: boolean;
  inCompare: boolean;
  initialQuantity: number | null;
  onBack: () => void;
  onAdd: (baseQuantity: number, selection: ProductUnitSelection) => void;
  onWishlist: () => void;
  onCompare: () => void;
  onOpenRelated: (product: ProductWithInventory) => void;
}) {
  const rawAvailableQuantity = product.inventory?.quantity_available;
  const quantityKnown = typeof rawAvailableQuantity === 'number' &&
    Number.isFinite(rawAvailableQuantity) && rawAvailableQuantity >= 0;
  const availableQuantity = quantityKnown ? Math.floor(rawAvailableQuantity) : 0;
  const minimumOrderQuantity = Number.isSafeInteger(product.min_order_quantity) && Number(product.min_order_quantity) >= 1
    ? Number(product.min_order_quantity) : 1;
  const quantityMultiple = Number.isSafeInteger(product.order_quantity_multiple) && Number(product.order_quantity_multiple) >= 1
    ? Number(product.order_quantity_multiple) : 1;
  const belowMinimum = quantityKnown && availableQuantity > 0 && availableQuantity < minimumOrderQuantity;
  const galleryUrls = Array.from(new Set([
    product.image_url,
    ...(Array.isArray(product.image_gallery_urls) ? product.image_gallery_urls : []),
  ].filter((url): url is string => typeof url === 'string' && /^https:\/\//i.test(url))));
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(
    product.image_url ?? product.image_gallery_urls?.[0] ?? null,
  );
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false);
  const [alternateUnits, setAlternateUnits] = useState<ProductAlternateUnit[]>([]);
  const [alternateUnitsLoading, setAlternateUnitsLoading] = useState(true);
  const [alternateUnitsError, setAlternateUnitsError] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<ProductAlternateUnit>({
    unit_name: product.unit,
    base_units_per_unit: 1,
  });
  const [requestedUnitQuantity, setRequestedUnitQuantity] = useState(minimumOrderQuantity);
  const pricePresentation = resolveStorefrontPricePresentation(priceVisibilityPolicy, product.display_price);

  useEffect(() => {
    setSelectedImageUrl(product.image_url ?? product.image_gallery_urls?.[0] ?? null);
    setIsImageZoomOpen(false);
  }, [product.id, product.image_url, product.image_gallery_urls]);

  useEffect(() => {
    if (!isImageZoomOpen) return;
    function handleImageZoomKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsImageZoomOpen(false);
    }
    window.addEventListener('keydown', handleImageZoomKeyDown);
    return () => window.removeEventListener('keydown', handleImageZoomKeyDown);
  }, [isImageZoomOpen]);

  useEffect(() => {
    let active = true;
    setAlternateUnits([]);
    setAlternateUnitsLoading(true);
    setAlternateUnitsError('');
    void fetchProductUnitOptions(product.id)
      .then((result) => {
        if (result.base_unit !== product.unit) {
          throw new Error('تغيرت الوحدة الأساسية للمنتج أثناء تحميل خيارات البيع.');
        }
        if (active) setAlternateUnits(result.units);
      })
      .catch((cause) => {
        if (active) setAlternateUnitsError(cause instanceof Error ? cause.message : 'تعذر تحميل وحدات البيع البديلة.');
      })
      .finally(() => {
        if (active) setAlternateUnitsLoading(false);
      });
    return () => { active = false; };
  }, [product.id, product.unit]);

  useEffect(() => {
    setSelectedUnit({ unit_name: product.unit, base_units_per_unit: 1 });
    const startingBaseQuantity = initialQuantity ?? minimumOrderQuantity;
    const cappedBaseQuantity = quantityKnown
      ? Math.min(availableQuantity, startingBaseQuantity)
      : minimumOrderQuantity;
    const steps = Math.max(0, Math.floor((cappedBaseQuantity - minimumOrderQuantity) / quantityMultiple));
    setRequestedUnitQuantity(minimumOrderQuantity + steps * quantityMultiple);
  }, [product.id, product.unit, initialQuantity, minimumOrderQuantity, quantityMultiple, quantityKnown, availableQuantity]);

  const unitChoices: ProductAlternateUnit[] = [
    { unit_name: product.unit, base_units_per_unit: 1 },
    ...alternateUnits,
  ];
  const maximumDisplayQuantity = Math.min(
    10000,
    Math.floor(Math.min(availableQuantity, 10000) / selectedUnit.base_units_per_unit),
  );

  function isValidDisplayQuantity(displayQuantity: number, unit: ProductAlternateUnit = selectedUnit): boolean {
    const baseQuantity = displayQuantity * unit.base_units_per_unit;
    return Number.isSafeInteger(displayQuantity) &&
      displayQuantity >= 1 &&
      Number.isSafeInteger(baseQuantity) &&
      baseQuantity >= minimumOrderQuantity &&
      (baseQuantity - minimumOrderQuantity) % quantityMultiple === 0 &&
      baseQuantity <= availableQuantity &&
      baseQuantity <= 10000;
  }

  function minimumDisplayQuantityForUnit(unit: ProductAlternateUnit): number | null {
    const maximum = Math.min(10000, Math.floor(Math.min(availableQuantity, 10000) / unit.base_units_per_unit));
    for (let displayQuantity = 1; displayQuantity <= maximum; displayQuantity += 1) {
      if (isValidDisplayQuantity(displayQuantity, unit)) return displayQuantity;
    }
    return null;
  }

  const minimumDisplayQuantity = minimumDisplayQuantityForUnit(selectedUnit);
  const requestedBaseQuantity = requestedUnitQuantity * selectedUnit.base_units_per_unit;
  const requestedQuantityValid = minimumDisplayQuantity !== null &&
    isValidDisplayQuantity(requestedUnitQuantity);

  function chooseUnit(unitName: string) {
    const nextUnit = unitChoices.find((unit) => unit.unit_name === unitName);
    if (!nextUnit) return;
    setSelectedUnit(nextUnit);
    setRequestedUnitQuantity(minimumDisplayQuantityForUnit(nextUnit) ?? 1);
  }

  function findAdjacentValidDisplayQuantity(direction: 1 | -1): number | null {
    const minimum = minimumDisplayQuantity ?? 1;
    const start = requestedUnitQuantity + direction;
    for (
      let candidate = start;
      direction > 0 ? candidate <= maximumDisplayQuantity : candidate >= minimum;
      candidate += direction
    ) {
      if (isValidDisplayQuantity(candidate)) return candidate;
    }
    return null;
  }

  function normalizeRequestedQuantity(value: string) {
    const parsed = Number.parseInt(value, 10);
    const minimum = minimumDisplayQuantity ?? 1;
    const start = Number.isFinite(parsed)
      ? Math.max(minimum, Math.min(maximumDisplayQuantity, parsed))
      : minimum;
    for (let candidate = start; candidate <= maximumDisplayQuantity; candidate += 1) {
      if (isValidDisplayQuantity(candidate)) {
        setRequestedUnitQuantity(candidate);
        return;
      }
    }
    setRequestedUnitQuantity(minimum);
  }

  const nextLowerQuantity = findAdjacentValidDisplayQuantity(-1);
  const nextHigherQuantity = findAdjacentValidDisplayQuantity(1);

  return (
    <section className="sf-product-detail">
      <button className="sf-back-link" onClick={onBack}><ArrowRight size={16} /> العودة للكتالوج</button>
      <div className="sf-detail-layout">
        <div className="sf-detail-image">
          {selectedImageUrl ? (
            <button type="button" className="sf-detail-image-trigger" aria-label={'تكبير صورة ' + product.name}
              onClick={() => setIsImageZoomOpen(true)}>
              <img src={selectedImageUrl} alt={product.name} loading="lazy" decoding="async" />
              <span className="sf-detail-image-hint">اضغط لتكبير الصورة</span>
            </button>
          ) : <Package size={72} />}
          {galleryUrls.length > 1 && (
            <div role="group" aria-label="صور المنتج" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(58px,1fr))', gap: 7, width: '100%', marginTop: 10 }}>
              {galleryUrls.map((url, index) => (
                <button key={url} type="button" aria-label={'عرض صورة المنتج ' + (index + 1)} aria-pressed={selectedImageUrl === url}
                  onClick={() => setSelectedImageUrl(url)}
                  style={{ border: selectedImageUrl === url ? '2px solid var(--primary, #0f766e)' : '1px solid var(--border, #d6dfe4)', borderRadius: 8, padding: 3, background: 'var(--card, #fff)' }}>
                  <img src={url} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: 54, objectFit: 'contain' }} />
                </button>
              ))}
            </div>
          )}
          <span className="sf-detail-code">
            {product.sku ? <span dir="ltr">SKU: {product.sku}</span> : <>رمز المنتج: <bdi>{product.item_code}</bdi></>}
            {product.sku && product.item_code ? <> · رمز المنتج: <bdi>{product.item_code}</bdi></> : null}
            {product.barcode ? <> · الباركود: <bdi>{product.barcode}</bdi></> : null}
          </span>
        </div>
        <div className="sf-detail-content">
          <span className="sf-detail-category">{product.category?.name ?? 'غير مصنف'}</span>
          <h2>{product.name}</h2>
          {product.name_en ? <p dir="auto" style={{ margin: '-4px 0 12px', color: '#5f777b', fontSize: 14, fontWeight: 500 }}>{product.name_en}</p> : null}
          <p className="sf-detail-description">{product.description || 'لا يوجد وصف متاح لهذا المنتج.'}</p>
          <StorefrontPricePresentation
            policyValue={priceVisibilityPolicy}
            serverUnitPrice={product.display_price}
            className="sf-detail-price"
            unitLabel={`لكل ${product.unit}`}
          />
          <div className={`sf-detail-stock ${quantityKnown && availableQuantity > 0 && !belowMinimum ? 'available' : 'unavailable'}`} role="status" aria-live="polite">
            {!quantityKnown
              ? 'تعذر التحقق من الكمية المتاحة لهذا المنتج. أعد تحميل تفاصيل المنتج قبل الإضافة.'
              : availableQuantity <= 0
                ? 'هذا المنتج غير متوفر حالياً'
                : belowMinimum
                  ? `المتوفر (${formatNumber(availableQuantity)} ${product.unit}) أقل من الحد الأدنى للطلب (${formatNumber(minimumOrderQuantity)} ${product.unit})`
                  : `متوفر حالياً: ${formatNumber(availableQuantity)} ${product.unit}`}
          </div>
          {quantityKnown && availableQuantity > 0 && !belowMinimum ? (
            <div className="sf-detail-quantity" role="group" aria-label="اختيار كمية الطلب" style={{ display: 'grid', gap: 7, maxWidth: 340, marginBottom: 16 }}>
              {unitChoices.length > 1 ? (
                <label htmlFor="sf-product-order-unit" style={{ fontSize: 13, fontWeight: 700 }}>
                  وحدة الشراء
                  <select
                    id="sf-product-order-unit"
                    value={selectedUnit.unit_name}
                    onChange={(event) => chooseUnit(event.currentTarget.value)}
                    style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 6, border: '1px solid var(--border, #d6dfe4)', borderRadius: 8, padding: 7, background: 'var(--card, #fff)' }}
                  >
                    {unitChoices.map((unit) => (
                      <option
                        key={unit.unit_name}
                        value={unit.unit_name}
                        disabled={minimumDisplayQuantityForUnit(unit) === null}
                      >
                        {unit.unit_name}{unit.base_units_per_unit > 1
                          ? ` — الوحدة الواحدة = ${formatNumber(unit.base_units_per_unit)} ${product.unit}`
                          : ` — الوحدة الأساسية`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label htmlFor="sf-product-requested-quantity" style={{ fontSize: 13, fontWeight: 700 }}>
                الكمية المطلوبة ({selectedUnit.unit_name})
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="sf-btn-secondary"
                  aria-label="تقليل كمية الطلب"
                  disabled={nextLowerQuantity === null}
                  onClick={() => { if (nextLowerQuantity !== null) setRequestedUnitQuantity(nextLowerQuantity); }}
                ><Minus size={16} /></button>
                <input
                  id="sf-product-requested-quantity"
                  type="number"
                  inputMode="numeric"
                  min={minimumDisplayQuantity ?? 1}
                  max={maximumDisplayQuantity}
                  step={1}
                  value={requestedUnitQuantity}
                  aria-label="كمية الطلب"
                  onChange={(event) => normalizeRequestedQuantity(event.currentTarget.value)}
                  style={{ width: 100, minHeight: 40, textAlign: 'center', border: '1px solid var(--border, #d6dfe4)', borderRadius: 8, padding: 6 }}
                />
                <button
                  type="button"
                  className="sf-btn-secondary"
                  aria-label="زيادة كمية الطلب"
                  disabled={nextHigherQuantity === null}
                  onClick={() => { if (nextHigherQuantity !== null) setRequestedUnitQuantity(nextHigherQuantity); }}
                ><Plus size={16} /></button>
              </div>
              <small className="text-muted">
                يعادل الاختيار {formatNumber(requestedBaseQuantity)} {product.unit}. الحد الأدنى {formatNumber(minimumOrderQuantity)} {product.unit}،
                ومضاعف الطلب {formatNumber(quantityMultiple)} {product.unit}، والمتاح {formatNumber(availableQuantity)} {product.unit}.
              </small>
              {minimumDisplayQuantity === null ? (
                <small role="alert" style={{ color: '#9b3d34' }}>
                  لا تتوافق هذه الوحدة مع حد الطلب ومضاعفه أو المخزون المتاح؛ اختر وحدة أخرى.
                </small>
              ) : null}
              {alternateUnitsLoading ? <small role="status">جار تحميل وحدات البيع البديلة...</small> : null}
              {alternateUnitsError ? <small role="status">تعذر تحميل الوحدات البديلة؛ يمكنك المتابعة بالوحدة الأساسية.</small> : null}
            </div>
          ) : null}
          <div className="sf-detail-actions">
            <button
              type="button"
              className="sf-btn-primary"
              disabled={!requestedQuantityValid || !quantityKnown || belowMinimum}
              onClick={() => onAdd(requestedBaseQuantity, {
                unit_name: selectedUnit.unit_name,
                base_units_per_unit: selectedUnit.base_units_per_unit,
                selected_quantity: requestedUnitQuantity,
              })}
            ><ShoppingCart size={17} /> إضافة إلى السلة</button>
            <button type="button" className={`sf-icon-action ${inWishlist ? 'active' : ''}`} aria-pressed={inWishlist} onClick={onWishlist}>
              <Heart size={18} fill={inWishlist ? 'currentColor' : 'none'} /> {inWishlist ? 'في المفضلة' : 'أضف للمفضلة'}
            </button>
            <button type="button" className={`sf-icon-action ${inCompare ? 'active' : ''}`} aria-pressed={inCompare} onClick={onCompare}><GitCompare size={18} /> {inCompare ? 'في المقارنة' : 'مقارنة'}</button>
          </div>
          <div className="sf-detail-facts">
            <div><strong>الوحدة الأساسية</strong><span>{product.unit}</span></div>
            <div><strong>الحد الأدنى</strong><span>{formatNumber(product.min_order_quantity ?? 1)} {product.unit}</span></div>
            {(product.order_quantity_multiple ?? 1) > 1 && <div><strong>مضاعف الطلب</strong><span>{formatNumber(product.order_quantity_multiple ?? 1)} {product.unit}</span></div>}
            {pricePresentation.visible && <div><strong>السعر</strong><span>السعر الظاهر قبل تأكيد الطلب</span></div>}
          </div>
        </div>
      </div>
      {relatedProducts.length > 0 && (
        <section className="sf-related-products" aria-labelledby="sf-related-products-title">
          <div className="sf-related-header">
            <h3 id="sf-related-products-title">منتجات من التصنيف نفسه</h3>
            <span>من المنتجات المحمّلة في الكتالوج</span>
          </div>
          <div className="sf-related-grid">
            {relatedProducts.map((relatedProduct) => (
              <button
                type="button"
                key={relatedProduct.id}
                className="sf-related-card"
                onClick={() => onOpenRelated(relatedProduct)}
                aria-label={'عرض تفاصيل ' + relatedProduct.name}
              >
                <span className="sf-related-image">
                  {relatedProduct.image_url
                    ? <img src={relatedProduct.image_url} alt="" loading="lazy" decoding="async" />
                    : <Package size={30} aria-hidden="true" />}
                </span>
                <strong>{relatedProduct.name}</strong>
                <small><bdi>{relatedProduct.item_code}</bdi></small>
                <StorefrontPricePresentation
                  policyValue={priceVisibilityPolicy}
                  serverUnitPrice={relatedProduct.display_price}
                  className="sf-related-price"
                  unitLabel={'لكل ' + relatedProduct.unit}
                />
              </button>
            ))}
          </div>
        </section>
      )}
      {isImageZoomOpen && selectedImageUrl && (
        <div
          className="sf-image-lightbox"
          role="presentation"
          onClick={() => setIsImageZoomOpen(false)}
        >
          <div
            className="sf-image-lightbox-panel"
            role="dialog"
            aria-modal="true"
            aria-label={'صورة المنتج ' + product.name}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="sf-image-lightbox-close"
              autoFocus
              onClick={() => setIsImageZoomOpen(false)}
            >إغلاق الصورة</button>
            <img src={selectedImageUrl} alt={product.name} decoding="async" />
          </div>
        </div>
      )}
    </section>
  );
}

function CollectionView({
  title,
  icon: Icon,
  products,
  priceVisibilityPolicy,
  wishlist,
  compare,
  loading,
  error,
  onRetry,
  onOpen,
  onAdd,
  onWishlist,
  onCompare,
  onBack,
  empty,
}: {
  title: string;
  icon: typeof Heart;
  products: ProductWithInventory[];
  priceVisibilityPolicy: unknown;
  wishlist: string[];
  compare: string[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (product: ProductWithInventory) => void;
  onAdd: (product: ProductWithInventory) => void;
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
  onBack: () => void;
  empty: string;
}) {
  return (
    <section className="sf-collection">
      <button className="sf-back-link" onClick={onBack}><ArrowRight size={16} /> العودة للمتجر</button>
      <div className="sf-products-head">
        <div><h2><Icon size={21} /> {title}</h2><span>{products.length} منتجات</span></div>
      </div>
      {products.length
        ? <ProductGrid
            products={products}
            priceVisibilityPolicy={priceVisibilityPolicy}
            wishlist={wishlist}
            compare={compare}
            emptyTitle={empty}
            emptyDescription=""
            onOpen={onOpen}
            onAdd={onAdd}
            onWishlist={onWishlist}
            onCompare={onCompare}
          />
        : loading
          ? <div className="sf-empty" role="status">جار تحميل قائمة المنتجات...</div>
          : error
            ? <div className="sf-empty" role="alert"><strong>تعذر تحميل قائمة المنتجات</strong><small>{error}</small><button type="button" className="sf-btn-secondary" onClick={onRetry}>إعادة المحاولة</button></div>
            : <div className="sf-empty"><Icon size={32} /><span>{empty}</span><button className="sf-link" onClick={onBack}>تصفح الكتالوج</button></div>}
    </section>
  );
}

type CheckoutPreviewLine = {
  product_id: string;
  name: string;
  item_code: string;
  unit: string;
  quantity: number | string;
};
type CheckoutValidation = {
  valid: true;
  items: CheckoutPreviewLine[];
  item_count: number;
  currency: string;
  pricing_verified: true;
};

const CHECKOUT_ATTEMPT_STORAGE_KEY = 'aghbari:checkout-attempt:v1';
type StoredCheckoutAttempt = { signature: string; key: string };

function checkoutAttemptStorageKey(profileId: string | undefined): string | null {
  return profileId ? CHECKOUT_ATTEMPT_STORAGE_KEY + ':' + encodeURIComponent(profileId) : null;
}

function readStoredCheckoutAttempt(profileId: string | undefined): StoredCheckoutAttempt | null {
  if (!profileId || typeof window === 'undefined') return null;
  try {
    const scopedKey = checkoutAttemptStorageKey(profileId);
    if (!scopedKey) return null;
    let raw = window.sessionStorage.getItem(scopedKey);
    let isLegacyKey = false;
    if (!raw) {
      raw = window.sessionStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
      isLegacyKey = raw !== null;
    }
    const saved = JSON.parse(raw || 'null') as {
      signature?: unknown;
      key?: unknown;
    } | null;
    if (!saved || typeof saved.signature !== 'string' || typeof saved.key !== 'string' ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(saved.key)) return null;
    const signature = JSON.parse(saved.signature) as { profile_id?: unknown };
    if (signature.profile_id !== profileId) return null;
    if (isLegacyKey) {
      window.sessionStorage.setItem(scopedKey, JSON.stringify(saved));
      if (window.sessionStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY) === raw) {
        window.sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
      }
    }
    return { signature: saved.signature, key: saved.key };
  } catch {
    return null;
  }
}

function Checkout({ cart, priceVisibilityPolicy, onBack, onComplete }: { cart: CartItem[]; priceVisibilityPolicy: unknown; onBack: () => void; onComplete: (order: { id: string; order_number: string }) => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [business, setBusiness] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<'cash_on_delivery' | 'credit'>('cash_on_delivery');
  const [deliveryAddresses, setDeliveryAddresses] = useState<CustomerAddress[]>([]);
  const [deliveryAddressId, setDeliveryAddressId] = useState('');
  const [deliveryAddressesLoading, setDeliveryAddressesLoading] = useState(false);
  const [deliveryAddressesError, setDeliveryAddressesError] = useState('');
  const [deliveryAddressRetry, setDeliveryAddressRetry] = useState(0);
  const selectedDeliveryAddress = useMemo(
    () => deliveryAddresses.find((address) => address.id === deliveryAddressId) ?? null,
    [deliveryAddresses, deliveryAddressId],
  );
  const [cartValidation, setCartValidation] = useState<CheckoutValidation | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const checkoutItems = useMemo(
    () => cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })).sort((a, b) => a.product_id.localeCompare(b.product_id)),
    [cart],
  );
  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);
  const submitInFlightRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [ambiguousSubmit, setAmbiguousSubmit] = useState(false);
  const [recoveringAttempt, setRecoveringAttempt] = useState(() => Boolean(readStoredCheckoutAttempt(user?.profileId)));
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!user?.profileId) {
      setDeliveryAddresses([]);
      setDeliveryAddressId('');
      setDeliveryAddressesLoading(false);
      setDeliveryAddressesError('');
      return () => { active = false; };
    }

    setDeliveryAddressesLoading(true);
    setDeliveryAddressesError('');
    void fetchCustomerAddresses().then((addresses) => {
      if (!active) return;
      setDeliveryAddresses(addresses);
      setDeliveryAddressId((current) =>
        addresses.some((address) => address.id === current)
          ? current
          : addresses.find((address) => address.is_default)?.id ?? addresses[0]?.id ?? '',
      );
    }).catch((cause) => {
      if (!active) return;
      setDeliveryAddresses([]);
      setDeliveryAddressId('');
      setDeliveryAddressesError(cause instanceof Error ? cause.message : 'تعذر تحميل عناوين التوصيل.');
    }).finally(() => {
      if (active) setDeliveryAddressesLoading(false);
    });

    return () => { active = false; };
  }, [user?.profileId, deliveryAddressRetry]);

  useEffect(() => {
    let active = true;
    setPreviewLoading(true);
    setPreviewError('');
    setCartValidation(null);
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('validate_checkout_cart', { p_items: checkoutItems });
        if (rpcError) throw new Error(rpcError.message || 'تعذر التحقق من أصناف السلة وسياسة التسعير');
        const payload = data as { valid?: unknown; items?: unknown; item_count?: unknown; currency?: unknown; pricing_verified?: unknown } | null;
        if (!payload || payload.valid !== true || payload.pricing_verified !== true || !Array.isArray(payload.items) ||
          payload.items.length === 0 || Number(payload.item_count) !== payload.items.length) {
          throw new Error('لم يصل تأكيد تحقق صالح من الخادم');
        }
        const rows = payload.items as CheckoutPreviewLine[];
        if (rows.some((line) =>
          typeof line.product_id !== 'string' || typeof line.name !== 'string' ||
          typeof line.item_code !== 'string' || typeof line.unit !== 'string' ||
          !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 ||
          'unit_price' in line || 'line_total' in line || 'total_amount' in line
        )) throw new Error('استجابة تحقق السلة غير مكتملة أو تحتوي حقولًا مالية غير مسموحة');
        if (active) setCartValidation({
          valid: true,
          items: rows,
          item_count: Number(payload.item_count),
          currency: typeof payload.currency === 'string' ? payload.currency : 'YER',
          pricing_verified: true,
        });
      } catch (e) {
        if (active) setPreviewError(e instanceof Error ? e.message : 'تعذر التحقق من الأسعار الحالية');
      } finally {
        if (active) setPreviewLoading(false);
      }
    })();
    return () => { active = false; };
  }, [checkoutItems, user?.profileId, previewRetry]);

  function checkoutSignature(): string {
    const items = cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })).sort((a, b) => a.product_id.localeCompare(b.product_id));
    return JSON.stringify({ profile_id: user?.profileId, payment_terms: paymentTerms, items, contact_name: name.trim(), business_name: business.trim(), phone: phone.trim(), notes: notes.trim(), delivery_address_id: deliveryAddressId || null });
  }

  function hasConflictingPendingAttempt(): boolean {
    const signature = checkoutSignature();
    const pending = idempotencyRef.current ?? readStoredCheckoutAttempt(user?.profileId);
    if (!pending || pending.signature === signature) return false;
    setRecoveringAttempt(true);
    setError('توجد محاولة طلب سابقة لم تصل نتيجة تأكيدها. أعد بياناتها نفسها أولًا؛ لن نغيّر السلة المحفوظة أو نرسل طلبًا مختلفًا قبل حسم المحاولة.');
    return true;
  }

  function getIdempotencyKey(): string | null {
    const signature = checkoutSignature();
    const activeAttempt = idempotencyRef.current;
    if (activeAttempt) {
      if (activeAttempt.signature === signature) return activeAttempt.key;
      setRecoveringAttempt(true);
      setError('هناك طلب سابق لم تصل نتيجة تأكيده. لا يمكن إرسال بيانات مختلفة قبل حسم المحاولة السابقة؛ أعد إدخال بياناتها نفسها ثم أعد المحاولة.');
      return null;
    }
    const saved = readStoredCheckoutAttempt(user?.profileId);
    if (saved) {
      if (saved.signature !== signature) {
        setRecoveringAttempt(true);
        setError('توجد محاولة طلب محفوظة لم تصل نتيجة تأكيدها. أدخل بيانات الطلب السابق نفسها لإعادة المحاولة الآمنة؛ لن ننشئ طلبًا جديدًا ببيانات مختلفة.');
        return null;
      }
      idempotencyRef.current = saved;
      setRecoveringAttempt(false);
      setAmbiguousSubmit(true);
      return saved.key;
    }
    const key = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'checkout_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    idempotencyRef.current = { signature, key };
    const storageKey = checkoutAttemptStorageKey(user?.profileId);
    try { if (storageKey) window.sessionStorage.setItem(storageKey, JSON.stringify({ signature, key })); } catch { /* in-page ref still protects retries when session storage is unavailable */ }
    return key;
  }

  async function submit() {
    // Button disabled state updates after React commits; guard the same-tick duplicate event too.
    if (submitInFlightRef.current) return;
    if (!user) { setError('سجّل الدخول أو أنشئ حساباً لإتمام الطلب'); return; }
    if (name.trim().length < 2 || phone.trim().length < 6) { setError('الاسم ورقم الهاتف مطلوبان'); return; }
    if (previewLoading || !cartValidation) { setError('لا يمكن تسجيل الطلب حتى ينجح التحقق من أصناف السلة وسياسة التسعير. أعد المحاولة.'); return; }
    if (hasConflictingPendingAttempt()) return;
    submitInFlightRef.current = true;
    setSubmitting(true); setError('');
    let requestWasSent = false;
    try {
      // The local draft can change just before the debounced background sync completes.
      // Persist/read back the exact line set before submit so the deferred DB trigger can
      // convert that same server-side cart atomically with the order.
      if (!user.isStaff && user.profileId && user.roles?.includes('customer')) {
        const expectedCart = checkoutItems
          .map((line) => ({ product_id: line.product_id.toLowerCase(), quantity: line.quantity }))
          .sort((a, b) => a.product_id.localeCompare(b.product_id));
        const persistedCart = await saveCustomerCart(expectedCart);
        const actualCart = [...persistedCart.items].sort((a, b) => a.product_id.localeCompare(b.product_id));
        if (JSON.stringify(actualCart) !== JSON.stringify(expectedCart)) {
          throw new Error('لم يؤكد الخادم حفظ جميع أصناف وكميات السلة الحالية؛ لم يُنشأ الطلب. أعد مزامنة السلة ثم حاول مجددًا.');
        }
      }

      const requestKey = getIdempotencyKey();
      if (!requestKey) return;
      requestWasSent = true;
      const { data, error: rpcError } = await supabase.rpc('submit_customer_order', {
        _items: cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        _notes: notes.trim(), _business_name: business.trim(), _contact_name: name.trim(), _phone: phone.trim(),
        _payment_terms: paymentTerms, _idempotency_key: requestKey,
        _delivery_address_id: deliveryAddressId || null,
      });
      const result = data as { id?: unknown; order_number?: unknown; status?: unknown } | null;
      if (rpcError || !result || typeof result.id !== 'string' || !result.id || typeof result.order_number !== 'string' || !result.order_number ||
        'total_amount' in result || 'unit_price' in result || 'line_total' in result) {
        // The server may have committed before an error or malformed acknowledgement reached the browser.
        // Keep the attempt key and require exact-payload replay instead of risking a second order.
        setAmbiguousSubmit(true);
        setError('لم يصل تأكيد نهائي لنتيجة الطلب. أعد المحاولة بالبيانات نفسها؛ سيُستخدم مفتاح المحاولة نفسه لمنع إنشاء طلب مكرر.');
        return;
      }
      try {
        const storageKey = checkoutAttemptStorageKey(user?.profileId);
        const saved = storageKey
          ? JSON.parse(window.sessionStorage.getItem(storageKey) || 'null') as { key?: unknown } | null
          : null;
        if (storageKey && saved?.key === requestKey) window.sessionStorage.removeItem(storageKey);
      } catch { /* request is already confirmed; cleanup is best-effort */ }
      idempotencyRef.current = null;
      setAmbiguousSubmit(false);
      setRecoveringAttempt(false);
      onComplete({ id: result.id, order_number: result.order_number });
    } catch (cause) {
      if (requestWasSent) {
        setAmbiguousSubmit(true);
        setError('انقطع الاتصال قبل وصول تأكيد نهائي للطلب. لا تغيّر بياناته؛ أعد المحاولة نفسها حتى نتحقق من نتيجته دون إنشاء طلب مكرر.');
      } else {
        setError(cause instanceof Error ? cause.message : 'تعذر إرسال الطلب');
      }
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="sf-checkout">
      <h2>إتمام الطلب</h2>
      <div className="sf-checkout-layout">
        <div className="sf-checkout-form">
          <label className="sf-form-field"><span>الاسم الكامل *</span><input value={name} disabled={submitting || ambiguousSubmit} onChange={(e) => setName(e.target.value)} placeholder="اسمك الكامل" /></label>
          <label className="sf-form-field"><span>رقم الهاتف *</span><input value={phone} disabled={submitting || ambiguousSubmit} onChange={(e) => setPhone(e.target.value)} placeholder="7XX XXX XXX" /></label>
          <label className="sf-form-field"><span>اسم المنشأة</span><input value={business} disabled={submitting || ambiguousSubmit} onChange={(e) => setBusiness(e.target.value)} placeholder="اسم المتجر أو الشركة" /></label>

          <div className="sf-form-field">
            <label htmlFor="checkout-delivery-address"><span>عنوان التوصيل</span></label>
            <select
              id="checkout-delivery-address"
              value={deliveryAddressId}
              onChange={(event) => setDeliveryAddressId(event.target.value)}
              disabled={deliveryAddressesLoading || submitting || ambiguousSubmit}
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #d8e8e8', borderRadius: 10, background: '#fff', color: '#18383c' }}
            >
              <option value="">بدون عنوان محفوظ — سأؤكد تفاصيل التوصيل لاحقًا</option>
              {deliveryAddresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label} — {address.city} — {address.address_line1}
                </option>
              ))}
            </select>
            {deliveryAddressesLoading && <small role="status" style={{ display: 'block', marginTop: 6 }}>جارٍ تحميل عناوينك المحفوظة...</small>}
            {deliveryAddressesError && <div className="sf-form-error" role="alert" style={{ marginTop: 8 }}>
              {deliveryAddressesError}
              <button className="sf-link" type="button" onClick={() => setDeliveryAddressRetry((n) => n + 1)}>إعادة المحاولة</button>
            </div>}
            {!deliveryAddressesLoading && deliveryAddresses.length === 0 && (
              <p style={{ color: '#71868a', lineHeight: 1.7, margin: '7px 0 0' }}>
                لا يوجد عنوان محفوظ. يمكنك إتمام الطلب دون ربط عنوان، أو <Link to="/addresses" className="sf-link">إضافة عنوان توصيل</Link>.
              </p>
            )}
            {selectedDeliveryAddress && (
              <div role="note" style={{ marginTop: 8, padding: 10, borderRadius: 9, background: '#f2f7f8', color: '#536b70', lineHeight: 1.7 }}>
                سيحفظ الطلب نسخة ثابتة من العنوان المحدد. تعديل دفتر العناوين لاحقًا لن يغير وجهة هذا الطلب.
              </div>
            )}
          </div>
          <fieldset className="sf-form-field" style={{ border: '1px solid #d8e8e8', borderRadius: 12, padding: 12, margin: 0 }}><legend style={{ padding: '0 6px', fontWeight: 800 }}>شروط الدفع</legend>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><input type="radio" name="paymentTerms" value="cash_on_delivery" checked={paymentTerms === 'cash_on_delivery'} disabled={submitting || ambiguousSubmit} onChange={() => setPaymentTerms('cash_on_delivery')} /> الدفع عند الاستلام</label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="radio" name="paymentTerms" value="credit" checked={paymentTerms === 'credit'} disabled={submitting || ambiguousSubmit} onChange={() => setPaymentTerms('credit')} /> الدفع الآجل وفق حد الائتمان المعتمد</label>
            <small style={{ color: '#71868a' }}>يتحقق الخادم من اعتماد حسابك وحد الائتمان عند اختيار الدفع الآجل.</small>
          </fieldset>
          <label className="sf-form-field"><span>ملاحظات</span><textarea value={notes} disabled={submitting || ambiguousSubmit} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات على الطلب..." /></label>
          {recoveringAttempt && !ambiguousSubmit && <p className="sf-form-error" role="status">توجد محاولة طلب سابقة لم يصل تأكيدها بعد. أدخل بيانات الطلب نفسها لإعادة المحاولة؛ لا تُنشئ طلبًا جديدًا قبل حسمها.</p>}
          {previewError && <div className="sf-form-error" role="alert">{previewError} <button className="sf-link" type="button" onClick={() => setPreviewRetry((n) => n + 1)}>إعادة التحقق</button></div>}
          {error && <div className="sf-form-error" role="alert" aria-live="assertive">{error}</div>}
          {ambiguousSubmit && <p role="status">بيانات الطلب مقفلة لحماية المحاولة غير المحسومة. أعد إرسال الطلب نفسه أو <Link to="/orders" className="sf-link">افتح طلباتي للتحقق من ظهور الطلب</Link>. سيبقى مفتاح المحاولة محفوظًا أثناء التحقق.</p>}
          <div className="sf-checkout-actions"><button className="sf-btn-secondary" onClick={onBack} disabled={submitting || ambiguousSubmit}>رجوع</button><button className="sf-btn-primary" onClick={submit} disabled={submitting || previewLoading || deliveryAddressesLoading || !cartValidation}>{submitting ? 'جار الإرسال...' : previewLoading ? 'جارٍ التحقق من السلة...' : deliveryAddressesLoading ? 'جارٍ تحميل عناوين التوصيل...' : ambiguousSubmit || recoveringAttempt ? 'إعادة محاولة تأكيد الطلب نفسه' : 'تأكيد الطلب'}</button></div>
        </div>
        <aside className="sf-checkout-summary">
          <h3>ملخص الطلب</h3>
          {previewLoading && <p role="status">جارٍ التحقق من الأصناف وسياسة التسعير من الخادم...</p>}
          {cartValidation ? cartValidation.items.map((line) => <div className="sf-summary-row" key={line.product_id}><span>{line.name}</span><small>الكمية: {formatNumber(Number(line.quantity))} {line.unit}</small></div>)
            : !previewLoading && cart.map((i) => <div className="sf-summary-row" key={i.product.id}><span>{i.product.name}</span><small>الكمية: {formatNumber(i.quantity)} {i.product.unit}</small></div>)}
          <CustomerOrderPricingPreview
            items={checkoutItems}
            policyValue={priceVisibilityPolicy}
            surface="orders"
            title="مراجعة أسعار الطلب"
          />
          {priceVisibilityPolicy !== true && <div role="note" style={{ padding: 12, borderRadius: 10, background: '#f2f7f8', color: '#536b70', lineHeight: 1.8 }}>
            الأسعار والإجماليات مخفية في مراجعة الطلب حسب إعدادات المتجر. بعد مراجعة الإدارة سيظهر إشعار حالة الطلب وتعليمات السداد عند الحاجة.
          </div>}
          {cartValidation && <small style={{ color: '#71868a', lineHeight: 1.7 }}>تحقق الخادم من الأصناف وسياسة التسعير. تُعرض مبالغ المراجعة فقط إذا أجازها إعداد الخادم ومعاينة الأسعار المطابقة لهذه الشاشة؛ ويعيد الخادم حساب المبلغ داخل معاملة إنشاء الطلب.</small>}
          {!cartValidation && !previewLoading && <small style={{ color: '#9b2626', lineHeight: 1.7 }}>لن يُرسل الطلب حتى ينجح التحقق من السلة وسياسة التسعير في الخادم.</small>}
        </aside>
      </div>
    </section>
  );
}

function OrderConfirm({ orderNo, orderId, onContinue }: { orderNo: string; orderId: string; onContinue: () => void }) {
  return (
    <section className="sf-confirm">
      <div className="sf-confirm-icon"><Check size={40} /></div>
      <h2>تم استلام طلبك بنجاح!</h2>
      <p>رقم الطلب: <strong>{orderNo}</strong></p>
      <p>الطلب الآن بانتظار مراجعة الإدارة. لن تظهر الأسعار أو الإجماليات في مستندات الطلب الخاصة بالعميل.</p>
      <p>بعد اعتماد الإدارة، ستجد حالة الطلب وتعليمات السداد عند الحاجة في صفحة التفاصيل.</p>
      <p>سنتواصل معك لتأكيد تفاصيل التوصيل. لا يمثل هذا إشعار دفع أو شحن.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}><Link to="/orders/$id" params={{ id: orderId }} className="sf-btn-secondary" style={{ textDecoration: 'none', padding: '10px 14px' }}>تفاصيل الطلب</Link><button className="sf-btn-primary" onClick={onContinue}>متابعة التسوق</button></div>
    </section>
  );
}

type MatrixFeedback = { kind: 'success' | 'error'; message: string };

export function QuickOrderMatrix({ products, quantities, alreadyInCart = {}, feedback, onQuantityChange, onAddSelected, onBack, onCart }: {
  products: ProductWithInventory[];
  quantities: Record<string, string>;
  alreadyInCart?: Record<string, number>;
  feedback: MatrixFeedback | null;
  onQuantityChange: (productId: string, value: string) => void;
  onAddSelected: () => void;
  onBack: () => void;
  onCart: () => void;
}) {
  const selectedCount = products.filter((product) => Number(quantities[product.id] ?? 0) > 0).length;
  return (
    <section className="sf-collection">
      <button className="sf-back-link" onClick={onBack}><ArrowRight size={16} /> العودة للكتالوج</button>
      <div className="sf-products-head">
        <div><h2><ClipboardList size={21} /> الطلب السريع</h2><span>حدد كميات عدة أصناف في شاشة واحدة ثم أضفها إلى السلة. لا تعرض شاشة الطلب السريع أي أسعار أو إجماليات.</span></div>
        <div className="sf-discovery-links"><button onClick={onCart}><ShoppingCart size={15} /> عرض السلة</button></div>
      </div>
      <p style={{ margin: '0 0 14px', color: '#667b80', fontSize: 12 }} role="note">
        لا تُعرض الأسعار أو إجماليات الطلب هنا؛ يتحقق الخادم من الأصناف والكميات والمخزون ويعيد احتساب السعر داخليًا عند إرسال الطلب.
      </p>
      {feedback && <div role={feedback.kind === 'error' ? 'alert' : 'status'} style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, border: `1px solid ${feedback.kind === 'error' ? '#efc5c5' : '#b8e5d4'}`, background: feedback.kind === 'error' ? '#fff6f6' : '#f0fbf6', color: feedback.kind === 'error' ? '#9b2626' : '#17684d', fontSize: 13 }}>{feedback.message}</div>}
      {!products.length ? <div className="sf-empty"><Package size={30} /><span>لا توجد منتجات مطابقة للبحث الحالي</span><small>غيّر البحث أو التصنيف ثم حاول مجددًا.</small></div> :
        <div style={{ overflowX: 'auto', border: '1px solid #dfeaec', borderRadius: 14, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560, fontSize: 13 }}>
            <thead><tr style={{ background: '#f2f7f8', textAlign: 'right' }}>
              <th scope="col" style={{ padding: 12 }}>الصنف</th>
              <th scope="col" style={{ padding: 12 }}>الرمز</th>
              <th scope="col" style={{ padding: 12 }}>المتوفر</th>
              <th scope="col" style={{ padding: 12 }}>الكمية</th>
            </tr></thead>
            <tbody>{products.map((product) => {
              const available = Math.max(0, Math.floor(Number(product.inventory?.quantity_available ?? 0)));
              const alreadyOrdered = Math.max(0, Math.floor(Number(alreadyInCart[product.id] ?? 0)));
              const remainingToAdd = Math.max(0, available - alreadyOrdered);
              const minimum = Number.isSafeInteger(product.min_order_quantity) && Number(product.min_order_quantity) >= 1
                ? Number(product.min_order_quantity) : 1;
              const multiple = Number.isSafeInteger(product.order_quantity_multiple) && Number(product.order_quantity_multiple) >= 1
                ? Number(product.order_quantity_multiple) : 1;
              const nextAllowedTotal = alreadyOrdered < minimum
                ? minimum
                : minimum + (Math.floor((alreadyOrdered - minimum) / multiple) + 1) * multiple;
              const minimumAddition = Math.max(1, nextAllowedTotal - alreadyOrdered);
              const rawQuantity = quantities[product.id] ?? '';
              const currentQuantity = /^\d+$/.test(rawQuantity) ? Number(rawQuantity) : 0;
              const resultingQuantity = alreadyOrdered + currentQuantity;
              const nextAllowedAfterCurrent = resultingQuantity < minimum
                ? minimum
                : minimum + (Math.floor((resultingQuantity - minimum) / multiple) + 1) * multiple;
              const nextIncrease = nextAllowedAfterCurrent - alreadyOrdered;
              return <tr key={product.id} style={{ borderTop: '1px solid #edf2f3' }}>
                <td style={{ padding: 12, fontWeight: 800 }}>
                  <div>{product.name}</div>
                  {product.name_en ? <small dir="auto" style={{ display: 'block', marginTop: 3, color: '#62797e', fontWeight: 500 }}>{product.name_en}</small> : null}
                  <small style={{ display: 'block', marginTop: 3, color: '#74888c', fontWeight: 500 }}>{product.category?.name ?? 'غير مصنف'}</small>
                  {(minimum > 1 || multiple > 1) && <small style={{ display: 'block', marginTop: 3, color: '#62797e', fontWeight: 600 }}>الحد الأدنى {minimum} · تدرج الكمية {multiple}</small>}
                </td>
                <td style={{ padding: 12, direction: 'ltr', textAlign: 'right' }}>
                  <div>{product.item_code}</div>
                  {product.sku ? <small style={{ display: 'block', marginTop: 3, color: '#62797e', fontWeight: 600 }}>SKU: {product.sku}</small> : null}
                </td>
                <td style={{ padding: 12, whiteSpace: 'nowrap' }}>{formatNumber(available)} {product.unit}</td>
                <td style={{ padding: 12, minWidth: 160 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <button type="button" aria-label={`تقليل كمية ${product.name}`} disabled={remainingToAdd < minimumAddition || currentQuantity <= 0} onClick={() => { const previousTotal = resultingQuantity <= minimum ? 0 : minimum + Math.max(0, Math.ceil((resultingQuantity - minimum) / multiple) - 1) * multiple; const next = previousTotal - alreadyOrdered; onQuantityChange(product.id, next < minimumAddition ? '' : String(next)); }} style={{ width: 32, height: 36, border: '1px solid #cfdddd', borderRadius: 8, background: '#f0f7f3', color: '#1d6048' }}><Minus size={14} /></button>
                    <input type="number" inputMode="numeric" min={minimumAddition} max={remainingToAdd} step={multiple} value={rawQuantity} disabled={remainingToAdd < minimumAddition} aria-label={`كمية ${product.name}`} onChange={(event) => { const value = event.target.value; if (value === '' || /^\d+$/.test(value)) onQuantityChange(product.id, value); }} style={{ width: 78, padding: '9px 8px', border: '1px solid #cfdddd', borderRadius: 9, background: available <= 0 ? '#f2f5f5' : '#fff', color: '#18383c', textAlign: 'center' }} />
                    <button type="button" aria-label={`زيادة كمية ${product.name}`} disabled={remainingToAdd < minimumAddition || nextIncrease > remainingToAdd} onClick={() => onQuantityChange(product.id, String(nextIncrease))} style={{ width: 32, height: 36, border: '1px solid #cfdddd', borderRadius: 8, background: '#f0f7f3', color: '#1d6048' }}><Plus size={14} /></button>
                  </div>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        <span style={{ color: '#687e82', fontSize: 12 }}>{selectedCount} أصناف محددة ضمن النتائج الحالية</span>
        <button className="sf-btn-primary" onClick={onAddSelected} disabled={selectedCount === 0}><ClipboardList size={16} /> إضافة المحدد إلى السلة</button>
      </div>
    </section>
  );
}
