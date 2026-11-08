import { supabase } from "@/lib/supabase";

export type CommercePolicySourceTable =
  | "pricing_rules" | "promotions" | "customers" | "products" | "inventory_balances";
export type CommercePolicyKey =
  | "PRICING_RULE" | "PROMOTION" | "CUSTOMER_CREDIT" | "PRODUCT_ORDER_QUANTITY" | "INVENTORY_REORDER_POINT";
export type CommercePolicySimulationType =
  | "PROMOTION_PREVIEW" | "CUSTOMER_CREDIT" | "PRODUCT_ORDER_QUANTITY"
  | "INVENTORY_REORDER_POINT" | "TASK_DEDUPLICATION";
export type PolicyRpcErrorCode = "DENIED" | "NOT_FOUND" | "UNAVAILABLE" | "ERROR";
export type PolicyRpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: PolicyRpcErrorCode; message: string };

type Row = Record<string, unknown>;
function object(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function rpcFailure(error: { code?: string; message?: string }): PolicyRpcResult<never> {
  const code = error.code ?? "";
  if (code === "42501" || code === "28000" || code === "PGRST301")
    return { ok: false, status: "DENIED", message: "لا تملك صلاحية إدارة سياسات التجارة أو تنفيذ هذه المحاكاة." };
  if (code === "P0002")
    return { ok: false, status: "NOT_FOUND", message: "السجل المصدر غير متاح في المؤسسة الحالية." };
  if (code === "PGRST202" || code === "42883")
    return { ok: false, status: "UNAVAILABLE", message: "حوكمة السياسات غير متاحة قبل تطبيق ترحيل القسم 55." };
  return { ok: false, status: "ERROR", message: error.message || "تعذر تنفيذ عملية حوكمة السياسات." };
}

export interface CommercePolicyMetadata {
  id: string;
  policyKey: CommercePolicyKey;
  sourceTable: CommercePolicySourceTable;
  sourceId: string;
  version: number;
  ownerProfileId: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  conflictPriority: number;
  businessRule: string;
  rationale: string;
  testExamples: Row[];
  sourceFingerprint: string;
  sourceChanged: boolean;
  currentSource: Row;
  lifecycle: "SCHEDULED" | "EFFECTIVE" | "EXPIRED" | "SUPERSEDED";
  createdAt: string;
}
export interface CommercePolicyCatalog {
  asOf: string;
  totalCount: number;
  returnedCount: number;
  completePopulation: boolean;
  items: CommercePolicyMetadata[];
}
export interface RegisterCommercePolicyMetadataInput {
  sourceTable: CommercePolicySourceTable;
  sourceId: string;
  ownerProfileId: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  conflictPriority: number;
  businessRule: string;
  rationale: string;
  testExamples: Row[];
  idempotencyKey?: string;
}
export interface CommercePolicySimulation {
  simulationId: string;
  simulationType: CommercePolicySimulationType;
  asOf: string;
  inputFingerprint: string;
  sourceFingerprint: string;
  outcome: Row;
  noWrite: true;
}
export interface CommercePolicySimulationHistoryItem {
  id: string;
  simulationType: CommercePolicySimulationType;
  sourceRefs: string[];
  inputFingerprint: string;
  sourceFingerprint: string;
  outcome: Row;
  createdAt: string;
}

function parsePolicy(value: unknown): CommercePolicyMetadata | null {
  const r = object(value);
  if (!r || !uuid(r.id) || typeof r.policyKey !== "string" ||
      !["PRICING_RULE","PROMOTION","CUSTOMER_CREDIT","PRODUCT_ORDER_QUANTITY","INVENTORY_REORDER_POINT"].includes(r.policyKey) ||
      typeof r.sourceTable !== "string" ||
      !["pricing_rules","promotions","customers","products","inventory_balances"].includes(r.sourceTable) ||
      !uuid(r.sourceId) || !Number.isSafeInteger(r.version) || (r.version as number) < 1 ||
      !uuid(r.ownerProfileId) || typeof r.effectiveFrom !== "string" ||
      (r.effectiveUntil !== null && typeof r.effectiveUntil !== "string") ||
      !Number.isSafeInteger(r.conflictPriority) || typeof r.businessRule !== "string" ||
      typeof r.rationale !== "string" || !Array.isArray(r.testExamples) ||
      typeof r.sourceFingerprint !== "string" || !/^[0-9a-f]{32}$/.test(r.sourceFingerprint) ||
      typeof r.sourceChanged !== "boolean" || !object(r.currentSource) ||
      !["SCHEDULED","EFFECTIVE","EXPIRED","SUPERSEDED"].includes(String(r.lifecycle)) ||
      typeof r.createdAt !== "string") return null;
  return r as unknown as CommercePolicyMetadata;
}

export function parseCommercePolicyCatalog(value: unknown): PolicyRpcResult<CommercePolicyCatalog> {
  const row = object(value);
  if (!row || typeof row.asOf !== "string" || !Number.isFinite(Date.parse(row.asOf)) ||
      !Number.isSafeInteger(row.totalCount) || (row.totalCount as number) < 0 ||
      !Number.isSafeInteger(row.returnedCount) || (row.returnedCount as number) < 0 ||
      (row.returnedCount as number) > (row.totalCount as number) ||
      typeof row.completePopulation !== "boolean" || !Array.isArray(row.items) ||
      row.returnedCount !== row.items.length ||
      row.completePopulation !== (row.returnedCount === row.totalCount)) {
    return { ok: false, status: "ERROR", message: "استجابة سجل السياسات غير مكتملة أو لا تطابق أعداد المجتمع؛ تم حجبها." };
  }
  const items = row.items.map(parsePolicy);
  if (items.some(item => item === null))
    return { ok: false, status: "ERROR", message: "أحد سجلات السياسات ناقص أو غير صالح؛ لم يتم عرض بيانات بديلة." };
  const parsed = items as CommercePolicyMetadata[];
  if (new Set(parsed.map(item => item.id)).size !== parsed.length)
    return { ok: false, status: "ERROR", message: "سجل السياسات يحتوي على معرفات مكررة؛ تم حجب المجتمع." };
  return { ok: true, data: {
    asOf: row.asOf, totalCount: row.totalCount as number,
    returnedCount: row.returnedCount as number, completePopulation: row.completePopulation,
    items: parsed,
  } };
}

export async function fetchCommercePolicyCatalog(): Promise<PolicyRpcResult<CommercePolicyCatalog>> {
  const { data, error } = await supabase.rpc("fetch_commerce_policy_catalog");
  if (error) return rpcFailure(error);
  return parseCommercePolicyCatalog(data);
}

export async function registerCommercePolicyMetadata(
  input: RegisterCommercePolicyMetadataInput,
): Promise<PolicyRpcResult<{ policyId: string; policyKey: CommercePolicyKey; version: number; sourceFingerprint: string; createdAt: string; idempotentReplay: boolean }>> {
  if (!uuid(input.sourceId) || !uuid(input.ownerProfileId) ||
      !Number.isSafeInteger(input.conflictPriority) || input.conflictPriority < 1 || input.conflictPriority > 10000 ||
      input.businessRule.trim().length < 5 || input.businessRule.length > 1000 ||
      input.rationale.trim().length < 5 || input.rationale.length > 2000 ||
      input.testExamples.length < 1 || input.testExamples.length > 20 ||
      !Number.isFinite(Date.parse(input.effectiveFrom)) ||
      (input.effectiveUntil != null && (!Number.isFinite(Date.parse(input.effectiveUntil)) ||
       Date.parse(input.effectiveUntil) <= Date.parse(input.effectiveFrom)))) {
    return { ok: false, status: "ERROR", message: "بيانات تعريف السياسة أو فترة سريانها غير صالحة." };
  }
  const { data, error } = await supabase.rpc("register_commerce_policy_metadata", {
    p_source_table: input.sourceTable,
    p_source_id: input.sourceId,
    p_owner_profile_id: input.ownerProfileId,
    p_effective_from: input.effectiveFrom,
    p_effective_until: input.effectiveUntil ?? null,
    p_conflict_priority: input.conflictPriority,
    p_business_rule: input.businessRule.trim(),
    p_rationale: input.rationale.trim(),
    p_test_examples: input.testExamples,
    p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
  });
  if (error) return rpcFailure(error);
  const row = object(data);
  if (!row || !uuid(row.policy_id) || typeof row.policy_key !== "string" ||
      !Number.isSafeInteger(row.version) || typeof row.source_fingerprint !== "string" ||
      !/^[0-9a-f]{32}$/.test(row.source_fingerprint) || typeof row.created_at !== "string") {
    return { ok: false, status: "ERROR", message: "استجابة تسجيل بيانات السياسة لا تطابق عقد الخدمة." };
  }
  return { ok: true, data: {
    policyId: row.policy_id, policyKey: row.policy_key as CommercePolicyKey,
    version: row.version as number, sourceFingerprint: row.source_fingerprint,
    createdAt: row.created_at, idempotentReplay: row.idempotent_replay === true,
  } };
}

const SIMULATION_TYPES = [
  "PROMOTION_PREVIEW", "CUSTOMER_CREDIT", "PRODUCT_ORDER_QUANTITY",
  "INVENTORY_REORDER_POINT", "TASK_DEDUPLICATION",
] as const;
function validFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}
function validInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
export function parseCommercePolicySimulation(
  value: unknown,
  expectedType: CommercePolicySimulationType,
): PolicyRpcResult<CommercePolicySimulation> {
  const row = object(value);
  const outcome = object(row?.outcome);
  if (!row || !uuid(row.simulationId) || row.simulationType !== expectedType ||
      !validInstant(row.asOf) || !validFingerprint(row.inputFingerprint) ||
      !validFingerprint(row.sourceFingerprint) || !outcome ||
      outcome.simulationType !== expectedType || outcome.noWrite !== true || row.noWrite !== true) {
    return { ok: false, status: "ERROR", message: "نتيجة المحاكاة ناقصة أو لا تطابق عقد الأدلة ومنع الكتابة." };
  }
  return { ok: true, data: row as unknown as CommercePolicySimulation };
}
export async function simulateCommercePolicy(
  simulationType: CommercePolicySimulationType,
  input: Row,
): Promise<PolicyRpcResult<CommercePolicySimulation>> {
  if (!SIMULATION_TYPES.includes(simulationType) || !object(input) || Object.keys(input).length > 12) {
    return { ok: false, status: "ERROR", message: "مدخلات المحاكاة يجب أن تكون نوعاً معتمداً وكائناً محدود الحقول." };
  }
  const { data, error } = await supabase.rpc("simulate_commerce_policy", {
    p_simulation_type: simulationType,
    p_input: input,
  });
  if (error) return rpcFailure(error);
  return parseCommercePolicySimulation(data, simulationType);
}

export function parseCommercePolicySimulationHistory(
  value: unknown,
  limit: number,
): PolicyRpcResult<CommercePolicySimulationHistoryItem[]> {
  const row = object(value);
  if (!row || !validInstant(row.asOf) || !Number.isSafeInteger(row.returnedCount) ||
      (row.returnedCount as number) < 0 || (row.returnedCount as number) > limit ||
      !Array.isArray(row.items) || row.returnedCount !== row.items.length) {
    return { ok: false, status: "ERROR", message: "سجل المحاكاة لا يطابق عدد النتائج وحدود المجتمع ووقت المصدر." };
  }
  const asOf = Date.parse(row.asOf);
  const items = row.items.map(value => {
    const item = object(value);
    const outcome = object(item?.outcome);
    if (!item || !uuid(item.id) || typeof item.simulationType !== "string" ||
        !SIMULATION_TYPES.includes(item.simulationType as CommercePolicySimulationType) ||
        !Array.isArray(item.sourceRefs) || item.sourceRefs.length > 20 ||
        item.sourceRefs.some(ref => !uuid(ref)) ||
        !validFingerprint(item.inputFingerprint) || !validFingerprint(item.sourceFingerprint) ||
        !outcome || outcome.simulationType !== item.simulationType || outcome.noWrite !== true ||
        !validInstant(item.createdAt) || Date.parse(item.createdAt) > asOf) return null;
    const sourceRefs = item.sourceRefs as string[];
    if (new Set(sourceRefs.map(ref => ref.toLowerCase())).size !== sourceRefs.length) return null;
    return { ...item, sourceRefs } as unknown as CommercePolicySimulationHistoryItem;
  });
  if (items.some(item => item === null))
    return { ok: false, status: "ERROR", message: "سجل المحاكاة يحتوي على عنصر غير صالح أو بلا دليل مصدر موثق." };
  const parsed = items as CommercePolicySimulationHistoryItem[];
  if (new Set(parsed.map(item => item.id)).size !== parsed.length)
    return { ok: false, status: "ERROR", message: "سجل المحاكاة يحتوي على معرفات مكررة؛ تم حجب النتائج." };
  return { ok: true, data: parsed };
}
export async function fetchCommercePolicySimulationHistory(
  simulationType?: CommercePolicySimulationType,
  limit = 30,
): Promise<PolicyRpcResult<CommercePolicySimulationHistoryItem[]>> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      (simulationType !== undefined && !SIMULATION_TYPES.includes(simulationType))) {
    return { ok: false, status: "ERROR", message: "حد سجل المحاكاة أو نوعه غير صالح." };
  }
  const { data, error } = await supabase.rpc("fetch_commerce_policy_simulation_history", {
    p_simulation_type: simulationType ?? null, p_limit: limit,
  });
  if (error) return rpcFailure(error);
  return parseCommercePolicySimulationHistory(data, limit);
}

export interface CommercePolicyOwner {
  id: string;
  name: string;
  roles: string[];
}
export interface CommercePolicyOwnerDirectory {
  items: CommercePolicyOwner[];
  totalCount: number;
  returnedCount: number;
  completePopulation: boolean;
}
export interface CommercePolicySource {
  id: string;
  label: string;
  sourceTable: CommercePolicySourceTable;
  status: string;
  detail: string;
}
export interface CommercePolicySourceDirectory {
  sourceTable: CommercePolicySourceTable;
  items: CommercePolicySource[];
  totalCount: number;
  returnedCount: number;
  completePopulation: boolean;
  asOf: string;
}
function parseDirectory(value: unknown, sourceTable?: CommercePolicySourceTable): CommercePolicySourceDirectory | null {
  const row = object(value);
  if (!row || (sourceTable && row.sourceTable !== sourceTable) ||
      typeof row.asOf !== "string" || !Number.isSafeInteger(row.totalCount) ||
      !Number.isSafeInteger(row.returnedCount) || typeof row.completePopulation !== "boolean" ||
      !Array.isArray(row.items)) return null;
  const items = row.items.map(value => {
    const item = object(value);
    if (!item || !uuid(item.id) || typeof item.label !== "string" ||
        item.sourceTable !== row.sourceTable || typeof item.status !== "string" ||
        typeof item.detail !== "string") return null;
    return item as unknown as CommercePolicySource;
  });
  if (items.some(item => item === null)) return null;
  return {
    sourceTable: row.sourceTable as CommercePolicySourceTable,
    items: items as CommercePolicySource[],
    totalCount: row.totalCount as number, returnedCount: row.returnedCount as number,
    completePopulation: row.completePopulation, asOf: row.asOf,
  };
}
export async function fetchCommercePolicyOwners(): Promise<PolicyRpcResult<CommercePolicyOwnerDirectory>> {
  const { data, error } = await supabase.rpc("fetch_commerce_policy_owners");
  if (error) return rpcFailure(error);
  const row = object(data);
  if (!row || !Array.isArray(row.items) || !Number.isSafeInteger(row.totalCount) ||
      !Number.isSafeInteger(row.returnedCount) || typeof row.completePopulation !== "boolean")
    return { ok: false, status: "ERROR", message: "دليل ملاك السياسات لا يطابق عقد البيانات." };
  const items = row.items.map(value => {
    const item = object(value);
    if (!item || !uuid(item.id) || typeof item.name !== "string" ||
        !Array.isArray(item.roles) || item.roles.some(role => typeof role !== "string")) return null;
    return item as unknown as CommercePolicyOwner;
  });
  if (items.some(item => item === null))
    return { ok: false, status: "ERROR", message: "دليل ملاك السياسات يحتوي على سجل غير صالح." };
  return { ok: true, data: {
    items: items as CommercePolicyOwner[], totalCount: row.totalCount as number,
    returnedCount: row.returnedCount as number, completePopulation: row.completePopulation,
  } };
}
export async function fetchCommercePolicySources(
  sourceTable: CommercePolicySourceTable,
  search?: string,
  limit = 100,
): Promise<PolicyRpcResult<CommercePolicySourceDirectory>> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (search?.length ?? 0) > 120)
    return { ok: false, status: "ERROR", message: "معايير البحث عن مصدر السياسة غير صالحة." };
  const { data, error } = await supabase.rpc("fetch_commerce_policy_sources", {
    p_source_table: sourceTable, p_search: search?.trim() || null, p_limit: limit,
  });
  if (error) return rpcFailure(error);
  const directory = parseDirectory(data, sourceTable);
  if (!directory) return { ok: false, status: "ERROR", message: "دليل مصادر السياسات لا يطابق عقد البيانات." };
  return { ok: true, data: directory };
}

export interface CommercePolicyRollbackPreview {
  sourceTable: "pricing_rules" | "promotions";
  sourceId: string;
  canRestore: boolean;
  sourceAuditEventId: string | null;
  sourceAuditAction: string | null;
  sourceAuditAt: string | null;
  currentValue: Row;
  previousValue: Row | null;
  requiredWorkflow: string;
  requiresHumanApproval: true;
  noWrite: true;
}
export async function previewCommercePolicyRollback(
  sourceTable: "pricing_rules" | "promotions",
  sourceId: string,
): Promise<PolicyRpcResult<CommercePolicyRollbackPreview>> {
  if (!uuid(sourceId)) return { ok: false, status: "ERROR", message: "مرجع القاعدة غير صالح." };
  const { data, error } = await supabase.rpc("preview_commerce_policy_rollback", {
    p_source_table: sourceTable, p_source_id: sourceId,
  });
  if (error) return rpcFailure(error);
  const row = object(data);
  const currentValue = object(row?.currentValue);
  const previousValue = row?.previousValue === null ? null : object(row?.previousValue);
  if (!row || row.sourceTable !== sourceTable || row.sourceId !== sourceId ||
      typeof row.canRestore !== "boolean" || !currentValue ||
      (row.previousValue !== null && !previousValue) ||
      (row.sourceAuditEventId !== null && !uuid(row.sourceAuditEventId)) ||
      typeof row.requiredWorkflow !== "string" || row.requiresHumanApproval !== true || row.noWrite !== true) {
    return { ok: false, status: "ERROR", message: "معاينة الاستعادة ناقصة أو لا تطابق عقد التدقيق." };
  }
  return { ok: true, data: row as unknown as CommercePolicyRollbackPreview };
}
