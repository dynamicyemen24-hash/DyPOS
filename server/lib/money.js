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

/**
 * ONE sale-line rule: discount clamp → gross → net/tax split (minor units).
 *
 * This body used to be copy-pasted in FIVE places — services/invoice-totals.js,
 * routes/invoices.js (REST create) and routes/method.js three times (method
 * sale, draft header, draft items). Two of those skipped the rate clamp, so a
 * DRAFT could total differently from the sale that finalized it. Same failure
 * mode lib/stockPolicy.js was extracted for: a rule that drifts between paths
 * is a bug you cannot see until a customer's receipt disagrees with the ledger.
 *
 * Semantics are the canonical ones (services/invoice-totals.js):
 *   - discount is clamped into [0, qty×price] (a discount never flips a line),
 *   - taxRate is clamped into [0,100] and returned so callers store the rate
 *     that was ACTUALLY applied,
 *   - exclusive: tax = pctOf(gross, rate), net = gross,
 *   - inclusive (tax_inclusive=1): tax is backed OUT of the gross so
 *     net + tax === gross exactly — no halala leaks either direction.
 *
 * @param {{qty?:number, price?:number, discount?:number, taxRate?:number, taxInclusive?:boolean}} line
 * @returns {{discountMinor:number, grossMinor:number, netMinor:number, taxMinor:number, totalMinor:number, taxRate:number}}
 */
export function computeLineMinor(line = {}) {
  const qty = Number(line.qty);
  const price = Number(line.price);
  const discountMinor = clampMinor(toMinor(line.discount), toMinor(qty * price));
  const rate = Math.max(0, Math.min(Number(line.taxRate) || 0, 100));
  const grossMinor = toMinor(qty * price) - discountMinor;
  let netMinor = grossMinor;
  let taxMinor = pctOf(grossMinor, rate);
  if (line.taxInclusive && rate > 0) {
    netMinor = Math.round((grossMinor * 100) / (100 + rate));
    taxMinor = grossMinor - netMinor;
  }
  return {
    discountMinor,
    grossMinor,
    netMinor,
    taxMinor,
    totalMinor: netMinor + taxMinor,
    taxRate: rate,
  };
}

export default { toMinor, toMajor, r2, pctOf, clampMinor, computeLineMinor };
