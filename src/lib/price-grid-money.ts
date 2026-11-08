export const MAX_PRICE_AMOUNT = 999999999999;

const PRICE_INPUT_PATTERN = /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/;

/** Validate a numeric amount without comparing a decimal fraction's binary product to an integer. */
export function isValidPriceAmount(value: number): boolean {
  return Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_PRICE_AMOUNT &&
    Math.round(value * 100) / 100 === value;
}

/** Validate the user's decimal spelling as well as the numeric business bounds. */
export function parsePriceGridInput(raw: string): number | null {
  const normalized = raw.trim();
  if (!PRICE_INPUT_PATTERN.test(normalized)) return null;
  const amount = Number(normalized);
  return isValidPriceAmount(amount) ? amount : null;
}
