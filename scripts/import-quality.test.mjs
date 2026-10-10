import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyImportDqs,
  evaluateImportDqs,
  validateImportDqsThresholds,
} from '../src/lib/importQuality.ts'

const thresholds = {
  dqs_warning_min: 50,
  dqs_acceptable_min: 75,
  dqs_excellent_min: 90,
}

const perfectMetrics = () => ({
  totalRows: 4,
  requiredCells: 8,
  completenessCells: 8,
  validRows: 4,
  acceptedRows: 4,
  duplicateRows: 0,
  rejectedRows: 0,
  consistentRows: 4,
  nonEmptyKeys: 4,
  temporalApplicable: false,
  temporalValid: 0,
  temporalTotal: 0,
})

test('perfect CSV metrics score 100 and produce a snapshot only', () => {
  const result = evaluateImportDqs(perfectMetrics(), thresholds)
  assert.equal(result.qualityScore, 100)
  assert.equal(result.status, 'snapshotted')
  assert.equal(result.warningRows, 0)
  assert.equal(result.errorCode, null)
  assert.equal(result.qualityBreakdown.temporal_integrity.applicable, false)
  assert.equal(result.qualityBreakdown.weights.temporal_integrity, 0)
  assert.match(result.message, /لم تُدمج البيانات/)
})

test('temporal integrity is not weighted when date columns have no usable evidence', () => {
  const metrics = { ...perfectMetrics(), temporalApplicable: true, temporalValid: 0, temporalTotal: 0 }
  const result = evaluateImportDqs(metrics, thresholds)
  assert.equal(result.qualityScore, 100)
  assert.equal(result.qualityBreakdown.temporal_integrity.applicable, false)
  assert.equal(result.qualityBreakdown.weights.temporal_integrity, 0)
})

test('invalid date evidence lowers the score only when temporal evidence exists', () => {
  const metrics = { ...perfectMetrics(), temporalApplicable: true, temporalValid: 0, temporalTotal: 4 }
  const result = evaluateImportDqs(metrics, thresholds)
  assert.equal(result.qualityScore, 90)
  assert.equal(result.qualityBreakdown.temporal_integrity.applicable, true)
  assert.equal(result.qualityBreakdown.temporal_integrity.checked_values, 4)
  assert.equal(result.qualityBreakdown.weights.temporal_integrity, 0.1)
})

test('duplicate and rejected rows lower uniqueness and validity rather than disappearing from DQS', () => {
  const metrics = {
    ...perfectMetrics(),
    completenessCells: 7,
    validRows: 3,
    acceptedRows: 2,
    duplicateRows: 1,
    rejectedRows: 1,
  }
  const result = evaluateImportDqs(metrics, thresholds)
  assert.ok(result.qualityScore < 100)
  assert.equal(result.qualityBreakdown.uniqueness, 75)
  assert.equal(result.qualityBreakdown.validity, 75)
  assert.equal(result.status, 'snapshotted')
  assert.equal(result.errorCode, 'DQS_WARNINGS')
  assert.equal(result.warningRows, 2)
})

test('DQS threshold boundaries have deterministic, non-overlapping classification', () => {
  assert.equal(classifyImportDqs(90, 3, thresholds).status, 'snapshotted')
  assert.equal(classifyImportDqs(89.99, 3, thresholds).status, 'snapshotted')
  assert.equal(classifyImportDqs(89.99, 3, thresholds).errorCode, 'DQS_WARNINGS')
  assert.equal(classifyImportDqs(75, 3, thresholds).errorCode, 'DQS_WARNINGS')
  assert.equal(classifyImportDqs(74.99, 3, thresholds).status, 'manual_review')
  assert.equal(classifyImportDqs(50, 3, thresholds).status, 'manual_review')
  assert.equal(classifyImportDqs(49.99, 3, thresholds).status, 'rejected')
  assert.match(classifyImportDqs(49.99, 3, thresholds).message, /أقل من 50/)
})

test('threshold configuration is rejected when unordered, infinite, or outside 0..100', () => {
  assert.throws(() => validateImportDqsThresholds({
    dqs_warning_min: 75, dqs_acceptable_min: 50, dqs_excellent_min: 90,
  }), /DQS_THRESHOLDS_INVALID/)
  assert.throws(() => validateImportDqsThresholds({
    dqs_warning_min: 0, dqs_acceptable_min: 75, dqs_excellent_min: 101,
  }), /DQS_THRESHOLDS_INVALID/)
  assert.throws(() => validateImportDqsThresholds({
    dqs_warning_min: 0, dqs_acceptable_min: Number.POSITIVE_INFINITY, dqs_excellent_min: 100,
  }), /DQS_THRESHOLDS_INVALID/)
})

test('empty datasets, fractional/negative counters, and inconsistent partitions fail closed', () => {
  assert.throws(() => evaluateImportDqs({ ...perfectMetrics(), totalRows: 0, acceptedRows: 0 }, thresholds), /DQS_EMPTY_DATASET/)
  assert.throws(() => evaluateImportDqs({ ...perfectMetrics(), acceptedRows: -1 }, thresholds), /DQS_METRICS_INVALID:acceptedRows/)
  assert.throws(() => evaluateImportDqs({ ...perfectMetrics(), validRows: 1.5 }, thresholds), /DQS_METRICS_INVALID:validRows/)
  assert.throws(() => evaluateImportDqs({ ...perfectMetrics(), acceptedRows: 3 }, thresholds), /DQS_METRICS_INVALID/)
  assert.throws(() => evaluateImportDqs({ ...perfectMetrics(), temporalValid: 1, temporalTotal: 0 }, thresholds), /DQS_METRICS_INVALID/)
})

test('threshold inputs and scored outputs reject non-finite or out-of-range values', () => {
  assert.throws(() => classifyImportDqs(Number.NaN, 1, thresholds), /DQS_SCORE_INVALID/)
  assert.throws(() => classifyImportDqs(100.01, 1, thresholds), /DQS_SCORE_INVALID/)
  assert.throws(() => classifyImportDqs(80, 1.5, thresholds), /DQS_METRICS_INVALID:acceptedRows/)
})
