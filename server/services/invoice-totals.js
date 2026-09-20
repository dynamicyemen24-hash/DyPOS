/**
 * Invoice Totals Service — single canonical money algorithm (world-class).
 *
 * Extracted from routes/invoices.js so the SAME exact math is reused by:
 * - POST /api/invoices (create)
 * - POST /api/invoices/:id/pay (partial settlement)
 * - Frontend parity (POS/src/utils/money.js mirrors these semantics)
 * - Future: returns, credit notes, fiscal reports
 *
 * Guarantees (parity with frontend):
 * - All accumulation in INTEGER minor units (halalas), zero IEEE drift.
 * - pctOf rounds half-up in integer space (VAT exact).
 * - Overpay → explicit change; paid/remaining never negative.
 * - Status epsilons in minor units (<=1 minor = PAID).
 */
import { toMinor, toMajor, pctOf, clampMinor } from '../lib/money.js';

/**
 * Compute line + cart totals.
 * @param {Array<{qty:number, unitPrice:number, discount?:number, taxRate?:number}>} lines
 * @param {{discountAmount?:number, couponDiscount?:number, taxInclusive?:boolean}} opts
 */
export function computeInvoiceTotals(lines, opts = {}) {
  const taxInclusive = !!opts.taxInclusive;
  let subtotalMinor = 0;
  let taxTotalMinor = 0;
  const computed = [];

  for (const line of lines || []) {
    const qty = Number(line.qty) > 0 ? Number(line.qty) : 0;
    const price = Number(line.unitPrice) || 0;
    const discountMinor = clampMinor(toMinor(line.discount), toMinor(qty * price));
    const taxRate = Math.max(0, Math.min(Number(line.taxRate) || 0, 100));
    const lineGrossMinor = toMinor(qty * price) - discountMinor;
    let lineNetMinor = lineGrossMinor;
    let lineTaxMinor = pctOf(lineGrossMinor, taxRate);
    if (taxInclusive && taxRate > 0) {
      lineNetMinor = Math.round((lineGrossMinor * 100) / (100 + taxRate));
      lineTaxMinor = lineGrossMinor - lineNetMinor;
    }
    subtotalMinor += lineNetMinor;
    taxTotalMinor += lineTaxMinor;
    computed.push({ ...line, netMinor: lineNetMinor, taxMinor: lineTaxMinor, totalMinor: lineNetMinor + lineTaxMinor });
  }

  const grossMinor = subtotalMinor + taxTotalMinor;
  const manualMinor = clampMinor(toMinor(opts.discountAmount), grossMinor);
  const couponMinor = clampMinor(toMinor(opts.couponDiscount), grossMinor - manualMinor);
  const discountMinor = Math.min(manualMinor + couponMinor, grossMinor);
  const totalMinor = grossMinor - discountMinor;

  return {
    subtotal: toMajor(subtotalMinor),
    taxTotal: toMajor(taxTotalMinor),
    discountAmount: toMajor(discountMinor),
    total: toMajor(totalMinor),
    subtotalMinor, taxTotalMinor, discountMinor, totalMinor, grossMinor,
    lines: computed,
  };
}

/** Split a total into paid/remaining/change with clamped semantics. */
export function settlePayments(total, paidMinorSoFar, newPaymentMinor) {
  const totalMinor = toMinor(total);
  const paidMinor = toMinor(paidMinorSoFar) + toMinor(newPaymentMinor);
  const changeMinor = Math.max(0, paidMinor - totalMinor);
  const paidCapped = paidMinor - changeMinor;
  const remainingMinor = totalMinor - paidCapped;
  return {
    paidAmount: toMajor(paidCapped),
    remainingAmount: toMajor(remainingMinor),
    change: toMajor(changeMinor),
    status: remainingMinor <= 1 ? 'PAID' : remainingMinor >= totalMinor - 1 ? 'UNPAID' : 'PARTIAL',
  };
}

export function invoiceStatus(totalMinor, remainingMinor) {
  if (remainingMinor <= 1) return 'PAID';
  if (remainingMinor >= totalMinor - 1) return 'UNPAID';
  return 'PARTIAL';
}

export default { computeInvoiceTotals, settlePayments, invoiceStatus };
