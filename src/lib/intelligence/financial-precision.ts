/**
 * Exact decimal scaling for source-backed financial amounts.
 * The 10^15 minor-unit ceiling is deliberately conservative so a returned
 * JavaScript number can still preserve cent precision when projected to UI.
 */
const MAX_SAFE_MINOR_UNITS = 1_000_000_000_000_000n;

export function decimalToMinorUnits(
  value: unknown,
  scale: number,
  allowNegative = false,
): bigint | null {
  if (!Number.isInteger(scale) || scale < 0 || scale > 6) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const text = typeof value === "number" ? value.toString() : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  if (match[1] === "-" && !allowNegative) return null;
  const fraction = match[3] ?? "";
  if (fraction.length > scale) return null;
  const magnitude = BigInt(match[2]) * (10n ** BigInt(scale)) +
    BigInt((fraction.padEnd(scale, "0") || "0"));
  if (magnitude > MAX_SAFE_MINOR_UNITS) return null;
  return match[1] === "-" ? -magnitude : magnitude;
}

export function minorUnitsToNumber(value: bigint, scale: number): number | null {
  if (!Number.isInteger(scale) || scale < 0 || scale > 6 ||
      value > MAX_SAFE_MINOR_UNITS || value < -MAX_SAFE_MINOR_UNITS) return null;
  const result = Number(value) / (10 ** scale);
  return Number.isFinite(result) ? result : null;
}

/** PostgreSQL numeric ROUND(..., 2) parity for non-negative percentage inputs. */
export function roundedPercentageHundredths(
  numeratorMinorUnits: bigint,
  denominatorMinorUnits: bigint,
): bigint | null {
  if (numeratorMinorUnits < 0n || denominatorMinorUnits <= 0n) return null;
  const scaled = numeratorMinorUnits * 10_000n;
  const quotient = scaled / denominatorMinorUnits;
  const remainder = scaled % denominatorMinorUnits;
  return quotient + (remainder * 2n >= denominatorMinorUnits ? 1n : 0n);
}

export function percentageToHundredths(value: unknown): bigint | null {
  const parsed = decimalToMinorUnits(value, 2);
  return parsed !== null && parsed <= 10_000n ? parsed : null;
}
