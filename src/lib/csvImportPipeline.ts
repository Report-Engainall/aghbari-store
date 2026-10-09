import { supabase } from '@/lib/supabase'

type JsonRecord = Record<string, unknown>

export interface CsvImportProfile {
  id: string
  required_columns?: unknown
  optional_columns?: unknown
  ignored_columns?: unknown
  synonyms?: unknown
  validation_rules?: unknown
  matching_key?: string
}

export interface CsvImportProgress {
  stage: string
  processedRows: number
  bytesRead: number
  totalBytes: number
}

export interface CsvImportResult {
  uploadId: string
  status: 'snapshotted' | 'manual_review' | 'rejected'
  totalRows: number
  acceptedRows: number
  warningRows: number
  rejectedRows: number
  duplicateRows: number
  qualityScore: number | null
  message: string
}

const MAX_ROWS = 100_000
const MAX_COLUMNS = 100
const MAX_CELL_LENGTH = 4_000
const PROCESSING_BATCH_SIZE = 500

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function normalizeHeader(value: string): string {
  return value.normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .toLocaleLowerCase('ar').replace(/[\s_-]+/g, ' ').trim()
}

function normalizeCell(value: string): string {
  // SKU/customer/supplier codes remain strings. In particular, leading zeroes are never numerically coerced.
  return value.replace(/\s+/g, ' ').trim()
}

function fieldSynonyms(profile: CsvImportProfile, field: string): string[] {
  const dict = profile.synonyms && typeof profile.synonyms === 'object' ? profile.synonyms as JsonRecord : {}
  const value = dict[field]
  return [field, ...asStringArray(value)]
}

function buildMapping(headers: string[], profile: CsvImportProfile): Record<string, number> {
  const required = asStringArray(profile.required_columns)
  const optional = asStringArray(profile.optional_columns)
  const ignored = new Set(asStringArray(profile.ignored_columns).map(normalizeHeader))
  const mapping: Record<string, number> = {}
  const normalizedHeaders = headers.map(normalizeHeader)
  for (const field of [...new Set([...required, ...optional])]) {
    if (ignored.has(normalizeHeader(field))) continue
    const alternatives = new Set(fieldSynonyms(profile, field).map(normalizeHeader))
    const index = normalizedHeaders.findIndex(header => alternatives.has(header))
    if (index >= 0) mapping[field] = index
  }
  return mapping
}

/** Streaming CSV reader: records and fields are yielded incrementally, not collected as a full dataset. */
async function* csvRows(file: File): AsyncGenerator<string[]> {
  const reader = file.stream().getReader()
  const decoder = new TextDecoder('utf-8')
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let pendingQuote = false
  let skipLf = false

  const emit = (): string[] => {
    row.push(field)
    field = ''
    const result = row
    row = []
    return result
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true })
      for (let i = 0; i < chunk.length; i++) {
        const char = chunk[i]
        if (skipLf) {
          skipLf = false
          if (char === '\n') continue
        }
        if (pendingQuote) {
          pendingQuote = false
          if (char === '"') {
            field += '"'
            inQuotes = true
            continue
          }
          inQuotes = false
        }
        if (inQuotes) {
          if (char === '"') {
            if (i + 1 < chunk.length) {
              if (chunk[i + 1] === '"') { field += '"'; i++ }
              else inQuotes = false
            } else {
              pendingQuote = true
            }
          } else {
            field += char
          }
          continue
        }
        if (char === '"' && field.length === 0) { inQuotes = true; continue }
        if (char === ',') { row.push(field); field = ''; continue }
        if (char === '\n') { yield emit(); continue }
        if (char === '\r') { yield emit(); skipLf = true; continue }
        field += char
      }
      if (done) break
    }
    if (pendingQuote) { pendingQuote = false; inQuotes = false }
    if (inQuotes) throw new Error('CSV_MALFORMED_QUOTED_FIELD')
    if (field.length > 0 || row.length > 0) yield emit()
  } finally {
    reader.releaseLock()
  }
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator <= 0 ? 100 : Math.max(0, Math.min(100, (numerator / denominator) * 100))
}

async function setUpload(uploadId: string, patch: JsonRecord): Promise<void> {
  const { error } = await supabase.from('import_uploads').update(patch).eq('id', uploadId)
  if (error) throw error
}

/**
 * The CSV path performs real streaming extraction, mapping, validation, normalization, deduplication,
 * row chunking, and snapshotting. It deliberately stops before changing live operational records.
 */
export async function processCsvToSnapshot(args: {
  file: File
  organizationId: string
  profile: CsvImportProfile
  fileHash: string
  onProgress?: (progress: CsvImportProgress) => void
}): Promise<CsvImportResult> {
  const { file, organizationId, profile, fileHash, onProgress } = args
  const { data: upload, error: createError } = await supabase.from('import_uploads').insert({
    organization_id: organizationId,
    profile_id: profile.id,
    file_name: file.name,
    file_type: 'csv',
    file_size: file.size,
    file_hash: fileHash,
    status: 'detecting',
  }).select('id').single()
  if (createError) throw createError
  const uploadId = String(upload.id)
  const report = (stage: string, processedRows: number) => onProgress?.({
    stage, processedRows, bytesRead: Math.min(file.size, Math.round((processedRows / Math.max(MAX_ROWS, processedRows, 1)) * file.size)),
    totalBytes: file.size,
  })

  let totalRows = 0
  let completenessCells = 0
  let requiredCells = 0
  let validRows = 0
  let consistentRows = 0
  let nonEmptyKeys = 0
  let duplicateRows = 0
  let rejectedRows = 0
  let temporalApplicable = false
  let temporalValid = 0
  let temporalTotal = 0
  const seenKeys = new Set<string>()
  const batch: JsonRecord[] = []
  let headers: string[] = []
  let mapping: Record<string, number> = {}
  const required = asStringArray(profile.required_columns)
  const matchingKey = profile.matching_key || 'item_code'

  try {
    report('اكتشاف بنية CSV', 0)
    const iterator = csvRows(file)
    const first = await iterator.next()
    headers = (first.value || []).map((header, index) => index === 0 ? header.replace(/^\uFEFF/, '') : header)
    if (first.done || !headers.length || (headers.length === 1 && !headers[0].trim())) {
      throw new Error('CSV_HEADER_MISSING')
    }
    if (headers.length > MAX_COLUMNS) throw new Error('MAX_COLUMNS_EXCEEDED')

    await setUpload(uploadId, { status: 'mapping' })
    mapping = buildMapping(headers, profile)
    const missingFields = required.filter(field => mapping[field] === undefined)
    if (missingFields.length) {
      const message = `أعمدة مطلوبة غير موجودة: ${missingFields.join('، ')}`
      await setUpload(uploadId, {
        status: 'manual_review', error_code: 'MANUAL_MAPPING_REQUIRED',
        error_message: message,
        snapshot: { headers, missing_required_columns: missingFields, file_hash: fileHash },
      })
      return { uploadId, status: 'manual_review', totalRows: 0, acceptedRows: 0, warningRows: 0, rejectedRows: 0, duplicateRows: 0, qualityScore: null, message }
    }

    const dateFields = Object.keys(mapping).filter(field => /date|period|time|تاريخ|فترة|يوم/i.test(field))
    temporalApplicable = dateFields.length > 0
    await setUpload(uploadId, { status: 'validating' })

    const flush = async () => {
      if (!batch.length) return
      const { error } = await supabase.from('import_records').insert(batch.splice(0, batch.length))
      if (error) throw error
      report('معالجة الدفعات', totalRows)
    }

    const consume = async (cells: string[]) => {
      if (cells.every(cell => !cell.trim())) return
      totalRows++
      if (totalRows > MAX_ROWS) throw new Error('MAX_ROWS_EXCEEDED')
      let rowConsistent = cells.length === headers.length
      const errors: string[] = []
      const warnings: string[] = []
      if (!rowConsistent) errors.push('عدد الخلايا لا يطابق عدد الأعمدة')
      const normalized: Record<string, string> = {}
      for (const [field, index] of Object.entries(mapping)) {
        const raw = cells[index] ?? ''
        const value = normalizeCell(raw)
        normalized[field] = value
        if (value.length > MAX_CELL_LENGTH) errors.push(`الحقل ${field} يتجاوز ${MAX_CELL_LENGTH} حرفاً`)
        if (required.includes(field)) {
          requiredCells++
          if (value) completenessCells++
          else errors.push(`الحقل المطلوب ${field} فارغ`)
        }
      }
      if (rowConsistent) consistentRows++
      if (errors.length === 0) validRows++
      const key = normalizeCell(normalized[matchingKey] || '')
      if (key) nonEmptyKeys++
      let isDuplicate = false
      if (key) {
        const normalizedKey = normalizeHeader(key)
        if (seenKeys.has(normalizedKey)) isDuplicate = true
        else seenKeys.add(normalizedKey)
      }
      if (isDuplicate) { duplicateRows++; warnings.push(`مفتاح مكرر داخل الملف: ${key}`) }
      for (const field of dateFields) {
        const value = normalized[field] || ''
        if (value) {
          temporalTotal++
          if (!Number.isNaN(Date.parse(value))) temporalValid++
          else warnings.push(`قيمة تاريخ غير قابلة للتحليل في ${field}`)
        }
      }
      const status = errors.length ? 'rejected' : isDuplicate ? 'duplicate' : 'accepted'
      if (errors.length) rejectedRows++
      batch.push({
        upload_id: uploadId,
        row_number: totalRows,
        matching_key: key || null,
        normalized_record: normalized,
        validation_errors: errors,
        validation_warnings: warnings,
        status,
      })
      if (batch.length >= PROCESSING_BATCH_SIZE) await flush()
    }

    await setUpload(uploadId, { status: 'normalizing' })
    for await (const row of iterator) await consume(row)
    await flush()

    if (totalRows === 0) throw new Error('CSV_HAS_NO_DATA_ROWS')

    await setUpload(uploadId, { status: 'deduplicating' })
    const completeness = safeRatio(completenessCells, requiredCells)
    const validity = safeRatio(validRows, totalRows)
    const uniqueness = safeRatio(totalRows - duplicateRows, totalRows)
    const consistency = safeRatio(consistentRows, totalRows)
    const temporalIntegrity = temporalApplicable ? safeRatio(temporalValid, temporalTotal) : 100
    const referentialIntegrity = safeRatio(nonEmptyKeys, totalRows)
    const qualityScore = Math.round((
      completeness * 0.25 + validity * 0.25 + uniqueness * 0.20 +
      consistency * 0.10 + temporalIntegrity * 0.10 + referentialIntegrity * 0.10
    ) * 100) / 100

    const qualityBreakdown = {
      score: qualityScore,
      completeness, validity, uniqueness, consistency,
      temporal_integrity: { score: temporalIntegrity, applicable: temporalApplicable, checked_values: temporalTotal },
      referential_integrity: { score: referentialIntegrity, definition: 'مفاتيح المطابقة غير الفارغة؛ لم تُعدّل قاعدة البيانات التشغيلية.' },
      weights: { completeness: 0.25, validity: 0.25, uniqueness: 0.2, consistency: 0.1, temporal_integrity: 0.1, referential_integrity: 0.1 },
    }

    await setUpload(uploadId, { status: 'chunking' })
    let status: CsvImportResult['status'] = qualityScore >= 50 ? 'snapshotted' : 'rejected'
    let message = 'تم توحيد السجلات والتحقق منها وحفظ بيان Snapshot؛ لم تُدمج البيانات في قاعدة التشغيل.'
    if (qualityScore >= 75 && qualityScore < 90) {
      await supabase.from('import_records').update({ status: 'warning' }).eq('upload_id', uploadId).eq('status', 'accepted')
      message = 'تم حفظ Snapshot مع تحذير جودة؛ لم تُدمج البيانات في قاعدة التشغيل.'
    } else if (qualityScore >= 50 && qualityScore < 75) {
      status = 'manual_review'
      message = 'جودة البيانات تتطلب مراجعة بشرية قبل أي اعتماد.'
    } else if (qualityScore < 50) {
      await supabase.from('import_records').update({ status: 'rejected' }).eq('upload_id', uploadId)
      message = 'رُفضت الدفعة لأن جودة البيانات أقل من 50؛ لم تُدمج أي بيانات.'
    }

    await setUpload(uploadId, { status: 'snapshotted' })
    const manifest = {
      manifest_version: 1, file_name: file.name, file_type: 'csv', file_size: file.size,
      file_hash: fileHash, profile_id: profile.id, profile_version: (profile as JsonRecord).version ?? null,
      headers, column_mapping: mapping, total_rows: totalRows,
      accepted_rows: validRows - duplicateRows - rejectedRows,
      warning_rows: qualityScore >= 75 && qualityScore < 90 ? validRows - duplicateRows - rejectedRows : 0,
      rejected_rows: rejectedRows, duplicate_rows: duplicateRows, dqs: qualityBreakdown,
      snapshot_at: new Date().toISOString(), raw_file_persisted: false,
      live_data_merged: false,
    }
    await setUpload(uploadId, {
      status,
      quality_score: qualityScore,
      quality_breakdown: qualityBreakdown,
      error_code: qualityScore < 75 ? 'DQS_REVIEW_REQUIRED' : qualityScore < 90 ? 'DQS_WARNINGS' : null,
      error_message: qualityScore < 75 ? message : null,
      snapshot: manifest,
    })
    return {
      uploadId, status, totalRows, acceptedRows: validRows - duplicateRows - rejectedRows,
      warningRows: qualityScore >= 75 && qualityScore < 90 ? validRows - duplicateRows - rejectedRows : 0,
      rejectedRows, duplicateRows, qualityScore, message,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'IMPORT_PROCESSING_FAILED'
    await supabase.from('import_uploads').update({
      status: 'failed', error_code: reason, error_message: reason,
    }).eq('id', uploadId)
    throw error
  }
}
