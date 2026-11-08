import type {
  DataCompleteness,
  DataQuality,
  EvidencePeriod,
  EvidenceRecord,
  EvidenceStatus,
} from "./types";

export type ShiftItemState = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "RESOLVED" | "UNKNOWN";
export type ShiftItemSeverity = "CRITICAL" | "WARNING" | "INFO";
export type ShiftQueueSourceKey =
  | "CONNECTIVITY" | "TASKS" | "ORDERS" | "INVOICES" | "RECEIPTS" | "PAYMENTS"
  | "CASH" | "MOVEMENTS" | "DELIVERIES" | "INVENTORY" | "REMINDERS" | "HANDOVER";
export type ShiftOperationalCheckState = "CLEAR" | "ACTION_REQUIRED" | "UNKNOWN" | "NOT_APPLICABLE";
export type ShiftCashState = "MATCHED" | "VARIANCE" | "NOT_RECORDED" | "NOT_APPLICABLE" | "UNKNOWN";

export interface ShiftSourceCoverage {
  key: ShiftQueueSourceKey;
  status: EvidenceStatus;
  completeness: DataCompleteness;
  quality: DataQuality;
  asOf: string | null;
  period: EvidencePeriod | null;
  freshnessLimitMinutes: number;
  expectedCount: number | null;
  returnedCount: number | null;
  completePopulation: boolean;
  notApplicable: boolean;
  closeCritical: boolean;
  evidenceIds: string[];
  message: string;
}

export interface ShiftQueueItem {
  id: string;
  sourceKey: ShiftQueueSourceKey;
  sourceRef: string;
  title: string;
  summary: string | null;
  state: ShiftItemState;
  severity: ShiftItemSeverity;
  updatedAt: string;
  ownerProfileId: string | null;
  dueAt: string | null;
  amount: number | null;
  currency: string | null;
  evidenceIds: string[];
}

export interface ShiftOperationalCheck {
  id: string;
  title: string;
  state: ShiftOperationalCheckState;
  message: string;
  count: number | null;
  relatedItems: ShiftQueueItem[];
  evidenceIds: string[];
}

export interface ShiftCashPointSnapshot {
  expected: number | null;
  counted: number | null;
  expectedEvidenceIds: string[];
  countEvidenceIds: string[];
  notApplicable: boolean;
}

export interface ShiftCashControlSnapshot {
  currency: string;
  sourceAsOf: string;
  opening: ShiftCashPointSnapshot;
  closing: ShiftCashPointSnapshot;
}

export interface ShiftCashPointResult {
  expected: number | null;
  counted: number | null;
  variance: number | null;
  state: ShiftCashState;
}

export interface ShiftCashControlResult {
  currency: string;
  sourceAsOf: string;
  opening: ShiftCashPointResult;
  closing: ShiftCashPointResult;
  evidenceIds: string[];
}

export interface ShiftHandoverSnapshot {
  required: boolean;
  previousShiftId: string | null;
  currentShiftId: string;
  outgoingOwnerProfileId: string | null;
  incomingOwnerProfileId: string | null;
  recordedAt: string | null;
  acceptedAt: string | null;
  reason: string | null;
  note: string | null;
  openItemRefs: string[];
  evidenceIds: string[];
}

export interface ShiftHandoverResult {
  state: "NOT_REQUIRED" | "ACCEPTED" | "PENDING" | "UNKNOWN";
  outgoingOwnerProfileId: string | null;
  incomingOwnerProfileId: string | null;
  recordedAt: string | null;
  acceptedAt: string | null;
  reason: string | null;
  note: string | null;
  openItemRefs: string[];
  evidenceIds: string[];
}

export interface ShiftOperationsSnapshot {
  id: string;
  shiftId: string;
  previousShiftId: string | null;
  shiftLabel: string;
  businessDate: string;
  organizationTimeZone: string;
  asOf: string;
  generatedAt: string;
  currentOwnerProfileId: string | null;
  sourceCoverage: ShiftSourceCoverage[];
  items: ShiftQueueItem[];
  cashControls: ShiftCashControlSnapshot[];
  handover: ShiftHandoverSnapshot;
  evidenceRecords: EvidenceRecord[];
}

export interface ShiftOperationsCenterResult {
  id: string;
  shiftId: string;
  previousShiftId: string | null;
  shiftLabel: string;
  businessDate: string;
  organizationTimeZone: string;
  asOf: string;
  generatedAt: string;
  currentOwnerProfileId: string | null;
  status: EvidenceStatus;
  openingReadiness: "READY" | "ATTENTION" | "UNKNOWN";
  operationalClose: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  financialClose: {
    state: "ELIGIBLE" | "BLOCKED" | "NOT_RECORDED" | "UNKNOWN";
    statement: string;
    blockers: string[];
  };
  openingChecks: ShiftOperationalCheck[];
  closingChecks: ShiftOperationalCheck[];
  cashControls: ShiftCashControlResult[];
  handover: ShiftHandoverResult;
  items: ShiftQueueItem[];
  sourceCoverage: ShiftSourceCoverage[];
  warnings: string[];
}

type UnknownRecord = Record<string, unknown>;
const evidenceStatuses = new Set<EvidenceStatus>(["VERIFIED", "NEEDS_REVIEW", "UNVERIFIED", "UNAVAILABLE"]);
const completenessStates = new Set<DataCompleteness>(["COMPLETE", "PARTIAL", "UNKNOWN"]);
const qualityStates = new Set<DataQuality>(["ACCEPTABLE", "WARNINGS", "INVALID", "UNKNOWN"]);
const evidenceKinds = new Set<EvidenceRecord["source"]["kind"]>([
  "TABLE", "RPC", "IMPORT_SNAPSHOT", "LEDGER", "MOVEMENT", "SYSTEM_PROBE", "MANUAL",
]);
const sourceKeys = new Set<ShiftQueueSourceKey>([
  "CONNECTIVITY", "TASKS", "ORDERS", "INVOICES", "RECEIPTS", "PAYMENTS",
  "CASH", "MOVEMENTS", "DELIVERIES", "INVENTORY", "REMINDERS", "HANDOVER",
]);
const itemStates = new Set<ShiftItemState>(["OPEN", "IN_PROGRESS", "BLOCKED", "RESOLVED", "UNKNOWN"]);
const severities = new Set<ShiftItemSeverity>(["CRITICAL", "WARNING", "INFO"]);
const currencyPattern = /^[A-Z]{3}$/;

/**
 * A cash amount must be representable as an exact, safe integer number of minor
 * currency units (two decimal places). Values with sub-cent precision or an
 * unsafe cent count are withheld instead of being rounded silently.
 */
export function isSafeShiftCashAmount(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return false;
  const scaled = value * 100;
  const cents = Math.round(scaled);
  return Number.isSafeInteger(cents) && Math.abs(scaled - cents) < 1e-7;
}

/** Returns null rather than reporting a cash variance outside safe cent precision. */
export function calculateShiftCashVariance(expected: number, counted: number): number | null {
  if (!isSafeShiftCashAmount(expected) || !isSafeShiftCashAmount(counted)) return null;
  const varianceCents = Math.round(counted * 100) - Math.round(expected * 100);
  if (!Number.isSafeInteger(varianceCents)) return null;
  return varianceCents / 100;
}

/** A match is exact at the currency's supported cent precision; no hidden tolerance is applied. */
export function classifyShiftCashVariance(variance: number | null): ShiftCashState {
  if (variance === null || !Number.isFinite(variance)) return "UNKNOWN";
  return variance === 0 ? "MATCHED" : "VARIANCE";
}

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord : null;
}
function text(value: unknown, max = 2000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function optionalText(value: unknown, max = 2000): value is string | null {
  return value === null || value === undefined || (typeof value === "string" && value.length <= max);
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value));
}
function day(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function amountValue(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}
function cashAmountValue(value: unknown): value is number | null {
  return value === null || isSafeShiftCashAmount(value);
}
function countValue(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}
function stringList(value: unknown, max = 500): string[] | null {
  if (!Array.isArray(value) || value.length > max || value.some(item => !text(item, 500))) return null;
  const rows = value as string[];
  return new Set(rows).size === rows.length ? rows : null;
}
function parsePeriod(value: unknown): EvidencePeriod | null {
  const raw = record(value);
  if (!raw || !day(raw.from) || !day(raw.to) || raw.from > raw.to) return null;
  return { from: raw.from, to: raw.to };
}
function parseEvidenceRecord(value: unknown): EvidenceRecord | null {
  const raw = record(value);
  const source = record(raw?.source);
  const period = raw?.period === null ? null : parsePeriod(raw?.period);
  const warnings = stringList(raw?.warnings, 100);
  if (!raw || !source || !text(raw.id, 500) || !text(source.name, 150) ||
      typeof source.kind !== "string" || !evidenceKinds.has(source.kind as EvidenceRecord["source"]["kind"]) ||
      !optionalText(source.recordId, 150) || !timestamp(raw.sourceTimestamp) || !timestamp(raw.asOf) ||
      (raw.period !== null && !period) ||
      !(raw.currency === null || raw.currency === undefined || (typeof raw.currency === "string" && currencyPattern.test(raw.currency))) ||
      typeof raw.status !== "string" || !evidenceStatuses.has(raw.status as EvidenceStatus) ||
      typeof raw.completeness !== "string" || !completenessStates.has(raw.completeness as DataCompleteness) ||
      typeof raw.quality !== "string" || !qualityStates.has(raw.quality as DataQuality) || !warnings) return null;
  return {
    id: raw.id,
    source: {
      kind: source.kind as EvidenceRecord["source"]["kind"],
      name: source.name,
      ...(typeof source.recordId === "string" ? { recordId: source.recordId } : {}),
    },
    sourceTimestamp: raw.sourceTimestamp,
    asOf: raw.asOf,
    period,
    ...(typeof raw.currency === "string" ? { currency: raw.currency } : {}),
    status: raw.status as EvidenceStatus,
    completeness: raw.completeness as DataCompleteness,
    quality: raw.quality as DataQuality,
    warnings,
  };
}
function parseCoverage(value: unknown): ShiftSourceCoverage | null {
  const raw = record(value);
  const period = raw?.period === null ? null : parsePeriod(raw?.period);
  const evidenceIds = stringList(raw?.evidenceIds, 1000);
  if (!raw || typeof raw.key !== "string" || !sourceKeys.has(raw.key as ShiftQueueSourceKey) ||
      typeof raw.status !== "string" || !evidenceStatuses.has(raw.status as EvidenceStatus) ||
      typeof raw.completeness !== "string" || !completenessStates.has(raw.completeness as DataCompleteness) ||
      typeof raw.quality !== "string" || !qualityStates.has(raw.quality as DataQuality) ||
      !(raw.asOf === null || timestamp(raw.asOf)) || (raw.period !== null && !period) ||
      !Number.isInteger(raw.freshnessLimitMinutes) || (raw.freshnessLimitMinutes as number) < 1 ||
      !countValue(raw.expectedCount) || !countValue(raw.returnedCount) ||
      typeof raw.completePopulation !== "boolean" || typeof raw.notApplicable !== "boolean" ||
      typeof raw.closeCritical !== "boolean" || !evidenceIds || !text(raw.message, 1000)) return null;
  return {
    key: raw.key as ShiftQueueSourceKey,
    status: raw.status as EvidenceStatus,
    completeness: raw.completeness as DataCompleteness,
    quality: raw.quality as DataQuality,
    asOf: raw.asOf as string | null,
    period,
    freshnessLimitMinutes: raw.freshnessLimitMinutes as number,
    expectedCount: raw.expectedCount as number | null,
    returnedCount: raw.returnedCount as number | null,
    completePopulation: raw.completePopulation,
    notApplicable: raw.notApplicable,
    closeCritical: raw.closeCritical,
    evidenceIds,
    message: raw.message,
  };
}
function parseQueueItem(value: unknown): ShiftQueueItem | null {
  const raw = record(value);
  const evidenceIds = stringList(raw?.evidenceIds, 100);
  if (!raw || !text(raw.id, 100) || typeof raw.sourceKey !== "string" ||
      !sourceKeys.has(raw.sourceKey as ShiftQueueSourceKey) || !text(raw.sourceRef, 200) ||
      !text(raw.title, 300) || !optionalText(raw.summary, 1000) ||
      typeof raw.state !== "string" || !itemStates.has(raw.state as ShiftItemState) ||
      typeof raw.severity !== "string" || !severities.has(raw.severity as ShiftItemSeverity) ||
      !timestamp(raw.updatedAt) || !optionalText(raw.ownerProfileId, 100) ||
      !optionalText(raw.dueAt, 100) || (raw.dueAt !== null && raw.dueAt !== undefined && !timestamp(raw.dueAt)) ||
      !amountValue(raw.amount) || !optionalText(raw.currency, 3) ||
      (raw.currency !== null && raw.currency !== undefined && !currencyPattern.test(raw.currency)) ||
      (raw.amount !== null && raw.amount !== undefined && !raw.currency) ||
      !evidenceIds) return null;
  return {
    id: raw.id,
    sourceKey: raw.sourceKey as ShiftQueueSourceKey,
    sourceRef: raw.sourceRef,
    title: raw.title,
    summary: typeof raw.summary === "string" ? raw.summary : null,
    state: raw.state as ShiftItemState,
    severity: raw.severity as ShiftItemSeverity,
    updatedAt: raw.updatedAt,
    ownerProfileId: typeof raw.ownerProfileId === "string" ? raw.ownerProfileId : null,
    dueAt: typeof raw.dueAt === "string" ? raw.dueAt : null,
    amount: typeof raw.amount === "number" ? raw.amount : null,
    currency: typeof raw.currency === "string" ? raw.currency : null,
    evidenceIds,
  };
}
function parseCashPoint(value: unknown): ShiftCashPointSnapshot | null {
  const raw = record(value);
  const expectedEvidenceIds = stringList(raw?.expectedEvidenceIds, 100);
  const countEvidenceIds = stringList(raw?.countEvidenceIds, 100);
  if (!raw || !cashAmountValue(raw.expected) || !cashAmountValue(raw.counted) ||
      !expectedEvidenceIds || !countEvidenceIds || typeof raw.notApplicable !== "boolean") return null;
  return {
    expected: raw.expected,
    counted: raw.counted,
    expectedEvidenceIds,
    countEvidenceIds,
    notApplicable: raw.notApplicable,
  };
}
function parseCashControl(value: unknown): ShiftCashControlSnapshot | null {
  const raw = record(value);
  const opening = parseCashPoint(raw?.opening);
  const closing = parseCashPoint(raw?.closing);
  if (!raw || typeof raw.currency !== "string" || !currencyPattern.test(raw.currency) ||
      !timestamp(raw.sourceAsOf) || !opening || !closing) return null;
  return { currency: raw.currency, sourceAsOf: raw.sourceAsOf, opening, closing };
}
function parseHandover(value: unknown): ShiftHandoverSnapshot | null {
  const raw = record(value);
  const openItemRefs = stringList(raw?.openItemRefs, 500);
  const evidenceIds = stringList(raw?.evidenceIds, 100);
  if (!raw || typeof raw.required !== "boolean" || !optionalText(raw.previousShiftId, 100) ||
      !text(raw.currentShiftId, 100) || !optionalText(raw.outgoingOwnerProfileId, 100) ||
      !optionalText(raw.incomingOwnerProfileId, 100) ||
      !(raw.recordedAt === null || timestamp(raw.recordedAt)) ||
      !(raw.acceptedAt === null || timestamp(raw.acceptedAt)) ||
      !optionalText(raw.reason, 1000) || !optionalText(raw.note, 2000) ||
      !openItemRefs || !evidenceIds) return null;
  if (raw.required && !raw.previousShiftId) return null;
  if (!raw.required && (raw.previousShiftId || raw.recordedAt || raw.acceptedAt)) return null;
  return {
    required: raw.required,
    previousShiftId: typeof raw.previousShiftId === "string" ? raw.previousShiftId : null,
    currentShiftId: raw.currentShiftId,
    outgoingOwnerProfileId: typeof raw.outgoingOwnerProfileId === "string" ? raw.outgoingOwnerProfileId : null,
    incomingOwnerProfileId: typeof raw.incomingOwnerProfileId === "string" ? raw.incomingOwnerProfileId : null,
    recordedAt: typeof raw.recordedAt === "string" ? raw.recordedAt : null,
    acceptedAt: typeof raw.acceptedAt === "string" ? raw.acceptedAt : null,
    reason: typeof raw.reason === "string" ? raw.reason : null,
    note: typeof raw.note === "string" ? raw.note : null,
    openItemRefs,
    evidenceIds,
  };
}

/** Strictly parse an authenticated, immutable, tenant-scoped shift workspace snapshot. */
export function parseShiftOperationsSnapshot(value: unknown): ShiftOperationsSnapshot | null {
  const raw = record(value);
  const sourceCoverage = Array.isArray(raw?.sourceCoverage) ? raw.sourceCoverage.map(parseCoverage) : null;
  const items = Array.isArray(raw?.items) ? raw.items.map(parseQueueItem) : null;
  const cashControls = Array.isArray(raw?.cashControls) ? raw.cashControls.map(parseCashControl) : null;
  const handover = parseHandover(raw?.handover);
  const evidenceRecords = Array.isArray(raw?.evidenceRecords) ? raw.evidenceRecords.map(parseEvidenceRecord) : null;
  const organizationTimeZone = typeof raw?.organizationTimeZone === "string" ? raw.organizationTimeZone : "";
  let validTimeZone = false;
  try {
    if (organizationTimeZone.trim()) {
      new Intl.DateTimeFormat("en-US", { timeZone: organizationTimeZone }).format(new Date());
      validTimeZone = true;
    }
  } catch { validTimeZone = false; }
  if (!raw || !text(raw.id, 100) || !text(raw.shiftId, 100) ||
      !(raw.previousShiftId === null || text(raw.previousShiftId, 100)) || !text(raw.shiftLabel, 160) ||
      !day(raw.businessDate) || !validTimeZone ||
      !timestamp(raw.asOf) || !timestamp(raw.generatedAt) ||
      !(raw.currentOwnerProfileId === null || text(raw.currentOwnerProfileId, 100)) ||
      Date.parse(raw.asOf) > Date.parse(raw.generatedAt) ||
      (raw.previousShiftId !== null && !text(raw.previousShiftId, 100)) ||
      !sourceCoverage || sourceCoverage.some(item => !item) ||
      !items || items.length > 500 || items.some(item => !item) ||
      !cashControls || cashControls.length > 20 || cashControls.some(item => !item) ||
      !handover || handover.currentShiftId !== raw.shiftId ||
      handover.previousShiftId !== (raw.previousShiftId ?? null) ||
      !evidenceRecords || evidenceRecords.length > 3000 || evidenceRecords.some(item => !item)) return null;
  if (new Set((sourceCoverage as ShiftSourceCoverage[]).map(item => item.key)).size !== sourceCoverage.length ||
      new Set((items as ShiftQueueItem[]).map(item => item.id)).size !== items.length ||
      new Set((cashControls as ShiftCashControlSnapshot[]).map(item => item.currency)).size !== cashControls.length ||
      new Set((evidenceRecords as EvidenceRecord[]).map(item => item.id)).size !== evidenceRecords.length) return null;
  return {
    id: raw.id,
    shiftId: raw.shiftId,
    previousShiftId: typeof raw.previousShiftId === "string" ? raw.previousShiftId : null,
    shiftLabel: raw.shiftLabel,
    businessDate: raw.businessDate,
    organizationTimeZone,
    asOf: raw.asOf,
    generatedAt: raw.generatedAt,
    currentOwnerProfileId: typeof raw.currentOwnerProfileId === "string" ? raw.currentOwnerProfileId : null,
    sourceCoverage: sourceCoverage as ShiftSourceCoverage[],
    items: items as ShiftQueueItem[],
    cashControls: cashControls as ShiftCashControlSnapshot[],
    handover,
    evidenceRecords: evidenceRecords as EvidenceRecord[],
  };
}

function evidenceIndex(snapshot: ShiftOperationsSnapshot): Map<string, EvidenceRecord> {
  return new Map(snapshot.evidenceRecords.map(item => [item.id, item]));
}
function verifiedEvidence(
  ids: string[],
  index: Map<string, EvidenceRecord>,
  asOf: string,
  period: EvidencePeriod | null,
): boolean {
  return ids.length > 0 && new Set(ids).size === ids.length && ids.every(id => {
    const item = index.get(id);
    return !!item &&
      item.status === "VERIFIED" &&
      item.completeness === "COMPLETE" &&
      item.quality === "ACCEPTABLE" &&
      Date.parse(item.sourceTimestamp) <= Date.parse(asOf) &&
      Date.parse(item.asOf) <= Date.parse(asOf) &&
      (period === null || (item.period !== null && item.period.from === period.from && item.period.to === period.to));
  });
}
function sourceCoverageReady(
  coverage: ShiftSourceCoverage | undefined,
  snapshot: ShiftOperationsSnapshot,
  index: Map<string, EvidenceRecord>,
): boolean {
  if (!coverage || coverage.notApplicable) return !!coverage?.notApplicable;
  const queueBacked = new Set<ShiftQueueSourceKey>([
    "TASKS", "ORDERS", "INVOICES", "RECEIPTS", "PAYMENTS", "MOVEMENTS", "DELIVERIES", "INVENTORY", "REMINDERS",
  ]);
  const rowCount = snapshot.items.filter(item => item.sourceKey === coverage.key).length;
  const representedCount = coverage.key === "CASH" ? snapshot.cashControls.length
    : coverage.key === "HANDOVER" ? (snapshot.handover.recordedAt ? 1 : 0) : null;
  if (coverage.status !== "VERIFIED" || coverage.completeness !== "COMPLETE" ||
      coverage.quality !== "ACCEPTABLE" || !coverage.completePopulation ||
      coverage.asOf === null || Date.parse(coverage.asOf) > Date.parse(snapshot.asOf) ||
      Date.parse(snapshot.generatedAt) - Date.parse(coverage.asOf) > coverage.freshnessLimitMinutes * 60_000 ||
      coverage.expectedCount === null || coverage.returnedCount === null ||
      coverage.returnedCount !== coverage.expectedCount ||
      (queueBacked.has(coverage.key) && coverage.returnedCount !== rowCount) ||
      (representedCount !== null && coverage.returnedCount !== representedCount) ||
      !verifiedEvidence(coverage.evidenceIds, index, snapshot.asOf, coverage.period)) return false;
  return true;
}
function coverageFor(snapshot: ShiftOperationsSnapshot, key: ShiftQueueSourceKey): ShiftSourceCoverage | undefined {
  return snapshot.sourceCoverage.find(item => item.key === key);
}
function validItem(
  item: ShiftQueueItem,
  snapshot: ShiftOperationsSnapshot,
  index: Map<string, EvidenceRecord>,
): boolean {
  const coverage = coverageFor(snapshot, item.sourceKey);
  return !!coverage && sourceCoverageReady(coverage, snapshot, index) &&
    Date.parse(item.updatedAt) <= Date.parse(snapshot.asOf) &&
    verifiedEvidence(item.evidenceIds, index, snapshot.asOf, coverage.period);
}
function safeItems(snapshot: ShiftOperationsSnapshot, index: Map<string, EvidenceRecord>, warnings: string[]): ShiftQueueItem[] {
  return snapshot.items.map(item => {
    if (validItem(item, snapshot, index)) return item;
    warnings.push("SHIFT_QUEUE_ITEM_WITHHELD:" + item.id);
    return { ...item, state: "UNKNOWN", ownerProfileId: null, dueAt: null, amount: null, currency: null, evidenceIds: [] };
  });
}
function check(
  id: string,
  title: string,
  key: ShiftQueueSourceKey,
  coverage: ShiftSourceCoverage | undefined,
  rows: ShiftQueueItem[],
  snapshot: ShiftOperationsSnapshot,
  evidence: Map<string, EvidenceRecord>,
): ShiftOperationalCheck {
  if (coverage?.notApplicable) return {
    id, title, state: "NOT_APPLICABLE", message: coverage.message, count: null, relatedItems: [], evidenceIds: coverage.evidenceIds,
  };
  if (!sourceCoverageReady(coverage, snapshot, evidence)) return {
    id, title, state: "UNKNOWN",
    message: coverage?.message ?? "لم يُرجع الخادم تغطية موثقة لهذا المصدر.",
    count: null, relatedItems: [], evidenceIds: [],
  };
  const relatedItems = rows.filter(item => item.sourceKey === key);
  const unresolved = relatedItems.filter(item => item.state !== "RESOLVED");
  if (unresolved.some(item => item.state === "UNKNOWN")) return {
    id, title, state: "UNKNOWN", message: "توجد سجلات لم يكتمل إثباتها؛ حُجبت من العد والتقييم.",
    count: null, relatedItems: unresolved, evidenceIds: coverage?.evidenceIds ?? [],
  };
  if (unresolved.length) return {
    id, title, state: "ACTION_REQUIRED", message: "توجد سجلات مفتوحة أو متعثرة تحتاج متابعة موثقة.",
    count: coverage?.completePopulation ? coverage.returnedCount : null,
    relatedItems: unresolved, evidenceIds: coverage?.evidenceIds ?? [],
  };
  return {
    id, title, state: "CLEAR", message: "المصدر مكتمل وحديث ولا توجد سجلات مفتوحة في التغطية المعروضة.",
    count: coverage?.completePopulation ? coverage.returnedCount : null,
    relatedItems: [], evidenceIds: coverage?.evidenceIds ?? [],
  };
}
function cashPoint(
  input: ShiftCashPointSnapshot,
  snapshot: ShiftOperationsSnapshot,
  index: Map<string, EvidenceRecord>,
  coverage: ShiftSourceCoverage | undefined,
): ShiftCashPointResult {
  if (input.notApplicable) return { expected: null, counted: null, variance: null, state: "NOT_APPLICABLE" };
  if (!sourceCoverageReady(coverage, snapshot, index)) return { expected: null, counted: null, variance: null, state: "UNKNOWN" };
  if (input.counted === null || input.countEvidenceIds.length === 0) return {
    expected: null, counted: null, variance: null, state: "NOT_RECORDED",
  };
  if (input.expected === null || input.expectedEvidenceIds.length === 0 ||
      !verifiedEvidence(input.expectedEvidenceIds, index, snapshot.asOf, coverage?.period ?? null) ||
      !verifiedEvidence(input.countEvidenceIds, index, snapshot.asOf, coverage?.period ?? null)) {
    return { expected: null, counted: null, variance: null, state: "UNKNOWN" };
  }
  const variance = calculateShiftCashVariance(input.expected, input.counted);
  if (variance === null) return { expected: null, counted: null, variance: null, state: "UNKNOWN" };
  return {
    expected: input.expected,
    counted: input.counted,
    variance,
    state: classifyShiftCashVariance(variance),
  };
}
function buildCashControls(
  snapshot: ShiftOperationsSnapshot,
  index: Map<string, EvidenceRecord>,
  warnings: string[],
): ShiftCashControlResult[] {
  const coverage = coverageFor(snapshot, "CASH");
  return snapshot.cashControls.map(item => {
    if (Date.parse(item.sourceAsOf) > Date.parse(snapshot.asOf)) warnings.push("FUTURE_CASH_SOURCE_AS_OF:" + item.currency);
    const opening = cashPoint(item.opening, snapshot, index, coverage);
    const closing = cashPoint(item.closing, snapshot, index, coverage);
    const ids = [
      ...item.opening.expectedEvidenceIds, ...item.opening.countEvidenceIds,
      ...item.closing.expectedEvidenceIds, ...item.closing.countEvidenceIds,
    ];
    const evidenceIds = unique(ids).filter(id => verifiedEvidence([id], index, snapshot.asOf, coverage?.period ?? null));
    return {
      currency: item.currency,
      sourceAsOf: item.sourceAsOf,
      opening: item.sourceAsOf <= snapshot.asOf ? opening : { expected: null, counted: null, variance: null, state: "UNKNOWN" },
      closing: item.sourceAsOf <= snapshot.asOf ? closing : { expected: null, counted: null, variance: null, state: "UNKNOWN" },
      evidenceIds,
    };
  });
}
function buildHandover(
  snapshot: ShiftOperationsSnapshot,
  rows: ShiftQueueItem[],
  index: Map<string, EvidenceRecord>,
): ShiftHandoverResult {
  const value = snapshot.handover;
  if (!value.required) return {
    state: "NOT_REQUIRED", outgoingOwnerProfileId: null, incomingOwnerProfileId: null,
    recordedAt: null, acceptedAt: null, reason: null, note: null, openItemRefs: [], evidenceIds: [],
  };
  const coverage = coverageFor(snapshot, "HANDOVER");
  if (!sourceCoverageReady(coverage, snapshot, index) || !value.recordedAt ||
      Date.parse(value.recordedAt) > Date.parse(snapshot.asOf) ||
      !value.outgoingOwnerProfileId || !value.incomingOwnerProfileId ||
      !verifiedEvidence(value.evidenceIds, index, snapshot.asOf, coverage?.period ?? null) ||
      value.openItemRefs.some(ref => !rows.some(item => item.sourceRef === ref && item.state !== "UNKNOWN" && item.state !== "RESOLVED"))) {
    return {
      state: "UNKNOWN", outgoingOwnerProfileId: null, incomingOwnerProfileId: null,
      recordedAt: null, acceptedAt: null,
      reason: "لم يكتمل إثبات سجل التسليم أو مرجع أحد العناصر المرحّلة.",
      note: null, openItemRefs: [], evidenceIds: [],
    };
  }
  if (!value.acceptedAt) return {
    state: "PENDING", outgoingOwnerProfileId: value.outgoingOwnerProfileId,
    incomingOwnerProfileId: value.incomingOwnerProfileId, recordedAt: value.recordedAt,
    acceptedAt: null, reason: value.reason ?? "سُجل التسليم ولم يُسجل قبول المستلم بعد.",
    note: value.note, openItemRefs: value.openItemRefs, evidenceIds: value.evidenceIds,
  };
  if (!timestamp(value.acceptedAt) || Date.parse(value.acceptedAt) < Date.parse(value.recordedAt) ||
      Date.parse(value.acceptedAt) > Date.parse(snapshot.asOf)) return {
    state: "UNKNOWN", outgoingOwnerProfileId: null, incomingOwnerProfileId: null,
    recordedAt: null, acceptedAt: null,
    reason: "توقيت قبول التسليم خارج نطاق اللقطة أو يسبق تسجيله.",
    note: null, openItemRefs: [], evidenceIds: [],
  };
  return {
    state: "ACCEPTED", outgoingOwnerProfileId: value.outgoingOwnerProfileId,
    incomingOwnerProfileId: value.incomingOwnerProfileId, recordedAt: value.recordedAt,
    acceptedAt: value.acceptedAt, reason: value.reason, note: value.note,
    openItemRefs: value.openItemRefs, evidenceIds: value.evidenceIds,
  };
}
function unique(values: string[]): string[] {
  return [...new Set(values)];
}
function buildCheck(
  snapshot: ShiftOperationsSnapshot,
  evidence: Map<string, EvidenceRecord>,
  rows: ShiftQueueItem[],
  key: ShiftQueueSourceKey,
  title: string,
): ShiftOperationalCheck {
  return check(key.toLowerCase(), title, key, coverageFor(snapshot, key), rows, snapshot, evidence);
}

/**
 * Build the opening/closeout decision packet from one server snapshot.
 * This function is read-only: it never creates shifts, counts cash, assigns work,
 * posts journals, moves stock or changes a source record.
 */
export function buildShiftOperationsCenter(value: unknown): ShiftOperationsCenterResult {
  const snapshot = parseShiftOperationsSnapshot(value);
  if (!snapshot) throw new Error("shift_operations_snapshot_invalid");
  const warnings: string[] = [];
  const evidence = evidenceIndex(snapshot);
  for (const item of snapshot.evidenceRecords) {
    if (Date.parse(item.sourceTimestamp) > Date.parse(snapshot.asOf) || Date.parse(item.asOf) > Date.parse(snapshot.asOf)) {
      warnings.push("SHIFT_EVIDENCE_AFTER_AS_OF:" + item.id);
    }
  }
  const rows = safeItems(snapshot, evidence, warnings);
  const cashControls = buildCashControls(snapshot, evidence, warnings);
  const handover = buildHandover(snapshot, rows, evidence);

  const openingChecks = [
    buildCheck(snapshot, evidence, rows, "CONNECTIVITY", "الاتصال والمزامنة"),
    buildCheck(snapshot, evidence, rows, "TASKS", "المهام العاجلة والمرحّلة"),
    buildCheck(snapshot, evidence, rows, "ORDERS", "طلبات اليوم غير المحسومة"),
    buildCheck(snapshot, evidence, rows, "INVENTORY", "مستوى المخزون والتنبيهات"),
    {
      id: "cash-opening",
      title: "عهدة الصندوق الافتتاحية",
      state: cashControls.length
        ? cashControls.every(item => item.opening.state === "MATCHED" || item.opening.state === "NOT_APPLICABLE") ? "CLEAR"
          : cashControls.some(item => item.opening.state === "UNKNOWN") ? "UNKNOWN" : "ACTION_REQUIRED"
        : coverageFor(snapshot, "CASH")?.notApplicable ? "NOT_APPLICABLE" : "UNKNOWN",
      message: cashControls.length ? "مصالحة افتتاح الصندوق معروضة منفصلة لكل عملة." : "لا توجد سجلات عهدة افتتاحية موثقة.",
      count: cashControls.length || null,
      relatedItems: [],
      evidenceIds: unique(cashControls.flatMap(item => item.evidenceIds)),
    } as ShiftOperationalCheck,
    {
      id: "previous-handover",
      title: "عمليات الوردية السابقة",
      state: handover.state === "NOT_REQUIRED" || handover.state === "ACCEPTED" ? "CLEAR"
        : handover.state === "PENDING" ? "ACTION_REQUIRED" : "UNKNOWN",
      message: handover.state === "NOT_REQUIRED" ? "لا توجد وردية سابقة تتطلب التسليم."
        : handover.state === "ACCEPTED" ? "تم توثيق قبول التسليم."
        : handover.state === "PENDING" ? "سجل التسليم موجود وينتظر قبول المستلم."
        : "التسليم أو مرجع العناصر السابقة غير متحقق.",
      count: handover.openItemRefs.length,
      relatedItems: rows.filter(item => handover.openItemRefs.includes(item.sourceRef)),
      evidenceIds: handover.evidenceIds,
    } as ShiftOperationalCheck,
  ];

  const closingKeys: Array<[ShiftQueueSourceKey, string]> = [
    ["TASKS", "المهام المفتوحة والمرحّلة"],
    ["ORDERS", "الطلبات غير المحسومة"],
    ["INVOICES", "الفواتير"],
    ["RECEIPTS", "الاستلامات الفعلية"],
    ["PAYMENTS", "المقبوضات والمدفوعات"],
    ["MOVEMENTS", "حركات المخزون غير المرسلة"],
    ["DELIVERIES", "تجهيزات التوصيل"],
    ["INVENTORY", "فروق المخزون والجرد"],
    ["REMINDERS", "التنبيهات والتذكيرات"],
  ];
  const closingChecks = closingKeys.map(([key, title]) => buildCheck(snapshot, evidence, rows, key, title));
  closingChecks.push({
    id: "cash-closing",
    title: "مصالحة الصندوق عند الإقفال",
    state: cashControls.length
      ? cashControls.every(item => item.closing.state === "MATCHED" || item.closing.state === "NOT_APPLICABLE") ? "CLEAR"
        : cashControls.some(item => item.closing.state === "UNKNOWN") ? "UNKNOWN" : "ACTION_REQUIRED"
      : coverageFor(snapshot, "CASH")?.notApplicable ? "NOT_APPLICABLE" : "UNKNOWN",
    message: "العد المتوقع والفعلي والفرق لا يجمع عبر العملات.",
    count: cashControls.length || null,
    relatedItems: [],
    evidenceIds: unique(cashControls.flatMap(item => item.evidenceIds)),
  });
  closingChecks.push({
    id: "handover-close",
    title: "تسليم المهام المتبقية",
    state: handover.state === "NOT_REQUIRED" || handover.state === "ACCEPTED" ? "CLEAR"
      : handover.state === "PENDING" ? "ACTION_REQUIRED" : "UNKNOWN",
    message: handover.state === "ACCEPTED" ? "سجل التسليم مقبول." : handover.reason ?? "حالة التسليم غير مكتملة.",
    count: handover.openItemRefs.length,
    relatedItems: rows.filter(item => handover.openItemRefs.includes(item.sourceRef)),
    evidenceIds: handover.evidenceIds,
  });

  const openingStates = openingChecks.map(item => item.state);
  const openingReadiness = openingStates.includes("UNKNOWN") ? "UNKNOWN"
    : openingStates.includes("ACTION_REQUIRED") ? "ATTENTION" : "READY";
  const closeStates = closingChecks.map(item => item.state);
  const operationalClose = closeStates.includes("UNKNOWN") ? "UNKNOWN"
    : closeStates.includes("ACTION_REQUIRED") ? "PARTIAL" : "COMPLETE";

  const financialBlockers: string[] = [];
  const criticalCoverage = snapshot.sourceCoverage.filter(item => item.closeCritical);
  if (!criticalCoverage.length) financialBlockers.push("لم يحدد الخادم قائمة المصادر الحرجة للإقفال المالي.");
  const unknownCritical = criticalCoverage.filter(item => !sourceCoverageReady(item, snapshot, evidence));
  if (unknownCritical.length) financialBlockers.push("تغطية غير مكتملة أو قديمة: " + unknownCritical.map(item => item.key).join("، "));
  const unresolvedCritical = rows.filter(item => {
    const coverage = coverageFor(snapshot, item.sourceKey);
    return coverage?.closeCritical && item.state !== "RESOLVED";
  });
  if (unresolvedCritical.length) financialBlockers.push("سجلات حرجة معلقة: " + unresolvedCritical.map(item => item.title).slice(0, 8).join("، "));
  const requiredFinancialSources: ShiftQueueSourceKey[] = [
    "ORDERS", "INVOICES", "RECEIPTS", "PAYMENTS", "CASH", "MOVEMENTS", "DELIVERIES", "INVENTORY",
  ];
  const missingCriticalSources = requiredFinancialSources.filter(key => {
    const coverage = coverageFor(snapshot, key);
    return !coverage || (!coverage.notApplicable && !coverage.closeCritical);
  });
  if (missingCriticalSources.length) financialBlockers.push("لم تُحدد أو تُرجع مصادر الإقفال الحرجة المطلوبة: " + missingCriticalSources.join("، "));
  const cashPoints = cashControls.flatMap(item => [item.opening, item.closing]);
  const cashNotRecorded = cashControls.length === 0
    ? !coverageFor(snapshot, "CASH")?.notApplicable
    : cashPoints.some(point => point.state === "NOT_RECORDED");
  const cashUnknown = cashPoints.some(point => point.state === "UNKNOWN");
  const cashVariance = cashPoints.some(point => point.state === "VARIANCE");
  if (cashVariance) financialBlockers.push("يوجد فرق نقدي لم تتم مراجعته حسب العملة.");
  if (handover.state === "PENDING") financialBlockers.push("تسليم الوردية السابقة لم يُقبل بعد.");
  if (handover.state === "UNKNOWN") financialBlockers.push("حالة تسليم الوردية غير متحققة.");
  if (cashUnknown) financialBlockers.push("إثبات العد أو رصيد الصندوق غير مكتمل.");

  const financialState = unknownCritical.length || missingCriticalSources.length || cashUnknown || handover.state === "UNKNOWN"
    ? "UNKNOWN"
    : financialBlockers.length ? "BLOCKED"
      : cashNotRecorded ? "NOT_RECORDED" : "ELIGIBLE";
  const financialStatement = financialState === "ELIGIBLE"
    ? "اكتملت المصادر الحرجة ومصالحة النقد؛ هذا يعني أهلية العرض على مراجع مخوّل فقط، وليس ترحيلاً أو إقفالاً مالياً."
    : financialState === "NOT_RECORDED" ? "لم يُسجل عدّ الإقفال لكل عملة؛ لا يمكن إعلان الإقفال المالي."
      : financialState === "BLOCKED" ? "توجد موانع موثقة تمنع أهلية الإقفال المالي؛ يمكن حفظ إقفال تشغيلي جزئي."
        : "لا تتوفر تغطية وإثباتات كافية للحكم على الإقفال المالي.";

  const normalizedCoverage = snapshot.sourceCoverage.map(item => {
    if (item.notApplicable || sourceCoverageReady(item, snapshot, evidence)) return item;
    warnings.push("SHIFT_SOURCE_NOT_ACCEPTED:" + item.key);
    return { ...item, status: item.status === "UNAVAILABLE" ? "UNAVAILABLE" as EvidenceStatus : "NEEDS_REVIEW" as EvidenceStatus };
  });
  const coverageComplete = normalizedCoverage.length > 0 &&
    normalizedCoverage.every(item => item.notApplicable || sourceCoverageReady(item, snapshot, evidence));
  const status: EvidenceStatus = coverageComplete && warnings.length === 0 && handover.state !== "UNKNOWN"
    ? "VERIFIED"
    : snapshot.sourceCoverage.length === 0 ? "UNAVAILABLE" : "NEEDS_REVIEW";

  return {
    id: snapshot.id,
    shiftId: snapshot.shiftId,
    previousShiftId: snapshot.previousShiftId,
    shiftLabel: snapshot.shiftLabel,
    businessDate: snapshot.businessDate,
    organizationTimeZone: snapshot.organizationTimeZone,
    asOf: snapshot.asOf,
    generatedAt: snapshot.generatedAt,
    currentOwnerProfileId: snapshot.currentOwnerProfileId,
    status,
    openingReadiness,
    operationalClose,
    financialClose: { state: financialState, statement: financialStatement, blockers: financialBlockers },
    openingChecks,
    closingChecks,
    cashControls,
    handover,
    items: rows,
    sourceCoverage: normalizedCoverage,
    warnings: unique(warnings),
  };
}
