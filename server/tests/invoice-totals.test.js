/**
 * Invoice totals service — parity with frontend money math.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeInvoiceTotals, settlePayments } from '../services/invoice-totals.js';
import { toMinor } from '../lib/money.js';

describe('invoice-totals service', () => {
  it('computes cart totals exactly (no IEEE drift)', () => {
    const t = computeInvoiceTotals([
      { qty: 2, unitPrice: 19.99, taxRate: 15 },
      { qty: 1, unitPrice: 50, discount: 5, taxRate: 15 },
    ]);
    assert.equal(t.totalMinor, toMinor(t.total));
    assert.ok(Math.abs(t.total - 97.73) < 0.005);
  });

  it('tax-inclusive backs out exactly', () => {
    const t = computeInvoiceTotals([{ qty: 1, unitPrice: 115, taxRate: 15 }], { taxInclusive: true });
    assert.equal(t.total, 115);
  });

  it('settlePayments clamps overpay into change', () => {
    const s = settlePayments(100, 0, 120);
    assert.equal(s.paidAmount, 100);
    assert.equal(s.change, 20);
    assert.equal(s.status, 'PAID');
  });

  it('0.1+0.2 exactness holds', () => {
    const t = computeInvoiceTotals([{ qty: 1, unitPrice: 0.1 }, { qty: 1, unitPrice: 0.2 }]);
    assert.equal(t.total, 0.3);
  });
});
