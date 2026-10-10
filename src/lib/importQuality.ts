export type ImportDqsStatus = 'snapshotted' | 'manual_review' | 'rejected'

export interface ImportDqsThresholds {
  dqs_warning_min: number
  dqs_acceptable_min: number
  dqs_excellent_min: number
}

export interface ImportDqsMetrics {
  totalRows: number
  requiredCells: number
  completenessCells: number
  validRows: number
  acceptedRows: number
  duplicateRows: number
  rejectedRows: number
  consistentRows: number
  nonEmptyKeys: number
  temporalApplicable: boolean
  temporalValid: number
  temporalTotal: number
}

export interface ImportDqsEvaluation {
  qualityScore: number
  qualityBreakdown: Record<string, unknown>
  status: ImportDqsStatus
  warningRows: number
  errorCode: 'DQS_REVIEW_REQUIRED' | 'DQS_WARNINGS' | null
  errorMessage: string | null
  message: string
}

const snapshotMessage = 'تم توحيد السجلات والتحقق منها وحفظ بيان Snapshot؛ لم تُدمج البيانات في قاعدة التشغيل.'
const warningMessage = 'تم حفظ Snapshot مع تحذير جودة؛ لم تُدمج البيانات في قاعدة التشغيل.'
const manualReviewMessage = 'جودة البيانات تتطلب مراجعة بشرية قبل أي اعتماد.'

export function validateImportDqsThresholds(thresholds: ImportDqsThresholds): void {
  const values = [
    thresholds.dqs_warning_min,
    thresholds.dqs_acceptable_min,
    thresholds.dqs_excellent_min,
  ]
  if (values.some(value => !Number.isFinite(value) || value < 0 || value > 100)) {
    throw new Error('DQS_THRESHOLDS_INVALID')
  }
  if (!(thresholds.dqs_warning_min <= thresholds.dqs_acceptable_min
    && thresholds.dqs_acceptable_min <= thresholds.dqs_excellent_min)) {
    throw new Error('DQS_THRESHOLDS_INVALID')
  }
}

function assertCounter(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new Error('DQS_METRICS_INVALID:' + name)
}

function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 100
  return Math.max(0, Math.min(100, (numerator / denominator) * 100))
}

export function classifyImportDqs(
  score: number,
  acceptedRows: number,
  thresholds: ImportDqsThresholds,
): Pick<ImportDqsEvaluation, 'status' | 'warningRows' | 'errorCode' | 'errorMessage' | 'message'> {
  validateImportDqsThresholds(thresholds)
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('DQS_SCORE_INVALID')
  assertCounter('acceptedRows', acceptedRows)

  if (score >= thresholds.dqs_excellent_min) {
    return {
      status: 'snapshotted',
      warningRows: 0,
      errorCode: null,
      errorMessage: null,
      message: snapshotMessage,
    }
  }

  if (score >= thresholds.dqs_acceptable_min) {
    return {
      status: 'snapshotted',
      warningRows: acceptedRows,
      errorCode: 'DQS_WARNINGS',
      errorMessage: null,
      message: warningMessage,
    }
  }

  if (score >= thresholds.dqs_warning_min) {
    return {
      status: 'manual_review',
      warningRows: 0,
      errorCode: 'DQS_REVIEW_REQUIRED',
      errorMessage: manualReviewMessage,
      message: manualReviewMessage,
    }
  }

  const rejectedMessage = 'رُفضت الدفعة لأن جودة البيانات أقل من ' + thresholds.dqs_warning_min + '؛ لم تُدمج أي بيانات.'
  return {
    status: 'rejected',
    warningRows: 0,
    errorCode: 'DQS_REVIEW_REQUIRED',
    errorMessage: rejectedMessage,
    message: rejectedMessage,
  }
}

export function evaluateImportDqs(
  metrics: ImportDqsMetrics,
  thresholds: ImportDqsThresholds,
): ImportDqsEvaluation {
  validateImportDqsThresholds(thresholds)

  const counters: Array<[keyof ImportDqsMetrics, number]> = [
    ['totalRows', metrics.totalRows],
    ['requiredCells', metrics.requiredCells],
    ['completenessCells', metrics.completenessCells],
    ['validRows', metrics.validRows],
    ['acceptedRows', metrics.acceptedRows],
    ['duplicateRows', metrics.duplicateRows],
    ['rejectedRows', metrics.rejectedRows],
    ['consistentRows', metrics.consistentRows],
    ['nonEmptyKeys', metrics.nonEmptyKeys],
    ['temporalValid', metrics.temporalValid],
    ['temporalTotal', metrics.temporalTotal],
  ]
  for (const [name, value] of counters) assertCounter(String(name), value)

  if (metrics.totalRows === 0) throw new Error('DQS_EMPTY_DATASET')
  if (metrics.completenessCells > metrics.requiredCells
    || metrics.validRows > metrics.totalRows
    || metrics.acceptedRows > metrics.totalRows
    || metrics.duplicateRows > metrics.totalRows
    || metrics.rejectedRows > metrics.totalRows
    || metrics.consistentRows > metrics.totalRows
    || metrics.nonEmptyKeys > metrics.totalRows
    || metrics.temporalValid > metrics.temporalTotal
    || (!metrics.temporalApplicable && metrics.temporalTotal > 0)
    || metrics.acceptedRows + metrics.duplicateRows > metrics.validRows
    || typeof metrics.temporalApplicable !== 'boolean'
    || metrics.acceptedRows + metrics.duplicateRows + metrics.rejectedRows !== metrics.totalRows) {
    throw new Error('DQS_METRICS_INVALID')
  }

  const completeness = safeRatio(metrics.completenessCells, metrics.requiredCells)
  const validity = safeRatio(metrics.validRows, metrics.totalRows)
  const uniqueness = safeRatio(metrics.totalRows - metrics.duplicateRows, metrics.totalRows)
  const consistency = safeRatio(metrics.consistentRows, metrics.totalRows)
  const temporalIntegrity = metrics.temporalTotal > 0 ? safeRatio(metrics.temporalValid, metrics.temporalTotal) : 100
  const temporalHasEvidence = metrics.temporalApplicable && metrics.temporalTotal > 0
  const matchingKeyCoverage = safeRatio(metrics.nonEmptyKeys, metrics.totalRows)
  const activeWeight = 0.25 + 0.25 + 0.20 + 0.10 + 0.10 + (temporalHasEvidence ? 0.10 : 0)
  const weightedScore = completeness * 0.25
    + validity * 0.25
    + uniqueness * 0.20
    + consistency * 0.10
    + matchingKeyCoverage * 0.10
    + (temporalHasEvidence ? temporalIntegrity * 0.10 : 0)
  const qualityScore = Math.round((weightedScore / activeWeight) * 100) / 100

  const qualityBreakdown: Record<string, unknown> = {
    score: qualityScore,
    completeness,
    validity,
    uniqueness,
    consistency,
    matching_key_coverage: matchingKeyCoverage,
    temporal_integrity: {
      score: temporalIntegrity,
      applicable: temporalHasEvidence,
      checked_values: metrics.temporalTotal,
    },
    referential_integrity: {
      score: null,
      applicable: false,
      reason: 'التحقق من العلاقات المرجعية بين الجداول يُجرى قبل الدمج؛ لم يُنفذ في مرحلة Snapshot.',
    },
    weights: {
      completeness: 0.25,
      validity: 0.25,
      uniqueness: 0.2,
      consistency: 0.1,
      matching_key_coverage: 0.1,
      temporal_integrity: temporalHasEvidence ? 0.1 : 0,
    },
  }

  return {
    qualityScore,
    qualityBreakdown,
    ...classifyImportDqs(qualityScore, metrics.acceptedRows, thresholds),
  }
}
