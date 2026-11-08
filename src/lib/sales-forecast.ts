export type SalesForecastUnavailableReason =
  | 'insufficient_history'
  | 'missing_days'
  | 'invalid_data';

export type SalesForecastPoint = {
  day: string;
  sales: number;
};

/**
 * Applies a user-entered what-if percentage to a forecast total without
 * mutating the source data. Returns null for invalid or unsafe calculations.
 * The supported range is an explicit UI guard, not a claim about likely outcomes.
 */
function isValidForecastDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function calculateWhatIfSales(expectedTotal: number, changePercent: number): number | null {
  if (
    !Number.isFinite(expectedTotal) ||
    expectedTotal < 0 ||
    !Number.isFinite(changePercent) ||
    changePercent < -100 ||
    changePercent > 500
  ) {
    return null;
  }
  const resultCents = Math.round(expectedTotal * (1 + changePercent / 100) * 100);
  if (!Number.isSafeInteger(resultCents) || resultCents < 0) return null;
  return resultCents / 100;
}

export type SalesForecastResult =
  | {
      ready: false;
      reason: SalesForecastUnavailableReason;
      availableDays: number;
    }
  | {
      ready: true;
      availableDays: number;
      historicalDays: number;
      dailyBaseline: number;
      expectedTotal: number;
      lowerScenario: number;
      upperScenario: number;
      meanAbsoluteError: number;
      lastHistoricalDay: string;
      days: Array<{ day: string; expectedSales: number }>;
    };

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUIRED_DAYS = 21;
const WINDOW_DAYS = 7;

function unavailable(
  reason: SalesForecastUnavailableReason,
  availableDays: number,
): SalesForecastResult {
  return { ready: false, reason, availableDays };
}

function parseIsoDay(day: unknown): number | null {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = Date.parse(day + 'T00:00:00.000Z');
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString().slice(0, 10) === day ? time : null;
}

function toCents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function safeWindowSum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

function meanCents(values: readonly number[]): number | null {
  if (values.length !== WINDOW_DAYS) return null;
  const sum = safeWindowSum(values);
  if (sum === null) return null;
  const mean = Math.round(sum / WINDOW_DAYS);
  return Number.isSafeInteger(mean) ? mean : null;
}

/**
 * Deterministic 7-day moving-average planning baseline.
 * It refuses to forecast when daily history is short, invalid, duplicated,
 * or discontinuous; missing days are never silently treated as zero sales.
 * The error band is a descriptive back-test planning scenario, not a
 * statistical confidence interval.
 */
export function buildSalesForecast(points: readonly SalesForecastPoint[]): SalesForecastResult {
  if (!Array.isArray(points)) return unavailable('invalid_data', 0);

  const normalized: Array<{ day: string; timestamp: number; salesCents: number }> = [];
  const seen = new Set<string>();

  for (const point of points as readonly unknown[]) {
    if (typeof point !== 'object' || point === null || Array.isArray(point)) {
      return unavailable('invalid_data', normalized.length);
    }
    const raw = point as Record<string, unknown>;
    const timestamp = parseIsoDay(raw.day);
    const salesCents = toCents(raw.sales);
    if (timestamp === null || salesCents === null) {
      return unavailable('invalid_data', normalized.length);
    }
    const day = String(raw.day);
    if (seen.has(day)) return unavailable('invalid_data', normalized.length);
    seen.add(day);
    normalized.push({ day, timestamp, salesCents });
  }

  if (normalized.length < REQUIRED_DAYS) {
    return unavailable('insufficient_history', normalized.length);
  }

  normalized.sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 1; i < normalized.length; i += 1) {
    if (normalized[i].timestamp - normalized[i - 1].timestamp !== DAY_MS) {
      return unavailable('missing_days', normalized.length);
    }
  }

  const validationStart = normalized.length - WINDOW_DAYS;
  const absoluteErrors: number[] = [];
  for (let i = validationStart; i < normalized.length; i += 1) {
    const trainingValues = normalized.slice(i - WINDOW_DAYS, i).map((item) => item.salesCents);
    const predictedCents = meanCents(trainingValues);
    if (predictedCents === null) return unavailable('invalid_data', normalized.length);
    absoluteErrors.push(Math.abs(normalized[i].salesCents - predictedCents));
  }

  const maeSum = safeWindowSum(absoluteErrors);
  const meanAbsoluteErrorCents = maeSum === null
    ? null
    : Math.round(maeSum / WINDOW_DAYS);
  const baselineCents = meanCents(normalized.slice(-WINDOW_DAYS).map((item) => item.salesCents));
  if (baselineCents === null || meanAbsoluteErrorCents === null) {
    return unavailable('invalid_data', normalized.length);
  }

  const expectedTotalCents = baselineCents * WINDOW_DAYS;
  const scenarioErrorCents = meanAbsoluteErrorCents * WINDOW_DAYS;
  const upperScenarioCents = expectedTotalCents + scenarioErrorCents;
  if (![expectedTotalCents, scenarioErrorCents, upperScenarioCents].every(Number.isSafeInteger)) {
    return unavailable('invalid_data', normalized.length);
  }

  const last = normalized[normalized.length - 1];
  const days: Array<{ day: string; expectedSales: number }> = [];
  for (let offset = 1; offset <= WINDOW_DAYS; offset += 1) {
    const time = last.timestamp + DAY_MS * offset;
    const date = new Date(time);
    if (!Number.isFinite(time) || Number.isNaN(date.getTime())) {
      return unavailable('invalid_data', normalized.length);
    }
    const day = date.toISOString().slice(0, 10);
    if (!isValidForecastDay(day)) {
      return unavailable('invalid_data', normalized.length);
    }
    days.push({ day, expectedSales: baselineCents / 100 });
  }

  return {
    ready: true,
    availableDays: normalized.length,
    historicalDays: normalized.length,
    dailyBaseline: baselineCents / 100,
    expectedTotal: expectedTotalCents / 100,
    lowerScenario: Math.max(0, expectedTotalCents - scenarioErrorCents) / 100,
    upperScenario: upperScenarioCents / 100,
    meanAbsoluteError: meanAbsoluteErrorCents / 100,
    lastHistoricalDay: last.day,
    days,
  };
}
