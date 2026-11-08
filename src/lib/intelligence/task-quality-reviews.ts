export type TaskQualityReviewType = "ACTIONABILITY" | "RECOMMENDATION_DISPOSITION" | "ALERT_VALIDATION";
export type TaskQualityActionability = "ACTIONABLE" | "NOT_ACTIONABLE" | "DEFERRED";
export type TaskQualityDisposition = "APPROVED" | "REJECTED" | "DEFERRED";
export type TaskQualityAlertVerdict = "TRUE_POSITIVE" | "FALSE_POSITIVE" | "NEEDS_REVIEW";
export type TaskQualityReasonCode =
  | "SOURCE_MISSING" | "SOURCE_INCOMPLETE" | "SOURCE_STALE" | "SOURCE_MISMATCH"
  | "ALREADY_RESOLVED" | "DUPLICATE_RECOMMENDATION" | "OUT_OF_SCOPE" | "POLICY_CONFLICT"
  | "RESOURCE_UNAVAILABLE" | "TIMING_NOT_APPROPRIATE" | "LOW_EXPECTED_IMPACT"
  | "BUDGET_CONSTRAINT" | "THRESHOLD_NOT_MET" | "OTHER";

export interface TaskQualityReasonBreakdown {
  reasonCode: TaskQualityReasonCode;
  reviewCount: number;
  affectedTaskCount: number;
}
export interface TaskQualityCause {
  reasonCode: TaskQualityReasonCode;
  affectedTaskCount: number;
  reviewCount: number;
}
export type TaskQualityMetrics =
  | { status: "RESTRICTED"; reasonCode: "QUALITY_REVIEW_MANAGER_ONLY" }
  | { status: "UNAVAILABLE"; reasonCode: "QUALITY_REVIEW_MIGRATION_PENDING" | "QUALITY_REVIEW_SOURCE_INVALID" }
  | {
      status: "READY" | "EMPTY";
      scope: { visibleTaskCount: number; reviewedTaskCount: number };
      actionability: {
        reviewedCount: number;
        actionableCount: number;
        notActionableCount: number;
        deferredCount: number;
        rateDenominator: number;
        actionableRatePercent: number | null;
        notActionableReasons: TaskQualityReasonBreakdown[];
      };
      disposition: {
        reviewedCount: number;
        approvedCount: number;
        rejectedCount: number;
        deferredCount: number;
        rejectionReasons: TaskQualityReasonBreakdown[];
        deferralReasons: TaskQualityReasonBreakdown[];
      };
      alerts: {
        reviewedCount: number;
        truePositiveCount: number;
        falsePositiveCount: number;
        needsReviewCount: number;
        falseAlarmDenominator: number;
        falseAlarmRatePercent: number | null;
      };
      causeReviewCount: number;
      repeatedCauses: TaskQualityCause[];
    };

type PlainRecord = Record<string, unknown>;
const REASON_CODES = new Set<TaskQualityReasonCode>([
  "SOURCE_MISSING","SOURCE_INCOMPLETE","SOURCE_STALE","SOURCE_MISMATCH",
  "ALREADY_RESOLVED","DUPLICATE_RECOMMENDATION","OUT_OF_SCOPE","POLICY_CONFLICT",
  "RESOURCE_UNAVAILABLE","TIMING_NOT_APPROPRIATE","LOW_EXPECTED_IMPACT",
  "BUDGET_CONSTRAINT","THRESHOLD_NOT_MET","OTHER",
]);
function asRecord(value: unknown): PlainRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as PlainRecord : null;
}
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function exactPercent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator * 10000) / denominator) / 100 : null;
}
function parseReasonBreakdown(value: unknown): TaskQualityReasonBreakdown[] | null {
  if (!Array.isArray(value) || value.length > REASON_CODES.size) return null;
  const parsed: TaskQualityReasonBreakdown[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row || typeof row.reasonCode !== "string" ||
        !REASON_CODES.has(row.reasonCode as TaskQualityReasonCode) ||
        !isCount(row.reviewCount) || row.reviewCount < 1 ||
        !isCount(row.affectedTaskCount) || row.affectedTaskCount < 1 ||
        row.affectedTaskCount > row.reviewCount) return null;
    parsed.push({
      reasonCode: row.reasonCode as TaskQualityReasonCode,
      reviewCount: row.reviewCount,
      affectedTaskCount: row.affectedTaskCount,
    });
  }
  return new Set(parsed.map(item => item.reasonCode)).size === parsed.length ? parsed : null;
}

/** Missing review migrations are explicit; they never become synthetic zero metrics. */
export function parseTaskQualityMetrics(value: unknown): TaskQualityMetrics {
  if (value === undefined || value === null) {
    return {status:"UNAVAILABLE",reasonCode:"QUALITY_REVIEW_MIGRATION_PENDING"};
  }
  const row=asRecord(value);
  if (!row) return {status:"UNAVAILABLE",reasonCode:"QUALITY_REVIEW_SOURCE_INVALID"};
  if (row.status==="RESTRICTED" && row.reasonCode==="QUALITY_REVIEW_MANAGER_ONLY") {
    return {status:"RESTRICTED",reasonCode:"QUALITY_REVIEW_MANAGER_ONLY"};
  }
  if (row.status!=="READY" && row.status!=="EMPTY") {
    return {status:"UNAVAILABLE",reasonCode:"QUALITY_REVIEW_SOURCE_INVALID"};
  }
  const scope=asRecord(row.scope),action=asRecord(row.actionability),disposition=asRecord(row.disposition),alerts=asRecord(row.alerts);
  if (!scope||!action||!disposition||!alerts ||
      !isCount(scope.visibleTaskCount)||!isCount(scope.reviewedTaskCount) ||
      !isCount(action.reviewedCount)||!isCount(action.actionableCount)||!isCount(action.notActionableCount)||
      !isCount(action.deferredCount)||!isCount(action.rateDenominator)||
      (action.actionableRatePercent!==null && (typeof action.actionableRatePercent!=="number" ||
        !Number.isFinite(action.actionableRatePercent)||action.actionableRatePercent<0||action.actionableRatePercent>100)) ||
      !isCount(disposition.reviewedCount)||!isCount(disposition.approvedCount)||!isCount(disposition.rejectedCount)||!isCount(disposition.deferredCount)||
      !isCount(alerts.reviewedCount)||!isCount(alerts.truePositiveCount)||!isCount(alerts.falsePositiveCount)||!isCount(alerts.needsReviewCount)||
      !isCount(alerts.falseAlarmDenominator)||
      (alerts.falseAlarmRatePercent!==null && (typeof alerts.falseAlarmRatePercent!=="number" ||
        !Number.isFinite(alerts.falseAlarmRatePercent)||alerts.falseAlarmRatePercent<0||alerts.falseAlarmRatePercent>100))||
      !isCount(row.causeReviewCount)||!Array.isArray(row.repeatedCauses)||row.repeatedCauses.length>REASON_CODES.size) {
    return {status:"UNAVAILABLE",reasonCode:"QUALITY_REVIEW_SOURCE_INVALID"};
  }
  const notActionableReasons=parseReasonBreakdown(action.notActionableReasons);
  const rejectionReasons=parseReasonBreakdown(disposition.rejectionReasons);
  const deferralReasons=parseReasonBreakdown(disposition.deferralReasons);
  if(!notActionableReasons||!rejectionReasons||!deferralReasons) return {status:"UNAVAILABLE",reasonCode:"QUALITY_REVIEW_SOURCE_INVALID"};
  const repeatedCauses:TaskQualityCause[]=[];
  for(const item of row.repeatedCauses) {
    const cause=asRecord(item);
    if(!cause||typeof cause.reasonCode!=="string"||!REASON_CODES.has(cause.reasonCode as TaskQualityReasonCode)||
      !isCount(cause.affectedTaskCount)||cause.affectedTaskCount<2||
      !isCount(cause.reviewCount)||cause.reviewCount<cause.affectedTaskCount) {
      return {status:"UNAVAILABLE",reasonCode:"QUALITY_REVIEW_SOURCE_INVALID"};
    }
    repeatedCauses.push({reasonCode:cause.reasonCode as TaskQualityReasonCode,affectedTaskCount:cause.affectedTaskCount,reviewCount:cause.reviewCount});
  }
  const sum=(items:TaskQualityReasonBreakdown[])=>items.reduce((total,item)=>total+item.reviewCount,0);
  const actionDenominator=action.actionableCount+action.notActionableCount;
  const alertDenominator=alerts.truePositiveCount+alerts.falsePositiveCount;
  const totalReviews=action.reviewedCount+disposition.reviewedCount+alerts.reviewedCount;
  if(row.status!==(totalReviews===0?"EMPTY":"READY") || scope.reviewedTaskCount>scope.visibleTaskCount ||
      action.reviewedCount!==action.actionableCount+action.notActionableCount+action.deferredCount ||
      action.rateDenominator!==actionDenominator ||
      action.actionableRatePercent!==exactPercent(action.actionableCount,actionDenominator) ||
      sum(notActionableReasons)!==action.notActionableCount ||
      disposition.reviewedCount!==disposition.approvedCount+disposition.rejectedCount+disposition.deferredCount ||
      sum(rejectionReasons)!==disposition.rejectedCount ||
      sum(deferralReasons)!==disposition.deferredCount+action.deferredCount ||
      sum(notActionableReasons)+sum(rejectionReasons)+sum(deferralReasons)+alerts.falsePositiveCount!==row.causeReviewCount ||
      alerts.reviewedCount!==alerts.truePositiveCount+alerts.falsePositiveCount+alerts.needsReviewCount ||
      alerts.falseAlarmDenominator!==alertDenominator ||
      alerts.falseAlarmRatePercent!==exactPercent(alerts.falsePositiveCount,alertDenominator) ||
      repeatedCauses.some(cause=>cause.affectedTaskCount>(scope.reviewedTaskCount as number)) ||
      new Set(repeatedCauses.map(cause=>cause.reasonCode)).size!==repeatedCauses.length ||
      repeatedCauses.reduce((total,cause)=>total+cause.reviewCount,0)>row.causeReviewCount) {
    return {status:"UNAVAILABLE",reasonCode:"QUALITY_REVIEW_SOURCE_INVALID"};
  }
  return {
    status:row.status,
    scope:{visibleTaskCount:scope.visibleTaskCount,reviewedTaskCount:scope.reviewedTaskCount},
    actionability:{
      reviewedCount:action.reviewedCount,actionableCount:action.actionableCount,notActionableCount:action.notActionableCount,
      deferredCount:action.deferredCount,rateDenominator:action.rateDenominator,
      actionableRatePercent:action.actionableRatePercent as number|null,notActionableReasons,
    },
    disposition:{
      reviewedCount:disposition.reviewedCount,approvedCount:disposition.approvedCount,rejectedCount:disposition.rejectedCount,
      deferredCount:disposition.deferredCount,rejectionReasons,deferralReasons,
    },
    alerts:{
      reviewedCount:alerts.reviewedCount,truePositiveCount:alerts.truePositiveCount,falsePositiveCount:alerts.falsePositiveCount,
      needsReviewCount:alerts.needsReviewCount,falseAlarmDenominator:alerts.falseAlarmDenominator,
      falseAlarmRatePercent:alerts.falseAlarmRatePercent as number|null,
    },
    causeReviewCount:row.causeReviewCount,repeatedCauses,
  };
}
