import { supabase } from "@/lib/supabase";

export type CustomerActivationInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type CustomerActivationInvitation = {
  invitation_id: string;
  invited_email: string;
  status: CustomerActivationInvitationStatus;
  expires_at: string;
  created_at: string;
};

export type CustomerActivationWorkspace = {
  customer_id: string;
  customer_email: string | null;
  customer_status: string;
  is_linked: boolean;
  invitations: CustomerActivationInvitation[];
};

export type CreatedCustomerActivationInvitation = {
  invitation_id: string;
  customer_id: string;
  invited_email: string;
  token: string;
  expires_at: string;
  url: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_STATUSES = new Set<CustomerActivationInvitationStatus>(["pending", "accepted", "revoked", "expired"]);
const MAX_EXPIRY_CLOCK_SKEW_MS = 5 * 60 * 1000;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("استجابة الخادم غير صالحة.");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(label);
  return value;
}

function parseDate(value: unknown, label: string): string {
  const date = requiredString(value, label);
  if (!Number.isFinite(Date.parse(date))) throw new Error(label);
  return date;
}

export function normalizeCustomerActivationEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized) || normalized.length > 254) {
    throw new Error("أدخل بريدًا إلكترونيًا صحيحًا لا يتجاوز 254 حرفًا.");
  }
  return normalized;
}

export async function createCustomerActivationInvitation(
  customerId: string,
  email: string,
  expiresHours = 72,
): Promise<CreatedCustomerActivationInvitation> {
  if (!UUID_PATTERN.test(customerId)) throw new Error("معرّف العميل غير صالح.");
  const normalizedEmail = normalizeCustomerActivationEmail(email);
  if (!Number.isSafeInteger(expiresHours) || expiresHours < 1 || expiresHours > 168) {
    throw new Error("مدة الدعوة يجب أن تكون من ساعة إلى 168 ساعة.");
  }

  // Bound the accepted server expiry against the requested TTL while allowing
  // a small server/client clock skew. Re-check against response-time clock too:
  // the server response itself may arrive after a short-lived link has expired.
  const requestStartedAt = Date.now();
  const { data, error } = await supabase.rpc("create_customer_activation_invitation", {
    p_customer_id: customerId,
    p_email: normalizedEmail,
    p_expires_hours: expiresHours,
  });
  if (error) throw new Error("تعذر إنشاء دعوة تفعيل العميل: " + error.message);

  const row = record(data);
  const invitationId = requiredString(row.invitation_id, "لم يؤكد الخادم إنشاء الدعوة.");
  const returnedCustomerId = requiredString(row.customer_id, "رد الخادم بمعرّف عميل غير صالح.");
  const invitedEmail = requiredString(row.invited_email, "رد الخادم ببريد دعوة غير صالح.");
  const token = requiredString(row.token, "لم يرجع الخادم رمز الدعوة.");
  const expiresAt = parseDate(row.expires_at, "وقت انتهاء الدعوة غير صالح.");
  const expiresAtMs = Date.parse(expiresAt);
  const latestAllowedExpiry = requestStartedAt + expiresHours * 60 * 60 * 1000 + MAX_EXPIRY_CLOCK_SKEW_MS;
  if (expiresAtMs <= Date.now() || expiresAtMs > latestAllowedExpiry) {
    throw new Error("وقت انتهاء الدعوة خارج المدة المطلوبة.");
  }
  if (!UUID_PATTERN.test(invitationId) || returnedCustomerId !== customerId ||
      invitedEmail !== normalizedEmail || !TOKEN_PATTERN.test(token)) {
    throw new Error("لم يؤكد الخادم إنشاء دعوة تفعيل مطابقة للطلب.");
  }

  const url = new URL("/customer/activate/" + token.toLowerCase(), window.location.origin).toString();
  return {
    invitation_id: invitationId,
    customer_id: returnedCustomerId,
    invited_email: invitedEmail,
    token: token.toLowerCase(),
    expires_at: expiresAt,
    url,
  };
}

export async function fetchCustomerActivationWorkspace(customerId: string): Promise<CustomerActivationWorkspace> {
  if (!UUID_PATTERN.test(customerId)) throw new Error("معرّف العميل غير صالح.");
  const { data, error } = await supabase.rpc("list_customer_activation_invitations", {
    p_customer_id: customerId,
  });
  if (error) throw new Error("تعذر تحميل سجل دعوات تفعيل العميل: " + error.message);

  const row = record(data);
  const returnedCustomerId = requiredString(row.customer_id, "استجابة العميل غير مكتملة.");
  if (returnedCustomerId !== customerId || typeof row.customer_status !== "string" ||
      typeof row.is_linked !== "boolean" ||
      !(typeof row.customer_email === "string" || row.customer_email === null) ||
      !Array.isArray(row.invitations) || row.invitations.length > 20) {
    throw new Error("بيانات سجل دعوات العميل غير صالحة.");
  }

  const invitations = row.invitations.map((value): CustomerActivationInvitation => {
    const invite = record(value);
    const invitationId = requiredString(invite.invitation_id, "معرّف الدعوة غير صالح.");
    const email = requiredString(invite.invited_email, "بريد الدعوة غير صالح.");
    const status = invite.status;
    if (!UUID_PATTERN.test(invitationId) || !EMAIL_PATTERN.test(email) ||
        typeof status !== "string" || !INVITATION_STATUSES.has(status as CustomerActivationInvitationStatus)) {
      throw new Error("سجل دعوة تفعيل غير صالح.");
    }
    return {
      invitation_id: invitationId,
      invited_email: email,
      status: status as CustomerActivationInvitationStatus,
      expires_at: parseDate(invite.expires_at, "وقت انتهاء الدعوة غير صالح."),
      created_at: parseDate(invite.created_at, "وقت إنشاء الدعوة غير صالح."),
    };
  });

  return {
    customer_id: returnedCustomerId,
    customer_email: row.customer_email,
    customer_status: row.customer_status,
    is_linked: row.is_linked,
    invitations,
  };
}

export async function revokeCustomerActivationInvitation(invitationId: string): Promise<void> {
  if (!UUID_PATTERN.test(invitationId)) throw new Error("معرّف الدعوة غير صالح.");
  const { data, error } = await supabase.rpc("revoke_customer_activation_invitation", {
    p_invitation_id: invitationId,
  });
  if (error) throw new Error("تعذر إلغاء دعوة تفعيل العميل: " + error.message);
  if (data !== true) throw new Error("لم يؤكد الخادم إلغاء الدعوة.");
}

export async function acceptCustomerActivationInvitation(
  token: string,
): Promise<{ customer_id: string; business_name: string; email: string; status: "active" }> {
  if (!TOKEN_PATTERN.test(token)) throw new Error("رابط تفعيل الحساب غير صالح.");
  const { data, error } = await supabase.rpc("accept_customer_activation_invitation", {
    p_token: token.toLowerCase(),
  });
  if (error) throw new Error(error.message || "تعذر تفعيل حساب العميل.");

  const row = record(data);
  const customerId = requiredString(row.customer_id, "لم يؤكد الخادم ربط حساب العميل.");
  const businessName = requiredString(row.business_name, "اسم العميل غير موجود في استجابة الخادم.");
  const email = requiredString(row.email, "بريد الحساب غير مثبت في استجابة الخادم.");
  if (!UUID_PATTERN.test(customerId) || !EMAIL_PATTERN.test(email) || row.status !== "active") {
    throw new Error("لم يؤكد الخادم تفعيل حساب العميل.");
  }
  return { customer_id: customerId, business_name: businessName, email, status: "active" };
}
