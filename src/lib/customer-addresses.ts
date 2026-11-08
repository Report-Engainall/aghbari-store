import { supabase } from "@/lib/supabase";

export type CustomerAddress = {
  id: string; label: string; recipient_name: string; phone: string;
  address_line1: string; address_line2: string | null; city: string;
  region: string | null; postal_code: string | null; country: string;
  delivery_instructions: string | null; is_default: boolean;
  created_at: string; updated_at: string;
};
export type CustomerAddressInput = {
  id?: string | null; label: string; recipient_name: string; phone: string;
  address_line1: string; address_line2?: string | null; city: string;
  region?: string | null; postal_code?: string | null; country: string;
  delivery_instructions?: string | null; is_default: boolean;
};
const COLUMNS = "id,label,recipient_name,phone,address_line1,address_line2,city,region,postal_code,country,delivery_instructions,is_default,created_at,updated_at";
const clean = (value: string | null | undefined) => (value ?? "").trim();
const optional = (value: string | null | undefined) => clean(value) || null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validate(input: CustomerAddressInput): CustomerAddressInput {
  const value = {
    id: optional(input.id), label: clean(input.label), recipient_name: clean(input.recipient_name),
    phone: clean(input.phone), address_line1: clean(input.address_line1),
    address_line2: optional(input.address_line2), city: clean(input.city),
    region: optional(input.region), postal_code: optional(input.postal_code),
    country: clean(input.country).toUpperCase(), delivery_instructions: optional(input.delivery_instructions),
    is_default: input.is_default === true,
  };
  if (value.id && !uuid.test(value.id)) throw new Error("معرّف عنوان التوصيل غير صالح.");
  if (!value.label || value.label.length > 50) throw new Error("اسم العنوان مطلوب ولا يتجاوز 50 حرفًا.");
  if (value.recipient_name.length < 2 || value.recipient_name.length > 120) throw new Error("اسم المستلم مطلوب (من حرفين إلى 120 حرفًا).");
  if (value.phone.length < 7 || value.phone.length > 32) throw new Error("أدخل رقم هاتف صحيحًا من 7 إلى 32 حرفًا.");
  if (value.address_line1.length < 3 || value.address_line1.length > 180) throw new Error("العنوان التفصيلي مطلوب ولا يتجاوز 180 حرفًا.");
  if (value.city.length < 2 || value.city.length > 100) throw new Error("المدينة مطلوبة ولا تتجاوز 100 حرف.");
  if (!/^[A-Z]{2}$/.test(value.country)) throw new Error("رمز الدولة يجب أن يتكون من حرفين، مثل YE.");
  if ((value.address_line2?.length ?? 0) > 180 || (value.region?.length ?? 0) > 100 ||
      (value.postal_code?.length ?? 0) > 24 || (value.delivery_instructions?.length ?? 0) > 1000) {
    throw new Error("أحد الحقول الاختيارية يتجاوز الحد المسموح.");
  }
  return value;
}

const requiredText = (row: Record<string, unknown>, key: string, max: number): string => {
  const value = row[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("سجل عنوان التوصيل غير صالح: " + key);
  }
  return value;
};
const optionalText = (row: Record<string, unknown>, key: string, max: number): string | null => {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.length > max) {
    throw new Error("سجل عنوان التوصيل غير صالح: " + key);
  }
  return value;
};
function parseCustomerAddress(value: unknown): CustomerAddress {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("استجابة عناوين التوصيل غير صالحة.");
  }
  const row = value as Record<string, unknown>;
  const id = row.id;
  if (typeof id !== "string" || !uuid.test(id)) throw new Error("معرّف عنوان التوصيل غير صالح.");
  const country = row.country;
  if (typeof country !== "string" || !/^[A-Z]{2}$/.test(country)) {
    throw new Error("رمز دولة عنوان التوصيل غير صالح.");
  }
  if (typeof row.is_default !== "boolean") throw new Error("حالة العنوان الافتراضي غير صالحة.");
  const createdAt = requiredText(row, "created_at", 64);
  const updatedAt = requiredText(row, "updated_at", 64);
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("تواريخ عنوان التوصيل غير صالحة.");
  }
  return {
    id,
    label: requiredText(row, "label", 50),
    recipient_name: requiredText(row, "recipient_name", 120),
    phone: requiredText(row, "phone", 32),
    address_line1: requiredText(row, "address_line1", 180),
    address_line2: optionalText(row, "address_line2", 180),
    city: requiredText(row, "city", 100),
    region: optionalText(row, "region", 100),
    postal_code: optionalText(row, "postal_code", 24),
    country,
    delivery_instructions: optionalText(row, "delivery_instructions", 1000),
    is_default: row.is_default,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export async function fetchCustomerAddresses(): Promise<CustomerAddress[]> {
  const { data, error } = await supabase.from("customer_addresses").select(COLUMNS)
    .order("is_default", { ascending: false }).order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error("تعذر تحميل عناوين التوصيل: " + error.message);
  if (data === null) return [];
  if (!Array.isArray(data)) throw new Error("استجابة عناوين التوصيل غير صالحة.");
  return data.map(parseCustomerAddress);
}
export async function saveCustomerAddress(input: CustomerAddressInput): Promise<string> {
  const v = validate(input);
  const { data, error } = await supabase.rpc("save_customer_address", {
    p_address_id: v.id ?? null, p_label: v.label, p_recipient_name: v.recipient_name,
    p_phone: v.phone, p_address_line1: v.address_line1, p_address_line2: v.address_line2 ?? null,
    p_city: v.city, p_region: v.region ?? null, p_postal_code: v.postal_code ?? null,
    p_country: v.country, p_delivery_instructions: v.delivery_instructions ?? null, p_is_default: v.is_default,
  });
  if (error) throw new Error("تعذر حفظ عنوان التوصيل: " + error.message);
  if (typeof data !== "string" || !uuid.test(data)) throw new Error("لم يؤكد الخادم حفظ العنوان؛ لم يتم عرض نجاح غير مثبت.");
  return data;
}
export async function deleteCustomerAddress(id: string): Promise<void> {
  const addressId = clean(id);
  if (!addressId) throw new Error("حدد عنوانًا صالحًا للحذف.");
  if (!uuid.test(addressId)) throw new Error("معرّف عنوان التوصيل غير صالح.");
  const { data, error } = await supabase.rpc("delete_customer_address", { p_address_id: addressId });
  if (error) throw new Error("تعذر حذف عنوان التوصيل: " + error.message);
  if (data !== true) throw new Error("لم يؤكد الخادم حذف العنوان.");
}
