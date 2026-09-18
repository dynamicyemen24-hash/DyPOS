/**
 * DyPOS Money — halala-integer arithmetic (precision at billions scale).
 *
 * IEEE-754 floats cannot represent most decimals: 0.1 + 0.2 !== 0.3.
 * Rounding only at the END lets error accumulate across 500-line carts and
 * billions of rows (auditors sum stored totals independently — a 0.01 drift
 * per invoice becomes millions). These helpers accumulate in INTEGER minor
 * units (halalas/cents) and convert back once, so every total is exact.
 *
 *   toMinor(19.99) → 1999
 *   addMinor(1999, 1) → 2000
 *   toMajor(2000) → 20
 *   pctOf(1999, 15) → 300  (15% VAT, rounded half-up)
 */
export function toMinor(major) {
  const n = Number(major);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function toMajor(minor) {
  return (Math.round(Number(minor) || 0)) / 100;
}

/** Round half-up to 2 decimals (single canonical rounding for display/storage). */
export function r2(n) {
  return toMajor(toMinor(n));
}

/** Percent of a minor amount, rounded half-up to a minor unit. */
export function pctOf(minor, rate) {
  return Math.round((Math.round(Number(minor) || 0) * Number(rate || 0)) / 100);
}

/** Clamp a minor amount into [0, capMinor]. */
export function clampMinor(minor, capMinor) {
  const m = Math.round(Number(minor) || 0);
  const cap = Math.round(Number(capMinor) || 0);
  return Math.max(0, Math.min(m, cap));
}

export default { toMinor, toMajor, r2, pctOf, clampMinor };
