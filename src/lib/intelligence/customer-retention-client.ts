import { supabase } from "@/lib/supabase";
import { buildCustomerRetentionReport, type CustomerRetentionCoverage, type CustomerRetentionRecord, type CustomerRetentionReport, type CustomerRetentionSaleRecord } from "./customer-retention";
import { buildGrowthOpportunityRadar, type GrowthOpportunityRadarResult, type GrowthOpportunitySignal } from "./growth-opportunities";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot } from "./types";

type UnknownRecord = Record<string, unknown>;
export interface CustomerRetentionGrowthInputs {
  evidenceRecords: EvidenceRecord[];
  metrics: MetricSnapshot[];
  signals: GrowthOpportunitySignal[];
  sourceSnapshotVerified: boolean;
}
export type CustomerRetentionAggregateResult =
  | {
      ok: true;
      data: CustomerRetentionReport;
      growthRadar: GrowthOpportunityRadarResult;
      growthInputs: CustomerRetentionGrowthInputs;
    }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUS = new Set(["VERIFIED", "NEEDS_REVIEW", "UNVERIFIED", "UNAVAILABLE"]);
const COMPLETENESS = new Set(["COMPLETE", "PARTIAL", "UNKNOWN"]);
const QUALITY = new Set(["ACCEPTABLE", "WARNINGS", "INVALID", "UNKNOWN"]);
const SOURCE_KINDS = new Set(["TABLE", "RPC", "IMPORT_SNAPSHOT", "LEDGER", "MOVEMENT", "SYSTEM_PROBE", "MANUAL"]);

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}
function nonEmpty(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function isoDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const time = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function isoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value));
}
function period(value: unknown): EvidencePeriod | null {
  const raw = record(value);
  if (!raw || !isoDay(raw.from) || !isoDay(raw.to) || raw.from > raw.to) return null;
  return { from: raw.from, to: raw.to };
}
function stringList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max || value.some(item => !nonEmpty(item, 500))) return null;
  return value as string[];
}
function snapshot(value: unknown, key: string, expectedPeriod: EvidencePeriod, asOf: string): MetricSnapshot | null {
  const raw = record(value);
  const lineage = record(raw?.lineage);
  const metricPeriod = period(raw?.period);
  const evidenceIds = stringList(lineage?.evidenceIds, 100);
  const numeric = typeof raw?.value === "number" ? raw.value
    : typeof raw?.value === "string" && raw.value.trim() ? Number(raw.value) : Number.NaN;
  const warnings = stringList(raw?.warnings, 100);
  if (
    !raw || !lineage || !metricPeriod || metricPeriod.from !== expectedPeriod.from ||
    metricPeriod.to !== expectedPeriod.to || raw.key !== key ||
    !nonEmpty(raw.id, 200) || !Number.isSafeInteger(numeric) || numeric < 0 ||
    raw.unit !== "COUNT" || raw.status !== "VERIFIED" ||
    raw.completeness !== "COMPLETE" || raw.quality !== "ACCEPTABLE" ||
    raw.asOf !== asOf || !evidenceIds || evidenceIds.length !== 1 ||
    !nonEmpty(lineage.formulaId, 160) || !nonEmpty(lineage.formulaVersion, 80) ||
    !isoTimestamp(lineage.calculatedAt) || Date.parse(lineage.calculatedAt) > Date.parse(asOf) ||
    !Array.isArray(lineage.transformations) ||
    lineage.transformations.some(item => !nonEmpty(item, 300)) || !warnings
  ) return null;
  return {
    id: raw.id, key, value: numeric, unit: "COUNT", status: "VERIFIED",
    completeness: "COMPLETE", quality: "ACCEPTABLE",
    period: metricPeriod, asOf,
    lineage: {
      evidenceIds, calculatedAt: lineage.calculatedAt,
      formulaId: lineage.formulaId, formulaVersion: lineage.formulaVersion,
      transformations: lineage.transformations as string[],
    },
    warnings,
  };
}
function evidence(value: unknown, asOf: string): EvidenceRecord | null {
  const raw = record(value);
  const source = record(raw?.source);
  const evidencePeriod = raw?.period === null ? null : period(raw?.period);
  const warnings = stringList(raw?.warnings, 100);
  if (
    !raw || !source || !nonEmpty(raw.id, 500) ||
    !nonEmpty(source.name, 150) || !SOURCE_KINDS.has(String(source.kind)) ||
    (source.recordId !== undefined && !nonEmpty(source.recordId, 200)) ||
    (source.version !== undefined && !nonEmpty(source.version, 80)) ||
    !isoTimestamp(raw.sourceTimestamp) || Date.parse(raw.sourceTimestamp) > Date.parse(asOf) ||
    raw.asOf !== asOf || (raw.period !== null && !evidencePeriod) ||
    !STATUS.has(String(raw.status)) || !COMPLETENESS.has(String(raw.completeness)) ||
    !QUALITY.has(String(raw.quality)) || !warnings
  ) return null;
  return {
    id: raw.id,
    source: {
      kind: source.kind as EvidenceRecord["source"]["kind"],
      name: source.name,
      ...(source.recordId ? { recordId: source.recordId as string } : {}),
      ...(source.version ? { version: source.version as string } : {}),
    },
    sourceTimestamp: raw.sourceTimestamp,
    asOf,
    period: evidencePeriod,
    status: raw.status as EvidenceRecord["status"],
    completeness: raw.completeness as EvidenceRecord["completeness"],
    quality: raw.quality as EvidenceRecord["quality"],
    warnings,
  };
}

export async function fetchCustomerRetentionAggregate(
  periodDays: 30 | 60 | 90 | 180 | 365,
  asOf: string,
): Promise<CustomerRetentionAggregateResult> {
  if (![30, 60, 90, 180, 365].includes(periodDays) || !isoTimestamp(asOf)) {
    return { ok: false, status: "ERROR", message: "فترة لقطة الاحتفاظ بالعملاء أو توقيتها غير صالح." };
  }
  try {
    const { data, error } = await supabase.rpc("get_customer_retention_aggregate", {
      p_period_days: periodDays,
      p_as_of: asOf,
    });
    if (error) {
      const code = record(error)?.code;
      if (code === "42501") return { ok: false, status: "DENIED", message: "تتطلب مؤشرات العملاء صلاحية موظف نشط داخل المؤسسة." };
      return { ok: false, status: "UNAVAILABLE", message: "تعذر تحميل مجتمع العملاء الكامل؛ لم تُعرض نسب احتفاظ تقديرية." };
    }
    const raw = record(data);
    const currentPeriod = period(raw?.period);
    const previousPeriod = period(raw?.previousPeriod);
    const coverageRaw = record(raw?.coverage);
    const evidenceRaw = raw?.evidenceRecords;
    const customersRaw = raw?.customers;
    const salesRaw = raw?.salesByCurrency;
    const warnings = stringList(raw?.warnings, 100);
    if (
      !raw || !nonEmpty(raw.id, 200) || raw.asOf !== asOf ||
      !currentPeriod || !previousPeriod || !coverageRaw ||
      raw.sideEffects !== "NONE" || !Array.isArray(evidenceRaw) || evidenceRaw.length > 10002 ||
      !Array.isArray(customersRaw) || customersRaw.length > 5000 ||
      !Array.isArray(salesRaw) || salesRaw.length > 10000 || !warnings
    ) {
      return { ok: false, status: "ERROR", message: "حزمة احتفاظ العملاء غير مكتملة أو لا تطابق لقطة الخادم؛ حُجبت المؤشرات." };
    }
    const evidenceRecords = evidenceRaw.map(item => evidence(item, asOf));
    if (evidenceRecords.some(item => item === null)) {
      return { ok: false, status: "ERROR", message: "تحتوي حزمة الاحتفاظ على أدلة مصدر غير صالحة؛ حُجبت المؤشرات." };
    }
    const safeEvidence = evidenceRecords as EvidenceRecord[];
    const evidenceIds = new Set(safeEvidence.map(item => item.id));
    if (evidenceIds.size !== safeEvidence.length) {
      return { ok: false, status: "ERROR", message: "تحتوي حزمة الاحتفاظ على معرفات أدلة مكررة؛ حُجبت المؤشرات." };
    }

    const customers: CustomerRetentionRecord[] = [];
    const retentionMetrics: MetricSnapshot[] = [];
    const growthSignals: GrowthOpportunitySignal[] = [];
    for (const item of customersRaw) {
      const customer = record(item);
      if (!customer || !nonEmpty(customer.customerRef, 200) ||
          (customer.lastOrderAt !== null && !isoTimestamp(customer.lastOrderAt))) {
        return { ok: false, status: "ERROR", message: "تحتوي حزمة العملاء على مرجع أو تاريخ نشاط غير صالح." };
      }
      const current = snapshot(customer.ordersCurrentPeriod, "customer.orders.current_period", currentPeriod, asOf);
      const previous = snapshot(customer.ordersPreviousPeriod, "customer.orders.previous_period", previousPeriod, asOf);
      if (!current || !previous ||
          current.lineage.evidenceIds.some(id => !evidenceIds.has(id)) ||
          previous.lineage.evidenceIds.some(id => !evidenceIds.has(id))) {
        return { ok: false, status: "ERROR", message: "تعذر ربط أعداد الطلبات بأدلة مصدر موثقة للفترة المطابقة." };
      }
      customers.push({
        customerRef: customer.customerRef,
        ordersCurrentPeriod: current,
        ordersPreviousPeriod: previous,
        lastOrderAt: customer.lastOrderAt as string | null,
      });

      retentionMetrics.push(current, previous);
      const currentOrders = Number(current.value);
      const previousOrders = Number(previous.value);
      if (currentOrders >= 2) {
        growthSignals.push({
          id: "customer-repeat-purchase:" + customer.customerRef,
          kind: "REPEAT_PURCHASE",
          subjectRef: customer.customerRef,
          observedMetricId: current.id,
          sampleMetricId: current.id,
        });
      }
      if (previousOrders >= 3 && currentOrders < previousOrders) {
        growthSignals.push({
          id: "customer-activity-decline:" + customer.customerRef,
          kind: "CUSTOMER_ACTIVITY_DECLINE",
          subjectRef: customer.customerRef,
          observedMetricId: current.id,
          sampleMetricId: current.id,
          baselineMetricId: previous.id,
        });
      }
    }

    const coverage: CustomerRetentionCoverage = {
      status: coverageRaw.status as CustomerRetentionCoverage["status"],
      completeness: coverageRaw.completeness as CustomerRetentionCoverage["completeness"],
      quality: coverageRaw.quality as CustomerRetentionCoverage["quality"],
      expectedCustomerCount: Number(coverageRaw.expectedCustomerCount),
      returnedCustomerCount: Number(coverageRaw.returnedCustomerCount),
      expectedSalesRecordCount: Number(coverageRaw.expectedSalesRecordCount),
      returnedSalesRecordCount: Number(coverageRaw.returnedSalesRecordCount),
      truncated: coverageRaw.truncated === true,
      evidenceIds: stringList(coverageRaw.evidenceIds, 20) ?? [],
    };
    if (
      !STATUS.has(String(coverage.status)) ||
      !COMPLETENESS.has(String(coverage.completeness)) ||
      !QUALITY.has(String(coverage.quality)) ||
      ![coverage.expectedCustomerCount,coverage.returnedCustomerCount,coverage.expectedSalesRecordCount,coverage.returnedSalesRecordCount]
        .every(value => Number.isSafeInteger(value) && value >= 0) ||
      coverage.evidenceIds.some(id => !evidenceIds.has(id))
    ) {
      return { ok: false, status: "ERROR", message: "بيانات تغطية مجتمع العملاء أو أدلة اكتمالها غير صالحة." };
    }

    // The current server endpoint intentionally returns no customer sales rows.
    // Do not synthesize sales concentration from order counts or commercial balances.
    if (salesRaw.length !== 0 || coverage.expectedSalesRecordCount !== 0 || coverage.returnedSalesRecordCount !== 0) {
      return { ok: false, status: "ERROR", message: "مصدر المبيعات لم يطابق عقد الاحتفاظ الحالي؛ حُجبت مؤشرات التركيز المالي." };
    }
    const salesByCurrency: CustomerRetentionSaleRecord[] = [];
    const report = buildCustomerRetentionReport({
      id: raw.id, asOf, period: currentPeriod, previousPeriod,
      evidenceRecords: safeEvidence, coverage, customers, salesByCurrency,
    });
    const sourceSnapshotVerified = report.status === "VERIFIED" &&
      coverage.status === "VERIFIED" && coverage.completeness === "COMPLETE" &&
      coverage.quality === "ACCEPTABLE" && !coverage.truncated &&
      coverage.returnedCustomerCount === coverage.expectedCustomerCount;
    const growthInputs: CustomerRetentionGrowthInputs = {
      evidenceRecords: safeEvidence,
      metrics: retentionMetrics,
      signals: growthSignals,
      sourceSnapshotVerified,
    };
    const growthRadar = buildGrowthOpportunityRadar({
      id: raw.id,
      generatedAt: asOf,
      asOf,
      evidenceRecords: safeEvidence,
      metrics: retentionMetrics,
      signals: growthSignals,
      sourceSnapshotVerified,
    });
    return { ok: true, data: report, growthRadar, growthInputs };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بخدمة تحليلات الاحتفاظ بالعملاء." };
  }
}
