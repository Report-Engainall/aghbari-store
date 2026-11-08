import { getCurrentTenantScope, getStorefrontDataScope, supabase } from './supabase';
import { saveAdminCatalogProduct } from './admin-catalog-commands';
import { parseStoreExecutiveAnalytics, type StoreExecutiveAnalytics } from './executive-analytics';
import { parseStoreProductActivityReport, type StoreProductActivityReport } from './product-activity-report';
import { parseStaffCustomer360Summary, type StaffCustomer360Summary } from './customer-360-summary';
import { isPurchaseOrderUuid, parsePurchaseOrder, parsePurchaseOrders, type PurchaseOrder } from './purchase-orders';
import { countLowStockBalances } from './inventory-metrics';
import { summarizeDashboardOrders } from './dashboard-metrics';
import { retryRead } from './retry';
import { PRODUCT_IMAGE_MAX_BYTES } from './product-image';
import { extractOwnedProductImageObjectPath } from './product-image-security';
import { validateCustomerInput, type NewCustomerInput } from './customer-input';
import { validateInventoryTransferBatchInput, type InventoryTransferBatchInput } from './inventory-transfer-batch';
import { isValidPriceAmount } from './price-grid-money';
import type {
  Product, Category, Customer, Supplier, Order, OrderItem,
  InventoryBalance, PricingRule, CreatePricingRuleInput, Promotion, AiAlert, AiTask, Notification,
  ProductWithInventory, OrderWithCustomer, AdminSetting, ImportJob, ImportJobRow,
  OperationalTask, OperationalTaskRole, OperationalTaskStatus, OperationalTaskAssignee,
  CustomerInteraction, CustomerInteractionType, CustomerInteractionFollowUpStatus,
  StorefrontAnnouncement, StorefrontAnnouncementInput, PromotionInput,
} from './types';

type SupabaseReadOutcome<T> = { data: T | null; error: unknown | null };

/** Retries transient READ failures only. Never use this helper for writes, RPC commands, or finance mutations. */
async function readWithRetry<T>(operation: () => PromiseLike<SupabaseReadOutcome<T>>): Promise<T | null> {
  return retryRead(async () => {
    const { data, error } = await operation();
    if (error) throw error;
    return data;
  });
}

// Fetch unit prices using the server-derived customer/company tier. The client never
// supplies a tier, customer id, or organization id, and must fail closed if any price is missing.
export async function fetchResolvedProductPrices(
  productIds: string[],
  quantity = 1,
): Promise<Map<string, number | null>> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw new Error("الكمية المطلوبة لاحتساب السعر غير صالحة.");
  }
  const uniqueIds = [...new Set(productIds)];
  if (!uniqueIds.length) return new Map();
  if (uniqueIds.some((id) => typeof id !== "string" || !id.length)) {
    throw new Error("تعذر التحقق من هوية أحد الأصناف.");
  }
  const prices = new Map<string, number | null>();
  for (let offset = 0; offset < uniqueIds.length; offset += 500) {
    const chunk = uniqueIds.slice(offset, offset + 500);
    let data: unknown;
    try {
      data = await readWithRetry(() => supabase.rpc("get_storefront_product_prices", {
        p_product_ids: chunk,
        p_quantity: quantity,
      }));
    } catch {
      throw new Error("تعذر تحميل أسعار فئة حسابك من الخادم؛ أُخفيت الأسعار حتى اكتمال التحقق.");
    }
    if (!Array.isArray(data)) {
      throw new Error("تعذر تحميل أسعار فئة حسابك من الخادم؛ أُخفيت الأسعار حتى اكتمال التحقق.");
    }
    for (const row of data as Array<{ product_id?: unknown; unit_price?: unknown }>) {
      if (typeof row.product_id !== "string" || !chunk.includes(row.product_id) || prices.has(row.product_id)) {
        throw new Error("أعاد الخادم نتيجة أسعار غير متطابقة؛ أُخفيت الأسعار لحماية الحساب.");
      }
      if (row.unit_price === null) {
        prices.set(row.product_id, null);
        continue;
      }
      const price = Number(row.unit_price);
      if (!Number.isFinite(price) || price < 0) {
        throw new Error("أعاد الخادم سعرًا غير صالح؛ أُخفيت الأسعار لحماية الحساب.");
      }
      prices.set(row.product_id, price);
    }
    if (chunk.some((id) => !prices.has(id))) {
      throw new Error("لم يرجع الخادم سعرًا موثقًا لكل صنف متاح؛ أُخفيت الأسعار لحماية الحساب.");
    }
  }
  return prices;
}

// ─── Products ───
export async function fetchProducts(): Promise<ProductWithInventory[]> {
  const scope = await getStorefrontDataScope();
  const { organizationId: orgId, warehouseId, isStaff } = scope;
  const publicProductColumns = 'id,category_id,name,name_en,item_code,sku,barcode,description,unit,status,image_url,created_at,min_order_quantity,order_quantity_multiple';
  let products: Product[];
  if (isStaff) {
    // Sensitive product columns are not directly SELECTable by browser roles.
    // Staff reads cross this tenant-bound, role-checked RPC instead of table-wide SELECT.
    const data = await readWithRetry(() => supabase.rpc('fetch_staff_products', { p_product_id: null }));
    products = ((data ?? []) as Product[]).sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const data = await readWithRetry(() => supabase
      .from('products')
      .select(publicProductColumns)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('name'));
    products = (data ?? []) as unknown as Product[];
  }

  const productIds = products.map((product) => product.id);
  const galleryByProduct = new Map<string, string[]>();
  for (let offset = 0; offset < productIds.length; offset += 200) {
    const productIdBatch = productIds.slice(offset, offset + 200);
    const mediaRows = await readWithRetry<Array<{ product_id: string; url: string; sort_order: number; created_at: string }>>(async () => {
      const { data, error } = await supabase
        .from('product_media')
        .select('product_id,url,sort_order,created_at')
        .in('product_id', productIdBatch)
        .eq('is_primary', false)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      return {
        data: (data ?? []) as Array<{ product_id: string; url: string; sort_order: number; created_at: string }>,
        error,
      };
    });
    for (const media of mediaRows ?? []) {
      if (typeof media.product_id !== 'string' || typeof media.url !== 'string' || !/^https:\/\//i.test(media.url)) continue;
      const urls = galleryByProduct.get(media.product_id) ?? [];
      if (urls.length < 8) urls.push(media.url);
      galleryByProduct.set(media.product_id, urls);
    }
  }

  const customerPriceMap = isStaff
    ? null
    : await fetchResolvedProductPrices(productIds);

  const inventory = warehouseId
    ? await readWithRetry(() => supabase
        .from('inventory_balances')
        .select(isStaff ? '*' : 'product_id,quantity_available')
        .eq('warehouse_id', warehouseId))
    : [];

  const invMap = new Map<string, InventoryBalance>();
  (inventory as unknown as Array<Record<string, unknown>> | null)?.forEach((row) => {
    if (typeof row.product_id !== 'string') return;
    if (isStaff) {
      invMap.set(row.product_id, row as unknown as InventoryBalance);
      return;
    }
    const available = Number(row.quantity_available);
    invMap.set(row.product_id, {
      id: '',
      product_id: row.product_id,
      warehouse_id: '',
      quantity_on_hand: 0,
      quantity_reserved: 0,
      quantity_available: Number.isFinite(available) && available >= 0 ? available : 0,
    });
  });

  const categories = await retryRead(async () => {
    let query = supabase
      .from('categories')
      .select(isStaff ? '*' : 'id,name,code,parent_id,sort_order,is_active')
      .eq('organization_id', orgId);
    // Categories can contain internal descriptions; expose only storefront fields and active
    // categories to non-staff clients. Keep the full scoped projection for staff maintenance.
    if (!isStaff) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  });
  const catMap = new Map<string, Category>();
  (categories as unknown as Category[] | null)?.forEach((cat) => catMap.set(cat.id, cat));

  return (products as Product[]).map((p) => {
    const displayPrice = isStaff ? Number(p.base_price) : customerPriceMap?.get(p.id);
    if (
      displayPrice === undefined ||
      (displayPrice !== null && (!Number.isFinite(displayPrice) || displayPrice < 0))
    ) {
      throw new Error("تعذر التحقق من سعر فئة حسابك لهذا الصنف؛ لم يُعرض سعر بديل.");
    }

    // Do not spread a customer query result: explicit projection is a second privacy
    // boundary if a later query change or mocked response contains internal financial keys.
    const staffProduct = p as Product & {
      status?: string;
      created_at?: string;
    };
    const productFields: Record<string, unknown> = isStaff
      ? {
          ...p,
          base_price: Number(p.base_price),
          min_order_quantity: Number(p.min_order_quantity ?? 1),
          order_quantity_multiple: Number(p.order_quantity_multiple ?? 1),
          image_gallery_urls: galleryByProduct.get(p.id) ?? [],
        }
      : {
          id: p.id,
          category_id: p.category_id,
          name: p.name,
          name_en: p.name_en,
          item_code: p.item_code,
          sku: p.sku,
          barcode: p.barcode,
          description: p.description,
          unit: p.unit,
          min_order_quantity: Number(p.min_order_quantity ?? 1),
          order_quantity_multiple: Number(p.order_quantity_multiple ?? 1),
          status: staffProduct.status,
          image_url: p.image_url,
          image_gallery_urls: galleryByProduct.get(p.id) ?? [],
          created_at: staffProduct.created_at,
        };

    return {
      ...productFields,
      ...(displayPrice === null ? {} : { display_price: displayPrice }),
      inventory: invMap.get(p.id),
      category: catMap.get(p.category_id || ''),
    } as unknown as ProductWithInventory;
  });
}

async function fetchStaffProductById(id: string): Promise<Product> {
  const { data, error } = await supabase.rpc('fetch_staff_products', { p_product_id: id });
  if (error) throw error;
  const product = (data as Product[] | null)?.[0];
  if (!product) throw new Error('الصنف غير موجود في المؤسسة الحالية أو لا تملك صلاحية قراءته.');
  return product;
}

export async function createProduct(p: Partial<Product>): Promise<Product> {
  const prices = [
    p.base_price,
    p.price_wholesale_of_wholesale,
    p.price_wholesale,
    p.price_retail,
  ];
  if (!prices.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('أدخل السعر الأساسي وأسعار شرائح العملاء الثلاث قبل إنشاء المنتج.');
  }

  const requestedStatus = (p as Partial<Product> & { status?: string }).status;
  const saved = await saveAdminCatalogProduct(null, {
    name: p.name ?? '',
    item_code: p.item_code ?? '',
    barcode: p.barcode ?? null,
    unit: p.unit ?? '',
    description: p.description ?? null,
    category_id: p.category_id ?? null,
    base_price: p.base_price as number,
    price_wholesale_of_wholesale: p.price_wholesale_of_wholesale as number,
    price_wholesale: p.price_wholesale as number,
    price_retail: p.price_retail as number,
    status: requestedStatus === 'inactive' || p.is_active === false ? 'inactive' : 'active',
    name_en: p.name_en ?? null,
    sku: p.sku ?? null,
    is_featured: p.is_featured ?? false,
    sort_order: p.sort_order ?? 0,
    min_order_quantity: p.min_order_quantity ?? 1,
    order_quantity_multiple: p.order_quantity_multiple ?? 1,
  });
  if (!saved.created) {
    throw new Error('لم يؤكد الخادم إنشاء المنتج؛ حدّث الكتالوج قبل إعادة المحاولة.');
  }
  try {
    return await fetchStaffProductById(saved.id);
  } catch {
    throw new Error('تم حفظ المنتج بالمعرّف ' + saved.id + '، لكن تعذر تحميل بياناته. حدّث قائمة المنتجات قبل إعادة الإنشاء لتجنب التكرار.');
  }
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
  await getCurrentTenantScope();
  const current = await fetchStaffProductById(id);
  const merged = { ...current, ...updates };
  const editableStatus = (merged as Product & { status?: string }).status;

  const currentPrices = [
    current.base_price,
    current.price_wholesale_of_wholesale,
    current.price_wholesale,
    current.price_retail,
  ].map(Number);
  const nextPrices = [
    merged.base_price,
    merged.price_wholesale_of_wholesale,
    merged.price_wholesale,
    merged.price_retail,
  ].map(Number);
  if (![...currentPrices, ...nextPrices].every(Number.isFinite)) {
    throw new Error('تعذر التحقق من شبكة أسعار المنتج الحالية؛ لم تُحفظ أي تعديلات.');
  }

  // Product table UPDATE is intentionally revoked for authenticated users.
  // One security-definer command applies core fields, price-grid optimistic
  // concurrency, editable catalog metadata and audit atomically in PostgreSQL.
  const payload = {
    name: String(merged.name ?? ''),
    item_code: String(merged.item_code ?? ''),
    barcode: merged.barcode ?? null,
    unit: String(merged.unit ?? ''),
    description: merged.description ?? null,
    category_id: merged.category_id ?? null,
    base_price: nextPrices[0],
    price_wholesale_of_wholesale: nextPrices[1],
    price_wholesale: nextPrices[2],
    price_retail: nextPrices[3],
    status: editableStatus === 'inactive' || merged.is_active === false ? 'inactive' : 'active',
    expected_base_price: currentPrices[0],
    expected_price_wholesale_of_wholesale: currentPrices[1],
    expected_price_wholesale: currentPrices[2],
    expected_price_retail: currentPrices[3],
    name_en: merged.name_en ?? null,
    sku: merged.sku ?? null,
    is_featured: merged.is_featured === true,
    sort_order: Number(merged.sort_order ?? 0),
    min_order_quantity: Number(merged.min_order_quantity ?? 1),
    order_quantity_multiple: Number(merged.order_quantity_multiple ?? 1),
  };
  const { data, error } = await supabase.rpc('save_admin_product_with_metadata', {
    p_product_id: id,
    p_payload: payload,
  });
  if (error) throw error;
  const result = data as { id?: unknown } | null;
  if (!result || result.id !== id) {
    throw new Error('لم يؤكد الخادم حفظ المنتج ضمن المؤسسة الحالية؛ حدّث القائمة قبل إعادة المحاولة.');
  }
  return fetchStaffProductById(id);
}

export class ProductImageCleanupError extends Error {
  constructor(message: string, readonly imageLinked: boolean) {
    super(message);
    this.name = "ProductImageCleanupError";
  }
}

async function deleteProductImageObject(productId: string, objectPath: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("product-image-upload", {
    body: { action: "delete", product_id: productId, object_path: objectPath },
  });
  if (error || data?.deleted !== true) {
    throw new Error("تعذر تأكيد حذف ملف الصورة من التخزين.");
  }
}

const PRODUCT_IMAGE_PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidProductImageProductId(value: unknown): value is string {
  return typeof value === "string" && PRODUCT_IMAGE_PRODUCT_ID_PATTERN.test(value);
}

export async function uploadProductImage(
  productId: string,
  image: Blob,
  previousImageUrl?: string | null,
): Promise<string> {
  if (!isValidProductImageProductId(productId)) {
    throw new Error("معرّف المنتج غير صالح؛ لم تُرفع الصورة.");
  }
  if (!(image instanceof Blob) || image.type !== "image/webp" || image.size < 1 || image.size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new Error("الصورة المحوّلة ليست WebP صالحًا أو تجاوزت حد 8 ميغابايت.");
  }
  const scope = await getCurrentTenantScope();
  if (!scope.isStaff) throw new Error("صلاحية إدارة المنتجات مطلوبة لرفع الصورة.");

  const { data, error } = await supabase.functions.invoke("product-image-upload", {
    body: image,
    headers: {
      "content-type": "image/webp",
      "x-product-id": productId,
      "x-expected-image-url": previousImageUrl ?? "",
    },
  });
  if (error || data?.image_linked !== true) {
    const code = typeof data?.error === "string" ? data.error : "";
    if (code === "image_link_changed") {
      throw new Error("تغيرت صورة المنتج منذ فتح النموذج؛ حدّث بيانات المنتج ثم أعد المحاولة.");
    }
    if (code === "image_link_state_unconfirmed") {
      throw new Error("حالة ربط الصورة غير مؤكدة؛ حدّث المنتج قبل أي محاولة رفع أخرى.");
    }
    if (code === "image_link_failed_cleanup_pending") {
      throw new Error("تعذر ربط الصورة، وتعذر تأكيد تنظيف الملف المرفوع؛ لا تكرر الرفع قبل تحديث المنتج.");
    }
    throw new Error("تعذر رفع صورة المنتج وربطها ذرياً بسجل المنتج. تحقق من خدمة الصور ثم حدّث القائمة.");
  }
  const publicUrl = typeof data.public_url === "string" ? data.public_url : "";
  const objectPath = typeof data.object_path === "string" ? data.object_path : "";
  if (!/^https:\/\//i.test(publicUrl) || !objectPath) {
    throw new Error("أكد الخادم ربط الصورة لكن أعاد مرجعاً غير صالح؛ حدّث المنتج قبل المتابعة.");
  }

  const previousObjectPath = extractOwnedProductImageObjectPath(
    previousImageUrl,
    scope.organizationId,
    productId,
  );

  // The new URL is committed before the old object is removed; a cleanup failure must
  // never delete the newly linked image or be reported as an upload/link failure.
  if (previousObjectPath && previousObjectPath !== objectPath) {
    try {
      await deleteProductImageObject(productId, previousObjectPath);
    } catch {
      throw new ProductImageCleanupError(
        "تم ربط الصورة الجديدة، لكن تعذر تنظيف الصورة السابقة من التخزين.",
        true,
      );
    }
  }
  return publicUrl;
}

export async function uploadProductGalleryImage(productId: string, image: Blob): Promise<string> {
  if (!isValidProductImageProductId(productId)) throw new Error("معرّف المنتج غير صالح؛ لم تُرفع صورة المعرض.");
  if (!(image instanceof Blob) || image.type !== "image/webp" || image.size < 1 || image.size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new Error("صورة المعرض ليست WebP صالحًا أو تجاوزت حد 8 ميغابايت.");
  }
  const scope = await getCurrentTenantScope();
  if (!scope.isStaff) throw new Error("صلاحية إدارة المنتجات مطلوبة لرفع صور المعرض.");
  const { data, error } = await supabase.functions.invoke("product-image-upload", {
    body: image,
    headers: { "content-type": "image/webp", "x-product-id": productId, "x-image-mode": "gallery" },
  });
  if (error || data?.image_linked !== true || data?.image_role !== "gallery") {
    const code = typeof data?.error === "string" ? data.error : "";
    if (code === "gallery_limit_reached") throw new Error("يحتوي معرض المنتج على الحد الأقصى البالغ 8 صور.");
    throw new Error("تعذر رفع صورة المعرض وربطها بالمنتج؛ حدّث المنتج قبل إعادة المحاولة.");
  }
  const url = typeof data.public_url === "string" ? data.public_url : "";
  if (!/^https:\/\//i.test(url)) throw new Error("لم يرجع الخادم رابط صورة صالحًا للمعرض.");
  return url;
}

export async function removeProductGalleryImage(productId: string, imageUrl: string): Promise<void> {
  if (!isValidProductImageProductId(productId)) throw new Error("معرّف المنتج غير صالح؛ لم تُزل صورة المعرض.");
  const scope = await getCurrentTenantScope();
  if (!scope.isStaff) throw new Error("صلاحية إدارة المنتجات مطلوبة لإزالة صور المعرض.");
  const objectPath = extractOwnedProductImageObjectPath(imageUrl, scope.organizationId, productId);
  const { data, error } = await supabase.rpc("mutate_staff_product_gallery_image", {
    p_product_id: productId, p_image_url: imageUrl, p_action: "remove",
  });
  if (error) throw new Error("تعذر فصل صورة المعرض من المنتج؛ لم يُحذف أي ملف.");
  const saved = data && typeof data === "object" ? data as Record<string, unknown> : null;
  if (!saved || saved.id !== productId || saved.changed !== true) {
    throw new Error("لم يؤكد الخادم فصل صورة المعرض؛ حدّث بيانات المنتج.");
  }
  if (objectPath) {
    try {
      await deleteProductImageObject(productId, objectPath);
    } catch {
      throw new ProductImageCleanupError("فُصلت الصورة من معرض المنتج، لكن تعذر تنظيف ملفها من التخزين.", false);
    }
  }
}

export async function removeProductImage(
  productId: string,
  currentImageUrl?: string | null,
): Promise<void> {
  if (!isValidProductImageProductId(productId)) {
    throw new Error("معرّف المنتج غير صالح؛ لم تُزل الصورة.");
  }
  const scope = await getCurrentTenantScope();
  if (!scope.isStaff) throw new Error("صلاحية إدارة المنتجات مطلوبة لإزالة الصورة.");

  const objectPath = extractOwnedProductImageObjectPath(
    currentImageUrl,
    scope.organizationId,
    productId,
  );
  const { data, error } = await supabase.functions.invoke("product-image-upload", {
    body: {
      action: "unlink",
      product_id: productId,
      expected_image_url: currentImageUrl ?? null,
      object_path: objectPath ?? null,
    },
  });
  if (error || data?.unlinked !== true) {
    const code = typeof data?.error === "string" ? data.error : "";
    if (code === "image_link_changed") {
      throw new Error("تغيرت صورة المنتج منذ فتح النموذج؛ حدّث بيانات المنتج قبل إزالة الصورة.");
    }
    throw new Error("تعذر فصل الصورة من سجل المنتج؛ لم يُؤكد الخادم العملية.");
  }
  if (data.cleaned !== true) {
    throw new ProductImageCleanupError(
      "أُزيل رابط الصورة من سجل المنتج، لكن تعذر تنظيف ملفها من التخزين.",
      false,
    );
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// ─── Categories ───
export async function fetchCategories(): Promise<Category[]> {
  const { organizationId: orgId, isStaff } = await getStorefrontDataScope();
  const data = await retryRead(async () => {
    let query = supabase
      .from('categories')
      .select(isStaff ? '*' : 'id,name,code,parent_id,sort_order,is_active')
      .eq('organization_id', orgId);
    if (!isStaff) query = query.eq('is_active', true);
    const { data, error } = await query.order('sort_order');
    if (error) throw error;
    return data ?? [];
  });
  return data as unknown as Category[];
}

export async function createCategory(c: Partial<Category>): Promise<Category> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('categories')
    .insert({ ...c, organization_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

// ─── Customers ───
export async function fetchCustomers(): Promise<Customer[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const data = await readWithRetry(() => supabase
    .from('customers')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false }));
  return (data ?? []) as Customer[];
}

export async function createCustomer(c: NewCustomerInput): Promise<Customer> {
  const input = validateCustomerInput({
    business_name: c.business_name,
    contact_name: c.contact_name,
    phone: c.phone,
    tier: c.tier,
  });
  const scope = await getCurrentTenantScope();
  if (!scope.isStaff) throw new Error('صلاحية إدارة العملاء مطلوبة.');
  // Never spread browser-provided customer fields into the table (balance, status, limits, etc.).
  const customerCode = 'CUST-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  const { data, error } = await supabase
    .from('customers')
    .insert({
      organization_id: scope.organizationId,
      business_name: input.business_name,
      contact_name: input.contact_name,
      phone: input.phone,
      tier: input.tier,
      customer_code: customerCode,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type CustomerStatusChangeResult = {
  customer_id: string;
  previous_status: string;
  status: string;
  changed: boolean;
};

const CUSTOMER_LIFECYCLE_STATUSES = ['pending', 'approved', 'rejected', 'frozen', 'blocked', 'archived'] as const;
const CUSTOMER_LIFECYCLE_COMMANDS = ['approved', 'rejected', 'frozen', 'blocked', 'archived', 'restore'] as const;

export async function updateCustomerStatus(
  id: string,
  expectedStatus: string,
  nextStatus: string,
  reason: string,
): Promise<CustomerStatusChangeResult> {
  const customerId = typeof id === 'string' ? id.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)) {
    throw new Error('معرّف العميل غير صالح.');
  }
  const normalizedExpected = typeof expectedStatus === 'string' ? expectedStatus.trim().toLowerCase() : '';
  const normalizedNext = typeof nextStatus === 'string' ? nextStatus.trim().toLowerCase() : '';
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!CUSTOMER_LIFECYCLE_STATUSES.includes(normalizedExpected as typeof CUSTOMER_LIFECYCLE_STATUSES[number])
    || !CUSTOMER_LIFECYCLE_COMMANDS.includes(normalizedNext as typeof CUSTOMER_LIFECYCLE_COMMANDS[number])) {
    throw new Error('انتقال حالة العميل غير صالح.');
  }
  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    throw new Error('سبب تغيير الحالة مطلوب (3 إلى 500 حرف).');
  }

  const { data, error } = await supabase.rpc('set_admin_customer_status', {
    p_customer_id: customerId,
    p_expected_status: normalizedExpected,
    p_status: normalizedNext,
    p_reason: normalizedReason,
  });
  if (error) throw error;

  if (!data || typeof data !== 'object' || Array.isArray(data)
    || data.customer_id !== customerId
    || data.previous_status !== normalizedExpected
    || typeof data.status !== 'string'
    || !CUSTOMER_LIFECYCLE_STATUSES.includes(data.status as typeof CUSTOMER_LIFECYCLE_STATUSES[number])
    || typeof data.changed !== 'boolean'
    || (normalizedNext !== 'restore' && data.status !== normalizedNext)
    || (normalizedNext === 'restore' && data.status === 'archived')) {
    throw new Error('لم يؤكد الخادم تحديث حالة العميل.');
  }
  return data as CustomerStatusChangeResult;
}


export type CustomerTierChangeResult = {
  customer_id: string;
  previous_tier: string;
  tier: 'retail' | 'wholesale' | 'vip';
  changed: boolean;
};

export async function updateCustomerTier(
  id: string,
  expectedTier: string,
  nextTier: string,
  reason: string,
): Promise<CustomerTierChangeResult> {
  const allowedTiers = ['retail', 'wholesale', 'vip'] as const;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('معرّف العميل غير صالح.');
  }
  const normalizedExpected = typeof expectedTier === 'string' ? expectedTier.trim().toLowerCase() : '';
  const normalizedTier = typeof nextTier === 'string' ? nextTier.trim().toLowerCase() : '';
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!normalizedExpected || normalizedExpected.length > 32 || !allowedTiers.includes(normalizedTier as typeof allowedTiers[number])) {
    throw new Error('شريحة العميل غير صالحة.');
  }
  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    throw new Error('سبب تغيير الشريحة مطلوب (3 إلى 500 حرف).');
  }
  const { data, error } = await supabase.rpc('set_admin_customer_tier', {
    p_customer_id: id, p_expected_tier: normalizedExpected, p_tier: normalizedTier, p_reason: normalizedReason,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || data.customer_id !== id || data.tier !== normalizedTier
    || typeof data.previous_tier !== 'string' || typeof data.changed !== 'boolean') {
    throw new Error('لم يؤكد الخادم تحديث شريحة العميل.');
  }
  return data as CustomerTierChangeResult;
}

// ─── Suppliers ───
export async function fetchSuppliers(): Promise<Supplier[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const data = await readWithRetry(() => supabase
    .from('suppliers')
    .select('*')
    .eq('organization_id', orgId)
    .order('name'));
  return (data ?? []) as Supplier[];
}

export async function createSupplier(s: Partial<Supplier>): Promise<Supplier> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('suppliers')
    .insert({ ...s, organization_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Orders ───
export async function fetchOrders(): Promise<OrderWithCustomer[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  // The staff-only SECURITY DEFINER RPC derives the tenant from the signed-in profile.
  // The client can no longer SELECT financial order columns directly.
  const orders = await readWithRetry(() => supabase.rpc('fetch_staff_orders'));
  const customers = await readWithRetry(() => supabase
    .from('customers')
    .select('*')
    .eq('organization_id', orgId));
  const custMap = new Map<string, Customer>();
  customers?.forEach((c: Customer) => custMap.set(c.id, c));

  return ((orders ?? []) as Order[]).map((o) => ({
    ...o,
    customer: custMap.get(o.customer_id),
  }));
}

export async function fetchOrderItems(orderId: string): Promise<OrderItem[]> {
  // Financial item columns are intentionally not selectable by authenticated users.
  // The RPC checks staff status, active profile and tenant ownership before returning the full row.
  const data = await readWithRetry(() => supabase.rpc('fetch_staff_order_items', {
    p_order_id: orderId,
  }));
  return (data ?? []) as OrderItem[];
}

export type OrderReviewLineInput = {
  item_id: string;
  quantity: number;
  unit_price: number;
  price_reason?: string | null;
};

export async function reviewOrderLines(
  orderId: string,
  lines: OrderReviewLineInput[],
  action: 'stage' | 'approve' | 'discard',
  customerNote?: string,
): Promise<{
  order_id: string; action?: string; status?: string; total_amount?: number;
  total_items?: number; quantity_review_required: boolean; adjusted?: boolean;
  changed_lines?: number; payment_request_status?: string;
}> {
  const { data, error } = await supabase.rpc('review_order_lines', {
    p_order_id: orderId,
    p_lines: lines,
    p_action: action,
    p_customer_note: customerNote?.trim() || null,
  });
  if (error) throw error;
  return data as {
    order_id: string; action?: string; status?: string; total_amount?: number;
    total_items?: number; quantity_review_required: boolean; adjusted?: boolean;
    changed_lines?: number; payment_request_status?: string;
  };
}

const ORDER_STATUS_VALUES = new Set([
  'draft', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled',
]);

export async function updateOrderStatus(id: string, status: string): Promise<void> {
  // Reject unknown values locally; the database trigger remains authoritative for legal transitions.
  if (!ORDER_STATUS_VALUES.has(status)) throw new Error('حالة الطلب غير مدعومة.');

  // PostgREST can return no row without an error when no row is visible to this tenant/RLS scope.
  // Ask only for the granted id column and never report success without the exact row acknowledgement.
  const { data: updated, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!updated?.id || updated.id !== id) {
    throw new Error('لم يؤكد الخادم تحديث حالة الطلب؛ قد يكون الطلب غير موجود في المؤسسة الحالية أو أن الانتقال غير مسموح.');
  }
}

export async function createOrder(order: {
  customer_id: string;
  items: {
    product_id: string;
    quantity: number;
    // Backward-compatible descriptor fields are accepted but deliberately ignored by the server.
    item_code?: string;
    product_name?: string;
    unit?: string;
    unit_price?: number;
  }[];
  notes?: string;
  // Generate once per user intent and reuse across retries; never silently mint a new key on retry.
  idempotency_key: string;
  payment_terms?: 'cash_on_delivery' | 'credit';
}): Promise<Order> {
  if (!order.items.length) throw new Error('يجب إضافة صنف واحد على الأقل إلى الطلب.');
  const idempotencyKey = order.idempotency_key;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    throw new Error('مفتاح منع التكرار مطلوب (16–128 حرفاً) ويجب إعادة استخدامه عند إعادة المحاولة.');
  }
  const { data, error } = await supabase.rpc('create_staff_order', {
    p_customer_id: order.customer_id,
    p_items: order.items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
    })),
    p_notes: order.notes ?? null,
    p_idempotency_key: idempotencyKey,
    p_payment_terms: order.payment_terms ?? 'cash_on_delivery',
  });
  if (error) throw error;
  return data as Order;
}

// ─── Pricing rules ───
export async function fetchPricingRules(): Promise<PricingRule[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const data = await readWithRetry(() => supabase
    .from('pricing_rules')
    .select('*')
    .eq('organization_id', orgId)
    .order('priority'));
  return (data ?? []) as PricingRule[];
}

const SUPPORTED_PRICING_SCOPES = new Set(['default', 'all', 'product', 'category']);

type PricingRuleDatabaseFields = {
  name: string;
  scope_type: CreatePricingRuleInput['scope_type'];
  scope_value: string | null;
  base_type: CreatePricingRuleInput['base_source'];
  base_source: CreatePricingRuleInput['base_source'];
  adjustment_type: string;
  calculation_method: CreatePricingRuleInput['calculation_method'];
  adjustment_value: number;
  target_tier: CreatePricingRuleInput['target_tier'];
  min_quantity: number;
  min_price: number | null;
  max_price: number | null;
  priority: number;
  effective_from: string | null;
  effective_until: string | null;
};

function buildPricingRuleDatabaseFields(input: CreatePricingRuleInput): PricingRuleDatabaseFields {
  if (!input.name.trim() || input.name.trim().length > 120) throw new Error('اسم القاعدة مطلوب ولا يتجاوز 120 حرفًا.');
  if (!SUPPORTED_PRICING_SCOPES.has(input.scope_type)) throw new Error('نطاق القاعدة غير مدعوم في محرك التسعير.');
  if ((input.scope_type === 'product' || input.scope_type === 'category') && !input.scope_value) {
    throw new Error('حدد المنتج أو التصنيف الذي ستطبّق عليه القاعدة.');
  }
  if (!Number.isFinite(input.adjustment_value) || !Number.isFinite(input.min_quantity) || input.min_quantity <= 0 || input.min_quantity > 10000) {
    throw new Error('قيمة التسعير أو حد الكمية غير صالح.');
  }
  if (input.calculation_method === 'margin_percentage' && (input.adjustment_value < 0 || input.adjustment_value >= 100)) {
    throw new Error('هامش الربح يجب أن يكون من 0% إلى أقل من 100%.');
  }
  if (input.calculation_method === 'fixed_price' && input.adjustment_value < 0) {
    throw new Error('السعر الثابت لا يمكن أن يكون سالبًا.');
  }
  if ((input.min_price != null && (!Number.isFinite(input.min_price) || input.min_price < 0)) ||
      (input.max_price != null && (!Number.isFinite(input.max_price) || input.max_price < 0)) ||
      (input.min_price != null && input.max_price != null && input.min_price > input.max_price)) {
    throw new Error('تحقق من الحد الأدنى والأقصى للسعر.');
  }
  if (!Number.isInteger(input.priority) || input.priority < 1 || input.priority > 100000) {
    throw new Error('الأولوية يجب أن تكون عددًا صحيحًا بين 1 و100000.');
  }
  if (input.effective_from && input.effective_until && new Date(input.effective_from) > new Date(input.effective_until)) {
    throw new Error('تاريخ بدء القاعدة يجب أن يسبق تاريخ انتهائها.');
  }
  if ((input.effective_from && !Number.isFinite(new Date(input.effective_from).getTime())) ||
      (input.effective_until && !Number.isFinite(new Date(input.effective_until).getTime()))) {
    throw new Error('وقت بدء القاعدة أو انتهائها غير صالح.');
  }

  const legacyAdjustmentType: Record<CreatePricingRuleInput['calculation_method'], string> = {
    add_percentage: 'percentage',
    margin_percentage: 'margin',
    fixed_price: 'fixed',
    add_subtract_amount: 'amount',
  };
  return {
    name: input.name.trim(),
    scope_type: input.scope_type,
    scope_value: input.scope_value,
    base_type: input.base_source,
    base_source: input.base_source,
    adjustment_type: legacyAdjustmentType[input.calculation_method],
    calculation_method: input.calculation_method,
    adjustment_value: input.adjustment_value,
    target_tier: input.target_tier,
    min_quantity: input.min_quantity,
    min_price: input.min_price,
    max_price: input.max_price,
    priority: input.priority,
    effective_from: input.effective_from,
    effective_until: input.effective_until,
  };
}

export async function createPricingRule(input: CreatePricingRuleInput): Promise<void> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const fields = buildPricingRuleDatabaseFields(input);
  const { error } = await supabase.from('pricing_rules').insert({
    organization_id: orgId,
    ...fields,
  });
  if (error) throw new Error('تعذر إنشاء قاعدة التسعير: ' + error.message);
}

export async function updatePricingRule(id: string, input: CreatePricingRuleInput): Promise<void> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const fields = buildPricingRuleDatabaseFields(input);
  const { data: current, error: readError } = await supabase
    .from('pricing_rules')
    .select('id,manually_locked,requires_approval,approved_at')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new Error('قاعدة التسعير غير موجودة ضمن المؤسسة الحالية.');
  if (current.manually_locked) throw new Error('هذه القاعدة مقفلة يدويًا ولا يمكن تعديلها.');
  if (current.requires_approval) {
    throw new Error('هذه القاعدة خاضعة للموافقة؛ لا يمكن تعديلها من دون مسار اعتماد معتمد.');
  }

  const { data, error } = await supabase
    .from('pricing_rules')
    .update(fields)
    .eq('organization_id', orgId)
    .eq('id', id)
    .eq('manually_locked', false)
    .eq('requires_approval', false)
    .select('id')
    .maybeSingle();
  if (error) throw new Error('تعذر تحديث قاعدة التسعير: ' + error.message);
  if (!data) throw new Error('لم تُحدّث القاعدة؛ قد تكون مقفلة أو أصبحت خاضعة للموافقة.');
}

export async function togglePricingRule(id: string, isActive: boolean): Promise<{ requires_approval: boolean; approved_at: string | null; is_active: boolean }> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data: rule, error: readError } = await supabase
    .from('pricing_rules')
    .select('id,scope_type,manually_locked')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  if (!rule) throw new Error('قاعدة التسعير غير موجودة ضمن المؤسسة الحالية.');
  if (rule.manually_locked) throw new Error('هذه القاعدة مقفلة يدويًا ولا يمكن تعديل حالتها.');
  if (isActive && !SUPPORTED_PRICING_SCOPES.has(rule.scope_type)) {
    throw new Error('لا يمكن تفعيل هذه القاعدة القديمة؛ نطاقها غير مدعوم في محرك التسعير الحالي. أوقفها أو أنشئ قاعدة جديدة.');
  }
  const { data, error } = await supabase
    .from('pricing_rules')
    .update({ is_active: isActive })
    .eq('organization_id', orgId)
    .eq('id', id)
    .eq('manually_locked', false)
    .select('id,requires_approval,approved_at,is_active')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('لم تتغير القاعدة؛ قد تكون مقفلة أو لم تعد موجودة.');
  return data;
}

export async function deletePricingRule(id: string): Promise<void> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('pricing_rules')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
    .eq('manually_locked', false)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('تعذر حذف القاعدة؛ تأكد أنها غير مقفلة وأنها تتبع المؤسسة الحالية.');
}

export type CustomerTierPricePreview = {
  customer_id: string; customer_name: string; product_id: string; product_name: string;
  item_code: string; tier: string; quantity: number; unit_price: number; line_total: number; currency: string;
};

export async function previewCustomerTierPrice(input: { customer_id: string; product_id: string; quantity: number }): Promise<CustomerTierPricePreview> {
  if (!input.customer_id || !input.product_id || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 10000) {
    throw new Error('اختر العميل والصنف وأدخل كمية صحيحة بين 1 و10000.');
  }
  const { data, error } = await supabase.rpc('preview_customer_tier_price', {
    p_customer_id: input.customer_id, p_product_id: input.product_id, p_quantity: input.quantity,
  });
  if (error) throw new Error('تعذر معاينة سعر العميل: ' + error.message);
  return data as CustomerTierPricePreview;
}

export async function approvePricingRule(id: string, approvalNote: string): Promise<void> {
  const note = approvalNote.trim();
  if (!id || note.length < 3 || note.length > 1000) throw new Error('سبب الاعتماد مطلوب ولا يتجاوز 1000 حرف.');
  const { error } = await supabase.rpc('approve_pricing_rule', { p_rule_id: id, p_approval_note: note });
  if (error) throw new Error('تعذر اعتماد قاعدة التسعير: ' + error.message);
}

// ─── Promotions ───
// Customer/storefront reads expose only currently published campaigns. The admin view
// uses a separate SECURITY DEFINER RPC; browser table DML is deliberately revoked.
export async function fetchStorefrontPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase.rpc('get_storefront_promotions');
  if (error) throw new Error('تعذر تحميل الحملات المنشورة: ' + error.message);
  return (data ?? []) as unknown as Promotion[];
}

export async function fetchPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase.rpc('get_admin_promotions');
  if (error) throw new Error('تعذر تحميل حملات الإدارة: ' + error.message);
  return (data ?? []) as unknown as Promotion[];
}

export async function savePromotion(input: PromotionInput): Promise<string> {
  const title = input.title.trim();
  const description = input.description?.trim() || null;
  if (!title || title.length > 120) throw new Error('اسم الحملة مطلوب وبحد أقصى 120 حرفًا.');
  if (description && description.length > 600) throw new Error('وصف الحملة لا يتجاوز 600 حرف.');
  if (input.discount_type !== 'percentage' && input.discount_type !== 'fixed') throw new Error('نوع الخصم غير صالح.');
  if (!Number.isFinite(input.discount_value) || input.discount_value <= 0 ||
      input.discount_value > 99999999.99 || Math.round(input.discount_value * 100) !== input.discount_value * 100 ||
      (input.discount_type === 'percentage' && input.discount_value > 100)) {
    throw new Error('قيمة الحملة يجب أن تكون موجبة حتى منزلتين عشريتين؛ والنسبة لا تتجاوز 100%.');
  }
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + 'T00:00:00.000Z')) &&
    new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
  if (!validDate(input.start_date) || !validDate(input.end_date) || input.end_date < input.start_date) {
    throw new Error('تحقق من تاريخ البداية والنهاية؛ يجب ألا تنتهي الحملة قبل بدايتها.');
  }
  if (input.product_ids.length > 500 || input.category_ids.length > 500) throw new Error('اختر 500 صنف أو تصنيف كحد أقصى للحملة.');
  const { data, error } = await supabase.rpc('save_promotion', {
    p_promotion_id: input.id,
    p_title: title,
    p_description: description,
    p_discount_type: input.discount_type,
    p_discount_value: input.discount_value,
    p_product_ids: input.product_ids,
    p_category_ids: input.category_ids,
    p_start_date: input.start_date,
    p_end_date: input.end_date,
    p_is_active: input.is_active,
  });
  if (error) throw new Error('تعذر حفظ الحملة: ' + error.message);
  if (!data) throw new Error('لم يُرجع الخادم معرّف الحملة المحفوظة.');
  return data;
}

export async function togglePromotion(id: string, isActive: boolean): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('معرّف الحملة غير صالح.');
  }
  const { error } = await supabase.rpc('set_promotion_active', {
    p_promotion_id: id,
    p_is_active: isActive,
  });
  if (error) throw new Error('تعذر تغيير حالة الحملة: ' + error.message);
}

// ─── Budgeted AI Gateway ───
export type AiGatewayBudget = {
  organization_id: string;
  configured: boolean;
  ai_enabled: boolean;
  fallback_enabled: boolean;
  primary_provider: 'openai_compatible' | 'gemini';
  primary_model: string;
  primary_base_url: string;
  fallback_provider: 'openai_compatible' | 'gemini';
  fallback_model: string;
  fallback_base_url: string;
  daily_cost_limit: number;
  monthly_cost_limit: number;
  daily_token_limit: number;
  monthly_token_limit: number;
  per_request_cost_limit: number;
  today_cost: number;
  month_cost: number;
  today_tokens: number;
  month_tokens: number;
  reserved_cost: number;
  keys_stored_in_database: false;
};

export async function fetchAiGatewayBudget(): Promise<AiGatewayBudget> {
  const { data, error } = await supabase.rpc('get_ai_gateway_budget');
  if (error || !data || typeof data !== 'object') {
    throw new Error('تعذر تحميل إعدادات الذكاء. يلزم حساب مدير أو مدير فرع.');
  }
  return data as AiGatewayBudget;
}

export async function configureAiGatewayBudget(settings: {
  ai_enabled: boolean;
  fallback_enabled: boolean;
  primary_provider: 'openai_compatible' | 'gemini';
  primary_model: string;
  primary_base_url: string;
  fallback_provider: 'openai_compatible' | 'gemini';
  fallback_model: string;
  fallback_base_url: string;
  daily_cost_limit: number;
  monthly_cost_limit: number;
  daily_token_limit: number;
  monthly_token_limit: number;
  per_request_cost_limit: number;
}): Promise<AiGatewayBudget> {
  const { data, error } = await supabase.rpc('configure_ai_usage_budget', { p_settings: settings });
  if (error || !data || typeof data !== 'object') {
    throw new Error('تعذر حفظ إعدادات الذكاء. تحقق من حدود الميزانية والمزود وصلاحية حسابك.');
  }
  return data as AiGatewayBudget;
}

export async function testAiGatewayConnection(): Promise<{ status: string; provider?: string; model?: string; fallback_used?: boolean }> {
  const { data, error } = await supabase.functions.invoke('ai-gateway', { body: { action: 'test_connection' } });
  if (error || !data || typeof data !== 'object' || (data as Record<string, unknown>).status !== 'connection_ok') {
    throw new Error('فشل اختبار الاتصال. تحقق من تفعيل الذكاء والميزانية وأسرار المزود في بيئة Edge Function.');
  }
  return data as { status: string; provider?: string; model?: string; fallback_used?: boolean };
}

// ─── AI Alerts ───
export async function fetchAiAlerts(): Promise<AiAlert[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const data = await readWithRetry(() => supabase
    .from('ai_alerts')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20));
  return (data ?? []) as AiAlert[];
}

export async function resolveAiAlert(id: string): Promise<void> {
  const { error } = await supabase.from('ai_alerts').update({ is_resolved: true }).eq('id', id);
  if (error) throw error;
}

// ─── AI Tasks ───
export async function fetchAiTasks(): Promise<AiTask[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const data = await readWithRetry(() => supabase
    .from('ai_tasks')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false }));
  return (data ?? []) as AiTask[];
}

export async function toggleAiTaskStatus(id: string, status: string): Promise<void> {
  if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
    throw new Error('حالة المهمة غير صالحة.');
  }
  await setOperationalTaskStatus(id, status as OperationalTaskStatus);
}


// ─── Operational Task Center ───
export async function fetchOperationalTasks(): Promise<OperationalTask[]> {
  const { organizationId } = await getCurrentTenantScope();
  const data = await readWithRetry(() => supabase.from('ai_tasks').select('*')
    .eq('organization_id', organizationId).order('created_at', { ascending: false }));
  return (data ?? []) as OperationalTask[];
}


export async function fetchOperationalTaskAssignees(): Promise<OperationalTaskAssignee[]> {
  const { data, error } = await supabase.rpc('list_operational_task_assignees');
  if (error) throw new Error(error.message || 'تعذر تحميل قائمة الموظفين المسموح إسناد المهام إليهم.');
  if (!Array.isArray(data)) throw new Error('أعاد الخادم قائمة إسناد غير صالحة.');
  return data.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('يوجد سجل موظف غير صالح في نتيجة الإسناد.');
    }
    const row = value as Record<string, unknown>;
    if (typeof row.profile_id !== 'string' || typeof row.full_name !== 'string' ||
        !(typeof row.email === 'string' || row.email === null) ||
        !Array.isArray(row.roles) || !row.roles.every((role) => typeof role === 'string')) {
      throw new Error('بيانات الموظف غير مكتملة؛ لم تُستخدم قائمة إسناد غير موثوقة.');
    }
    return {
      profile_id: row.profile_id,
      full_name: row.full_name,
      email: row.email,
      roles: row.roles as string[],
    };
  });
}

export async function updateOperationalTasksDetails(
  taskIds: string[],
  priority: 'low' | 'medium' | 'high' | 'critical',
  dueAt: string,
): Promise<{ processed_count: number; changed_count: number }> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (taskIds.length < 1 || taskIds.length > 100 || taskIds.some((id) => !uuidPattern.test(id)) ||
      new Set(taskIds).size !== taskIds.length) {
    throw new Error('اختر من مهمة واحدة إلى 100 مهمة دون تكرار.');
  }
  if (!['low','medium','high','critical'].includes(priority)) {
    throw new Error('أولوية المهمة غير صالحة.');
  }
  if (!Number.isFinite(Date.parse(dueAt))) {
    throw new Error('موعد الاستحقاق غير صالح.');
  }
  const { data, error } = await supabase.rpc('update_operational_tasks_details', {
    p_task_ids: taskIds,
    p_priority: priority,
    p_due_at: dueAt,
  });
  if (error) throw new Error(error.message || 'تعذر تحديث أولوية ومواعيد المهام المحددة.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('أعاد الخادم نتيجة تحديث جماعي غير صالحة.');
  }
  const result = data as Record<string, unknown>;
  if (typeof result.processed_count !== 'number' || typeof result.changed_count !== 'number' ||
      result.processed_count !== taskIds.length || result.changed_count < 0 ||
      result.changed_count > result.processed_count) {
    throw new Error('نتيجة تحديث المهام المحددة غير مكتملة.');
  }
  return { processed_count: result.processed_count, changed_count: result.changed_count };
}

export async function assignOperationalTasks(taskIds: string[], assignedTo: string | null): Promise<{
  processed_count: number;
  changed_count: number;
}> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (taskIds.length < 1 || taskIds.length > 100 || taskIds.some((id) => !uuidPattern.test(id)) ||
      new Set(taskIds).size !== taskIds.length) {
    throw new Error('اختر من مهمة واحدة إلى 100 مهمة دون تكرار.');
  }
  if (assignedTo !== null && !uuidPattern.test(assignedTo)) {
    throw new Error('معرّف الموظف غير صالح.');
  }
  const { data, error } = await supabase.rpc('assign_operational_tasks', {
    p_task_ids: taskIds,
    p_assigned_to: assignedTo,
  });
  if (error) throw new Error(error.message || 'تعذر تنفيذ إعادة الإسناد الجماعي.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('أعاد الخادم نتيجة إسناد جماعي غير صالحة.');
  }
  const result = data as Record<string, unknown>;
  if (typeof result.processed_count !== 'number' || typeof result.changed_count !== 'number' ||
      result.processed_count !== taskIds.length || result.changed_count < 0 ||
      result.changed_count > result.processed_count) {
    throw new Error('نتيجة الإسناد الجماعي غير مكتملة.');
  }
  return { processed_count: result.processed_count, changed_count: result.changed_count };
}

export async function assignOperationalTask(taskId: string, assignedTo: string | null): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
    throw new Error('معرّف المهمة غير صالح.');
  }
  if (assignedTo !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assignedTo)) {
    throw new Error('معرّف الموظف غير صالح.');
  }
  const { error } = await supabase.rpc('assign_operational_task', {
    p_task_id: taskId,
    p_assigned_to: assignedTo,
  });
  if (error) throw new Error(error.message || 'تعذر إعادة إسناد المهمة.');
}

export async function updateOperationalTaskDetails(
  taskId: string,
  priority: 'low' | 'medium' | 'high' | 'critical',
  dueAt: string | null,
): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
    throw new Error('معرّف المهمة غير صالح.');
  }
  if (!['low','medium','high','critical'].includes(priority)) {
    throw new Error('أولوية المهمة غير صالحة.');
  }
  if (dueAt !== null && !Number.isFinite(Date.parse(dueAt))) {
    throw new Error('موعد استحقاق المهمة غير صالح.');
  }
  const { error } = await supabase.rpc('update_operational_task_details', {
    p_task_id: taskId,
    p_priority: priority,
    p_due_at: dueAt,
  });
  if (error) throw new Error(error.message || 'تعذر تحديث أولوية المهمة وموعدها.');
}

export async function updateManualOperationalTask(
  taskId: string,
  title: string,
  description: string,
): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
    throw new Error('معرّف المهمة غير صالح.');
  }
  const normalizedTitle = title.trim();
  const normalizedDescription = description.trim();
  if (!normalizedTitle || normalizedTitle.length > 240 || normalizedDescription.length > 2000) {
    throw new Error('عنوان المهمة أو تفاصيلها تتجاوز الحدود المسموح بها.');
  }
  const { error } = await supabase.rpc('update_manual_operational_task', {
    p_task_id: taskId,
    p_title: normalizedTitle,
    p_description: normalizedDescription || null,
  });
  if (error) throw new Error(error.message || 'تعذر تحديث نص المهمة اليدوية.');
}

export async function cancelOperationalTask(taskId: string, reason: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
    throw new Error('معرّف المهمة غير صالح.');
  }
  const normalizedReason = reason.trim();
  if (!normalizedReason || normalizedReason.length > 1000) {
    throw new Error('اكتب سبب إلغاء للمهمة بين حرف واحد و1000 حرف.');
  }
  const { error } = await supabase.rpc('cancel_operational_task', {
    p_task_id: taskId,
    p_reason: normalizedReason,
  });
  if (error) throw new Error(error.message || 'تعذر إلغاء المهمة.');
}

export async function createOperationalTask(input: {
  title: string; description?: string; taskRole: OperationalTaskRole;
  priority: 'low' | 'medium' | 'high' | 'critical'; dueAt?: string | null; assignedTo?: string | null;
}): Promise<string> {
  if (!input.title.trim() || input.title.trim().length > 240) {
    throw new Error('اكتب عنوانًا للمهمة بين حرف واحد و240 حرفًا.');
  }
  const { data, error } = await supabase.rpc('create_operational_task', {
    p_title: input.title.trim(), p_description: input.description?.trim() || null,
    p_task_role: input.taskRole, p_priority: input.priority, p_due_at: input.dueAt || null, p_assigned_to: input.assignedTo || null,
  });
  if (error) throw new Error(error.message || 'تعذر إنشاء المهمة.');
  if (typeof data !== 'string') throw new Error('لم يرجع الخادم معرّف المهمة.');
  return data;
}

export async function setOperationalTaskStatus(
  taskId: string, status: OperationalTaskStatus, resolutionNote?: string,
): Promise<void> {
  const { error } = await supabase.rpc('update_operational_task_status', {
    p_task_id: taskId, p_status: status, p_resolution_note: resolutionNote?.trim() || null,
  });
  if (error) throw new Error(error.message || 'تعذر تحديث حالة المهمة.');
}

export async function refreshOperationalTasks(): Promise<{
  organization_id: string; source_records_refreshed: number; refreshed_at: string;
}> {
  const { data, error } = await supabase.rpc('refresh_operational_tasks');
  if (error) throw new Error(error.message || 'تعذر مزامنة المهام مع سجلات التشغيل.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('أعاد الخادم نتيجة مزامنة غير صالحة.');
  const result = data as Record<string, unknown>;
  if (typeof result.organization_id !== 'string' || typeof result.source_records_refreshed !== 'number' || typeof result.refreshed_at !== 'string') {
    throw new Error('نتيجة مزامنة المهام غير مكتملة.');
  }
  return {
    organization_id: result.organization_id,
    source_records_refreshed: result.source_records_refreshed,
    refreshed_at: result.refreshed_at,
  };
}

// ─── Notifications ───
const NOTIFICATION_PAGE_SIZE = 30;
const NOTIFICATION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function fetchNotifications(): Promise<Notification[]> {
  const { profileId, organizationId } = await getCurrentTenantScope();
  const data = await readWithRetry(() => supabase
    .from('notifications')
    .select('id,organization_id,profile_id,title,body,type,is_read,created_at,entity_type,entity_id')
    .eq('organization_id', organizationId)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE));
  return (data ?? []) as Notification[];
}

/**
 * Reads the next older cursor page for the current profile only.
 * The timestamp+UUID tuple is a stable keyset cursor; newly inserted notifications
 * do not shift older pages or cause offset-pagination duplicates/skips.
 */
export async function fetchOlderNotifications(cursor: { createdAt: string; id: string }): Promise<Notification[]> {
  if (!cursor || typeof cursor.createdAt !== 'string' || !Number.isFinite(Date.parse(cursor.createdAt)) ||
      !NOTIFICATION_UUID.test(cursor.id)) {
    throw new Error('مؤشر صفحة التنبيهات الأقدم غير صالح.');
  }
  const createdAt = new Date(cursor.createdAt).toISOString();
  const { profileId, organizationId } = await getCurrentTenantScope();
  const data = await readWithRetry(() => supabase
    .from('notifications')
    .select('id,organization_id,profile_id,title,body,type,is_read,created_at,entity_type,entity_id')
    .eq('organization_id', organizationId)
    .eq('profile_id', profileId)
    .or('created_at.lt.' + createdAt + ',and(created_at.eq.' + createdAt + ',id.lt.' + cursor.id + ')')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE));
  return (data ?? []) as Notification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('معرّف التنبيه غير صالح.');
  }
  const { profileId, organizationId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('profile_id', profileId)
    .eq('is_read', false)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const { data: existing, error: readError } = await supabase
      .from('notifications')
      .select('id,is_read')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .eq('profile_id', profileId)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) throw new Error('التنبيه غير موجود ضمن حسابك الحالي.');
    if (existing.is_read !== true) throw new Error('لم يؤكد الخادم تحديث حالة التنبيه.');
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const { profileId, organizationId } = await getCurrentTenantScope();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('organization_id', organizationId)
    .eq('profile_id', profileId)
    .eq('is_read', false);
  if (error) throw error;
}

// ─── Admin Settings ───
export async function fetchSettings(): Promise<AdminSetting[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const data = await readWithRetry(() => supabase
    .from('admin_settings')
    .select('*')
    .eq('organization_id', orgId));
  return (data ?? []) as AdminSetting[];
}

export async function updateSetting(key: string, value: unknown, category: string): Promise<void> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { error } = await supabase
    .from('admin_settings')
    .upsert(
      { organization_id: orgId, key, value, category, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id,key' }
    );
  if (error) throw error;
}

export async function fetchSettingsMap(): Promise<Record<string, unknown>> {
  // Storefront must never read the full private admin-settings table.
  const { data, error } = await supabase.rpc('get_public_storefront_settings');
  if (error) throw new Error('تعذر تحميل إعدادات العرض العام: ' + error.message);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('أعاد الخادم إعدادات عرض عام غير صالحة.');
  }
  return data as Record<string, unknown>;
}


// ─── Server-authorized storefront announcements ───
function parseStorefrontAnnouncementRows(data: unknown, management: boolean): StorefrontAnnouncement[] {
  if (!Array.isArray(data)) throw new Error('أعاد الخادم قائمة إعلانات غير صالحة.');
  return data.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('أعاد الخادم سجل إعلان غير صالح.');
    const row = value as Record<string, unknown>;
    const audience = row.audience, content = row.content, href = row.href;
    const timestamp = (value: unknown): string | null => {
      if (value == null) return null;
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error('تاريخ إعلان غير صالح.');
      return value;
    };
    const safeHref = (value: string) => (value.startsWith('/') && !value.startsWith('//')) || /^https:\/\/[^\s]+$/i.test(value);
    if (typeof row.id !== 'string' || !row.id ||
      typeof row.title !== 'string' || !row.title.trim() || row.title.length > 120 ||
      !(content == null || typeof content === 'string') ||
      !(href == null || typeof href === 'string') ||
      (typeof href === 'string' && (!safeHref(href) || href.length > 500)) ||
      typeof row.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(row.color) ||
      typeof row.priority !== 'number' || !Number.isInteger(row.priority) ||
      !['all', 'customers', 'staff'].includes(String(audience)) ||
      (management && typeof row.is_active !== 'boolean')) {
      throw new Error('أعاد الخادم بيانات إعلان لا تطابق العقد؛ تم إيقاف العملية.');
    }
    return {
      id: row.id, title: row.title, content: content as string | null, href: (href ?? null) as string | null,
      color: row.color, priority: row.priority, starts_at: timestamp(row.starts_at), ends_at: timestamp(row.ends_at),
      audience: audience as StorefrontAnnouncement['audience'],
      is_active: management ? row.is_active as boolean : true,
      created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
    };
  });
}

export async function fetchStorefrontAnnouncements(): Promise<StorefrontAnnouncement[]> {
  const { data, error } = await supabase.rpc('get_storefront_announcements');
  if (error) throw new Error('تعذر تحميل إعلانات المتجر: ' + error.message);
  return parseStorefrontAnnouncementRows(data, false);
}
export async function fetchAdminStorefrontAnnouncements(): Promise<StorefrontAnnouncement[]> {
  const { data, error } = await supabase.rpc('get_admin_storefront_announcements');
  if (error) throw new Error('تعذر تحميل إعلانات الإدارة: ' + error.message);
  return parseStorefrontAnnouncementRows(data, true);
}
export async function saveStorefrontAnnouncement(input: StorefrontAnnouncementInput): Promise<string> {
  const result = await supabase.rpc('save_storefront_announcement', {
    p_announcement_id: input.id, p_title: input.title, p_content: input.content, p_href: input.href,
    p_color: input.color, p_priority: input.priority, p_is_active: input.is_active,
    p_starts_at: input.starts_at, p_ends_at: input.ends_at, p_audience: input.audience,
  });
  if (result.error) throw new Error('تعذر حفظ إعلان المتجر: ' + result.error.message);
  if (typeof result.data !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.data)) {
    throw new Error('لم يُعِد الخادم معرّف إعلان صالحًا.');
  }
  return result.data;
}


// ─── Server-resolved, role-authorized price grid read model ───
export interface ProductPriceGridRow {
  id: string; name: string; item_code: string; unit: string; is_active: boolean;
  base_price: number; price_wholesale_of_wholesale: number; price_wholesale: number; price_retail: number;
  quantity_on_hand_total: number | null; quantity_reserved_total: number | null;
  quantity_available_total: number | null; reorder_point_total: number | null;
  inventory_warehouse_count: number;
}
export async function fetchAdminProductPriceGrid(): Promise<ProductPriceGridRow[]> {
  const { data, error } = await supabase.rpc('get_admin_product_price_grid_with_inventory');
  if (error) throw new Error('تعذر تحميل شبكة الأسعار والمخزون: ' + error.message);
  if (!Array.isArray(data)) throw new Error('أعاد الخادم شبكة أسعار غير صالحة.');
  return data.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('أعاد الخادم صف سعر غير صالح.');
    const row = value as Record<string, unknown>;
    const money = (key: string): number => {
      const value = row[key];
      if (!(typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))) {
        throw new Error('السعر ' + key + ' غير متاح في بيانات الخادم؛ لم يُستبدل بصفر.');
      }
      const n = Number(value);
      if (!isValidPriceAmount(n)) throw new Error('أعاد الخادم قيمة سعر غير صالحة: ' + key);
      return n;
    };
    const quantity = (key: string): number | null => {
      const value = row[key];
      if (value === null) return null;
      if (!(typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))) {
        throw new Error('كمية المخزون ' + key + ' غير متاحة في بيانات الخادم؛ تُركت مفقودة بدل تحويلها إلى صفر.');
      }
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 999999999999 || Math.round(n * 1000) !== n * 1000) {
        throw new Error('أعاد الخادم كمية مخزون غير صالحة: ' + key);
      }
      return n;
    };
    const warehouseCountValue = row.inventory_warehouse_count;
    const warehouseCount = typeof warehouseCountValue === 'number' || (typeof warehouseCountValue === 'string' && warehouseCountValue.trim() !== '')
      ? Number(warehouseCountValue)
      : Number.NaN;
    if (!Number.isInteger(warehouseCount) || warehouseCount < 0 || warehouseCount > 100000) {
      throw new Error('أعاد الخادم عدد مخازن غير صالح لشبكة الأسعار.');
    };
    if (typeof row.id !== 'string' || typeof row.name !== 'string' ||
      typeof row.item_code !== 'string' || typeof row.unit !== 'string' || typeof row.is_active !== 'boolean') {
      throw new Error('أعاد الخادم هوية منتج غير صالحة لشبكة الأسعار.');
    }
    return {
      id: row.id, name: row.name, item_code: row.item_code, unit: row.unit, is_active: row.is_active,
      base_price: money('base_price'),
      price_wholesale_of_wholesale: money('price_wholesale_of_wholesale'),
      price_wholesale: money('price_wholesale'),
      price_retail: money('price_retail'),
      quantity_on_hand_total: quantity('quantity_on_hand_total'),
      quantity_reserved_total: quantity('quantity_reserved_total'),
      quantity_available_total: quantity('quantity_available_total'),
      reorder_point_total: quantity('reorder_point_total'),
      inventory_warehouse_count: warehouseCount,
    };
  });
}

// ─── Atomic, stale-safe price grid command ───
export interface ProductPriceGridChange {
  id: string;
  expectedBasePrice: number;
  expectedPriceWholesaleOfWholesale: number;
  expectedPriceWholesale: number;
  expectedPriceRetail: number;
  basePrice: number;
  priceWholesaleOfWholesale: number;
  priceWholesale: number;
  priceRetail: number;
}

export async function saveProductPriceGrid(changes: ProductPriceGridChange[]): Promise<number> {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 200) {
    throw new Error('يجب حفظ من 1 إلى 200 تعديل سعر في الدفعة الواحدة.');
  }
  const seen = new Set<string>();
  for (const item of changes) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) throw new Error('تحتوي دفعة الأسعار على معرّف منتج مكرر أو غير صالح.');
    seen.add(item.id);
    const values = [item.expectedBasePrice,item.expectedPriceWholesaleOfWholesale,item.expectedPriceWholesale,item.expectedPriceRetail,
      item.basePrice,item.priceWholesaleOfWholesale,item.priceWholesale,item.priceRetail];
    if (values.some((value) => !isValidPriceAmount(value))) {
      throw new Error('الأسعار يجب أن تكون أرقامًا غير سالبة وبحد أقصى منزلتين عشريتين.');
    }
  }
  const payload = changes.map((item) => ({
    id: item.id,
    expected_base_price: item.expectedBasePrice,
    expected_price_wholesale_of_wholesale: item.expectedPriceWholesaleOfWholesale,
    expected_price_wholesale: item.expectedPriceWholesale,
    expected_price_retail: item.expectedPriceRetail,
    base_price: item.basePrice,
    price_wholesale_of_wholesale: item.priceWholesaleOfWholesale,
    price_wholesale: item.priceWholesale,
    price_retail: item.priceRetail,
  }));
  const { data, error } = await supabase.rpc('save_product_price_grid', { p_changes: payload });
  if (error) throw new Error('لم تُحفظ شبكة الأسعار: ' + error.message);
  const count = data && typeof data === 'object' ? Number((data as Record<string, unknown>).updated_count) : NaN;
  if (!Number.isInteger(count) || count !== changes.length) {
    throw new Error('نتيجة حفظ الأسعار غير مطابقة للدفعة؛ حدّث الصفحة وتحقق من الأسعار المحفوظة قبل إعادة المحاولة.');
  }
  return count;
}

// ─── Unified import engine ───
export async function createImportJob(input: {
  fileName: string;
  fileHash: string;
  fileSize: number;
  jobType: string;
  totalRows?: number;
  profileId?: string | null;
  periodKey?: string | null;
  sourceSystem?: string;
  externalSourceReference?: string | null;
  /** Stable for retries of one logical import attempt; a new intentional version gets a fresh key. */
  requestKey?: string;
  /** The user-selected duplicate intent is part of the idempotency payload, not file identity. */
  intent?: "replace" | "merge" | "new_version";
}): Promise<ImportJob> {
  // Tenant identity is derived by the database from auth.uid(); no organization_id comes from the browser.
  // Reuse the supplied key for transport retries; UI starts a fresh key for each intentional operation.
  const { data, error } = await supabase.rpc('create_import_job_idempotent', {
    p_request_key: input.requestKey ?? crypto.randomUUID(),
    p_file_name: input.fileName,
    p_file_hash: input.fileHash,
    p_file_size: input.fileSize,
    p_job_type: input.jobType,
    p_external_source_reference: input.externalSourceReference?.trim() || null,
    p_profile_id: input.profileId ?? null,
    p_period_key: input.periodKey ?? null,
    p_source_system: input.sourceSystem ?? 'manual',
    p_intent: input.intent ?? 'new_version',
  });
  if (error) throw error;
  return data as ImportJob;
}

export async function createImportUploadSession(jobId: string) {
  const { data, error } = await supabase.rpc('create_import_upload_session', { p_job_id: jobId });
  if (error) throw error;
  return data as {
    id: string; import_job_id: string; organization_id: string;
    profile_id: string | null; profile_version: number | null; period_key: string | null;
    external_source_reference: string | null;
    chunk_size_bytes: number; total_chunks: number; verified_chunks: number;
    status: string; file_hash: string; file_size: number;
  };
}

export async function fetchImportUploadChunks(sessionId: string): Promise<Array<{
  chunk_number: number; byte_offset: number; byte_size: number; chunk_hash: string;
}>> {
  const { data, error } = await supabase
    .from('import_upload_chunks')
    .select('chunk_number,byte_offset,byte_size,chunk_hash')
    .eq('session_id', sessionId)
    .order('chunk_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<{ chunk_number: number; byte_offset: number; byte_size: number; chunk_hash: string }>;
}

export async function cancelImportUploadSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('import_upload_sessions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', sessionId);
  if (error) throw error;
}

export async function recordImportUploadChunk(input: {
  sessionId: string; chunkNumber: number; byteOffset: number; byteSize: number; chunkHash: string;
}) {
  const { data, error } = await supabase.rpc('record_import_upload_chunk', {
    p_session_id: input.sessionId,
    p_chunk_number: input.chunkNumber,
    p_byte_offset: input.byteOffset,
    p_byte_size: input.byteSize,
    p_chunk_hash: input.chunkHash,
  });
  if (error) throw error;
  return data as { session_id: string; verified_chunks: number; total_chunks: number; complete: boolean };
}

export async function findImportDuplicate(fileHash: string, profileId: string | null, periodKey: string | null) {
  const { data, error } = await supabase.rpc('find_import_duplicate', {
    p_file_hash: fileHash, p_profile_id: profileId, p_period_key: periodKey,
  });
  if (error) throw error;
  return data as { duplicate: boolean; jobs: ImportJob[]; snapshots: unknown[] };
}

export type ActiveInventoryWarehouse = { id: string; name: string; code: string | null };

export async function fetchActiveInventoryWarehouses(): Promise<ActiveInventoryWarehouse[]> {
  const { organizationId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('warehouses')
    .select('id,name,code')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as ActiveInventoryWarehouse[];
}

export type InventoryStockCountSession = {
  id: string; organization_id: string; warehouse_id: string; status: 'open' | 'completed' | 'cancelled';
  idempotency_key: string; notes: string | null; started_by: string; started_at: string; total_lines: number; counted_lines: number;
  completed_by: string | null; completed_at: string | null; cancelled_by: string | null; cancelled_at: string | null; cancellation_reason: string | null;
};
export type InventoryStockCountLine = {
  id: string; organization_id: string; session_id: string; product_id: string; product_code: string; product_name: string; unit: string | null;
  expected_quantity: number; expected_reserved_quantity: number; expected_last_movement_at: string | null;
  counted_quantity: number | null; counted_at: string | null; completed_quantity: number | null; variance: number | null; completed_at: string | null;
};
export type InventoryStockCountCompletion = {
  session_id: string; status: string; total_lines: number; adjusted_lines: number; positive_adjustment: number; negative_adjustment: number;
};
const stockCountUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertStockCountId(value: string, label: string): void { if (!stockCountUuid.test(value)) throw new Error(label + ' غير صالح.'); }
export async function fetchOpenStockCountForWarehouse(warehouseId: string): Promise<InventoryStockCountSession | null> {
  assertStockCountId(warehouseId, 'معرّف المستودع');
  const { data, error } = await supabase.from('stock_count_sessions')
    .select('id,organization_id,warehouse_id,status,idempotency_key,notes,started_by,started_at,total_lines,counted_lines,completed_by,completed_at,cancelled_by,cancelled_at,cancellation_reason')
    .eq('warehouse_id', warehouseId).eq('status', 'open').maybeSingle();
  if (error) throw error; return data as InventoryStockCountSession | null;
}
export async function fetchStockCountLines(sessionId: string): Promise<InventoryStockCountLine[]> {
  assertStockCountId(sessionId, 'معرّف جلسة الجرد');
  const { data, error } = await supabase.from('stock_count_lines')
    .select('id,organization_id,session_id,product_id,product_code,product_name,unit,expected_quantity,expected_reserved_quantity,expected_last_movement_at,counted_quantity,counted_at,completed_quantity,variance,completed_at')
    .eq('session_id', sessionId).order('product_code').limit(100000);
  if (error) throw error; return (data ?? []) as InventoryStockCountLine[];
}
export async function startStockCount(warehouseId: string, idempotencyKey: string, notes: string): Promise<InventoryStockCountSession & { replayed?: boolean }> {
  assertStockCountId(warehouseId, 'معرّف المستودع');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new Error('مفتاح جلسة الجرد غير صالح.');
  if (notes.trim().length > 1000) throw new Error('ملاحظات الجرد لا تتجاوز 1000 حرف.');
  const { data, error } = await supabase.rpc('start_stock_count', { p_warehouse_id: warehouseId, p_idempotency_key: idempotencyKey, p_notes: notes.trim() || null });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('لم يؤكد الخادم إنشاء جلسة الجرد.');
  return data as InventoryStockCountSession & { replayed?: boolean };
}
export async function setStockCountLine(sessionId: string, productId: string, countedQuantity: number): Promise<InventoryStockCountLine> {
  assertStockCountId(sessionId, 'معرّف جلسة الجرد'); assertStockCountId(productId, 'معرّف المنتج');
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0 || countedQuantity > 999999999999.999 ||
      !Number.isSafeInteger(Math.round(countedQuantity * 1000)) || Math.round(countedQuantity * 1000) !== countedQuantity * 1000) {
    throw new Error('الكمية المعدودة يجب أن تكون غير سالبة وبحد أقصى ثلاث منازل عشرية.');
  }
  const { data, error } = await supabase.rpc('set_stock_count_line', { p_session_id: sessionId, p_product_id: productId, p_counted_quantity: countedQuantity });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('لم يؤكد الخادم حفظ الكمية المعدودة.');
  return data as InventoryStockCountLine;
}
export async function completeStockCount(sessionId: string): Promise<InventoryStockCountCompletion> {
  assertStockCountId(sessionId, 'معرّف جلسة الجرد');
  const { data, error } = await supabase.rpc('complete_stock_count', { p_session_id: sessionId });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('لم يؤكد الخادم إتمام الجرد.');
  return data as InventoryStockCountCompletion;
}
export async function cancelStockCount(sessionId: string, reason: string): Promise<{ session_id: string; status: string; reason: string }> {
  assertStockCountId(sessionId, 'معرّف جلسة الجرد');
  const normalizedReason = reason.trim();
  if (!normalizedReason || normalizedReason.length > 1000) throw new Error('سبب إلغاء الجرد مطلوب ولا يتجاوز 1000 حرف.');
  const { data, error } = await supabase.rpc('cancel_stock_count', { p_session_id: sessionId, p_reason: normalizedReason });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('لم يؤكد الخادم إلغاء جلسة الجرد.');
  return data as { session_id: string; status: string; reason: string };
}

export type InventoryReorderPointSnapshot = {
  reorder_point: number | null;
  quantity_available: number;
};

export async function fetchInventoryReorderPoint(productId: string, warehouseId: string): Promise<InventoryReorderPointSnapshot | null> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(productId) || !uuid.test(warehouseId)) throw new Error('معرّف الصنف أو المستودع غير صالح.');
  const { data, error } = await supabase
    .from('inventory_balances')
    .select('reorder_point,quantity_available')
    .eq('product_id', productId)
    .eq('warehouse_id', warehouseId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const available = Number(data.quantity_available);
  if (!Number.isFinite(available)) throw new Error('رصيد المخزون المسترجع غير صالح.');
  return {
    reorder_point: data.reorder_point === null ? null : Number(data.reorder_point),
    quantity_available: available,
  };
}

export type InventoryReorderPointResult = {
  balance_id: string;
  product_id: string;
  warehouse_id: string;
  previous_reorder_point: number | null;
  reorder_point: number;
  quantity_available: number;
  unchanged: boolean;
};

export async function setInventoryReorderPoint(input: { productId: string; warehouseId: string; reorderPoint: number; reason: string }): Promise<InventoryReorderPointResult> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.productId) || !uuid.test(input.warehouseId)) throw new Error('معرّف الصنف أو المستودع غير صالح.');
  if (!Number.isSafeInteger(input.reorderPoint) || input.reorderPoint < 0 || input.reorderPoint > 1000000000) {
    throw new Error('حد إعادة الطلب يجب أن يكون عددًا صحيحًا بين صفر ومليار.');
  }
  const reason = input.reason.trim();
  if (!reason || reason.length > 1000) throw new Error('سبب التعديل مطلوب ولا يتجاوز 1000 حرف.');
  const { data, error } = await supabase.rpc('set_inventory_reorder_point', {
    p_product_id: input.productId,
    p_warehouse_id: input.warehouseId,
    p_reorder_point: input.reorderPoint,
    p_reason: reason,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('لم يؤكد الخادم نتيجة تعديل حد إعادة الطلب.');
  return data as InventoryReorderPointResult;
}
export type InventoryTransferResult = {
  transfer_id: string;
  product_id: string;
  source_warehouse_id: string;
  destination_warehouse_id: string;
  quantity: number;
  idempotent_replay: boolean;
  source_quantity_available_after?: number;
  destination_quantity_available_after?: number;
};

export async function transferInventory(input: {
  productId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  quantity: number;
  reason: string;
  idempotencyKey: string;
}): Promise<InventoryTransferResult> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (![input.productId, input.sourceWarehouseId, input.destinationWarehouseId].every((id) => uuid.test(id))) {
    throw new Error('معرّف الصنف أو المستودع غير صالح.');
  }
  if (input.sourceWarehouseId === input.destinationWarehouseId) {
    throw new Error('اختر مستودعين مختلفين.');
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 ||
      input.quantity > 999999999999.999 ||
      !Number.isSafeInteger(Math.round(input.quantity * 1000)) ||
      Math.round(input.quantity * 1000) !== input.quantity * 1000) {
    throw new Error('كمية النقل يجب أن تكون موجبة وبحد أقصى ثلاث منازل عشرية.');
  }
  const reason = input.reason.trim();
  if (!reason || reason.length > 1000) throw new Error('سبب النقل مطلوب ولا يتجاوز 1000 حرف.');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)) {
    throw new Error('مفتاح منع التكرار غير صالح.');
  }
  const { data, error } = await supabase.rpc('transfer_inventory', {
    p_product_id: input.productId,
    p_source_warehouse_id: input.sourceWarehouseId,
    p_destination_warehouse_id: input.destinationWarehouseId,
    p_quantity: input.quantity,
    p_reason: reason,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('لم يؤكد الخادم نتيجة نقل المخزون.');
  }
  return data as InventoryTransferResult;
}



export type InventoryTransferProduct = {
  id: string;
  name: string;
  item_code: string | null;
  unit: string | null;
  status: string;
};
export type InventoryTransferHistoryRow = {
  id: string;
  organization_id: string;
  product_id: string;
  source_warehouse_id: string;
  destination_warehouse_id: string;
  quantity: number;
  reason: string;
  created_by: string | null;
  created_at: string;
  batch_id: string | null;
  product_name: string | null;
  item_code: string | null;
  unit: string | null;
  source_warehouse_name: string | null;
  destination_warehouse_name: string | null;
  batch_line_count: number | null;
};
export type InventoryTransferBatchResult = {
  batch_id: string;
  line_count: number;
  idempotent_replay: boolean;
  transfer_ids: string[];
};

export async function fetchInventoryTransferProducts(): Promise<InventoryTransferProduct[]> {
  const { data, error } = await supabase.rpc('fetch_staff_products', { p_product_id: null });
  if (error) throw error;
  return ((data ?? []) as Array<Partial<InventoryTransferProduct>>)
    .filter((row): row is InventoryTransferProduct =>
      typeof row.id === 'string' && typeof row.name === 'string' &&
      typeof row.status === 'string' &&
      (row.item_code == null || typeof row.item_code === 'string') &&
      (row.unit == null || typeof row.unit === 'string'))
    .map((row) => ({
      id: row.id, name: row.name, item_code: row.item_code ?? null,
      unit: row.unit ?? null, status: row.status,
    }));
}

export async function transferInventoryBatch(input: InventoryTransferBatchInput): Promise<InventoryTransferBatchResult> {
  const normalized = validateInventoryTransferBatchInput(input);
  const { data, error } = await supabase.rpc('transfer_inventory_batch', {
    p_source_warehouse_id: normalized.sourceWarehouseId,
    p_destination_warehouse_id: normalized.destinationWarehouseId,
    p_idempotency_key: normalized.idempotencyKey,
    p_lines: normalized.lines.map((line) => ({ product_id: line.productId, quantity: line.quantity })),
    p_reason: normalized.reason,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      typeof (data as Record<string, unknown>).batch_id !== 'string' ||
      typeof (data as Record<string, unknown>).idempotent_replay !== 'boolean') {
    throw new Error('لم يؤكد الخادم نتيجة دفعة تحويل المخزون.');
  }
  return data as InventoryTransferBatchResult;
}

export async function fetchInventoryTransferHistory(): Promise<InventoryTransferHistoryRow[]> {
  const { data, error } = await supabase.rpc('list_inventory_transfer_history', { p_limit: 500 });
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const validString = (value: unknown): value is string => typeof value === 'string';
    const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
    const quantity = typeof row.quantity === 'number' || typeof row.quantity === 'string'
      ? Number(row.quantity) : Number.NaN;
    if (
      !validString(row.id) || !validString(row.organization_id) || !validString(row.product_id) ||
      !validString(row.source_warehouse_id) || !validString(row.destination_warehouse_id) ||
      !Number.isFinite(quantity) || !validString(row.reason) || !nullableString(row.created_by) ||
      !validString(row.created_at) || !nullableString(row.batch_id) ||
      !nullableString(row.product_name) || !nullableString(row.item_code) || !nullableString(row.unit) ||
      !nullableString(row.source_warehouse_name) || !nullableString(row.destination_warehouse_name) ||
      !(row.batch_line_count === null || (typeof row.batch_line_count === 'number' && Number.isInteger(row.batch_line_count)))
    ) {
      throw new Error('أعاد الخادم حركة مخزون غير مكتملة؛ أوقف عرض سجل التحويلات.');
    }
    return {
      id: row.id,
      organization_id: row.organization_id,
      product_id: row.product_id,
      source_warehouse_id: row.source_warehouse_id,
      destination_warehouse_id: row.destination_warehouse_id,
      quantity,
      reason: row.reason,
      created_by: row.created_by,
      created_at: row.created_at,
      batch_id: row.batch_id,
      product_name: row.product_name,
      item_code: row.item_code,
      unit: row.unit,
      source_warehouse_name: row.source_warehouse_name,
      destination_warehouse_name: row.destination_warehouse_name,
      batch_line_count: row.batch_line_count as number | null,
    };
  });
}

export async function fetchInventoryReconciliationRuns() {
  const { data, error } = await supabase.from('inventory_reconciliation_runs').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data;
}

export async function fetchInventoryReconciliationItems(runId: string) {
  const { data, error } = await supabase.from('inventory_reconciliation_items').select('*').eq('run_id', runId).order('item_code').limit(100000);
  if (error) throw error;
  return data;
}

export async function fetchCentralSynonyms() {
  const { data, error } = await supabase.from('central_synonym_dictionary').select('*').order('normalized_header').limit(2000);
  if (error) throw error;
  return data;
}

export async function saveCentralSynonym(input: {
  sourceHeader: string; normalizedHeader?: string; canonicalField: string; profileId?: string | null; locale?: string;
}) {
  // Tenant identity and normalized key are derived server-side; the browser cannot supply organization_id.
  const { data, error } = await supabase.rpc('create_central_synonym', {
    p_source_header: input.sourceHeader.trim(),
    p_canonical_field: input.canonicalField.trim(),
    p_profile_id: input.profileId ?? null,
    p_locale: input.locale ?? 'ar',
  });
  if (error) throw error;
  return data;
}

export async function finalizeImportJob(jobId: string, duplicateAction: 'ignore' | 'replace' | 'merge' | 'new_version' = 'new_version'): Promise<{
  job_id: string; status: string; data_quality_score: number; quality: Record<string, unknown>;
  snapshot_id: string | null; review_required: boolean;
}> {
  const { data, error } = await supabase.rpc('finalize_import_job', { p_job_id: jobId, p_duplicate_action: duplicateAction });
  if (error) throw error;
  return data as {
    job_id: string; status: string; data_quality_score: number; quality: Record<string, unknown>;
    snapshot_id: string | null; review_required: boolean;
  };
}

export async function fetchImportProfiles() {
  const { data, error } = await supabase.from('import_profiles').select('*').order('profile_name').order('version', { ascending: false });
  if (error) throw error;
  return data;
}

export type OnyxSnapshotSummary = {
  id: string;
  snapshot_version: number;
  period_key: string | null;
  source_file_hash: string;
  source_file_name: string | null;
  report_type: string;
  row_count: number;
  data_quality_score: number;
  quality_breakdown: Record<string, number>;
  created_by: string | null;
  created_at: string;
};

export type OnyxSnapshotRow = {
  id: string;
  snapshot_id: string;
  row_number: number;
  canonical_key: string | null;
  row_hash: string;
  status: string;
  data: Record<string, unknown>;
  errors: unknown;
  created_at: string;
};

export async function fetchOnyxSnapshots(): Promise<OnyxSnapshotSummary[]> {
  const { data, error } = await supabase
    .from('onyx_snapshots')
    .select('id,snapshot_version,period_key,source_file_hash,source_file_name,report_type,row_count,data_quality_score,quality_breakdown,created_by,created_at')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const score = row.data_quality_score;
    const rowCount = row.row_count;
    const version = row.snapshot_version;
    if (
      typeof row.id !== 'string' || typeof row.source_file_hash !== 'string' ||
      typeof row.report_type !== 'string' || typeof row.created_at !== 'string' ||
      typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100 ||
      typeof rowCount !== 'number' || !Number.isInteger(rowCount) || rowCount < 0 ||
      typeof version !== 'number' || !Number.isInteger(version) || version < 1
    ) {
      throw new Error('أعاد الخادم بيانات لقطة أونكس غير مكتملة؛ لم تُعرض أرقام بديلة.');
    }
    const breakdown = row.quality_breakdown;
    return {
      id: row.id,
      snapshot_version: version,
      period_key: typeof row.period_key === 'string' ? row.period_key : null,
      source_file_hash: row.source_file_hash,
      source_file_name: typeof row.source_file_name === 'string' ? row.source_file_name : null,
      report_type: row.report_type,
      row_count: rowCount,
      data_quality_score: score,
      quality_breakdown: breakdown && typeof breakdown === 'object' && !Array.isArray(breakdown)
        ? breakdown as Record<string, number> : {},
      created_by: typeof row.created_by === 'string' ? row.created_by : null,
      created_at: row.created_at,
    };
  });
}

export type OnyxSnapshotAnalytics = {
  snapshot: {
    id: string; version: number; file_name: string | null; file_hash: string; report_type: string;
    created_at: string; data_quality_score: number; quality_breakdown: Record<string, number>;
  };
  metrics: {
    row_count: number; unique_keys: number; valid_rows: number; rejected_rows: number; warning_rows: number;
    quantity_total: number; revenue_total: number; sales_total: number; customer_count: number;
    supplier_count: number; item_count: number; snapshot_row_count: number; dqs: number;
  };
  status_distribution: Array<{ status: string; count: number }>;
  top_items: Array<{ item_code: string; name: string | null; quantity: number; revenue: number }>;
  top_customers: Array<{ customer_code: string; revenue: number; quantity: number }>;
  forecast_status: string;
  forecast_reason: string;
};

export async function fetchOnyxSnapshotAnalytics(snapshotId: string): Promise<OnyxSnapshotAnalytics> {
  const { data, error } = await supabase.rpc('get_onyx_snapshot_analytics', { p_snapshot_id: snapshotId });
  if (error) throw error;
  return data as OnyxSnapshotAnalytics;
}

export async function fetchOnyxSnapshotRows(snapshotId: string): Promise<OnyxSnapshotRow[]> {
  if (!snapshotId.trim()) throw new Error('معرّف لقطة أونكس مطلوب.');
  const { data, error } = await supabase
    .from('onyx_snapshot_rows')
    .select('id,snapshot_id,row_number,canonical_key,row_hash,status,data,errors,created_at')
    .eq('snapshot_id', snapshotId)
    .order('row_number')
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return rows.map((row) => {
    if (
      typeof row.id !== 'string' || row.snapshot_id !== snapshotId ||
      typeof row.row_number !== 'number' || !Number.isInteger(row.row_number) || row.row_number < 1 ||
      typeof row.row_hash !== 'string' || typeof row.status !== 'string' ||
      typeof row.created_at !== 'string' ||
      !row.data || typeof row.data !== 'object' || Array.isArray(row.data)
    ) {
      throw new Error('أعاد الخادم صفًا غير مكتمل من لقطة أونكس؛ أوقف عرض الصفوف.');
    }
    return {
      id: row.id,
      snapshot_id: snapshotId,
      row_number: row.row_number,
      canonical_key: typeof row.canonical_key === 'string' ? row.canonical_key : null,
      row_hash: row.row_hash,
      status: row.status,
      data: row.data as Record<string, unknown>,
      errors: row.errors,
      created_at: row.created_at,
    };
  });
}

export async function runInventoryReconciliation(snapshotId: string) {
  const { data, error } = await supabase.rpc('run_inventory_reconciliation', { p_snapshot_id: snapshotId });
  if (error) throw error;
  return data as {
    run_id: string; snapshot_id: string; source_row_count: number; matched_count: number;
    changed_count: number; new_count: number; invalid_count: number;
  };
}

export async function insertImportRows(jobId: string, rows: Array<{ rowNumber: number; data: Record<string, unknown>; status: string; errors?: string[] }>): Promise<void> {
  const { error } = await supabase.from('import_job_rows').upsert(rows.map((row) => ({
    import_job_id: jobId,
    row_number: row.rowNumber,
    data: row.data,
    status: row.status,
    errors: row.errors ?? null,
  })), { onConflict: 'import_job_id,row_number' });
  if (error) throw error;
}

export async function updateImportJob(id: string, updates: Partial<ImportJob>): Promise<void> {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('معرّف دفعة الاستيراد غير صالح؛ لم يتم حفظ التحديث.');
  }
  // RLS may make a write affect zero rows without a PostgREST error; require a returned row.
  const { data, error } = await supabase.from('import_jobs').update(updates).eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  if (!data?.id || data.id !== id) {
    throw new Error('لم يؤكد الخادم حفظ تحديث دفعة الاستيراد؛ تحقق من المؤسسة والصلاحيات قبل المتابعة.');
  }
}

export type SafeImportFailureResult = {
  jobId: string;
  status: string;
  changed: boolean;
  terminal: boolean;
  totalRows: number | null;
  processedRows: number | null;
  failedRows: number | null;
  snapshotId: string | null;
};

/**
 * Atomic tenant-scoped failure bookkeeping. Server returns terminal state unchanged if
 * finalization committed but the network response was lost; never downgrade it locally.
 */
export async function failImportJobSafely(
  jobId: string,
  errorSummary: Record<string, unknown>,
): Promise<SafeImportFailureResult> {
  if (typeof jobId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error('معرّف دفعة الاستيراد غير صالح؛ لم تُعدّل الحالة.');
  }
  if (!errorSummary || typeof errorSummary !== 'object' || Array.isArray(errorSummary)
      || new TextEncoder().encode(JSON.stringify(errorSummary)).byteLength > 20_000) {
    throw new Error('ملخص فشل الاستيراد غير صالح أو كبير جدًا.');
  }
  const { data, error } = await supabase.rpc('fail_import_job_safely', {
    p_job_id: jobId,
    p_error_summary: errorSummary,
  });
  if (error) throw new Error('تعذر تأكيد حالة دفعة الاستيراد بعد الفشل؛ تحقق من السجل قبل إعادة المحاولة.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('أعاد الخادم استجابة غير صالحة لمصالحة حالة دفعة الاستيراد.');
  }
  const result = data as Record<string, unknown>;
  if (result.job_id !== jobId || typeof result.status !== 'string'
      || typeof result.changed !== 'boolean' || typeof result.terminal !== 'boolean') {
    throw new Error('استجابة مصالحة حالة الاستيراد لا تطابق الدفعة المطلوبة.');
  }
  const optionalCount = (value: unknown): number | null =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  return {
    jobId,
    status: result.status,
    changed: result.changed,
    terminal: result.terminal,
    totalRows: optionalCount(result.total_rows),
    processedRows: optionalCount(result.processed_rows),
    failedRows: optionalCount(result.failed_rows),
    snapshotId: typeof result.snapshot_id === 'string' ? result.snapshot_id : null,
  };
}


export async function fetchImportJobs(): Promise<ImportJob[]> {
  // Tenant-scoped RLS filters rows from the authenticated profile, not a browser-provided org ID.
  const { data, error } = await supabase.from('import_jobs').select('*').order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return data as ImportJob[];
}

export async function fetchImportRows(jobId: string): Promise<ImportJobRow[]> {
  const { data, error } = await supabase.from('import_job_rows').select('*').eq('import_job_id', jobId).order('row_number').limit(100000);
  if (error) throw error;
  return data as ImportJobRow[];
}

export type RollbackImportSnapshotResult = {
  jobId: string;
  snapshotId: string;
  status: 'rolled_back';
  snapshotStatus: 'archived';
  rolledBack: boolean;
  alreadyRolledBack: boolean;
  snapshotVersion: number | null;
  auditId: string | null;
  snapshotRowsRetained: boolean;
};

export async function rollbackImportSnapshot(jobId: string, reason: string): Promise<RollbackImportSnapshotResult> {
  if (typeof jobId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error('معرّف دفعة الاستيراد غير صالح للتراجع.');
  }
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  if (normalizedReason.length < 3 || normalizedReason.length > 1000) {
    throw new Error('سبب التراجع مطلوب ويجب أن يكون بين 3 و1000 حرف.');
  }
  const { data, error } = await supabase.rpc('rollback_import_snapshot', {
    p_job_id: jobId,
    p_reason: normalizedReason,
  });
  if (error) throw new Error(error.message || 'تعذر التراجع عن لقطة الاستيراد.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('استجابة التراجع غير صالحة؛ لم يتم تأكيد الأرشفة.');
  }
  const result = data as Record<string, unknown>;
  if (result.job_id !== jobId || typeof result.snapshot_id !== 'string'
      || result.status !== 'rolled_back' || result.snapshot_status !== 'archived'
      || typeof result.rolled_back !== 'boolean' || typeof result.already_rolled_back !== 'boolean') {
    throw new Error('لم يؤكد الخادم التراجع الآمن عن اللقطة المطلوبة.');
  }
  return {
    jobId,
    snapshotId: result.snapshot_id,
    status: 'rolled_back',
    snapshotStatus: 'archived',
    rolledBack: result.rolled_back,
    alreadyRolledBack: result.already_rolled_back,
    snapshotVersion: typeof result.snapshot_version === 'number' ? result.snapshot_version : null,
    auditId: typeof result.audit_id === 'string' ? result.audit_id : null,
    snapshotRowsRetained: result.snapshot_rows_retained === true || result.already_rolled_back === true,
  };
}

export type ImportRowErrorDetail = { row_number: number; errors: unknown };

export async function fetchImportRowErrors(jobId: string, limit = 100, offset = 0): Promise<ImportRowErrorDetail[]> {
  if (typeof jobId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error('معرّف دفعة الاستيراد غير صالح لعرض أخطاء الصفوف.');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('حد عرض أخطاء الصفوف يجب أن يكون بين 1 و500.');
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
    throw new Error('موضع عرض أخطاء الصفوف غير صالح.');
  }
  // The RLS policy scopes these rows through their parent import job and active organization.
  const { data, error } = await supabase
    .from('import_job_rows')
    .select('row_number,errors')
    .eq('import_job_id', jobId)
    .eq('status', 'rejected')
    .order('row_number', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error('تعذر قراءة أسباب رفض الصفوف من الدفعة الحالية.');
  return (data ?? []).map((row) => ({ row_number: row.row_number, errors: row.errors }));
}

// ─── Dashboard stats ───
export async function fetchDashboardStats() {
  const { organizationId: orgId, warehouseId } = await getCurrentTenantScope();
  const [products, customers, orders, alerts, lowStock] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active'),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    supabase.rpc('fetch_staff_orders'),
    supabase.from('ai_alerts').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_resolved', false),
    warehouseId
      ? supabase.from('inventory_balances').select('quantity_available, reorder_point, product_id').eq('warehouse_id', warehouseId)
      : Promise.resolve({ data: [] as Array<{ quantity_available: unknown; reorder_point: unknown }>, error: null }),
  ]);

  // A failed count query must not silently become a factual zero in the dashboard.
  if (products.error) throw products.error;
  if (customers.error) throw customers.error;
  if (orders.error) throw orders.error;
  if (alerts.error) throw alerts.error;
  if (lowStock.error) throw lowStock.error;

  const exactCount = (count: number | null, label: string): number => {
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('لم يؤكد الخادم العدد الدقيق لـ' + label + '؛ لم يتم عرضه كصفر.');
    }
    return count;
  };

  if (warehouseId && !Array.isArray(lowStock.data)) {
    throw new Error('لم يؤكد الخادم أرصدة المستودع الحالي؛ تعذر تحديد المخزون المنخفض.');
  }

  const orderMetrics = summarizeDashboardOrders(orders.data);
  const lowStockCount = warehouseId
    ? countLowStockBalances(
      lowStock.data as Array<{ quantity_available: unknown; reorder_point: unknown }>
    )
    : null;

  return {
    productCount: exactCount(products.count, 'المنتجات النشطة'),
    customerCount: exactCount(customers.count, 'العملاء'),
    orderCount: orderMetrics.orderCount,
    totalSales: orderMetrics.totalSales,
    invalidOrderAmountCount: orderMetrics.invalidOrderAmountCount,
    totalSalesIssue: orderMetrics.totalSalesIssue,
    processingCount: orderMetrics.processingCount,
    alertCount: exactCount(alerts.count, 'التنبيهات المفتوحة'),
    lowStockCount,
  };
}

// ─── Tenant-scoped store executive analytics ───
// Aggregates the full authorized dataset in PostgreSQL; never derive company-wide trends
// from a truncated browser page or a caller-supplied organization id.
export async function fetchStoreExecutiveAnalytics(): Promise<StoreExecutiveAnalytics> {
  const { data, error } = await supabase.rpc('get_store_executive_analytics');
  if (error) throw error;
  return parseStoreExecutiveAnalytics(data);
}

export async function fetchStoreProductActivityReport(): Promise<StoreProductActivityReport> {
  const { data, error } = await supabase.rpc('get_store_product_activity_report');
  if (error) throw error;
  return parseStoreProductActivityReport(data);
}


// Complete ledger-backed customer 360 aggregates with bounded recent detail rows.
export async function fetchStaffCustomer360Summary(customerId: string): Promise<StaffCustomer360Summary> {
  if (typeof customerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(customerId)) {
    throw new Error('معرّف العميل غير صالح لطلب ملخص 360.');
  }
  const { data, error } = await supabase.rpc('get_staff_customer_360', { p_customer_id: customerId });
  if (error) throw error;
  const summary = parseStaffCustomer360Summary(data);
  if (summary.customer.id !== customerId) {
    throw new Error('معرّف العميل في استجابة الخادم لا يطابق الطلب.');
  }
  return summary;
}


// ─── Customer 360 interaction history ───
const customerInteractionTypes: CustomerInteractionType[] = [
  'call','visit','whatsapp','email','meeting','note','other',
];

function parseCustomerInteractionHistory(value: unknown): CustomerInteraction[] {
  if (!Array.isArray(value)) throw new Error('أعاد الخادم سجل تفاعلات غير صالح.');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('يوجد سجل تواصل غير صالح في استجابة العميل.');
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' ||
        typeof row.interaction_type !== 'string' ||
        !customerInteractionTypes.includes(row.interaction_type as CustomerInteractionType) ||
        typeof row.subject !== 'string' ||
        typeof row.details !== 'string' ||
        typeof row.interaction_at !== 'string' ||
        !(typeof row.next_follow_up_at === 'string' || row.next_follow_up_at === null) ||
        typeof row.created_at !== 'string' ||
        typeof row.recorded_by_name !== 'string' ||
        !(typeof row.follow_up_task_id === 'string' || row.follow_up_task_id === null) ||
        !(typeof row.follow_up_due_at === 'string' || row.follow_up_due_at === null) ||
        !(typeof row.follow_up_status === 'string' || row.follow_up_status === null) ||
        !(typeof row.follow_up_cancellation_reason === 'string' || row.follow_up_cancellation_reason === null) ||
        !(typeof row.follow_up_updated_at === 'string' || row.follow_up_updated_at === null)) {
      throw new Error('بيانات سجل التواصل غير مكتملة؛ لم يتم عرض سجل غير موثوق.');
    }
    if (!Number.isFinite(Date.parse(row.interaction_at)) ||
        !Number.isFinite(Date.parse(row.created_at)) ||
        (row.next_follow_up_at !== null && !Number.isFinite(Date.parse(row.next_follow_up_at))) ||
        (row.follow_up_due_at !== null && !Number.isFinite(Date.parse(row.follow_up_due_at))) ||
        (row.follow_up_updated_at !== null && !Number.isFinite(Date.parse(row.follow_up_updated_at)))) {
      throw new Error('تواريخ سجل التواصل غير صالحة.');
    }
    return {
      id: row.id,
      interaction_type: row.interaction_type as CustomerInteractionType,
      subject: row.subject,
      details: row.details,
      interaction_at: row.interaction_at,
      next_follow_up_at: row.next_follow_up_at,
      created_at: row.created_at,
      recorded_by_name: row.recorded_by_name,
      follow_up_task_id: row.follow_up_task_id,
      follow_up_due_at: row.follow_up_due_at,
      follow_up_status: row.follow_up_status === null ? null :
        (['pending','in_progress','completed','cancelled'].includes(row.follow_up_status)
          ? row.follow_up_status as CustomerInteractionFollowUpStatus
          : (() => { throw new Error('حالة مهمة متابعة العميل غير معروفة؛ لم يتم عرض حالة غير موثوقة.'); })()),
      follow_up_cancellation_reason: row.follow_up_cancellation_reason,
      follow_up_updated_at: row.follow_up_updated_at,
    };
  });
}

export async function fetchCustomerInteractions(customerId: string, limit = 50): Promise<CustomerInteraction[]> {
  if (typeof customerId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId)) {
    throw new Error('معرّف العميل غير صالح لطلب سجل التواصل.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('حدّ عرض سجل التواصل غير صالح.');
  }
  const { data, error } = await supabase.rpc('get_customer_interaction_history', {
    p_customer_id: customerId,
    p_limit: limit,
  });
  if (error) throw error;
  return parseCustomerInteractionHistory(data);
}

export async function recordCustomerInteraction(input: {
  customerId: string;
  idempotencyKey: string;
  interactionType: CustomerInteractionType;
  subject: string;
  details: string;
  nextFollowUpAt?: string | null;
}): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(input.customerId)) {
    throw new Error('معرّف العميل غير صالح.');
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)) {
    throw new Error('مفتاح حفظ التواصل غير صالح؛ أعد المحاولة من النموذج.');
  }
  if (!customerInteractionTypes.includes(input.interactionType)) {
    throw new Error('نوع التواصل غير صالح.');
  }
  const subject = input.subject.trim();
  const details = input.details.trim();
  if (!subject || subject.length > 200 || !details || details.length > 4000) {
    throw new Error('أدخل موضوع التواصل وتفاصيله ضمن الحدود المسموح بها.');
  }
  if (input.nextFollowUpAt !== undefined && input.nextFollowUpAt !== null &&
      !Number.isFinite(Date.parse(input.nextFollowUpAt))) {
    throw new Error('موعد المتابعة القادمة غير صالح.');
  }
  const { data, error } = await supabase.rpc('record_customer_interaction', {
    p_customer_id: input.customerId,
    p_idempotency_key: input.idempotencyKey,
    p_interaction_type: input.interactionType,
    p_subject: subject,
    p_details: details,
    p_interaction_at: null,
    p_next_follow_up_at: input.nextFollowUpAt || null,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data)) {
    throw new Error('لم يرجع الخادم معرّف سجل التواصل المحفوظ.');
  }
  return data;
}

// ─── Purchase orders and atomic inventory receiving ───
const purchaseIdempotencyKey = /^[A-Za-z0-9_-]{16,128}$/;
export type PurchaseOrderLineCommand = { product_id: string; quantity: number; unit_cost: number | null };
export type PurchaseReceiptLineCommand = {
  item_id: string;
  quantity: number;
  batch_number?: string | null;
  expiry_date?: string | null;
};
export type PurchaseOrderCommandResult = { purchase_order: PurchaseOrder; idempotent_replay: boolean };
export type PurchaseReceiptCommandResult = {
  purchase_order: PurchaseOrder;
  receipt: { id: string; receipt_number: string; purchase_order_id: string; received_at: string };
  idempotent_replay: boolean;
};

function assertPurchaseUuid(value: string, label: string): void {
  if (!isPurchaseOrderUuid(value)) throw new Error(label + ' غير صالح.');
}
function assertPurchaseKey(value: string, label: string): void {
  if (!purchaseIdempotencyKey.test(value)) throw new Error(label + ' غير صالح.');
}
function parsePurchaseCommand(value: unknown): PurchaseOrderCommandResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('لم يؤكد الخادم نتيجة أمر الشراء.');
  const row=value as Record<string,unknown>;
  return {
    purchase_order: parsePurchaseOrder(row.purchase_order),
    idempotent_replay: row.idempotent_replay === true,
  };
}
export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase.rpc('fetch_purchase_orders');
  if (error) throw error;
  return parsePurchaseOrders(data);
}
export async function createPurchaseOrder(input: {
  supplierId: string; warehouseId: string; lines: PurchaseOrderLineCommand[]; notes: string; idempotencyKey: string;
}): Promise<PurchaseOrderCommandResult> {
  assertPurchaseUuid(input.supplierId,'معرّف المورد');
  assertPurchaseUuid(input.warehouseId,'معرّف المخزن');
  assertPurchaseKey(input.idempotencyKey,'مفتاح منع تكرار أمر الشراء');
  if (!input.lines.length || input.lines.length>100) throw new Error('أمر الشراء يجب أن يحتوي من صنف واحد إلى 100 صنف.');
  if (input.notes.trim().length>2000) throw new Error('ملاحظات أمر الشراء لا تتجاوز 2000 حرف.');
  const seen=new Set<string>();
  for (const line of input.lines) {
    assertPurchaseUuid(line.product_id,'معرّف الصنف');
    if (seen.has(line.product_id)) throw new Error('لا تكرر الصنف نفسه؛ ادمج كميته في سطر واحد.');
    seen.add(line.product_id);
    if (!Number.isFinite(line.quantity) || line.quantity<=0 || line.quantity>999999999999.999 ||
        !Number.isSafeInteger(Math.round(line.quantity*1000)) || Math.round(line.quantity*1000)!==line.quantity*1000) {
      throw new Error('كمية الشراء يجب أن تكون موجبة وبحد أقصى ثلاث منازل عشرية.');
    }
    if (line.unit_cost!==null && (!Number.isFinite(line.unit_cost) || line.unit_cost<0 || line.unit_cost>9999999999999.99 ||
        !Number.isSafeInteger(Math.round(line.unit_cost*100)) || Math.round(line.unit_cost*100)!==line.unit_cost*100)) {
      throw new Error('تكلفة الوحدة يجب أن تكون غير سالبة وبحد أقصى منزلتين عشريتين، أو اتركها غير مسجلة.');
    }
  }
  const {data,error}=await supabase.rpc('create_purchase_order',{
    p_supplier_id:input.supplierId,p_warehouse_id:input.warehouseId,
    p_lines:input.lines,p_notes:input.notes.trim()||null,p_idempotency_key:input.idempotencyKey,
  });
  if(error) throw error;
  return parsePurchaseCommand(data);
}
export async function submitPurchaseOrder(purchaseOrderId:string):Promise<PurchaseOrderCommandResult> {
  assertPurchaseUuid(purchaseOrderId,'معرّف أمر الشراء');
  const {data,error}=await supabase.rpc('submit_purchase_order',{p_purchase_order_id:purchaseOrderId});
  if(error) throw error;
  return parsePurchaseCommand(data);
}
export async function cancelPurchaseOrder(purchaseOrderId:string,reason:string):Promise<PurchaseOrderCommandResult> {
  assertPurchaseUuid(purchaseOrderId,'معرّف أمر الشراء');
  const note=reason.trim();
  if(note.length<3||note.length>1000) throw new Error('سبب الإلغاء مطلوب (3 إلى 1000 حرف).');
  const {data,error}=await supabase.rpc('cancel_purchase_order',{p_purchase_order_id:purchaseOrderId,p_reason:note});
  if(error) throw error;
  return parsePurchaseCommand(data);
}
export async function receivePurchaseOrder(input:{
  purchaseOrderId:string;lines:PurchaseReceiptLineCommand[];notes:string;idempotencyKey:string;
}):Promise<PurchaseReceiptCommandResult>{
  assertPurchaseUuid(input.purchaseOrderId,'معرّف أمر الشراء');
  assertPurchaseKey(input.idempotencyKey,'مفتاح منع تكرار الاستلام');
  if(!input.lines.length||input.lines.length>100) throw new Error('اختر من بند واحد إلى 100 بند للاستلام.');
  if(input.notes.trim().length>2000) throw new Error('ملاحظات الاستلام لا تتجاوز 2000 حرف.');
  const seen=new Set<string>();
  const normalizedLines: PurchaseReceiptLineCommand[]=[];
  for(const line of input.lines){
    assertPurchaseUuid(line.item_id,'معرّف بند أمر الشراء');
    if(seen.has(line.item_id)) throw new Error('لا تكرر بند أمر الشراء داخل إيصال واحد.');
    seen.add(line.item_id);
    if(!Number.isFinite(line.quantity)||line.quantity<=0||line.quantity>999999999999.999||
       !Number.isSafeInteger(Math.round(line.quantity*1000))||Math.round(line.quantity*1000)!==line.quantity*1000) {
      throw new Error('كمية الاستلام يجب أن تكون موجبة وبحد أقصى ثلاث منازل عشرية.');
    }
    const batchNumber=(line.batch_number??'').trim();
    const expiryDate=(line.expiry_date??'').trim();
    if(batchNumber.length>100) throw new Error('رقم الدفعة لا يتجاوز 100 حرف.');
    if(expiryDate){
      if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(expiryDate)) throw new Error('تاريخ الانتهاء يجب أن يكون بصيغة سنة-شهر-يوم.');
      const parsedDate=new Date(expiryDate+'T00:00:00.000Z');
      if(!Number.isFinite(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==expiryDate) throw new Error('تاريخ الانتهاء غير صالح.');
      if(!batchNumber) throw new Error('أدخل رقم الدفعة عند تحديد تاريخ الانتهاء.');
    }
    normalizedLines.push({
      item_id:line.item_id,
      quantity:line.quantity,
      batch_number:batchNumber||null,
      expiry_date:expiryDate||null,
    });
  }
  const {data,error}=await supabase.rpc('receive_purchase_order',{
    p_purchase_order_id:input.purchaseOrderId,p_lines:normalizedLines,
    p_notes:input.notes.trim()||null,p_idempotency_key:input.idempotencyKey,
  });
  if(error) throw error;
  if(data===null||typeof data!=='object'||Array.isArray(data)) throw new Error('لم يؤكد الخادم نتيجة الاستلام.');
  const row=data as Record<string,unknown>;
  const receipt=row.receipt;
  if(receipt===null||typeof receipt!=='object'||Array.isArray(receipt)) throw new Error('بيانات إيصال الاستلام غير صالحة.');
  const raw=receipt as Record<string,unknown>;
  if(typeof raw.id!=='string'||typeof raw.receipt_number!=='string'||typeof raw.purchase_order_id!=='string'||
     typeof raw.received_at!=='string'||!Number.isFinite(Date.parse(raw.received_at))) throw new Error('بيانات إيصال الاستلام غير صالحة.');
  return {
    purchase_order:parsePurchaseOrder(row.purchase_order),
    receipt:{id:raw.id,receipt_number:raw.receipt_number,purchase_order_id:raw.purchase_order_id,received_at:raw.received_at},
    idempotent_replay:row.idempotent_replay===true,
  };
}

export async function manageCustomerInteractionFollowUp(input: {
  interactionId: string;
  action: 'reschedule' | 'cancel';
  idempotencyKey: string;
  newDueAt?: string | null;
  reason?: string | null;
}): Promise<{
  id: string;
  interactionId: string;
  taskId: string;
  action: 'rescheduled' | 'cancelled';
  oldDueAt: string | null;
  newDueAt: string | null;
  createdAt: string;
  replayed: boolean;
}> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(input.interactionId)) throw new Error('معرّف سجل التواصل غير صالح.');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)) throw new Error('مفتاح عملية المتابعة غير صالح.');
  if (input.action !== 'reschedule' && input.action !== 'cancel') throw new Error('إجراء المتابعة غير صالح.');

  const reason = input.reason?.trim() || null;
  let newDueAt: string | null = null;
  if (input.action === 'reschedule') {
    if (!input.newDueAt || !Number.isFinite(Date.parse(input.newDueAt))) {
      throw new Error('حدد موعد متابعة جديدًا صالحًا.');
    }
    newDueAt = new Date(input.newDueAt).toISOString();
    if (Date.parse(newDueAt) <= Date.now()) throw new Error('يجب أن يكون موعد المتابعة الجديد في المستقبل.');
    if (reason && reason.length > 500) throw new Error('ملاحظة تغيير الموعد تتجاوز 500 حرف.');
  } else {
    if (input.newDueAt) throw new Error('لا يُرسل موعد جديد عند إلغاء المتابعة.');
    if (!reason || reason.length > 500) throw new Error('سبب إلغاء المتابعة مطلوب وبحد أقصى 500 حرف.');
  }

  const { data, error } = await supabase.rpc('manage_customer_interaction_follow_up', {
    p_interaction_id: input.interactionId,
    p_action: input.action,
    p_new_due_at: newDueAt,
    p_reason: reason,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('لم يرجع الخادم نتيجة موثوقة لإجراء المتابعة.');
  }
  const row = data as Record<string, unknown>;
  const expectedAction = input.action === 'reschedule' ? 'rescheduled' : 'cancelled';
  if (typeof row.id !== 'string' || !uuidPattern.test(row.id) ||
      typeof row.interaction_id !== 'string' || row.interaction_id !== input.interactionId ||
      typeof row.task_id !== 'string' || !uuidPattern.test(row.task_id) ||
      row.action !== expectedAction ||
      !(typeof row.old_due_at === 'string' || row.old_due_at === null) ||
      !(typeof row.new_due_at === 'string' || row.new_due_at === null) ||
      typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) ||
      typeof row.replayed !== 'boolean' ||
      (row.old_due_at !== null && !Number.isFinite(Date.parse(row.old_due_at))) ||
      (row.new_due_at !== null && !Number.isFinite(Date.parse(row.new_due_at)))) {
    throw new Error('استجابة الخادم لإجراء المتابعة غير مكتملة؛ لم يتم اعتماد حالة غير موثوقة.');
  }
  return {
    id: row.id,
    interactionId: row.interaction_id,
    taskId: row.task_id,
    action: expectedAction,
    oldDueAt: row.old_due_at,
    newDueAt: row.new_due_at,
    createdAt: row.created_at,
    replayed: row.replayed,
  };
}
