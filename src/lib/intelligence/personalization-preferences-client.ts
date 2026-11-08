import { supabase } from "@/lib/supabase";
import {
  resolvePersonalizationExperience,
  type ExternalChannelConsent,
  type PersonalizationPreferences,
  type PersonalizationPreferencesUpdate,
} from "./personalization-governance";

type UnknownRecord = Record<string, unknown>;
type Failure = { ok: false; message: string };
export type PersonalizationSettingsSnapshot = {
  preferences: PersonalizationPreferences;
  externalConsents: ExternalChannelConsent[];
  consentReadStatus: "LOADED" | "UNAVAILABLE";
};
export type PersonalizationSettingsReadResult =
  | { ok: true; snapshot: PersonalizationSettingsSnapshot }
  | Failure;
export type PersonalizationSettingsSaveResult =
  | { ok: true; preferences: PersonalizationPreferences }
  | Failure;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord : null;
}

function safeMessage(error: unknown): string {
  const raw = record(error);
  const code = typeof raw?.code === "string" ? raw.code : "";
  if (code === "42501") return "لا تملك صلاحية قراءة إعدادات هذا الحساب.";
  if (code === "40001") return "تغيرت إعدادات الحساب في جلسة أخرى؛ أعد تحميلها قبل الحفظ.";
  if (code === "22023") return "رفض الخادم إعدادات غير صالحة.";
  return "تعذر الاتصال بمصدر إعدادات الخصوصية؛ لم تُحفظ قيم محلية.";
}

function parsePreferences(value: unknown, expectedProfileId: string): PersonalizationPreferences | null {
  const raw = record(value);
  if (!raw || raw.profileId !== expectedProfileId) return null;
  const candidate = value as PersonalizationPreferences;
  const experience = resolvePersonalizationExperience(candidate, new Date().toISOString());
  return experience.status === "READY" ? candidate : null;
}

const dataClasses = new Set([
  "GENERAL", "RECOMMENDATION", "ACCOUNT_STATEMENT", "SENSITIVE_TASK_LIST", "CUSTOMER_PERSONAL_DATA",
]);
const externalChannels = new Set(["EMAIL", "WHATSAPP", "SMS"]);

function parseConsents(value: unknown, profileId: string): ExternalChannelConsent[] | null {
  const root = record(value);
  if (!root || !Array.isArray(root.consents) || root.consents.length > 500) return null;
  const parsed: ExternalChannelConsent[] = [];
  const ids = new Set<string>();
  for (const item of root.consents) {
    const row = record(item);
    if (!row ||
        typeof row.id !== "string" || !row.id.trim() || ids.has(row.id) ||
        typeof row.organizationId !== "string" || !row.organizationId.trim() ||
        row.profileId !== profileId ||
        typeof row.channel !== "string" || !externalChannels.has(row.channel) ||
        typeof row.destinationId !== "string" || !row.destinationId.trim() ||
        typeof row.destinationLabel !== "string" || !row.destinationLabel.trim() ||
        typeof row.purpose !== "string" || !row.purpose.trim() ||
        !Array.isArray(row.dataClasses) || row.dataClasses.length === 0 ||
        row.dataClasses.some(value => typeof value !== "string" || !dataClasses.has(value)) ||
        typeof row.grantedAt !== "string" || !Number.isFinite(Date.parse(row.grantedAt)) ||
        (row.revokedAt !== null && (typeof row.revokedAt !== "string" || !Number.isFinite(Date.parse(row.revokedAt)))) ||
        typeof row.consentVersion !== "string" || !row.consentVersion.trim() ||
        row.source !== "EXPLICIT_USER_ACTION") return null;
    ids.add(row.id);
    parsed.push(row as unknown as ExternalChannelConsent);
  }
  return parsed.sort((a, b) => Date.parse(b.grantedAt) - Date.parse(a.grantedAt));
}

/** Reads account-scoped settings and consent records; tenant/profile scope is derived by the RPC. */
export async function fetchMyPersonalizationSettings(
  expectedProfileId: string,
): Promise<PersonalizationSettingsReadResult> {
  if (!expectedProfileId.trim()) return { ok: false, message: "جلسة الحساب غير صالحة." };
  try {
    const [preferencesResult, consentResult] = await Promise.all([
      supabase.rpc("fetch_my_personalization_preferences"),
      supabase.rpc("fetch_my_personalization_consents"),
    ]);
    if (preferencesResult.error) return { ok: false, message: safeMessage(preferencesResult.error) };
    const preferences = parsePreferences(preferencesResult.data, expectedProfileId);
    if (!preferences) {
      return { ok: false, message: "أعاد الخادم إعدادات ناقصة أو تخص ملفاً آخر؛ أُوقف العرض." };
    }
    if (consentResult.error) {
      return {
        ok: true,
        snapshot: { preferences, externalConsents: [], consentReadStatus: "UNAVAILABLE" },
      };
    }
    const externalConsents = parseConsents(consentResult.data, expectedProfileId);
    if (!externalConsents) {
      return {
        ok: true,
        snapshot: { preferences, externalConsents: [], consentReadStatus: "UNAVAILABLE" },
      };
    }
    return {
      ok: true,
      snapshot: { preferences, externalConsents, consentReadStatus: "LOADED" },
    };
  } catch {
    return { ok: false, message: "تعذر الوصول إلى خدمة إعدادات الخصوصية." };
  }
}

export async function saveMyPersonalizationPreferences(
  expectedProfileId: string,
  request: { expectedUpdatedAt: string; changes: PersonalizationPreferencesUpdate },
): Promise<PersonalizationSettingsSaveResult> {
  if (!expectedProfileId.trim() || !Number.isFinite(Date.parse(request.expectedUpdatedAt))) {
    return { ok: false, message: "إصدار إعدادات الحساب غير صالح." };
  }
  try {
    const { data, error } = await supabase.rpc("save_my_personalization_preferences", {
      p_expected_updated_at: request.expectedUpdatedAt,
      p_changes: request.changes,
    });
    if (error) return { ok: false, message: safeMessage(error) };
    const preferences = parsePreferences(data, expectedProfileId);
    if (!preferences) {
      return { ok: false, message: "لم يُرجع الخادم نسخة إعدادات مؤكدة لنفس الحساب؛ لم يُعرض نجاح." };
    }
    return { ok: true, preferences };
  } catch {
    return { ok: false, message: "تعذر تأكيد حفظ الإعدادات من الخادم." };
  }
}
export type PersonalizationConsentRevokeResult =
  | { ok: true; consent: ExternalChannelConsent }
  | Failure;

export async function revokeMyPersonalizationChannelConsent(
  expectedProfileId: string,
  request: { consentId: string; expectedGrantedAt: string },
): Promise<PersonalizationConsentRevokeResult> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!expectedProfileId.trim() || !uuidPattern.test(request.consentId) ||
      !Number.isFinite(Date.parse(request.expectedGrantedAt))) {
    return { ok: false, message: "معرّف الموافقة أو إصدارها غير صالح." };
  }
  try {
    const { data, error } = await supabase.rpc("revoke_my_personalization_channel_consent", {
      p_consent_id: request.consentId,
      p_expected_granted_at: request.expectedGrantedAt,
    });
    if (error) return { ok: false, message: safeMessage(error) };
    const parsed = parseConsents({ consents: [data] }, expectedProfileId);
    const consent = parsed?.[0];
    if (!consent || consent.id !== request.consentId || consent.revokedAt === null) {
      return { ok: false, message: "لم يرجع الخادم إلغاءً مؤكداً للموافقة نفسها؛ لم يُعرض نجاح." };
    }
    return { ok: true, consent };
  } catch {
    return { ok: false, message: "تعذر تأكيد إلغاء الموافقة من الخادم." };
  }
}
