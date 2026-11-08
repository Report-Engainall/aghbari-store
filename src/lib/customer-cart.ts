import { supabase } from '@/lib/supabase';

export type CustomerCartLine = { product_id: string; quantity: number };
export type CustomerCartSnapshot = { items: CustomerCartLine[]; updated_at: string | null };

const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CART_LINES = 100;
const MAX_CART_QUANTITY = 10000;

/** Accept only product identity and quantity, never price data. */
export function normalizeCustomerCartLines(value: unknown): CustomerCartLine[] {
  if (!Array.isArray(value) || value.length > MAX_CART_LINES) {
    throw new Error('لا يمكن مزامنة السلة: يجب أن تحتوي على 100 صنف أو أقل.');
  }

  const seen = new Set<string>();
  return value.map((candidate) => {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('لا يمكن مزامنة السلة: أحد بنودها غير صالح.');
    }
    const line = candidate as Record<string, unknown>;
    const productId = typeof line.product_id === 'string' ? line.product_id.trim() : '';
    const quantity = line.quantity;
    if (!PRODUCT_ID_PATTERN.test(productId)) {
      throw new Error('لا يمكن مزامنة السلة: معرّف أحد المنتجات غير صالح.');
    }
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) {
      throw new Error('لا يمكن مزامنة السلة: الكمية يجب أن تكون عددًا صحيحًا بين 1 و10000.');
    }
    const normalizedId = productId.toLowerCase();
    if (seen.has(normalizedId)) {
      throw new Error('لا يمكن مزامنة السلة: يوجد صنف مكرر.');
    }
    seen.add(normalizedId);
    return { product_id: normalizedId, quantity };
  });
}

function parseSnapshot(value: unknown): CustomerCartSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('استجابة السلة المحفوظة غير صالحة.');
  }
  const data = value as Record<string, unknown>;
  const updatedAt = data.updated_at;
  if (updatedAt !== null && updatedAt !== undefined && typeof updatedAt !== 'string') {
    throw new Error('تاريخ تحديث السلة المحفوظة غير صالح.');
  }
  return {
    items: normalizeCustomerCartLines(data.items),
    updated_at: typeof updatedAt === 'string' ? updatedAt : null,
  };
}

export async function fetchCustomerCart(): Promise<CustomerCartSnapshot> {
  const { data, error } = await supabase.rpc('get_customer_cart');
  if (error) throw error;
  return parseSnapshot(data);
}

export async function saveCustomerCart(value: unknown): Promise<CustomerCartSnapshot> {
  const items = normalizeCustomerCartLines(value);
  const { data, error } = await supabase.rpc('sync_customer_cart', { p_items: items });
  if (error) throw error;
  return parseSnapshot(data);
}
