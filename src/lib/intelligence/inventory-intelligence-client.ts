import { supabase } from "@/lib/supabase";
import type {
  DeadStockProductInput,
} from "./dead-stock";
import type { ReplenishmentProductInput } from "./replenishment";
import type { DataCompleteness, DataQuality, EvidencePeriod, EvidenceRecord, EvidenceSourceKind, EvidenceStatus, MetricSnapshot, MetricUnit } from "./types";

type UnknownRecord = Record<string, unknown>;
const evidenceStatuses = new Set<EvidenceStatus>(["VERIFIED","NEEDS_REVIEW","UNVERIFIED","UNAVAILABLE"]);
const completenessValues = new Set<DataCompleteness>(["COMPLETE","PARTIAL","UNKNOWN"]);
const qualityValues = new Set<DataQuality>(["ACCEPTABLE","WARNINGS","INVALID","UNKNOWN"]);
const units = new Set<MetricUnit>(["COUNT","RATIO","CURRENCY","CURRENCY_PER_UNIT","QUANTITY","DAYS","TEXT"]);
const sourceKinds = new Set<EvidenceSourceKind>(["TABLE","RPC","IMPORT_SNAPSHOT","LEDGER","MOVEMENT","SYSTEM_PROBE","MANUAL"]);

export interface InventoryIntelligenceData {
  asOf: string;
  period: EvidencePeriod;
  totalProducts: number;
  returnedProducts: number;
  evidenceRecords: EvidenceRecord[];
  deadStockProducts: DeadStockProductInput[];
  replenishmentProducts: ReplenishmentProductInput[];
  warnings: string[];
}
export type InventoryIntelligenceResult =
  | { ok: true; data: InventoryIntelligenceData }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "PARTIAL" | "ERROR"; message: string };

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}
function textValue(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function isoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && value.includes("T");
}
function isoDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function parsePeriod(value: unknown): EvidencePeriod | null {
  const raw = record(value);
  return raw && isoDay(raw.from) && isoDay(raw.to) && raw.from <= raw.to
    ? { from: raw.from, to: raw.to } : null;
}
function stringList(value: unknown, max = 2000): string[] | null {
  if (!Array.isArray(value) || value.length > max || value.some(item => !textValue(item, 500))) return null;
  return value as string[];
}
function parseEvidence(value: unknown, asOf: string): EvidenceRecord | null {
  const raw = record(value), source = record(raw?.source);
  if (
    !raw || !source ||
    !textValue(raw.id, 500) ||
    !textValue(source.name, 150) ||
    typeof source.kind !== "string" || !sourceKinds.has(source.kind as EvidenceSourceKind) ||
    !isoTimestamp(raw.sourceTimestamp) || !isoTimestamp(raw.asOf) || raw.asOf !== asOf ||
    (raw.period !== null && !parsePeriod(raw.period)) ||
    typeof raw.status !== "string" || !evidenceStatuses.has(raw.status as EvidenceStatus) ||
    typeof raw.completeness !== "string" || !completenessValues.has(raw.completeness as DataCompleteness) ||
    typeof raw.quality !== "string" || !qualityValues.has(raw.quality as DataQuality)
  ) return null;
  const warnings = stringList(raw.warnings, 100);
  if (!warnings) return null;
  return {
    id: raw.id,
    source: {
      kind: source.kind as EvidenceSourceKind,
      name: source.name,
      ...(textValue(source.recordId, 200) ? { recordId: source.recordId } : {}),
      ...(textValue(source.version, 80) ? { version: source.version } : {}),
    },
    sourceTimestamp: raw.sourceTimestamp,
    asOf,
    period: raw.period === null ? null : parsePeriod(raw.period),
    ...(textValue(raw.currency, 3) ? { currency: raw.currency } : {}),
    status: raw.status as EvidenceStatus,
    completeness: raw.completeness as DataCompleteness,
    quality: raw.quality as DataQuality,
    warnings,
  };
}
function parseMetric(value: unknown, asOf: string, expectedUnit: MetricUnit, expectedPeriod: EvidencePeriod | null): MetricSnapshot | null {
  const raw = record(value), lineage = record(raw?.lineage);
  const period = raw?.period === null ? null : parsePeriod(raw?.period);
  const evidenceIds = stringList(lineage?.evidenceIds, 1000);
  const transformations = stringList(lineage?.transformations, 50);
  if (
    !raw || !lineage ||
    !textValue(raw.id, 200) || !textValue(raw.key, 150) ||
    raw.unit !== expectedUnit || !units.has(raw.unit as MetricUnit) ||
    (raw.value !== null && typeof raw.value !== "number" && typeof raw.value !== "string") ||
    (typeof raw.value === "number" && !Number.isFinite(raw.value)) ||
    (typeof raw.value === "string" && raw.value.trim() !== "" && !Number.isFinite(Number(raw.value))) ||
    !textValue(raw.unitOfMeasure, 80) && expectedUnit === "QUANTITY" ||
    (raw.currency !== undefined && raw.currency !== null && !textValue(raw.currency, 3)) ||
    typeof raw.status !== "string" || !evidenceStatuses.has(raw.status as EvidenceStatus) ||
    typeof raw.completeness !== "string" || !completenessValues.has(raw.completeness as DataCompleteness) ||
    typeof raw.quality !== "string" || !qualityValues.has(raw.quality as DataQuality) ||
    !isoTimestamp(raw.asOf) || raw.asOf !== asOf ||
    (raw.period !== null && !period) ||
    (expectedPeriod && (!period || period.from !== expectedPeriod.from || period.to !== expectedPeriod.to)) ||
    (!expectedPeriod && period !== null) ||
    !evidenceIds || !transformations ||
    !isoTimestamp(lineage.calculatedAt) || lineage.calculatedAt !== asOf ||
    !textValue(lineage.formulaId, 150) || !textValue(lineage.formulaVersion, 80)
  ) return null;
  return {
    id: raw.id,
    key: raw.key,
    value: raw.value as number | string | null,
    unit: expectedUnit,
    ...(textValue(raw.currency, 3) ? { currency: raw.currency } : {}),
    ...(textValue(raw.unitOfMeasure, 80) ? { unitOfMeasure: raw.unitOfMeasure } : {}),
    status: raw.status as EvidenceStatus,
    completeness: raw.completeness as DataCompleteness,
    quality: raw.quality as DataQuality,
    period,
    asOf,
    lineage: {
      evidenceIds,
      calculatedAt: asOf,
      formulaId: lineage.formulaId,
      formulaVersion: lineage.formulaVersion,
      transformations,
    },
    warnings: stringList(raw.warnings, 100) ?? [],
  };
}
function safeError(error: unknown): { status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string } {
  const raw = record(error);
  if (raw?.code === "42501") return { status: "DENIED", message: "تتطلب قراءة بيانات المخزون صلاحية المدير أو مدير المؤسسة المالية." };
  if (raw?.code === "22023") return { status: "ERROR", message: "رفض الخادم نطاق تحليل المخزون أو تاريخه." };
  return { status: "UNAVAILABLE", message: "تعذر تحميل بيانات المخزون من قاعدة البيانات؛ لم تُعرض تقديرات بديلة." };
}

function parsePayload(value: unknown, requestedAsOf: string, period: EvidencePeriod): InventoryIntelligenceData | null {
  const raw = record(value), authorization = record(raw?.authorization);
  if (
    !raw || raw.status !== "OK" || raw.sideEffects !== "NONE" ||
    !isoTimestamp(raw.asOf) || Date.parse(raw.asOf) !== Date.parse(requestedAsOf) ||
    authorization?.tenantScope !== "SERVER_RESOLVED_AUTHENTICATED_TENANT" ||
    (authorization.effectiveRole !== "admin" && authorization.effectiveRole !== "manager") ||
    !Number.isInteger(raw.totalProducts) || (raw.totalProducts as number) < 1 ||
    raw.totalProducts !== raw.returnedProducts ||
    !Array.isArray(raw.deadStockProducts) || raw.deadStockProducts.length !== raw.totalProducts ||
    !Array.isArray(raw.replenishmentProducts) || raw.replenishmentProducts.length !== raw.totalProducts ||
    !Array.isArray(raw.evidenceRecords) || raw.evidenceRecords.length > 100000
  ) return null;
  const serverAsOf = raw.asOf as string;
  const returnedPeriod = parsePeriod(raw.period);
  if (!returnedPeriod || returnedPeriod.from !== period.from || returnedPeriod.to !== period.to) return null;
  const evidence = raw.evidenceRecords.map(item => parseEvidence(item, serverAsOf));
  if (evidence.some(item => item === null)) return null;
  const evidenceRecords = evidence as EvidenceRecord[];
  const evidenceIds = new Set<string>();
  for (const item of evidenceRecords) {
    if (evidenceIds.has(item.id)) return null;
    evidenceIds.add(item.id);
  }
  const resolvedMetric = (metric: MetricSnapshot) =>
    metric.status !== "VERIFIED" || metric.lineage.evidenceIds.length > 0 &&
      new Set(metric.lineage.evidenceIds).size === metric.lineage.evidenceIds.length &&
      metric.lineage.evidenceIds.every(id => evidenceIds.has(id));
  const deadStockProducts: DeadStockProductInput[] = [];
  const replenishmentProducts: ReplenishmentProductInput[] = [];
  const deadRefs = new Set<string>(), replenishRefs = new Set<string>();

  for (const item of raw.deadStockProducts) {
    const row = record(item), coverage = record(row?.movementCoverage);
    const coveragePeriod = parsePeriod(coverage?.period);
    const availableQuantity = parseMetric(row?.availableQuantity, serverAsOf, "QUANTITY", null);
    const soldQuantityWindow = parseMetric(row?.soldQuantityWindow, serverAsOf, "QUANTITY", period);
    const coverageEvidence = stringList(coverage?.evidenceIds, 100);
    if (
      !row || !textValue(row.productRef, 200) || deadRefs.has(row.productRef) ||
      !textValue(row.quantityUnit, 80) ||
      (row.lastMovementAt !== null && !isoTimestamp(row.lastMovementAt)) ||
      !coverage || coverage.status !== "VERIFIED" || coverage.completeness !== "COMPLETE" || coverage.quality !== "ACCEPTABLE" ||
      !coveragePeriod || coveragePeriod.from !== period.from || coveragePeriod.to !== period.to ||
      !coverageEvidence || coverageEvidence.length !== 1 ||
      coverageEvidence.some(id => !evidenceIds.has(id)) ||
      !availableQuantity || !soldQuantityWindow ||
      !resolvedMetric(availableQuantity) || !resolvedMetric(soldQuantityWindow) ||
      row.unitCost !== null || row.averageInventoryWindow !== null
    ) return null;
    deadRefs.add(row.productRef);
    deadStockProducts.push({
      productRef: row.productRef,
      lastMovementAt: row.lastMovementAt as string | null,
      movementCoverage: {
        status: "VERIFIED",
        period: coveragePeriod,
        completeness: "COMPLETE",
        quality: "ACCEPTABLE",
        evidenceIds: coverageEvidence,
      },
      availableQuantity,
      quantityUnit: row.quantityUnit,
      unitCost: null,
      soldQuantityWindow,
      averageInventoryWindow: null,
    });
  }

  for (const item of raw.replenishmentProducts) {
    const row = record(item);
    const availableToPromise = parseMetric(row?.availableToPromise, serverAsOf, "QUANTITY", null);
    const reorderPoint = parseMetric(row?.reorderPoint, serverAsOf, "QUANTITY", null);
    const soldQuantityWindow = parseMetric(row?.soldQuantityWindow, serverAsOf, "QUANTITY", period);
    const supplierLeadTimeDays = parseMetric(row?.supplierLeadTimeDays, serverAsOf, "DAYS", null);
    const incomingPurchaseQuantity = parseMetric(row?.incomingPurchaseQuantity, serverAsOf, "QUANTITY", null);
    if (
      !row || !textValue(row.productRef, 200) || replenishRefs.has(row.productRef) ||
      !textValue(row.quantityUnit, 80) ||
      !availableToPromise || !reorderPoint || !soldQuantityWindow || !supplierLeadTimeDays || !incomingPurchaseQuantity ||
      !resolvedMetric(availableToPromise) || !resolvedMetric(reorderPoint) ||
      !resolvedMetric(soldQuantityWindow) || !resolvedMetric(supplierLeadTimeDays) || !resolvedMetric(incomingPurchaseQuantity)
    ) return null;
    replenishRefs.add(row.productRef);
    replenishmentProducts.push({
      productRef: row.productRef,
      availableToPromise,
      reorderPoint,
      soldQuantityWindow,
      supplierLeadTimeDays,
      incomingPurchaseQuantity,
      quantityUnit: row.quantityUnit,
      minimumOrderQuantity: null,
      orderMultiple: null,
    });
  }
  if (deadRefs.size !== replenishRefs.size || [...deadRefs].some(id => !replenishRefs.has(id))) return null;
  return {
    asOf: serverAsOf,
    period,
    totalProducts: raw.totalProducts as number,
    returnedProducts: raw.returnedProducts as number,
    evidenceRecords,
    deadStockProducts,
    replenishmentProducts,
    warnings: stringList(raw.warnings, 100) ?? [],
  };
}

export function createInventoryIntelligencePeriod(now = new Date(), lookbackDays = 92): {
  asOf: string; period: EvidencePeriod;
} {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 180) {
    throw new Error("invalid inventory intelligence period");
  }
  const asOf = now.toISOString();
  const to = asOf.slice(0, 10);
  const fromDate = new Date(to + "T00:00:00.000Z");
  fromDate.setUTCDate(fromDate.getUTCDate() - (lookbackDays - 1));
  return { asOf, period: { from: fromDate.toISOString().slice(0, 10), to } };
}

export async function fetchInventoryIntelligence(period: EvidencePeriod, asOf: string): Promise<InventoryIntelligenceResult> {
  if (!isoDay(period.from) || !isoDay(period.to) || period.from > period.to ||
      !isoTimestamp(asOf) || period.to !== asOf.slice(0, 10)) {
    return { ok: false, status: "ERROR", message: "فترة تحليل المخزون غير صالحة." };
  }
  try {
    const { data, error } = await supabase.rpc("get_inventory_intelligence_aggregate", {
      p_period_from: period.from,
      p_period_to: period.to,
      p_as_of: asOf,
    });
    if (error) return { ok: false, ...safeError(error) };
    const raw = record(data);
    if (raw?.status === "PARTIAL") {
      return { ok: false, status: "PARTIAL", message: "عدد المنتجات يتجاوز حد التقرير الكامل؛ تم حجب النتائج الجزئية." };
    }
    if (raw?.status === "UNAVAILABLE") {
      return { ok: false, status: "UNAVAILABLE", message: "لا توجد منتجات نشطة موثقة في هذه المؤسسة." };
    }
    const parsed = parsePayload(data, asOf, period);
    return parsed ? { ok: true, data: parsed } : {
      ok: false, status: "ERROR", message: "حزمة أدلة المخزون غير مكتملة أو غير متطابقة؛ أُوقف العرض.",
    };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بخدمة ذكاء المخزون." };
  }
}
