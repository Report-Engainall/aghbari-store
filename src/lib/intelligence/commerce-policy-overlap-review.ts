import type {
  CommercePolicyCatalog,
  CommercePolicyMetadata,
} from "./commerce-policy-governance-client";

type ScopeKind = "PRODUCT" | "CATEGORY";
type Row = Record<string, unknown>;

export interface PromotionPolicyOverlapPair {
  first: {
    label: string;
    version: number;
    effectiveFrom: string;
    effectiveUntil: string | null;
    conflictPriority: number;
  };
  second: {
    label: string;
    version: number;
    effectiveFrom: string;
    effectiveUntil: string | null;
    conflictPriority: number;
  };
  sharedScope: {
    kind: ScopeKind;
    count: number;
  };
  overlapPeriod: {
    from: string;
    to: string | null;
  };
  classification: "POTENTIAL_OVERLAP_REVIEW";
}

export interface PromotionPolicyOverlapReview {
  state: "READY" | "PARTIAL" | "EMPTY";
  asOf: string;
  completePopulation: boolean;
  inspectedPromotionCount: number;
  candidatePairCount: number;
  withheldCount: number;
  candidates: PromotionPolicyOverlapPair[];
  withheldReasons: Array<{
    reason: "SOURCE_CHANGED" | "SCOPE_NOT_COMPARABLE" | "SOURCE_DATE_MISSING" | "SOURCE_STATUS_UNAVAILABLE";
    count: number;
  }>;
}

interface Scope {
  kind: ScopeKind;
  ids: Set<string>;
}

interface PromotionEntry {
  policy: CommercePolicyMetadata;
  source: Row;
  scope: Scope;
  start: number;
  end: number | null;
  sourceStart: number;
  sourceEnd: number;
  label: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function row(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readIds(value: unknown): { present: boolean; valid: boolean; ids: Set<string> } {
  if (value === undefined || value === null) return { present: false, valid: true, ids: new Set() };
  if (!Array.isArray(value) || value.length > 500 ||
      value.some(item => typeof item !== "string" || !UUID.test(item))) {
    return { present: true, valid: false, ids: new Set() };
  }
  return { present: true, valid: true, ids: new Set((value as string[]).map(item => item.toLowerCase())) };
}

/**
 * Only compare explicit same-dimension scopes. A promotion with no explicit
 * scope, malformed arrays, or mixed non-empty product/category scope is
 * withheld rather than treated as a wildcard or guessed to cover all products.
 */
function parseScope(source: Row): Scope | null {
  const products = readIds(source.product_ids);
  const categories = readIds(source.category_ids);
  if (!products.valid || !categories.valid) return null;
  const hasProducts = products.ids.size > 0;
  const hasCategories = categories.ids.size > 0;
  if (hasProducts && hasCategories) return null;
  if (hasProducts) return { kind: "PRODUCT", ids: products.ids };
  if (hasCategories) return { kind: "CATEGORY", ids: categories.ids };
  return null;
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function intervalOverlap(
  leftStart: number,
  leftEnd: number | null,
  rightStart: number,
  rightEnd: number | null,
): { start: number; end: number | null } | null {
  const start = Math.max(leftStart, rightStart);
  const finiteEnds = [leftEnd, rightEnd].filter((value): value is number => value !== null);
  const end = finiteEnds.length ? Math.min(...finiteEnds) : null;
  if (end !== null && end < start) return null;
  return { start, end };
}

function label(source: Row, policy: CommercePolicyMetadata): string {
  const title = typeof source.title === "string" ? source.title.trim() : "";
  return title || ("عرض ترويجي · إصدار " + policy.version);
}

/**
 * Flags only conservative potential promotion overlap:
 * same explicit product OR category IDs and overlapping source + registry
 * effective windows, with unchanged source fingerprints and active sources.
 * It does not claim stacking is forbidden or modify policy precedence.
 */
export function buildPromotionPolicyOverlapReview(
  catalog: CommercePolicyCatalog,
): PromotionPolicyOverlapReview {
  const asOf = timestamp(catalog.asOf);
  if (asOf === null) throw new Error("commerce_policy_overlap_as_of_invalid");

  const promotions = catalog.items.filter(item =>
    item.policyKey === "PROMOTION" &&
    item.sourceTable === "promotions" &&
    (item.lifecycle === "EFFECTIVE" || item.lifecycle === "SCHEDULED")
  );

  const entries: PromotionEntry[] = [];
  let sourceChangedCount = 0;
  let scopeNotComparableCount = 0;
  let sourceDateMissingCount = 0;
  let sourceStatusUnavailableCount = 0;

  for (const policy of promotions) {
    if (policy.sourceChanged) {
      sourceChangedCount += 1;
      continue;
    }
    const source = row(policy.currentSource);
    if (!source) {
      sourceStatusUnavailableCount += 1;
      continue;
    }
    if (source.is_active === false) continue;
    if (source.is_active !== true) {
      sourceStatusUnavailableCount += 1;
      continue;
    }

    const start = timestamp(policy.effectiveFrom);
    const end = policy.effectiveUntil === null ? null : timestamp(policy.effectiveUntil);
    const sourceStart = timestamp(source.start_date);
    const sourceEnd = timestamp(source.end_date);

    if (start === null || (policy.effectiveUntil !== null && end === null) ||
        sourceStart === null || sourceEnd === null || sourceEnd < sourceStart) {
      sourceDateMissingCount += 1;
      continue;
    }

    const effectiveWindow = intervalOverlap(start, end, sourceStart, sourceEnd);
    if (!effectiveWindow || (effectiveWindow.end !== null && effectiveWindow.end < asOf)) continue;

    const scope = parseScope(source);
    if (!scope) {
      scopeNotComparableCount += 1;
      continue;
    }

    entries.push({
      policy,
      source,
      scope,
      start: effectiveWindow.start,
      end: effectiveWindow.end,
      sourceStart,
      sourceEnd,
      label: label(source, policy),
    });
  }

  const candidates: PromotionPolicyOverlapPair[] = [];
  let scopeNotComparablePairs = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const left = entries[i];
    for (let j = i + 1; j < entries.length; j += 1) {
      const right = entries[j];
      if (left.policy.sourceId === right.policy.sourceId) continue;

      const overlap = intervalOverlap(left.start, left.end, right.start, right.end);
      if (!overlap) continue;

      if (left.scope.kind !== right.scope.kind) {
        scopeNotComparablePairs += 1;
        continue;
      }

      const sharedCount = intersectionSize(left.scope.ids, right.scope.ids);
      if (sharedCount < 1) continue;

      // Both the policy-registry window and the live promotion dates were
      // checked above. The pair is still only a review candidate, not proof of
      // a discount conflict or a ban on combining offers.
      candidates.push({
        first: {
          label: left.label,
          version: left.policy.version,
          effectiveFrom: left.policy.effectiveFrom,
          effectiveUntil: left.policy.effectiveUntil,
          conflictPriority: left.policy.conflictPriority,
        },
        second: {
          label: right.label,
          version: right.policy.version,
          effectiveFrom: right.policy.effectiveFrom,
          effectiveUntil: right.policy.effectiveUntil,
          conflictPriority: right.policy.conflictPriority,
        },
        sharedScope: { kind: left.scope.kind, count: sharedCount },
        overlapPeriod: {
          from: new Date(overlap.start).toISOString(),
          to: overlap.end === null ? null : new Date(overlap.end).toISOString(),
        },
        classification: "POTENTIAL_OVERLAP_REVIEW",
      });
    }
  }

  const withheldReasons = [
    ...(sourceChangedCount ? [{ reason: "SOURCE_CHANGED" as const, count: sourceChangedCount }] : []),
    ...(scopeNotComparableCount + scopeNotComparablePairs
      ? [{ reason: "SCOPE_NOT_COMPARABLE" as const, count: scopeNotComparableCount + scopeNotComparablePairs }]
      : []),
    ...(sourceDateMissingCount
      ? [{ reason: "SOURCE_DATE_MISSING" as const, count: sourceDateMissingCount }]
      : []),
    ...(sourceStatusUnavailableCount
      ? [{ reason: "SOURCE_STATUS_UNAVAILABLE" as const, count: sourceStatusUnavailableCount }]
      : []),
  ];
  const withheldCount = withheldReasons.reduce((sum, item) => sum + item.count, 0);
  const completePopulation = catalog.completePopulation && withheldCount === 0;
  const state = candidates.length > 0
    ? completePopulation ? "READY" : "PARTIAL"
    : catalog.completePopulation && withheldCount === 0 ? "EMPTY" : "PARTIAL";

  return {
    state,
    asOf: catalog.asOf,
    completePopulation,
    inspectedPromotionCount: entries.length,
    candidatePairCount: candidates.length,
    withheldCount,
    candidates: candidates.slice(0, 50),
    withheldReasons,
  };
}
