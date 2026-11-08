import { supabase } from "./supabase";
import {
  buildCustomerRetentionReport,
  type CustomerRetentionCoverage,
  type CustomerRetentionRecord,
  type CustomerRetentionSaleRecord,
} from "./intelligence/customer-retention";
import type {
  CustomerRetentionReport,
  EvidenceRecord,
  EvidencePeriod,
  EvidenceStatus,
  MetricSnapshot,
} from "./intelligence";

type Row = Record<string, unknown>;

function object(value: unknown, label: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("بيانات " + label + " غير صالحة.");
  }
  return value as Row;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("حقل " + label + " مفقود أو غير صالح.");
  }
  return value;
}

function date(value: unknown, label: string): string {
  const result = text(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error("تاريخ " + label + " غير صالح.");
  return result;
}

function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("عدد " + label + " غير صالح.");
  }
  return value;
}

function period(value: unknown, label: string): EvidencePeriod {
  const row = object(value, label);
  const from = text(row.from, label + " بداية");
  const to = text(row.to, label + " نهاية");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error("نطاق " + label + " غير صالح.");
  }
  return { from, to };
}

function metric(value: unknown, label: string, expectedPeriod: EvidencePeriod, asOf: string): MetricSnapshot {
  const row = object(value, label);
  const lineage = object(row.lineage, label + " مصدر الحساب");
  const rawEvidenceIds = lineage.evidenceIds;
  if (!Array.isArray(rawEvidenceIds) || rawEvidenceIds.length !== 1 ||
      typeof rawEvidenceIds[0] !== "string" || !rawEvidenceIds[0].trim()) {
    throw new Error("دليل " + label + " غير مكتمل.");
  }
  const metricPeriod = period(row.period, label + " الفترة");
  if (metricPeriod.from !== expectedPeriod.from || metricPeriod.to !== expectedPeriod.to) {
    throw new Error("فترة " + label + " لا تطابق الفترة المطلوبة.");
  }
  const valueCount = count(row.value, label);
  const unit = row.unit;
  if (unit !== "COUNT" || row.status !== "VERIFIED" ||
      row.completeness !== "COMPLETE" || row.quality !== "ACCEPTABLE" ||
      text(row.asOf, label + " وقت القياس") !== asOf) {
    throw new Error("بيانات " + label + " غير مكتملة أو غير معتمدة.");
  }
  const transformations = lineage.transformations;
  if (!Array.isArray(transformations) || transformations.some(item => typeof item !== "string")) {
    throw new Error("سجل تحويل " + label + " غير صالح.");
  }
  return {
    id: text(row.id, label + " المعرف"),
    key: text(row.key, label + " المفتاح"),
    value: valueCount,
    unit: "COUNT",
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period: metricPeriod,
    asOf,
    lineage: {
      evidenceIds: rawEvidenceIds as string[],
      calculatedAt: date(lineage.calculatedAt, label + " وقت الحساب"),
      formulaId: text(lineage.formulaId, label + " المعادلة"),
      formulaVersion: text(lineage.formulaVersion, label + " إصدار المعادلة"),
      transformations: transformations as string[],
    },
    warnings: Array.isArray(row.warnings) ? row.warnings.filter((item): item is string => typeof item === "string") : [],
  };
}

function evidence(value: unknown, asOf: string): EvidenceRecord {
  const row = object(value, "دليل احتفاظ العملاء");
  const source = object(row.source, "مصدر دليل الاحتفاظ");
  const rawPeriod = row.period === null ? null : period(row.period, "فترة الدليل");
  const status = row.status;
  const completeness = row.completeness;
  const quality = row.quality;
  const kind = source.kind;
  if (!["VERIFIED", "NEEDS_REVIEW", "UNVERIFIED", "UNAVAILABLE"].includes(String(status)) ||
      !["COMPLETE", "PARTIAL", "UNKNOWN"].includes(String(completeness)) ||
      !["ACCEPTABLE", "WARNINGS", "INVALID", "UNKNOWN"].includes(String(quality)) ||
      kind !== "RPC" || row.asOf !== asOf) {
    throw new Error("حالة أو مصدر دليل الاحتفاظ غير صالح.");
  }
  return {
    id: text(row.id, "معرف الدليل"),
    source: {
      kind: "RPC",
      name: text(source.name, "اسم مصدر الدليل"),
      ...(typeof source.recordId === "string" ? { recordId: source.recordId } : {}),
      ...(typeof source.version === "string" ? { version: source.version } : {}),
    },
    sourceTimestamp: date(row.sourceTimestamp, "وقت مصدر الدليل"),
    asOf,
    period: rawPeriod,
    status: status as EvidenceStatus,
    completeness: completeness as EvidenceRecord["completeness"],
    quality: quality as EvidenceRecord["quality"],
    warnings: Array.isArray(row.warnings) ? row.warnings.filter((item): item is string => typeof item === "string") : [],
  };
}

function coverage(value: unknown): CustomerRetentionCoverage {
  const row = object(value, "تغطية مجتمع العملاء");
  const status = row.status;
  const completeness = row.completeness;
  const quality = row.quality;
  if (!["VERIFIED", "NEEDS_REVIEW", "UNVERIFIED", "UNAVAILABLE"].includes(String(status)) ||
      !["COMPLETE", "PARTIAL", "UNKNOWN"].includes(String(completeness)) ||
      !["ACCEPTABLE", "WARNINGS", "INVALID", "UNKNOWN"].includes(String(quality)) ||
      typeof row.truncated !== "boolean" ||
      !Array.isArray(row.evidenceIds) ||
      row.evidenceIds.some(id => typeof id !== "string")) {
    throw new Error("بيانات تغطية مجتمع العملاء غير صالحة.");
  }
  return {
    status: status as EvidenceStatus,
    completeness: completeness as CustomerRetentionCoverage["completeness"],
    quality: quality as CustomerRetentionCoverage["quality"],
    expectedCustomerCount: count(row.expectedCustomerCount, "العملاء المتوقعين"),
    returnedCustomerCount: count(row.returnedCustomerCount, "العملاء المعادين"),
    expectedSalesRecordCount: count(row.expectedSalesRecordCount, "سجلات المبيعات المتوقعة"),
    returnedSalesRecordCount: count(row.returnedSalesRecordCount, "سجلات المبيعات المعادة"),
    truncated: row.truncated,
    evidenceIds: row.evidenceIds as string[],
  };
}

export async function fetchCustomerRetentionReport(periodDays: 30 | 60 | 90 | 180 | 365 = 90): Promise<CustomerRetentionReport> {
  if (![30, 60, 90, 180, 365].includes(periodDays)) throw new Error("فترة تحليل الاحتفاظ غير مدعومة.");
  const { data, error } = await supabase.rpc("get_customer_retention_aggregate", {
    p_period_days: periodDays,
    p_as_of: new Date().toISOString(),
  });
  if (error) throw error;

  const root = object(data, "تقرير الاحتفاظ بالعملاء");
  const asOf = date(root.asOf, "وقت التقرير");
  const currentPeriod = period(root.period, "الفترة الحالية");
  const previousPeriod = period(root.previousPeriod, "الفترة السابقة");
  const rawCustomers = root.customers;
  const rawSales = root.salesByCurrency;
  const rawEvidence = root.evidenceRecords;
  if (!Array.isArray(rawCustomers) || !Array.isArray(rawSales) || !Array.isArray(rawEvidence)) {
    throw new Error("قوائم تقرير الاحتفاظ غير مكتملة.");
  }

  const customers: CustomerRetentionRecord[] = rawCustomers.map((value, index) => {
    const row = object(value, "العميل " + (index + 1));
    return {
      customerRef: text(row.customerRef, "مرجع العميل"),
      ordersCurrentPeriod: metric(row.ordersCurrentPeriod, "طلبات الفترة الحالية", currentPeriod, asOf),
      ordersPreviousPeriod: metric(row.ordersPreviousPeriod, "طلبات الفترة السابقة", previousPeriod, asOf),
      lastOrderAt: row.lastOrderAt === null ? null : date(row.lastOrderAt, "آخر طلب"),
    };
  });

  if (rawSales.length !== 0) {
    throw new Error("أعاد الخادم بيانات مبيعات مالية خارج نطاق تقرير نشاط العملاء.");
  }
  const salesByCurrency: CustomerRetentionSaleRecord[] = [];

  const evidenceRecords = rawEvidence.map(value => evidence(value, asOf));
  const rawId = root.id;
  const reportId = text(rawId, "معرف التقرير");
  const rawWarnings = root.warnings;
  const report = buildCustomerRetentionReport({
    id: reportId,
    asOf,
    period: currentPeriod,
    previousPeriod,
    coverage: coverage(root.coverage),
    customers,
    salesByCurrency,
    evidenceRecords,
  });
  if (Array.isArray(rawWarnings) && rawWarnings.some(item => typeof item === "string")) {
    report.warnings = [...new Set([...report.warnings, ...rawWarnings.filter((item): item is string => typeof item === "string")])];
  }
  return report;
}
