import type { TaskQualityMetrics } from "./task-quality-reviews";

export type TaskIntelligenceReportKind = "DAILY" | "WEEKLY" | "MONTHLY" | "MANAGER";
export type TaskIntelligenceRole = "sales" | "accountant" | "warehouse" | "purchasing" | "management" | "operations";
export type TaskIntelligencePriority = "low" | "medium" | "high" | "critical";

export interface TaskIntelligencePeriod {
  from: string;
  to: string;
  timeZone: "UTC";
}
export interface TaskIntelligenceRoleSummary {
  taskRole: TaskIntelligenceRole;
  newCount: number;
  openCount: number;
  overdueOpenCount: number;
  highImpactOpenCount: number;
  completedCount: number;
  reopenedTaskCount: number;
  reopenedEventCount: number;
  reopenRatePercent: number | null;
  resolvedTaskCount: number;
  averageResolutionMinutes: number | null;
  waitingOnOtherPartyCount: null;
  financialImpactAmount: null;
}
export interface TaskIntelligenceSourceSummary {
  sourceKey: string;
  taskRole: TaskIntelligenceRole;
  priority: TaskIntelligencePriority;
  createdCount: number;
  completedCount: number;
  reopenedEventCount: number;
  reopenedTaskCount: number;
  reopenRatePercent: number | null;
  resolvedTaskCount: number;
  averageResolutionMinutes: number | null;
}
export interface TaskIntelligenceWeeklyPoint {
  weekStart: string;
  createdCount: number;
  completedCount: number;
  reopenedTaskCount: number;
  reopenedEventCount: number;
  averageResolutionMinutes: number | null;
}
export interface TaskIntelligenceManagerRisk {
  id: string;
  title: string;
  taskType: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  taskRole: TaskIntelligenceRole;
  priority: "high" | "critical";
  status: "pending" | "in_progress";
  createdAt: string;
  dueAt: string | null;
  ageMinutes: number;
  overdueMinutes: number | null;
  assignedProfileId: string | null;
  isOverdue: boolean;
  delayReason: null;
  requiredManagementDecision: null;
}
export interface TaskIntelligenceReport {
  status: "VERIFIED";
  reportKind: TaskIntelligenceReportKind;
  asOf: string;
  period: TaskIntelligencePeriod;
  scope: {
    visibleRoles: TaskIntelligenceRole[];
    completePopulation: true;
    visibleTaskCount: number;
    managerViewAvailable: boolean;
    managerRiskTotalCount: number | null;
    managerRiskReturnedCount: number | null;
    managerRiskCompletePopulation: boolean;
  };
  state: "READY" | "EMPTY";
  roleSummaries: TaskIntelligenceRoleSummary[];
  sourceBreakdown: TaskIntelligenceSourceSummary[];
  weeklyTrend: TaskIntelligenceWeeklyPoint[];
  managerRisks: TaskIntelligenceManagerRisk[];
  quality: {
    reopenRateDefinition: string;
    waitingOnOtherPartyCount: null;
    falseAlarmCount: null;
    repeatedCauses: null;
    improvementOutcomes: null;
    employeeComparisonPerformed: false;
  };
  /** Latest manager review snapshot; independent of the task report period. */
  qualityReviewSnapshot: TaskQualityMetrics | null;
  limitations: string[];
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue : null;
}
function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function closeNumber(actual: number, expected: number): boolean {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= 0.01;
}
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}
const ROLES = new Set<TaskIntelligenceRole>([
  "sales", "accountant", "warehouse", "purchasing", "management", "operations",
]);
const PRIORITIES = new Set<TaskIntelligencePriority>(["low", "medium", "high", "critical"]);

function parseRoleSummary(value: unknown): TaskIntelligenceRoleSummary | null {
  const row = record(value);
  if (!row || typeof row.taskRole !== "string" || !ROLES.has(row.taskRole as TaskIntelligenceRole) ||
    !isCount(row.newCount) || !isCount(row.openCount) || !isCount(row.overdueOpenCount) ||
    !isCount(row.highImpactOpenCount) || !isCount(row.completedCount) ||
    !isCount(row.reopenedTaskCount) || !isCount(row.reopenedEventCount) ||
    !isNumberOrNull(row.reopenRatePercent) || !isCount(row.resolvedTaskCount) ||
    !isNumberOrNull(row.averageResolutionMinutes) ||
    row.waitingOnOtherPartyCount !== null || row.financialImpactAmount !== null) return null;
  if ((row.reopenRatePercent !== null && row.reopenRatePercent > 100) ||
    row.overdueOpenCount > row.openCount || row.highImpactOpenCount > row.openCount ||
    row.reopenedEventCount < row.reopenedTaskCount || row.resolvedTaskCount !== row.completedCount ||
    (row.resolvedTaskCount === 0 && (row.reopenRatePercent !== null || row.averageResolutionMinutes !== null)) ||
    (row.resolvedTaskCount > 0 && (row.reopenRatePercent === null || row.averageResolutionMinutes === null))) return null;
  return {
    taskRole: row.taskRole as TaskIntelligenceRole, newCount: row.newCount,
    openCount: row.openCount, overdueOpenCount: row.overdueOpenCount,
    highImpactOpenCount: row.highImpactOpenCount, completedCount: row.completedCount,
    reopenedTaskCount: row.reopenedTaskCount, reopenedEventCount: row.reopenedEventCount,
    reopenRatePercent: row.reopenRatePercent, resolvedTaskCount: row.resolvedTaskCount,
    averageResolutionMinutes: row.averageResolutionMinutes,
    waitingOnOtherPartyCount: null, financialImpactAmount: null,
  };
}
function parseSourceSummary(value: unknown): TaskIntelligenceSourceSummary | null {
  const row = record(value);
  if (!row || typeof row.sourceKey !== "string" || row.sourceKey.length < 1 || row.sourceKey.length > 120 ||
    typeof row.taskRole !== "string" || !ROLES.has(row.taskRole as TaskIntelligenceRole) ||
    typeof row.priority !== "string" || !PRIORITIES.has(row.priority as TaskIntelligencePriority) ||
    !isCount(row.createdCount) || !isCount(row.completedCount) ||
    !isCount(row.reopenedEventCount) || !isCount(row.reopenedTaskCount) ||
    !isNumberOrNull(row.reopenRatePercent) || (row.reopenRatePercent !== null && row.reopenRatePercent > 100) ||
    !isCount(row.resolvedTaskCount) || !isNumberOrNull(row.averageResolutionMinutes) ||
    row.reopenedEventCount < row.reopenedTaskCount || row.resolvedTaskCount !== row.completedCount ||
    (row.resolvedTaskCount === 0 && (row.reopenRatePercent !== null || row.averageResolutionMinutes !== null)) ||
    (row.resolvedTaskCount > 0 && (row.reopenRatePercent === null || row.averageResolutionMinutes === null))) return null;
  return {
    sourceKey: row.sourceKey, taskRole: row.taskRole as TaskIntelligenceRole,
    priority: row.priority as TaskIntelligencePriority, createdCount: row.createdCount,
    completedCount: row.completedCount, reopenedEventCount: row.reopenedEventCount,
    reopenedTaskCount: row.reopenedTaskCount, reopenRatePercent: row.reopenRatePercent as number | null,
    resolvedTaskCount: row.resolvedTaskCount, averageResolutionMinutes: row.averageResolutionMinutes,
  };
}
function parseWeeklyPoint(value: unknown): TaskIntelligenceWeeklyPoint | null {
  const row = record(value);
  if (!row || !isDay(row.weekStart) || !isCount(row.createdCount) ||
    !isCount(row.completedCount) || !isCount(row.reopenedTaskCount) ||
    !isCount(row.reopenedEventCount) || row.reopenedEventCount < row.reopenedTaskCount ||
    !isNumberOrNull(row.averageResolutionMinutes)) return null;
  return {
    weekStart: row.weekStart, createdCount: row.createdCount,
    completedCount: row.completedCount, reopenedTaskCount: row.reopenedTaskCount,
    reopenedEventCount: row.reopenedEventCount,
    averageResolutionMinutes: row.averageResolutionMinutes as number | null,
  };
}
function parseManagerRisk(value: unknown, asOf: string): TaskIntelligenceManagerRisk | null {
  const row = record(value);
  const asOfMs = Date.parse(asOf);
  if (!row || !isUuid(row.id) || typeof row.title !== "string" || !row.title.trim() ||
    typeof row.taskType !== "string" || !row.taskType.trim() ||
    (row.sourceEntityType !== null && typeof row.sourceEntityType !== "string") ||
    (row.sourceEntityId !== null && !isUuid(row.sourceEntityId)) ||
    typeof row.taskRole !== "string" || !ROLES.has(row.taskRole as TaskIntelligenceRole) ||
    (row.priority !== "high" && row.priority !== "critical") ||
    (row.status !== "pending" && row.status !== "in_progress") ||
    !isTimestamp(row.createdAt) || Date.parse(row.createdAt) > asOfMs ||
    (row.dueAt !== null && !isTimestamp(row.dueAt)) ||
    !isNumberOrNull(row.ageMinutes) || row.ageMinutes === null ||
    !isNumberOrNull(row.overdueMinutes) ||
    (row.assignedProfileId !== null && !isUuid(row.assignedProfileId)) ||
    typeof row.isOverdue !== "boolean" || row.delayReason !== null ||
    row.requiredManagementDecision !== null) return null;
  const createdAt = Date.parse(row.createdAt);
  const expectedAge = Math.round(Math.max(asOfMs - createdAt, 0) / 60000 * 100) / 100;
  if (!closeNumber(row.ageMinutes, expectedAge)) return null;
  const expectedOverdue = row.dueAt !== null && Date.parse(row.dueAt) < asOfMs;
  const expectedOverdueMinutes = expectedOverdue
    ? Math.round((asOfMs - Date.parse(row.dueAt as string)) / 60000 * 100) / 100
    : null;
  if (row.isOverdue !== expectedOverdue ||
      (expectedOverdueMinutes === null
        ? row.overdueMinutes !== null
        : row.overdueMinutes === null || !closeNumber(row.overdueMinutes, expectedOverdueMinutes))) return null;
  return {
    id: row.id, title: row.title, taskType: row.taskType,
    sourceEntityType: row.sourceEntityType as string | null,
    sourceEntityId: row.sourceEntityId as string | null,
    taskRole: row.taskRole as TaskIntelligenceRole,
    priority: row.priority, status: row.status, createdAt: row.createdAt,
    dueAt: row.dueAt as string | null, ageMinutes: row.ageMinutes,
    overdueMinutes: row.overdueMinutes, assignedProfileId: row.assignedProfileId as string | null,
    isOverdue: row.isOverdue, delayReason: null, requiredManagementDecision: null,
  };
}

function dateOfWeek(value: string): string {
  const date = new Date(value + "T00:00:00.000Z");
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function parseTaskIntelligenceReport(
  value: unknown,
  expectedKind: TaskIntelligenceReportKind,
): TaskIntelligenceReport | null {
  const row = record(value);
  const scope = record(row?.scope);
  const quality = record(row?.quality);
  const period = record(row?.period);
  if (!row || !scope || !quality || !period || row.status !== "VERIFIED" ||
    row.reportKind !== expectedKind || !isTimestamp(row.asOf) ||
    !isDay(period.from) || !isDay(period.to) || period.from > period.to ||
    period.timeZone !== "UTC" || !Array.isArray(scope.visibleRoles) ||
    scope.visibleRoles.length === 0 ||
    scope.visibleRoles.some(role => typeof role !== "string" || !ROLES.has(role as TaskIntelligenceRole)) ||
    new Set(scope.visibleRoles).size !== scope.visibleRoles.length ||
    scope.completePopulation !== true || !isCount(scope.visibleTaskCount) ||
    typeof scope.managerViewAvailable !== "boolean" ||
    (scope.managerRiskTotalCount !== null && !isCount(scope.managerRiskTotalCount)) ||
    (scope.managerRiskReturnedCount !== null && !isCount(scope.managerRiskReturnedCount)) ||
    typeof scope.managerRiskCompletePopulation !== "boolean" ||
    !Array.isArray(row.roleSummaries) || !Array.isArray(row.sourceBreakdown) ||
    !Array.isArray(row.weeklyTrend) || !Array.isArray(row.managerRisks) ||
    typeof quality.reopenRateDefinition !== "string" ||
    quality.waitingOnOtherPartyCount !== null || quality.falseAlarmCount !== null ||
    quality.repeatedCauses !== null || quality.improvementOutcomes !== null ||
    quality.employeeComparisonPerformed !== false ||
    !Array.isArray(row.limitations) ||
    row.limitations.some(item => typeof item !== "string")) return null;

  const periodFrom = period.from as string;
  const periodTo = period.to as string;
  const roleSummaries = row.roleSummaries.map(parseRoleSummary);
  const sourceBreakdown = row.sourceBreakdown.map(parseSourceSummary);
  const weeklyTrend = row.weeklyTrend.map(parseWeeklyPoint);
  const managerRisks = row.managerRisks.map(item => parseManagerRisk(item, row.asOf as string));
  if (roleSummaries.some(item => item === null) ||
    sourceBreakdown.some(item => item === null) ||
    weeklyTrend.some(item => item === null) ||
    managerRisks.some(item => item === null) ||
    roleSummaries.length !== scope.visibleRoles.length ||
    new Set((roleSummaries as TaskIntelligenceRoleSummary[]).map(item => item.taskRole)).size !== roleSummaries.length ||
    (expectedKind === "MANAGER" && !scope.managerViewAvailable)) return null;

  const riskTotal = scope.managerRiskTotalCount;
  const riskReturned = scope.managerRiskReturnedCount;
  if (scope.managerViewAvailable) {
    if (!isCount(riskTotal) || !isCount(riskReturned) ||
      riskReturned !== Math.min(riskTotal, 25) ||
      riskReturned !== managerRisks.length ||
      scope.managerRiskCompletePopulation !== (riskTotal <= 25) ||
      new Set((managerRisks as TaskIntelligenceManagerRisk[]).map(item => item.id)).size !== managerRisks.length) return null;
  } else if (riskTotal !== null || riskReturned !== null ||
    scope.managerRiskCompletePopulation !== false || managerRisks.length !== 0) {
    return null;
  }

  const sourceIdentities = (sourceBreakdown as TaskIntelligenceSourceSummary[])
    .map(item => item.sourceKey + ":" + item.taskRole + ":" + item.priority);
  if (new Set(sourceIdentities).size !== sourceIdentities.length) return null;

  const weekStarts = (weeklyTrend as TaskIntelligenceWeeklyPoint[]).map(item => item.weekStart);
  if (new Set(weekStarts).size !== weekStarts.length ||
    weekStarts.some((value, index) => {
      const date = new Date(value + "T00:00:00.000Z");
      return date.getUTCDay() !== 1 ||
        value < dateOfWeek(periodFrom) || value > dateOfWeek(periodTo) ||
        (index > 0 && value <= weekStarts[index - 1]);
    })) return null;

  return {
    status: "VERIFIED", reportKind: expectedKind, asOf: row.asOf,
    period: { from: periodFrom, to: periodTo, timeZone: "UTC" },
    scope: {
      visibleRoles: scope.visibleRoles as TaskIntelligenceRole[],
      completePopulation: true, visibleTaskCount: scope.visibleTaskCount,
      managerViewAvailable: scope.managerViewAvailable,
      managerRiskTotalCount: scope.managerRiskTotalCount as number | null,
      managerRiskReturnedCount: scope.managerRiskReturnedCount as number | null,
      managerRiskCompletePopulation: scope.managerRiskCompletePopulation,
    },
    state: scope.visibleTaskCount === 0 ? "EMPTY" : "READY",
    roleSummaries: roleSummaries as TaskIntelligenceRoleSummary[],
    sourceBreakdown: sourceBreakdown as TaskIntelligenceSourceSummary[],
    weeklyTrend: weeklyTrend as TaskIntelligenceWeeklyPoint[],
    managerRisks: managerRisks as TaskIntelligenceManagerRisk[],
    quality: {
      reopenRateDefinition: quality.reopenRateDefinition,
      waitingOnOtherPartyCount: null, falseAlarmCount: null,
      repeatedCauses: null, improvementOutcomes: null,
      employeeComparisonPerformed: false,
    },
    qualityReviewSnapshot: null,
    limitations: row.limitations as string[],
  };
}
