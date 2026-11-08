import { supabase } from '@/lib/supabase';
import type { ProductWithInventory } from '@/lib/types';
import { normalizeCatalogSearchQuery, MAX_CATALOG_SEARCH_LENGTH } from '@/lib/commerce-utils';

export interface StorefrontCatalogPage {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  items: ProductWithInventory[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function parseProduct(value: unknown): ProductWithInventory {
  const row = asRecord(value);
  if (!row || typeof row.id !== 'string' || !row.id
      || typeof row.name !== 'string' || typeof row.item_code !== 'string'
      || typeof row.unit !== 'string') {
    throw new Error('وصل سجل كتالوج غير صالح من الخادم؛ لم يُعرض.');
  }

  // NULL is the explicit server decision to hide catalog pricing; a missing property is malformed.
  if (row.display_price === undefined) {
    throw new Error('استجابة السعر من الخادم غير مكتملة؛ لم يُعرض سعر بديل.');
  }
  const displayPrice = row.display_price === null
    ? undefined
    : finiteNumber(row.display_price, Number.NaN);
  if (displayPrice !== undefined && (!Number.isFinite(displayPrice) || displayPrice < 0)) {
    throw new Error('تعذر التحقق من السعر المعتمد لهذا الصنف؛ لم يُعرض سعر بديل.');
  }

  const minimumOrderQuantity = row.min_order_quantity === undefined ? 1 : finiteNumber(row.min_order_quantity, Number.NaN);
  const orderQuantityMultiple = row.order_quantity_multiple === undefined ? 1 : finiteNumber(row.order_quantity_multiple, Number.NaN);
  if (!Number.isSafeInteger(minimumOrderQuantity) || minimumOrderQuantity < 1 || minimumOrderQuantity > 10000 ||
      !Number.isSafeInteger(orderQuantityMultiple) || orderQuantityMultiple < 1 || orderQuantityMultiple > 10000) {
    throw new Error('سياسة الحد الأدنى ومضاعف الطلب للصنف غير صالحة؛ لم تُعرض بيانات كمية غير مؤكدة.');
  }

  const rawInventory = asRecord(row.inventory);
  const inventory = rawInventory && rawInventory.product_id === row.id
      && Number.isFinite(Number(rawInventory.quantity_available))
      && Number(rawInventory.quantity_available) >= 0
    ? {
        // Public catalog payloads carry availability, not internal inventory identifiers.
        id: '',
        product_id: row.id,
        warehouse_id: '',
        quantity_on_hand: 0,
        quantity_reserved: 0,
        quantity_available: Number(rawInventory.quantity_available),
      }
    : undefined;

  return {
    id: row.id,
    name: row.name,
    name_en: typeof row.name_en === 'string' ? row.name_en : null,
    item_code: row.item_code,
    sku: typeof row.sku === 'string' ? row.sku : null,
    barcode: typeof row.barcode === 'string' ? row.barcode : null,
    category_id: typeof row.category_id === 'string' ? row.category_id : null,
    brand_id: typeof row.brand_id === 'string' ? row.brand_id : null,
    unit: row.unit,
    description: typeof row.description === 'string' ? row.description : null,
    image_url: typeof row.image_url === 'string' ? row.image_url : null,
    is_active: row.is_active === true,
    is_featured: row.is_featured === true,
    sort_order: finiteNumber(row.sort_order),
    // Public stock quantity is availability, never internal on-hand count.
    // Never trust a legacy/raw stock_quantity field: public UI may expose availability only.
    stock_quantity: inventory?.quantity_available ?? 0,
    reserved_quantity: 0,
    min_stock_level: 0,
    min_order_quantity: minimumOrderQuantity,
    order_quantity_multiple: orderQuantityMultiple,
    status: typeof row.status === 'string' ? row.status : 'active',
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    ...(displayPrice === undefined ? {} : { display_price: displayPrice }),
    inventory,
  };
}

export async function fetchStorefrontCatalogPage(input: {
  search: string;
  categoryId: string | null;
  page: number;
  pageSize?: number;
  availableOnly: boolean;
}): Promise<StorefrontCatalogPage> {
  // Keep the client-side bounds aligned with the SECURITY DEFINER RPC contract, even for malformed runtime values.
  const requestedPage = Number.isFinite(input.page) ? Math.floor(input.page) : 1;
  const page = Math.min(100_000, Math.max(1, requestedPage));
  const requestedPageSize = input.pageSize !== undefined && Number.isFinite(input.pageSize)
    ? Math.floor(input.pageSize)
    : 24;
  const pageSize = Math.min(100, Math.max(1, requestedPageSize));
  const search = normalizeCatalogSearchQuery(input.search).slice(0, MAX_CATALOG_SEARCH_LENGTH);
  const { data, error } = await supabase.rpc('get_storefront_catalog_page', {
    p_search: search,
    p_category_id: input.categoryId,
    p_page: page,
    p_page_size: pageSize,
    p_available_only: input.availableOnly,
  });
  if (error) throw new Error('تعذر تحميل صفحة الكتالوج من الخادم.');
  const payload = asRecord(data);
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('استجابة صفحة الكتالوج غير صالحة؛ لم تُعرض نتائج غير مؤكدة.');
  }

  const items = payload.items.map(parseProduct);
  const totalCount = finiteNumber(payload.total_count, Number.NaN);
  const totalPages = finiteNumber(payload.total_pages, Number.NaN);
  const resolvedPage = finiteNumber(payload.page, Number.NaN);
  const resolvedPageSize = finiteNumber(payload.page_size, Number.NaN);
  if (![totalCount, totalPages, resolvedPage, resolvedPageSize].every(Number.isSafeInteger)
      || totalCount < 0 || totalPages < 0 || resolvedPage < 1 || resolvedPage > 100_000
      || resolvedPageSize < 1 || resolvedPageSize > 100
      || items.length > resolvedPageSize || items.length > totalCount) {
    throw new Error('بيانات ترقيم صفحات الكتالوج غير صالحة؛ لم تُعرض نتائج غير مؤكدة.');
  }
  const expectedTotalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / resolvedPageSize);
  if (totalPages !== expectedTotalPages || (totalCount === 0 && items.length !== 0)) {
    throw new Error('بيانات ترقيم صفحات الكتالوج غير متسقة؛ لم تُعرض نتائج غير مؤكدة.');
  }
  return {
    page: resolvedPage,
    pageSize: resolvedPageSize,
    totalCount,
    totalPages,
    items,
  };
}
