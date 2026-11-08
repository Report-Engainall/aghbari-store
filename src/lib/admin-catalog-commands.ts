import { supabase } from '@/lib/supabase';

export type AdminCatalogPayload = {
  name: string;
  item_code: string;
  barcode: string | null;
  unit: string;
  description: string | null;
  category_id: string | null;
  base_price: number;
  price_wholesale_of_wholesale: number;
  price_wholesale: number;
  price_retail: number;
  status: 'active' | 'inactive';
  name_en?: string | null;
  sku?: string | null;
  is_featured?: boolean;
  sort_order?: number;
  min_order_quantity?: number;
  order_quantity_multiple?: number;
  expected_base_price?: number;
  expected_price_wholesale_of_wholesale?: number;
  expected_price_wholesale?: number;
  expected_price_retail?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validAmount(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || value > 999999999999 || Math.round(value * 100) !== value * 100) {
    throw new Error('سعر غير صالح: ' + label);
  }
  return value;
}

function validInteger(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(label + ' خارج النطاق المسموح.');
  }
  return value;
}

function normalize(payload: AdminCatalogPayload): Record<string, string | number | boolean | null> {
  const name = payload.name.trim();
  const itemCode = payload.item_code.trim().toUpperCase();
  const unit = payload.unit.trim();
  const barcode = payload.barcode?.trim() || null;
  const description = payload.description?.trim() || null;

  if (!name || name.length > 200 || !itemCode || itemCode.length > 100 || !unit || unit.length > 40) {
    throw new Error('اسم المنتج والكود والوحدة مطلوبة.');
  }
  if (barcode !== null && barcode.length > 100) throw new Error('الباركود لا يتجاوز 100 حرفًا.');
  if (description !== null && description.length > 2000) throw new Error('وصف المنتج لا يتجاوز 2000 حرف.');
  if (payload.category_id !== null && !UUID.test(payload.category_id)) throw new Error('معرّف التصنيف غير صالح.');
  if (payload.status !== 'active' && payload.status !== 'inactive') throw new Error('حالة المنتج غير صالحة.');

  const normalized: Record<string, string | number | boolean | null> = {
    name,
    item_code: itemCode,
    barcode,
    unit,
    description,
    category_id: payload.category_id,
    base_price: validAmount(payload.base_price, 'base_price'),
    price_wholesale_of_wholesale: validAmount(payload.price_wholesale_of_wholesale, 'price_wholesale_of_wholesale'),
    price_wholesale: validAmount(payload.price_wholesale, 'price_wholesale'),
    price_retail: validAmount(payload.price_retail, 'price_retail'),
    status: payload.status,
  };

  if (payload.name_en !== undefined) {
    const nameEn = payload.name_en?.trim() || null;
    if (nameEn !== null && nameEn.length > 240) throw new Error('الاسم الإنجليزي لا يتجاوز 240 حرفًا.');
    normalized.name_en = nameEn;
  }
  if (payload.sku !== undefined) {
    const sku = payload.sku?.trim() || null;
    if (sku !== null && sku.length > 80) throw new Error('SKU لا يتجاوز 80 حرفًا.');
    normalized.sku = sku;
  }
  if (payload.is_featured !== undefined) {
    if (typeof payload.is_featured !== 'boolean') throw new Error('حالة المنتج المميز غير صالحة.');
    normalized.is_featured = payload.is_featured;
  }
  if (payload.sort_order !== undefined) normalized.sort_order = validInteger(payload.sort_order, 'ترتيب الظهور', 0, 1000000000);
  if (payload.min_order_quantity !== undefined) normalized.min_order_quantity = validInteger(payload.min_order_quantity, 'الحد الأدنى للطلب', 1, 10000);
  if (payload.order_quantity_multiple !== undefined) normalized.order_quantity_multiple = validInteger(payload.order_quantity_multiple, 'مضاعف كمية الطلب', 1, 10000);

  for (const key of [
    'expected_base_price',
    'expected_price_wholesale_of_wholesale',
    'expected_price_wholesale',
    'expected_price_retail',
  ] as const) {
    const value = payload[key];
    if (value !== undefined) normalized[key] = validAmount(value, key);
  }

  return normalized;
}

export async function saveAdminCatalogProduct(id: string | null, payload: AdminCatalogPayload) {
  if (id !== null && !UUID.test(id)) throw new Error('معرّف المنتج غير صالح.');
  const { data, error } = await supabase.rpc('save_admin_product_with_metadata', {
    p_product_id: id,
    p_payload: normalize(payload),
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('لم يُرجع الخادم نتيجة صالحة لحفظ المنتج.');
  }
  const saved = data as Record<string, unknown>;
  if (typeof saved.id !== 'string' || !UUID.test(saved.id)
    || (saved.status !== 'active' && saved.status !== 'inactive')
    || typeof saved.created !== 'boolean'
    || (id !== null && saved.id.toLowerCase() !== id.toLowerCase())
    || (id === null && saved.created !== true)) {
    throw new Error('لم يؤكد الخادم حفظ المنتج ضمن المؤسسة الحالية.');
  }
  return { id: saved.id, status: saved.status as 'active' | 'inactive', created: saved.created };
}

export async function archiveAdminCatalogProduct(id: string) {
  if (!UUID.test(id)) throw new Error('معرّف المنتج غير صالح.');
  const { data, error } = await supabase.rpc('archive_admin_catalog_product', { p_product_id: id });
  if (error) throw error;
  if (!data || typeof data !== 'object' || data.id !== id || data.status !== 'inactive' || data.archived !== true) {
    throw new Error('لم يؤكد الخادم أرشفة المنتج.');
  }
  return data as { id: string; status: 'inactive'; archived: true };
}

export async function createAdminCatalogCategory(nameInput: string, parentId: string | null = null, codeInput: string | null = null) {
  const name = nameInput.trim();
  const code = codeInput?.trim() || null;
  if (!name || name.length > 100) throw new Error('اسم التصنيف مطلوب.');
  if (parentId !== null && !UUID.test(parentId)) throw new Error('معرّف التصنيف الأب غير صالح.');
  if (code !== null && code.length > 64) throw new Error('رمز التصنيف لا يتجاوز 64 حرفًا.');
  const { data, error } = await supabase.rpc('create_admin_catalog_category', {
    p_name: name,
    p_parent_id: parentId,
    p_code: code,
  });
  if (error) throw error;
  return data as { id: string; name: string; created: boolean };
}

export async function archiveAdminCatalogCategory(id: string) {
  if (!UUID.test(id)) throw new Error('معرّف التصنيف غير صالح.');
  const { data, error } = await supabase.rpc('archive_admin_catalog_category', { p_category_id: id });
  if (error) throw error;
  if (!data || typeof data !== 'object' || typeof data.id !== 'string'
    || data.id.toLowerCase() !== id.toLowerCase() || data.is_active !== false || data.archived !== true) {
    throw new Error('لم يؤكد الخادم أرشفة التصنيف.');
  }
  return data as { id: string; is_active: false; archived: true };
}

export async function renameAdminCatalogCategory(id: string, nameInput: string) {
  if (!UUID.test(id)) throw new Error('معرّف التصنيف غير صالح.');
  const name = nameInput.trim();
  if (!name || name.length > 100) throw new Error('اسم التصنيف مطلوب ويجب ألا يتجاوز 100 حرف.');
  const { data, error } = await supabase.rpc('rename_admin_catalog_category', { p_category_id: id, p_name: name });
  if (error) throw error;
  if (!data || typeof data !== 'object' || typeof data.id !== 'string'
    || data.id.toLowerCase() !== id.toLowerCase() || data.name !== name || typeof data.renamed !== 'boolean') {
    throw new Error('لم يؤكد الخادم إعادة تسمية التصنيف.');
  }
  return data as { id: string; name: string; renamed: boolean };
}

export async function restoreAdminCatalogCategory(id: string) {
  if (!UUID.test(id)) throw new Error('معرّف التصنيف غير صالح.');
  const { data, error } = await supabase.rpc('restore_admin_catalog_category', { p_category_id: id });
  if (error) throw error;
  if (!data || typeof data !== 'object' || typeof data.id !== 'string'
    || data.id.toLowerCase() !== id.toLowerCase() || data.is_active !== true || typeof data.restored !== 'boolean') {
    throw new Error('لم يؤكد الخادم استعادة التصنيف.');
  }
  return data as { id: string; is_active: true; restored: boolean };
}
