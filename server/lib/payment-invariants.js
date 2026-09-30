/**
 * Payment invariants shared by the invoice and settlement paths.
 *
 * Cash is the only tender that can be handed over in excess of the amount owed:
 * the difference becomes change, and the cashier returns it. Every other tender
 * (card, wallet, transfer, voucher) is a settlement instrument — an overpayment
 * there means the ledger would record a payment larger than the invoice and the
 * difference would then be silently erased by capping `paid_amount`. That turns
 * a data-entry mistake into an unrecoverable gap between the bank settlement and
 * the books, so it is rejected at the boundary instead.
 *
 * Pure: no I/O, no database, no framework types. Returns normally or throws.
 */

/**
 * Reject a non-cash payment that exceeds what is still owed.
 *
 * @param {string} method upper-cased payment method
 * @param {number} amountMinor payment amount in integer minor units
 * @param {number} needMinor still-unpaid remainder in integer minor units
 * @throws {Error & {statusCode: 400}} when the tender is not cash and overpays
 */
export function assertNonCashNotOverpaid(method, amountMinor, needMinor) {
  if (method === 'CASH') return;
  if (amountMinor > Math.max(0, needMinor)) {
    throw Object.assign(new Error('مبلغ الدفع غير النقدي يتجاوز المبلغ المستحق'), { statusCode: 400 });
  }
}

/**
 * Net cash physically collected for one invoice, given its payments and total.
 *
 * Shift reconciliation must not sum raw CASH tenders: a customer paying 100 for
 * a 90 invoice keeps 10 as change, so only 90 reached the drawer. Tendering cash
 * can also exceed the total in mixed payments (card + cash), and the surplus is
 * change, not revenue. This is the same expression the settlement queries use.
 *
 * @param {Array<{method: string, amount: number}>} payments amounts in major units
 * @param {number} invoiceTotal major units
 * @returns {number} major units of cash actually in the drawer
 */
export function netCashForInvoice(payments, invoiceTotal) {
  const cashTendered = payments.reduce((sum, p) => (String(p.method).toUpperCase() === 'CASH' ? sum + p.amount : sum), 0);
  const totalTendered = payments.reduce((sum, p) => sum + p.amount, 0);
  const overpaid = Math.max(0, totalTendered - invoiceTotal);
  return Math.max(0, cashTendered - overpaid);
}
