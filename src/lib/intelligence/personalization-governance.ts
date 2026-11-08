export const PERSONALIZATION_POLICY_VERSION = "1.0.0";

export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL", "WHATSAPP", "SMS"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationLevel = "ALL" | "IMPORTANT" | "CRITICAL";
export type NotificationSeverity = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
export type NotificationDetailLevel = "SUMMARY" | "STANDARD";
export type NotificationDataClass =
  | "GENERAL"
  | "RECOMMENDATION"
  | "ACCOUNT_STATEMENT"
  | "SENSITIVE_TASK_LIST"
  | "CUSTOMER_PERSONAL_DATA";

export interface PersonalizationPreferencesUpdate {
  notificationChannels: NotificationChannel[];
  notificationLevel: NotificationLevel;
  quietHours: { enabled: boolean; startLocal: string; endLocal: string; timeZone: string };
  detailLevel: NotificationDetailLevel;
  reducedMotion: boolean;
  personalizationEnabled: boolean;
  externalProcessingEnabled: boolean;
}

export interface PersonalizationPreferences {
  schemaVersion: 1;
  organizationId: string;
  profileId: string;
  updatedAt: string;
  notificationChannels: NotificationChannel[];
  notificationLevel: NotificationLevel;
  quietHours: {
    enabled: boolean;
    startLocal: string;
    endLocal: string;
    timeZone: string;
  };
  detailLevel: NotificationDetailLevel;
  reducedMotion: boolean;
  personalizationEnabled: boolean;
  externalProcessingEnabled: boolean;
}

export interface ExternalChannelConsent {
  id: string;
  organizationId: string;
  profileId: string;
  channel: Exclude<NotificationChannel, "IN_APP">;
  destinationId: string;
  destinationLabel?: string;
  purpose: string;
  dataClasses: NotificationDataClass[];
  grantedAt: string;
  revokedAt: string | null;
  consentVersion: string;
  source: "EXPLICIT_USER_ACTION";
}

export interface NotificationRecipient {
  organizationId: string;
  profileId: string;
  destinationId: string | null;
  destinationVerified: boolean;
  authorizedForData: boolean;
}

export interface NotificationPolicyEvent {
  severity: NotificationSeverity;
  dataClass: NotificationDataClass;
  purpose: string;
}

export interface NotificationDeliveryInput {
  channel: NotificationChannel;
  event: NotificationPolicyEvent;
  recipient: NotificationRecipient;
  preferences: PersonalizationPreferences | null;
  channelCapabilities: Partial<Record<NotificationChannel, boolean>>;
  externalConsents?: ExternalChannelConsent[];
  asOf: string;
}

export type NotificationDeliveryReason =
  | "ALLOWED"
  | "PREFERENCES_NOT_LOADED"
  | "PREFERENCES_INVALID"
  | "PREFERENCES_SCOPE_MISMATCH"
  | "INVALID_EVENT"
  | "INVALID_AS_OF"
  | "CHANNEL_NOT_AVAILABLE"
  | "CHANNEL_DISABLED"
  | "RECIPIENT_CONTEXT_INVALID"
  | "RECIPIENT_NOT_AUTHORIZED"
  | "NOTIFICATION_LEVEL_FILTERED"
  | "QUIET_HOURS"
  | "QUIET_HOURS_TIMEZONE_INVALID"
  | "EXTERNAL_RECIPIENT_UNVERIFIED"
  | "EXTERNAL_CONSENT_REQUIRED"
  | "EXTERNAL_CONSENT_AMBIGUOUS"
  | "EXTERNAL_CONSENT_INVALID"
  | "EXTERNAL_CONSENT_REVOKED"
  | "EXTERNAL_CONSENT_SCOPE_MISMATCH";

export interface NotificationDeliveryDecision {
  status: "ALLOW" | "SUPPRESS" | "DENY" | "REVIEW";
  reason: NotificationDeliveryReason;
  channel: NotificationChannel;
  detailLevel: NotificationDetailLevel | null;
  reducedMotion: boolean | null;
  personalizationMode: "PERSONALIZED" | "ROLE_BASED_ONLY" | "UNAVAILABLE";
  externalContextAllowed: boolean;
}

export interface NotificationDeliveryAuditMetadata {
  eventType: "NOTIFICATION_DELIVERY_POLICY_EVALUATED";
  deliveryAttemptId: string;
  organizationId: string;
  recipientProfileId: string;
  actorProfileId: string;
  purpose: string;
  channel: NotificationChannel;
  severity: NotificationSeverity;
  dataClass: NotificationDataClass;
  policyVersion: string;
  preferencesUpdatedAt: string | null;
  decisionStatus: NotificationDeliveryDecision["status"];
  decisionReason: NotificationDeliveryReason;
  detailLevel: NotificationDeliveryDecision["detailLevel"];
  reducedMotion: NotificationDeliveryDecision["reducedMotion"];
  personalizationMode: NotificationDeliveryDecision["personalizationMode"];
  consentId: string | null;
  consentVersion: string | null;
  occurredAt: string;
}

/**
 * Produces payload-free, attempt-scoped metadata for the P2 transactional audit writer.
 * Recomputes the delivery decision and rejects caller-supplied decision drift.
 * The server must re-derive actor, tenant, recipient, capability and consent at write time.
 */
export function createNotificationDeliveryAuditMetadata(
  input: NotificationDeliveryInput & { deliveryAttemptId: string; actorProfileId: string },
  suppliedDecision: NotificationDeliveryDecision,
): NotificationDeliveryAuditMetadata | null {
  if (!input || typeof input !== "object" ||
      !suppliedDecision || typeof suppliedDecision !== "object" ||
      !isNonEmptyString(input.deliveryAttemptId) || input.deliveryAttemptId.length > 128 ||
      !isNonEmptyString(input.actorProfileId) || input.actorProfileId.length > 128 ||
      !isNonEmptyString(input.recipient?.organizationId) ||
      !isNonEmptyString(input.recipient?.profileId) ||
      !isNonEmptyString(input.event?.purpose) ||
      !Number.isFinite(Date.parse(input.asOf)) ||
      !knownChannels.has(input.channel) ||
      !validEvent(input.event)) {
    return null;
  }

  const expected = resolveNotificationDelivery(input);
  if (suppliedDecision.status !== expected.status ||
      suppliedDecision.reason !== expected.reason ||
      suppliedDecision.channel !== expected.channel ||
      suppliedDecision.detailLevel !== expected.detailLevel ||
      suppliedDecision.reducedMotion !== expected.reducedMotion ||
      suppliedDecision.personalizationMode !== expected.personalizationMode ||
      suppliedDecision.externalContextAllowed !== expected.externalContextAllowed) {
    return null;
  }

  let consentId: string | null = null;
  let consentVersion: string | null = null;
  if (input.channel !== "IN_APP") {
    const consentRows = Array.isArray(input.externalConsents) ? input.externalConsents : [];
    const matches = consentRows.filter(consent =>
      consent !== null && typeof consent === "object" &&
      consent.organizationId === input.recipient.organizationId &&
      consent.profileId === input.recipient.profileId &&
      consent.channel === input.channel &&
      consent.destinationId === input.recipient.destinationId &&
      consent.purpose === input.event.purpose,
    );
    if (matches.length === 1 &&
        isNonEmptyString(matches[0].id) &&
        isNonEmptyString(matches[0].consentVersion)) {
      consentId = matches[0].id;
      consentVersion = matches[0].consentVersion;
    }
  }

  return {
    eventType: "NOTIFICATION_DELIVERY_POLICY_EVALUATED",
    deliveryAttemptId: input.deliveryAttemptId,
    organizationId: input.recipient.organizationId,
    recipientProfileId: input.recipient.profileId,
    actorProfileId: input.actorProfileId,
    purpose: input.event.purpose,
    channel: input.channel,
    severity: input.event.severity,
    dataClass: input.event.dataClass,
    policyVersion: PERSONALIZATION_POLICY_VERSION,
    preferencesUpdatedAt: input.preferences?.updatedAt ?? null,
    decisionStatus: expected.status,
    decisionReason: expected.reason,
    detailLevel: expected.detailLevel,
    reducedMotion: expected.reducedMotion,
    personalizationMode: expected.personalizationMode,
    consentId,
    consentVersion,
    occurredAt: input.asOf,
  };
}

export interface PersonalizationExperience {
  status: "READY" | "REVIEW";
  mode: "PERSONALIZED" | "ROLE_BASED_ONLY" | "UNAVAILABLE";
  detailLevel: NotificationDetailLevel | null;
  reducedMotion: boolean | null;
  externalContextAllowed: boolean;
  reason: "READY" | "PREFERENCES_NOT_LOADED" | "PREFERENCES_INVALID";
}

const knownChannels = new Set<string>(NOTIFICATION_CHANNELS);
const knownSeverities = new Set<string>(["CRITICAL", "HIGH", "NORMAL", "LOW"]);
const knownDataClasses = new Set<string>([
  "GENERAL", "RECOMMENDATION", "ACCOUNT_STATEMENT", "SENSITIVE_TASK_LIST", "CUSTOMER_PERSONAL_DATA",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validTimeZone(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function validatePreferences(value: unknown, asOf: string): value is PersonalizationPreferences {
  if (!isRecord(value) || value.schemaVersion !== 1 ||
      !isNonEmptyString(value.organizationId) || !isNonEmptyString(value.profileId) ||
      !isNonEmptyString(value.updatedAt) || !Number.isFinite(Date.parse(value.updatedAt)) ||
      Date.parse(value.updatedAt) > Date.parse(asOf)) return false;

  if (!Array.isArray(value.notificationChannels) ||
      value.notificationChannels.some(channel => typeof channel !== "string" || !knownChannels.has(channel)) ||
      new Set(value.notificationChannels).size !== value.notificationChannels.length) return false;

  if (!["ALL", "IMPORTANT", "CRITICAL"].includes(String(value.notificationLevel)) ||
      !["SUMMARY", "STANDARD"].includes(String(value.detailLevel)) ||
      typeof value.reducedMotion !== "boolean" ||
      typeof value.personalizationEnabled !== "boolean" ||
      typeof value.externalProcessingEnabled !== "boolean") return false;

  const quiet = value.quietHours;
  if (!isRecord(quiet) || typeof quiet.enabled !== "boolean" ||
      !validTime(quiet.startLocal) || !validTime(quiet.endLocal) ||
      !validTimeZone(quiet.timeZone)) return false;
  if (quiet.enabled && quiet.startLocal === quiet.endLocal) return false;

  return true;
}

function validEvent(event: unknown): event is NotificationPolicyEvent {
  if (!isRecord(event)) return false;
  return knownSeverities.has(String(event.severity)) &&
    knownDataClasses.has(String(event.dataClass)) &&
    isNonEmptyString(event.purpose);
}

function isWithinQuietHours(at: string, quietHours: PersonalizationPreferences["quietHours"]): boolean | null {
  if (!quietHours.enabled) return false;

  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: quietHours.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;

    const current = hour * 60 + minute;
    const startParts = quietHours.startLocal.split(":").map(Number);
    const endParts = quietHours.endLocal.split(":").map(Number);
    const start = startParts[0] * 60 + startParts[1];
    const end = endParts[0] * 60 + endParts[1];
    return start < end ? current >= start && current < end : current >= start || current < end;
  } catch {
    return null;
  }
}

function passesNotificationLevel(
  severity: NotificationSeverity,
  level: NotificationLevel,
): boolean {
  if (severity === "CRITICAL") return true;
  if (level === "CRITICAL") return false;
  if (level === "IMPORTANT") return severity === "HIGH";
  return true;
}

function decision(
  input: NotificationDeliveryInput,
  status: NotificationDeliveryDecision["status"],
  reason: NotificationDeliveryReason,
  preferences?: PersonalizationPreferences,
): NotificationDeliveryDecision {
  return {
    status,
    reason,
    channel: input.channel,
    detailLevel: preferences?.detailLevel ?? null,
    reducedMotion: preferences?.reducedMotion ?? null,
    personalizationMode: preferences
      ? preferences.personalizationEnabled ? "PERSONALIZED" : "ROLE_BASED_ONLY"
      : "UNAVAILABLE",
    externalContextAllowed: Boolean(preferences?.externalProcessingEnabled),
  };
}

function externalConsentStatus(input: NotificationDeliveryInput, preferences: PersonalizationPreferences):
  { status: "ALLOW" } | { status: "DENY" | "REVIEW"; reason: NotificationDeliveryReason } {
  const recipient = input.recipient;
  if (!recipient || typeof recipient !== "object" ||
      !isNonEmptyString(recipient.organizationId) || !isNonEmptyString(recipient.profileId)) {
    return { status: "REVIEW", reason: "RECIPIENT_CONTEXT_INVALID" };
  }
  if (input.externalConsents !== undefined &&
      (!Array.isArray(input.externalConsents) ||
       input.externalConsents.some(consent => !consent || typeof consent !== "object"))) {
    return { status: "REVIEW", reason: "EXTERNAL_CONSENT_INVALID" };
  }
  if (!recipient.destinationVerified || !isNonEmptyString(recipient.destinationId)) {
    return { status: "DENY", reason: "EXTERNAL_RECIPIENT_UNVERIFIED" };
  }

  const matches = (input.externalConsents ?? []).filter(consent =>
    consent.organizationId === recipient.organizationId &&
    consent.profileId === recipient.profileId &&
    consent.channel === input.channel &&
    consent.destinationId === recipient.destinationId &&
    consent.purpose === input.event.purpose,
  );

  if (matches.length === 0) return { status: "DENY", reason: "EXTERNAL_CONSENT_REQUIRED" };
  if (matches.length !== 1) return { status: "REVIEW", reason: "EXTERNAL_CONSENT_AMBIGUOUS" };

  const consent = matches[0];
  if (!isNonEmptyString(consent.id) || !isNonEmptyString(consent.consentVersion) ||
      consent.source !== "EXPLICIT_USER_ACTION" ||
      !Array.isArray(consent.dataClasses) ||
      consent.dataClasses.some(dataClass => !knownDataClasses.has(dataClass)) ||
      !isNonEmptyString(consent.grantedAt) || !Number.isFinite(Date.parse(consent.grantedAt)) ||
      Date.parse(consent.grantedAt) > Date.parse(input.asOf) ||
      (consent.revokedAt !== null &&
        (!isNonEmptyString(consent.revokedAt) || !Number.isFinite(Date.parse(consent.revokedAt))))) {
    return { status: "REVIEW", reason: "EXTERNAL_CONSENT_INVALID" };
  }

  if (consent.revokedAt !== null && Date.parse(consent.revokedAt) <= Date.parse(input.asOf)) {
    return { status: "DENY", reason: "EXTERNAL_CONSENT_REVOKED" };
  }

  if (!consent.dataClasses.includes(input.event.dataClass) ||
      !preferences.notificationChannels.includes(input.channel)) {
    return { status: "DENY", reason: "EXTERNAL_CONSENT_SCOPE_MISMATCH" };
  }

  return { status: "ALLOW" };
}

export function createDefaultPersonalizationPreferences(input: {
  organizationId: string;
  profileId: string;
  savedAt: string;
  timeZone?: string;
}): PersonalizationPreferences {
  const timeZone = input.timeZone ?? "UTC";
  if (!isNonEmptyString(input.organizationId) || !isNonEmptyString(input.profileId) ||
      !isNonEmptyString(input.savedAt) || !Number.isFinite(Date.parse(input.savedAt)) ||
      !validTimeZone(timeZone)) {
    throw new Error("A valid tenant, profile, timestamp and IANA time zone are required.");
  }

  return {
    schemaVersion: 1,
    organizationId: input.organizationId,
    profileId: input.profileId,
    updatedAt: input.savedAt,
    notificationChannels: ["IN_APP"],
    notificationLevel: "ALL",
    quietHours: { enabled: false, startLocal: "22:00", endLocal: "07:00", timeZone },
    detailLevel: "SUMMARY",
    reducedMotion: false,
    personalizationEnabled: false,
    externalProcessingEnabled: false,
  };
}

export function resolvePersonalizationExperience(
  preferences: PersonalizationPreferences | null,
  asOf: string,
): PersonalizationExperience {
  if (!Number.isFinite(Date.parse(asOf))) {
    return {
      status: "REVIEW", mode: "UNAVAILABLE", detailLevel: null, reducedMotion: null,
      externalContextAllowed: false, reason: "PREFERENCES_INVALID",
    };
  }
  if (preferences === null) {
    return {
      status: "REVIEW", mode: "UNAVAILABLE", detailLevel: null, reducedMotion: null,
      externalContextAllowed: false, reason: "PREFERENCES_NOT_LOADED",
    };
  }
  if (!validatePreferences(preferences, asOf)) {
    return {
      status: "REVIEW", mode: "UNAVAILABLE", detailLevel: null, reducedMotion: null,
      externalContextAllowed: false, reason: "PREFERENCES_INVALID",
    };
  }

  return {
    status: "READY",
    mode: preferences.personalizationEnabled ? "PERSONALIZED" : "ROLE_BASED_ONLY",
    detailLevel: preferences.detailLevel,
    reducedMotion: preferences.reducedMotion,
    externalContextAllowed: preferences.externalProcessingEnabled,
    reason: "READY",
  };
}

export function resolveNotificationDelivery(
  input: NotificationDeliveryInput,
): NotificationDeliveryDecision {
  if (!Number.isFinite(Date.parse(input.asOf))) {
    return decision(input, "REVIEW", "INVALID_AS_OF");
  }
  if (!validatePreferences(input.preferences, input.asOf)) {
    return decision(input, input.preferences === null ? "REVIEW" : "REVIEW",
      input.preferences === null ? "PREFERENCES_NOT_LOADED" : "PREFERENCES_INVALID");
  }

  const preferences = input.preferences;
  if (!input.recipient || typeof input.recipient !== "object" ||
      !isNonEmptyString(input.recipient.organizationId) ||
      !isNonEmptyString(input.recipient.profileId)) {
    return decision(input, "REVIEW", "RECIPIENT_CONTEXT_INVALID", preferences);
  }
  if (preferences.organizationId !== input.recipient.organizationId ||
      preferences.profileId !== input.recipient.profileId) {
    return decision(input, "DENY", "PREFERENCES_SCOPE_MISMATCH", preferences);
  }
  if (!validEvent(input.event)) return decision(input, "REVIEW", "INVALID_EVENT", preferences);
  if (!knownChannels.has(input.channel)) return decision(input, "DENY", "CHANNEL_NOT_AVAILABLE", preferences);
  if (input.channelCapabilities?.[input.channel] !== true) {
    return decision(input, "DENY", "CHANNEL_NOT_AVAILABLE", preferences);
  }
  if (!preferences.notificationChannels.includes(input.channel)) {
    return decision(input, "SUPPRESS", "CHANNEL_DISABLED", preferences);
  }
  if (!isNonEmptyString(input.recipient.organizationId) ||
      !isNonEmptyString(input.recipient.profileId)) {
    return decision(input, "REVIEW", "RECIPIENT_CONTEXT_INVALID", preferences);
  }
  if (input.recipient.authorizedForData !== true) {
    return decision(input, "DENY", "RECIPIENT_NOT_AUTHORIZED", preferences);
  }
  if (!passesNotificationLevel(input.event.severity, preferences.notificationLevel)) {
    return decision(input, "SUPPRESS", "NOTIFICATION_LEVEL_FILTERED", preferences);
  }

  const quiet = isWithinQuietHours(input.asOf, preferences.quietHours);
  if (quiet === null) return decision(input, "REVIEW", "QUIET_HOURS_TIMEZONE_INVALID", preferences);
  if (quiet && input.event.severity !== "CRITICAL") {
    return decision(input, "SUPPRESS", "QUIET_HOURS", preferences);
  }

  if (input.channel !== "IN_APP") {
    const consent = externalConsentStatus(input, preferences);
    if (consent.status !== "ALLOW") {
      return decision(input, consent.status, consent.reason, preferences);
    }
  }

  return decision(input, "ALLOW", "ALLOWED", preferences);
}


export type PersonalizationSignalKind =
  | "WORK_ROLE"
  | "DECLARED_PREFERENCE"
  | "ESSENTIAL_WORK_CONTEXT"
  | "INFERRED_PERSONAL_TRAIT"
  | "SENSITIVE_ATTRIBUTE"
  | "PSYCHOLOGICAL_PROFILE"
  | "CUSTOMER_PERSONAL_DATA"
  | "FINANCIAL_RECORD"
  | "SENSITIVE_TASK_LIST";

export type ExternalPersonalizationSignalKind = "WORK_ROLE" | "DECLARED_PREFERENCE";

export interface PersonalizationSignal {
  id: string;
  organizationId: string;
  profileId: string;
  purpose: string;
  kind: PersonalizationSignalKind;
  verified: boolean;
  requiredForPurpose: boolean;
  declaredByUser: boolean;
}

export interface ExternalPersonalizationConsent {
  id: string;
  organizationId: string;
  profileId: string;
  provider: string;
  model: string;
  purpose: string;
  signalKinds: ExternalPersonalizationSignalKind[];
  grantedAt: string;
  revokedAt: string | null;
  consentVersion: string;
  source: "EXPLICIT_USER_ACTION";
}

export interface ResolvePersonalizationSignalsInput {
  preferences: PersonalizationPreferences | null;
  organizationId: string;
  profileId: string;
  purpose: string;
  destination: "INTERNAL" | "EXTERNAL_AI";
  provider?: string;
  model?: string;
  externalConsents?: ExternalPersonalizationConsent[];
  signals: PersonalizationSignal[];
  asOf: string;
}

export interface PersonalizationSignalsResult {
  status: "READY" | "PARTIAL" | "UNAVAILABLE" | "DENIED" | "REVIEW";
  includedSignalIds: string[];
  withheld: Array<{
    signalId: string;
    reason:
      | "DUPLICATE_SIGNAL_ID"
      | "SCOPE_MISMATCH"
      | "PURPOSE_MISMATCH"
      | "SIGNAL_NOT_VERIFIED"
      | "NOT_REQUIRED_FOR_PURPOSE"
      | "USER_DECLARATION_REQUIRED"
      | "PERSONALIZATION_NOT_ENABLED"
      | "EXTERNAL_PROCESSING_DISABLED"
      | "EXTERNAL_CONSENT_REQUIRED"
      | "EXTERNAL_CONSENT_SCOPE_MISMATCH"
      | "EXTERNAL_CONSENT_REVOKED"
      | "EXTERNAL_CONSENT_AMBIGUOUS"
      | "EXTERNAL_CONSENT_INVALID"
      | "DISALLOWED_SIGNAL_KIND";
  }>;
  reason: "READY" | "INVALID_INPUT" | "PREFERENCES_NOT_LOADED" | "PREFERENCES_INVALID" |
    "PREFERENCES_SCOPE_MISMATCH" | "EXTERNAL_PROCESSING_DISABLED" |
    "EXTERNAL_CONSENT_REQUIRED" | "EXTERNAL_CONSENT_AMBIGUOUS" |
    "EXTERNAL_CONSENT_INVALID" | "EXTERNAL_CONSENT_REVOKED" | "SIGNALS_WITHHELD" | "SIGNALS_UNAVAILABLE";
}

function validateExternalPersonalizationConsent(
  input: ResolvePersonalizationSignalsInput,
): {
  status: "ALLOW";
  reason: PersonalizationSignalsResult["reason"];
  consent: ExternalPersonalizationConsent;
} | {
  status: "DENY" | "REVIEW";
  reason: PersonalizationSignalsResult["reason"];
} {
  if (!input.preferences?.externalProcessingEnabled) {
    return { status: "DENY", reason: "EXTERNAL_PROCESSING_DISABLED" };
  }
  if (input.externalConsents !== undefined &&
      (!Array.isArray(input.externalConsents) ||
       input.externalConsents.some(consent => !consent || typeof consent !== "object"))) {
    return { status: "REVIEW", reason: "EXTERNAL_CONSENT_INVALID" };
  }
  if (!isNonEmptyString(input.provider) || !isNonEmptyString(input.model)) {
    return { status: "REVIEW", reason: "EXTERNAL_CONSENT_INVALID" };
  }

  const matches = (input.externalConsents ?? []).filter(consent =>
    consent.organizationId === input.organizationId &&
    consent.profileId === input.profileId &&
    consent.provider === input.provider &&
    consent.model === input.model &&
    consent.purpose === input.purpose,
  );

  if (matches.length === 0) return { status: "DENY", reason: "EXTERNAL_CONSENT_REQUIRED" };
  if (matches.length !== 1) return { status: "REVIEW", reason: "EXTERNAL_CONSENT_AMBIGUOUS" };

  const consent = matches[0];
  if (!isNonEmptyString(consent.id) || !isNonEmptyString(consent.consentVersion) ||
      consent.source !== "EXPLICIT_USER_ACTION" ||
      !Array.isArray(consent.signalKinds) ||
      consent.signalKinds.some(kind => kind !== "WORK_ROLE" && kind !== "DECLARED_PREFERENCE") ||
      !isNonEmptyString(consent.grantedAt) || !Number.isFinite(Date.parse(consent.grantedAt)) ||
      Date.parse(consent.grantedAt) > Date.parse(input.asOf) ||
      (consent.revokedAt !== null &&
        (!isNonEmptyString(consent.revokedAt) || !Number.isFinite(Date.parse(consent.revokedAt))))) {
    return { status: "REVIEW", reason: "EXTERNAL_CONSENT_INVALID" };
  }

  if (consent.revokedAt !== null && Date.parse(consent.revokedAt) <= Date.parse(input.asOf)) {
    return { status: "DENY", reason: "EXTERNAL_CONSENT_REVOKED" };
  }

  return { status: "ALLOW", reason: "READY", consent };
}

/**
 * Projects only signal identifiers. Values are intentionally not accepted or returned,
 * so callers can select the approved source records without passing a mixed payload.
 */
export function resolvePersonalizationSignals(
  input: ResolvePersonalizationSignalsInput,
): PersonalizationSignalsResult {
  if (!Number.isFinite(Date.parse(input.asOf)) ||
      !isNonEmptyString(input.organizationId) ||
      !isNonEmptyString(input.profileId) ||
      !isNonEmptyString(input.purpose) ||
      !Array.isArray(input.signals) ||
      (input.destination !== "INTERNAL" && input.destination !== "EXTERNAL_AI")) {
    return {
      status: "REVIEW", includedSignalIds: [], withheld: [], reason: "INVALID_INPUT",
    };
  }

  if (input.preferences === null) {
    return {
      status: "REVIEW", includedSignalIds: [], withheld: [], reason: "PREFERENCES_NOT_LOADED",
    };
  }
  if (!validatePreferences(input.preferences, input.asOf)) {
    return {
      status: "REVIEW", includedSignalIds: [], withheld: [], reason: "PREFERENCES_INVALID",
    };
  }
  if (input.preferences.organizationId !== input.organizationId ||
      input.preferences.profileId !== input.profileId) {
    return {
      status: "DENIED", includedSignalIds: [], withheld: [], reason: "PREFERENCES_SCOPE_MISMATCH",
    };
  }

  let externalConsent: ExternalPersonalizationConsent | null = null;
  if (input.destination === "EXTERNAL_AI") {
    const consentResult = validateExternalPersonalizationConsent(input);
    if (consentResult.status !== "ALLOW") {
      const reason = consentResult.reason;
      return {
        status: consentResult.status === "DENY" ? "DENIED" : "REVIEW",
        includedSignalIds: [],
        withheld: input.signals.map(signal => ({
          signalId: isNonEmptyString(signal?.id) ? signal.id : "UNKNOWN",
          reason: reason === "EXTERNAL_PROCESSING_DISABLED" ? "EXTERNAL_PROCESSING_DISABLED" :
            reason === "EXTERNAL_CONSENT_AMBIGUOUS" ? "EXTERNAL_CONSENT_AMBIGUOUS" :
            reason === "EXTERNAL_CONSENT_INVALID" ? "EXTERNAL_CONSENT_INVALID" :
            reason === "EXTERNAL_CONSENT_REVOKED" ? "EXTERNAL_CONSENT_REVOKED" :
            "EXTERNAL_CONSENT_REQUIRED",
        })),
        reason,
      };
    }
    externalConsent = consentResult.consent ?? null;
  }

  const counts = new Map<string, number>();
  for (const signal of input.signals) {
    if (isNonEmptyString(signal?.id)) counts.set(signal.id, (counts.get(signal.id) ?? 0) + 1);
  }

  const includedSignalIds: string[] = [];
  const withheld: PersonalizationSignalsResult["withheld"] = [];

  for (const signal of input.signals) {
    const id = isNonEmptyString(signal?.id) ? signal.id : "UNKNOWN";
    let reason: PersonalizationSignalsResult["withheld"][number]["reason"] | null = null;

    if (!isNonEmptyString(signal?.id) || (counts.get(id) ?? 0) !== 1) {
      reason = "DUPLICATE_SIGNAL_ID";
    } else if (signal.organizationId !== input.organizationId || signal.profileId !== input.profileId) {
      reason = "SCOPE_MISMATCH";
    } else if (signal.purpose !== input.purpose) {
      reason = "PURPOSE_MISMATCH";
    } else if (signal.verified !== true) {
      reason = "SIGNAL_NOT_VERIFIED";
    } else if (signal.requiredForPurpose !== true) {
      reason = "NOT_REQUIRED_FOR_PURPOSE";
    } else if (signal.kind === "WORK_ROLE") {
      if (input.destination === "EXTERNAL_AI" &&
          !externalConsent?.signalKinds.includes("WORK_ROLE")) {
        reason = "EXTERNAL_CONSENT_SCOPE_MISMATCH";
      }
    } else if (signal.kind === "ESSENTIAL_WORK_CONTEXT") {
      if (input.destination === "EXTERNAL_AI") reason = "DISALLOWED_SIGNAL_KIND";
    } else if (signal.kind === "DECLARED_PREFERENCE") {
      if (signal.declaredByUser !== true) reason = "USER_DECLARATION_REQUIRED";
      else if (!input.preferences.personalizationEnabled) reason = "PERSONALIZATION_NOT_ENABLED";
      else if (input.destination === "EXTERNAL_AI" &&
          !externalConsent?.signalKinds.includes("DECLARED_PREFERENCE")) {
        reason = "EXTERNAL_CONSENT_SCOPE_MISMATCH";
      }
    } else {
      reason = "DISALLOWED_SIGNAL_KIND";
    }

    if (reason) withheld.push({ signalId: id, reason });
    else includedSignalIds.push(id);
  }

  const status = includedSignalIds.length === 0
    ? "UNAVAILABLE"
    : withheld.length > 0 ? "PARTIAL" : "READY";
  return {
    status,
    includedSignalIds,
    withheld,
    reason: status === "READY" ? "READY" : status === "PARTIAL" ? "SIGNALS_WITHHELD" : "SIGNALS_UNAVAILABLE",
  };
}


export type PrivacyRequestAction = "ACCESS" | "CORRECTION" | "DELETION";
export type PrivacyRecordClass =
  | "GENERAL_PROFILE"
  | "DECLARED_PREFERENCE"
  | "OPERATIONAL_TASK"
  | "CUSTOMER_PERSONAL_DATA"
  | "FINANCIAL_RECORD"
  | "AUDIT_RECORD";

export interface PrivacyRetentionPolicyEvidence {
  id: string;
  status: "VERIFIED" | "NEEDS_REVIEW" | "UNVERIFIED" | "UNAVAILABLE";
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  quality: "ACCEPTABLE" | "WARNINGS" | "INVALID" | "UNKNOWN";
  sourceTimestamp: string;
  asOf: string;
}

export interface PrivacyRetentionPolicy {
  organizationId: string;
  recordClass: PrivacyRecordClass;
  purpose: string;
  policyVersion: string;
  retentionRule: "FIXED_UNTIL" | "INDEFINITE" | "NOT_REQUIRED";
  retainUntil: string | null;
  legalHold: boolean;
  supportsAccess: boolean;
  correctionMode: "DIRECT" | "APPEND_ONLY" | "UNSUPPORTED";
  supportsDeletion: boolean;
  evidence: PrivacyRetentionPolicyEvidence;
}

export interface PrivacyDataRequestInput {
  requestId: string;
  organizationId: string;
  actorProfileId: string;
  subjectProfileId: string;
  recordOrganizationId: string;
  recordRef: string;
  recordClass: PrivacyRecordClass;
  purpose: string;
  action: PrivacyRequestAction;
  actorAuthorized: boolean;
  subjectOwnershipVerified: boolean;
  asOf: string;
  policy: PrivacyRetentionPolicy | null;
}

export type PrivacyDataRequestReason =
  | "ELIGIBLE"
  | "INVALID_REQUEST"
  | "REQUESTER_NOT_AUTHORIZED"
  | "SUBJECT_OWNERSHIP_NOT_VERIFIED"
  | "RECORD_SCOPE_MISMATCH"
  | "RETENTION_POLICY_NOT_LOADED"
  | "RETENTION_POLICY_NOT_VERIFIED"
  | "RETENTION_POLICY_SCOPE_MISMATCH"
  | "RETENTION_POLICY_INVALID"
  | "LEGAL_HOLD_ACTIVE"
  | "RETENTION_NOT_EXPIRED"
  | "INDEFINITE_RETENTION"
  | "IMMUTABLE_RECORD"
  | "ACCESS_PROJECTION_UNAVAILABLE"
  | "CORRECTION_UNSUPPORTED"
  | "DELETION_UNSUPPORTED";

export interface PrivacyDataRequestDecision {
  status:
    | "ELIGIBLE_FOR_ACCESS_WORKFLOW"
    | "ELIGIBLE_FOR_CORRECTION_WORKFLOW"
    | "ELIGIBLE_FOR_APPEND_ONLY_CORRECTION"
    | "ELIGIBLE_FOR_DELETION_REVIEW"
    | "DENIED"
    | "REVIEW_REQUIRED"
    | "UNAVAILABLE";
  reason: PrivacyDataRequestReason;
  action: PrivacyRequestAction;
  recordClass: PrivacyRecordClass | null;
  retentionPolicyVersion: string | null;
  requiresHumanApproval: true;
  performsMutation: false;
}

const immutableRecordClasses = new Set<PrivacyRecordClass>(["FINANCIAL_RECORD", "AUDIT_RECORD"]);

function validPrivacyRetentionPolicy(
  policy: PrivacyRetentionPolicy,
  input: PrivacyDataRequestInput,
): boolean {
  const evidence = policy.evidence;
  if (!isNonEmptyString(policy.organizationId) ||
      policy.recordClass !== input.recordClass ||
      !isNonEmptyString(policy.purpose) ||
      !isNonEmptyString(policy.policyVersion) ||
      typeof policy.legalHold !== "boolean" ||
      typeof policy.supportsAccess !== "boolean" ||
      typeof policy.supportsDeletion !== "boolean" ||
      !["DIRECT", "APPEND_ONLY", "UNSUPPORTED"].includes(policy.correctionMode) ||
      !["FIXED_UNTIL", "INDEFINITE", "NOT_REQUIRED"].includes(policy.retentionRule)) {
    return false;
  }
  if (policy.retentionRule === "FIXED_UNTIL") {
    if (!isNonEmptyString(policy.retainUntil) || !Number.isFinite(Date.parse(policy.retainUntil))) return false;
  } else if (policy.retainUntil !== null) {
    return false;
  }

  return isNonEmptyString(evidence?.id) &&
    evidence.status === "VERIFIED" &&
    evidence.completeness === "COMPLETE" &&
    evidence.quality === "ACCEPTABLE" &&
    isNonEmptyString(evidence.sourceTimestamp) &&
    Number.isFinite(Date.parse(evidence.sourceTimestamp)) &&
    isNonEmptyString(evidence.asOf) &&
    Number.isFinite(Date.parse(evidence.asOf)) &&
    Date.parse(evidence.sourceTimestamp) <= Date.parse(evidence.asOf) &&
    Date.parse(evidence.asOf) <= Date.parse(input.asOf);
}

function privacyRequestDecision(
  input: PrivacyDataRequestInput,
  status: PrivacyDataRequestDecision["status"],
  reason: PrivacyDataRequestReason,
): PrivacyDataRequestDecision {
  return {
    status,
    reason,
    action: input.action,
    recordClass: input.recordClass ?? null,
    retentionPolicyVersion: input.policy?.policyVersion ?? null,
    requiresHumanApproval: true,
    performsMutation: false,
  };
}

/**
 * Decides eligibility only. The data-owning server service must enforce the same
 * policy, create the audited request, and execute its normal approval workflow.
 * This function never reads, changes, exports or deletes a record.
 */
export function resolvePrivacyDataRequest(
  input: PrivacyDataRequestInput,
): PrivacyDataRequestDecision {
  if (!isNonEmptyString(input.requestId) ||
      !isNonEmptyString(input.organizationId) ||
      !isNonEmptyString(input.actorProfileId) ||
      !isNonEmptyString(input.subjectProfileId) ||
      !isNonEmptyString(input.recordOrganizationId) ||
      !isNonEmptyString(input.recordRef) ||
      !isNonEmptyString(input.purpose) ||
      !Number.isFinite(Date.parse(input.asOf)) ||
      !["ACCESS", "CORRECTION", "DELETION"].includes(input.action)) {
    return privacyRequestDecision(input, "REVIEW_REQUIRED", "INVALID_REQUEST");
  }

  if (input.actorAuthorized !== true) {
    return privacyRequestDecision(input, "DENIED", "REQUESTER_NOT_AUTHORIZED");
  }
  if (input.subjectOwnershipVerified !== true) {
    return privacyRequestDecision(input, "DENIED", "SUBJECT_OWNERSHIP_NOT_VERIFIED");
  }
  if (input.recordOrganizationId !== input.organizationId) {
    return privacyRequestDecision(input, "DENIED", "RECORD_SCOPE_MISMATCH");
  }
  if (input.policy === null) {
    return privacyRequestDecision(input, "UNAVAILABLE", "RETENTION_POLICY_NOT_LOADED");
  }

  const policy = input.policy;
  if (policy.organizationId !== input.organizationId ||
      policy.recordClass !== input.recordClass ||
      policy.purpose !== input.purpose) {
    return privacyRequestDecision(input, "DENIED", "RETENTION_POLICY_SCOPE_MISMATCH");
  }
  if (!validPrivacyRetentionPolicy(policy, input)) {
    return privacyRequestDecision(input, "REVIEW_REQUIRED", "RETENTION_POLICY_NOT_VERIFIED");
  }

  if (input.action === "ACCESS") {
    if (!policy.supportsAccess) {
      return privacyRequestDecision(input, "UNAVAILABLE", "ACCESS_PROJECTION_UNAVAILABLE");
    }
    return privacyRequestDecision(input, "ELIGIBLE_FOR_ACCESS_WORKFLOW", "ELIGIBLE");
  }

  if (input.action === "CORRECTION") {
    if (policy.correctionMode === "UNSUPPORTED") {
      return privacyRequestDecision(input, "DENIED", "CORRECTION_UNSUPPORTED");
    }
    if (immutableRecordClasses.has(input.recordClass) && policy.correctionMode !== "APPEND_ONLY") {
      return privacyRequestDecision(input, "DENIED", "IMMUTABLE_RECORD");
    }
    return privacyRequestDecision(
      input,
      policy.correctionMode === "APPEND_ONLY"
        ? "ELIGIBLE_FOR_APPEND_ONLY_CORRECTION"
        : "ELIGIBLE_FOR_CORRECTION_WORKFLOW",
      "ELIGIBLE",
    );
  }

  if (immutableRecordClasses.has(input.recordClass)) {
    return privacyRequestDecision(input, "DENIED", "IMMUTABLE_RECORD");
  }
  if (policy.legalHold) {
    return privacyRequestDecision(input, "DENIED", "LEGAL_HOLD_ACTIVE");
  }
  if (policy.retentionRule === "INDEFINITE") {
    return privacyRequestDecision(input, "DENIED", "INDEFINITE_RETENTION");
  }
  if (policy.retentionRule === "FIXED_UNTIL" &&
      Date.parse(policy.retainUntil!) > Date.parse(input.asOf)) {
    return privacyRequestDecision(input, "DENIED", "RETENTION_NOT_EXPIRED");
  }
  if (!policy.supportsDeletion) {
    return privacyRequestDecision(input, "DENIED", "DELETION_UNSUPPORTED");
  }

  return privacyRequestDecision(input, "ELIGIBLE_FOR_DELETION_REVIEW", "ELIGIBLE");
}

export interface PrivacyAuditMetadata {
  eventType: "PRIVACY_DATA_REQUEST";
  requestId: string;
  organizationId: string;
  actorProfileId: string;
  subjectProfileId: string;
  recordRef: string;
  recordClass: PrivacyRecordClass;
  action: PrivacyRequestAction;
  purpose: string;
  decisionStatus: PrivacyDataRequestDecision["status"];
  decisionReason: PrivacyDataRequestReason;
  policyVersion: string | null;
  occurredAt: string;
  policyVersionSource: "VERIFIED_SOURCE" | "NOT_AVAILABLE";
}

/** Produces metadata for the P2 audit writer; never includes the record payload. */
export function createPrivacyAuditMetadata(
  input: PrivacyDataRequestInput,
  decision: PrivacyDataRequestDecision,
): PrivacyAuditMetadata | null {
  if (!isNonEmptyString(input.requestId) ||
      !isNonEmptyString(input.organizationId) ||
      !isNonEmptyString(input.actorProfileId) ||
      !isNonEmptyString(input.subjectProfileId) ||
      !isNonEmptyString(input.recordRef) ||
      !isNonEmptyString(input.purpose) ||
      !Number.isFinite(Date.parse(input.asOf)) ||
      decision.action !== input.action ||
      decision.recordClass !== input.recordClass) {
    return null;
  }
  const policyVersion = decision.retentionPolicyVersion;
  const verifiedPolicy = input.policy !== null &&
    input.policy.organizationId === input.organizationId &&
    input.policy.recordClass === input.recordClass &&
    input.policy.purpose === input.purpose &&
    validPrivacyRetentionPolicy(input.policy, input);
  const expectedDecision = resolvePrivacyDataRequest(input);
  if (expectedDecision.status !== decision.status || expectedDecision.reason !== decision.reason ||
      expectedDecision.retentionPolicyVersion !== decision.retentionPolicyVersion) return null;
  return {
    eventType: "PRIVACY_DATA_REQUEST",
    requestId: input.requestId,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    subjectProfileId: input.subjectProfileId,
    recordRef: input.recordRef,
    recordClass: input.recordClass,
    action: input.action,
    purpose: input.purpose,
    decisionStatus: decision.status,
    decisionReason: decision.reason,
    policyVersion,
    occurredAt: input.asOf,
    policyVersionSource: verifiedPolicy && policyVersion ? "VERIFIED_SOURCE" : "NOT_AVAILABLE",
  };
}


export interface PersonalizationUsageAuditMetadata {
  eventType: "PERSONALIZATION_CONTEXT_EVALUATED";
  organizationId: string;
  profileId: string;
  actorProfileId: string;
  purpose: string;
  destination: "INTERNAL" | "EXTERNAL_AI";
  provider: string | null;
  model: string | null;
  resultStatus: PersonalizationSignalsResult["status"];
  includedSignalIds: string[];
  withheldCount: number;
  withheldReasons: string[];
  consentId: string | null;
  consentVersion: string | null;
  occurredAt: string;
}

/**
 * Produces audit metadata only after recomputing the exact P3 decision.
 * The P2 audit writer must derive actor/tenant identity again on the server.
 */
export function createPersonalizationUsageAuditMetadata(
  input: ResolvePersonalizationSignalsInput & { actorProfileId: string },
  result: PersonalizationSignalsResult,
): PersonalizationUsageAuditMetadata | null {
  if (!isNonEmptyString(input.actorProfileId) ||
      input.actorProfileId !== input.profileId ||
      !Number.isFinite(Date.parse(input.asOf))) return null;

  const expected = resolvePersonalizationSignals(input);
  const sameIds = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value, index) => value === b[index]);
  const expectedWithheld = expected.withheld.map(item => item.signalId + ":" + item.reason);
  const actualWithheld = result.withheld.map(item => item.signalId + ":" + item.reason);
  if (expected.status !== result.status ||
      !sameIds(expected.includedSignalIds, result.includedSignalIds) ||
      !sameIds(expectedWithheld, actualWithheld) ||
      !sameIds([...expected.withheld].map(item => item.reason).sort(),
        [...result.withheld].map(item => item.reason).sort())) return null;

  let consentId: string | null = null;
  let consentVersion: string | null = null;
  if (input.destination === "EXTERNAL_AI") {
    const consent = validateExternalPersonalizationConsent(input);
    if (consent.status !== "ALLOW" || !consent.consent) return null;
    consentId = consent.consent.id;
    consentVersion = consent.consent.consentVersion;
  }

  const signalById = new Map(input.signals.map(signal => [signal.id, signal]));
  const includedSignalIds = [...result.includedSignalIds];
  if (includedSignalIds.some(id => !signalById.has(id))) return null;

  return {
    eventType: "PERSONALIZATION_CONTEXT_EVALUATED",
    organizationId: input.organizationId,
    profileId: input.profileId,
    actorProfileId: input.actorProfileId,
    purpose: input.purpose,
    destination: input.destination,
    provider: input.destination === "EXTERNAL_AI" ? input.provider ?? null : null,
    model: input.destination === "EXTERNAL_AI" ? input.model ?? null : null,
    resultStatus: result.status,
    includedSignalIds,
    withheldCount: result.withheld.length,
    withheldReasons: [...new Set(result.withheld.map(item => item.reason))].sort(),
    consentId,
    consentVersion,
    occurredAt: input.asOf,
  };
}
