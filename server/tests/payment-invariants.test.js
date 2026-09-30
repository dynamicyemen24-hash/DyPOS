import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertNonCashNotOverpaid, netCashForInvoice } from '../lib/payment-invariants.js';

describe('payment invariants', () => {
  describe('assertNonCashNotOverpaid', () => {
    it('allows cash to exceed the amount owed (it becomes change)', () => {
      assert.doesNotThrow(() => assertNonCashNotOverpaid('CASH', 10_000, 9_000));
    });

    it('allows a non-cash tender that exactly settles the remainder', () => {
      assert.doesNotThrow(() => assertNonCashNotOverpaid('CARD', 9_000, 9_000));
    });

    it('rejects a non-cash tender larger than the remainder', () => {
      assert.throws(
        () => assertNonCashNotOverpaid('CARD', 9_001, 9_000),
        (e) => e.statusCode === 400 && /يتجاوز/.test(e.message)
      );
    });

    it('rejects non-cash overpayment even when the invoice is fully settled', () => {
      assert.throws(() => assertNonCashNotOverpaid('TRANSFER', 1, 0), (e) => e.statusCode === 400);
    });
  });

  describe('netCashForInvoice', () => {
    it('subtracts change from cash handed over', () => {
      // 100 tendered for a 90 invoice → 10 change → 90 in the drawer.
      assert.equal(netCashForInvoice([{ method: 'CASH', amount: 100 }], 90), 90);
    });

    it('keeps cash in mixed payments after change is returned', () => {
      // 50 cash + 50 card = 100 for a 90 invoice → 10 change, taken from cash.
      assert.equal(netCashForInvoice([{ method: 'CASH', amount: 50 }, { method: 'CARD', amount: 50 }], 90), 40);
    });

    it('counts the whole cash tender when nothing is overpaid', () => {
      assert.equal(netCashForInvoice([{ method: 'CASH', amount: 90 }], 90), 90);
    });

    it('returns zero for a fully card-paid invoice', () => {
      assert.equal(netCashForInvoice([{ method: 'CARD', amount: 90 }], 90), 0);
    });

    it('is never dragged below zero by change on a partial cash payment', () => {
      // 10 cash against a 90 invoice is UNDERpayment, not change: the drawer
      // really does hold the 10 and the invoice stays PARTIAL. Subtracting the
      // unpaid 80 would report 0 and hide that cash from reconciliation.
      assert.equal(netCashForInvoice([{ method: 'CASH', amount: 10 }], 90), 10);
    });

    it('clamps to zero when cash is tendered on a fully settled invoice', () => {
      assert.equal(netCashForInvoice([{ method: 'CASH', amount: 5 }], 0), 0);
    });
  });
});
