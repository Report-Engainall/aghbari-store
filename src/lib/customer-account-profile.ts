import { supabase } from "@/lib/supabase";

export type CustomerAccountStatus = "pending" | "approved" | "rejected" | "frozen" | "blocked" | "archived";

export type CustomerAccountProfile = {
  customer_code: string;
  status: CustomerAccountStatus;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  updated_at: string;
};

export type CustomerAccountProfileInput = {
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
};

function parseCustomerAccountProfile(value: unknown): CustomerAccountProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("أعاد الخادم بيانات ملف تجاري غير مكتملة.");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.customer_code !== "string" ||
    typeof row.status !== "string" ||
    !["pending", "approved", "rejected", "frozen", "blocked", "archived"].includes(row.status) ||
    typeof row.business_name !== "string" ||
    !(row.contact_name === null || typeof row.contact_name === "string") ||
    !(row.phone === null || typeof row.phone === "string") ||
    !(row.email === null || typeof row.email === "string") ||
    typeof row.updated_at !== "string" ||
    !Number.isFinite(Date.parse(row.updated_at))
  ) {
    throw new Error("لم تطابق بيانات الملف التجاري العقد المصرح به.");
  }
  return {
    customer_code: row.customer_code,
    status: row.status as CustomerAccountStatus,
    business_name: row.business_name,
    contact_name: row.contact_name,
    phone: row.phone,
    email: row.email,
    updated_at: row.updated_at,
  };
}

export async function fetchMyCustomerAccountProfile(): Promise<CustomerAccountProfile> {
  const { data, error } = await supabase.rpc("get_my_customer_account_profile");
  if (error) {
    throw new Error("تعذر تحميل الملف التجاري المرتبط بالحساب. يلزم أن يكون الحساب هو المالك الأساسي لملف العميل.");
  }
  return parseCustomerAccountProfile(data);
}

export async function saveMyCustomerAccountProfile(
  input: CustomerAccountProfileInput,
  expectedUpdatedAt: string,
): Promise<CustomerAccountProfile> {
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new Error("تعذر حفظ الملف التجاري: لقطة البيانات القديمة غير صالحة.");
  }
  const { data, error } = await supabase.rpc("update_my_customer_account_profile", {
    p_business_name: input.businessName,
    p_contact_name: input.contactName,
    p_phone: input.phone,
    p_email: input.email,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("account changed") || message.includes("reload the profile")) {
      throw new Error("تم تعديل بيانات الحساب في جلسة أخرى. حدّث الصفحة قبل حفظ تغييرات جديدة.");
    }
    throw new Error("رفض الخادم تعديل الملف التجاري أو تعذر حفظه. راجع المدخلات وصلاحية ملكية الحساب.");
  }
  return parseCustomerAccountProfile(data);
}
