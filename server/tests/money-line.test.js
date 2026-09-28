/**
 * One money implementation — the line rule lives in lib/money.js only.
 *
 * The rule (discount clamp → gross → exclusive/inclusive net-tax split) was
 * copy-pasted in FIVE places before this gate existed, and two of them skipped
 * the rate clamp — so a DRAFT could total differently from the sale that
 * finalized it. This file pins BOTH halves of the fix:
 *
 *   1. behaviour  — the helper's semantics, in integer minor units;
 *   2. structure  — no other server source file may re-implement the split.
 *
 * Structure is enforced the same way the branding/dead-code gates work: a
 * literal scan of the runtime tree, because a rule that can silently return is
 * not a rule.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { computeLineMinor, toMinor, pctOf } from '../lib/money.js';
import { computeInvoiceTotals } from '../services/invoice-totals.js';

const SERVER = resolve(import.meta.dirname, '..');

/** Runtime code where the line rule may legitimately exist. */
const RUNTIME_DIRS = ['routes', 'services', 'lib', 'workers'];
/** The single source of truth (always compared as POSIX-style relative paths). */
const ALLOWED = new Set(['lib/money.js']);
/** The inclusive-split formula as written (backing VAT out of a gross). */
const SPLIT_RE = /\(\s*\w+\s*\*\s*100\s*\)\s*\/\s*\(\s*100\s*\+/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'uploads') continue;
      walk(full, out);
    } else if (/\.m?js$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('computeLineMinor — the line rule', () => {
  it('exclusive VAT: tax on top of gross, integer-exact', () => {
    const l = computeLineMinor({ qty: 2, price: 19.99, taxRate: 15 });
    assert.equal(l.discountMinor, 0);
    assert.equal(l.grossMinor, toMinor(39.98));
    assert.equal(l.netMinor, toMinor(39.98));
    assert.equal(l.taxMinor, pctOf(l.grossMinor, 15));
    assert.equal(l.totalMinor, l.netMinor + l.taxMinor);
  });

  it('inclusive VAT backs out so net + tax === gross (no halala leak)', () => {
    const l = computeLineMinor({ qty: 1, price: 115, taxRate: 15, taxInclusive: true });
    assert.equal(l.grossMinor, 11500);
    assert.equal(l.netMinor, 10000);
    assert.equal(l.taxMinor, 1500);
    assert.equal(l.netMinor + l.taxMinor, l.grossMinor);
  });

  it('inclusive split is exact on an odd gross too', () => {
    const l = computeLineMinor({ qty: 1, price: 100.01, taxRate: 15, taxInclusive: true });
    assert.equal(l.grossMinor, 10001);
    assert.equal(l.netMinor + l.taxMinor, l.grossMinor);
  });

  it('discount is clamped into [0, line gross] — a discount never flips a line', () => {
    const l = computeLineMinor({ qty: 1, price: 10, discount: 999, taxRate: 15 });
    assert.equal(l.discountMinor, toMinor(10));
    assert.equal(l.grossMinor, 0);
    assert.equal(l.taxMinor, 0);
    assert.equal(l.totalMinor, 0);
  });

  it('taxRate is clamped to [0,100] and the APPLIED rate is returned', () => {
    assert.equal(computeLineMinor({ qty: 1, price: 10, taxRate: 250 }).taxRate, 100);
    assert.equal(computeLineMinor({ qty: 1, price: 10, taxRate: -40 }).taxRate, 0);
    assert.equal(computeLineMinor({ qty: 1, price: 10, taxRate: 'abc' }).taxRate, 0);
  });

  it('a clamped high rate cannot mint tax out of a zero line', () => {
    const l = computeLineMinor({ qty: 1, price: 10, discount: 10, taxRate: 100 });
    assert.equal(l.taxMinor, 0);
    assert.equal(l.totalMinor, 0);
  });

  it('agrees line-for-line with the canonical cart service', () => {
    const lines = [
      { qty: 3, unitPrice: 19.99, taxRate: 15 },
      { qty: 1, unitPrice: 50, discount: 5, taxRate: 5 },
      { qty: 2, unitPrice: 115, taxRate: 15 },
    ];
    for (const taxInclusive of [false, true]) {
      const cart = computeInvoiceTotals(lines, { taxInclusive });
      assert.equal(cart.lines.length, lines.length);
      cart.lines.forEach((got, i) => {
        const l = computeLineMinor({
          qty: lines[i].qty,
          price: lines[i].unitPrice,
          discount: lines[i].discount,
          taxRate: lines[i].taxRate,
          taxInclusive,
        });
        assert.equal(got.netMinor, l.netMinor, `line ${i} net (inclusive=${taxInclusive})`);
        assert.equal(got.taxMinor, l.taxMinor, `line ${i} tax (inclusive=${taxInclusive})`);
      });
    }
  });

  it('500-line cart accumulates with zero IEEE drift', () => {
    const lines = Array.from({ length: 500 }, () => ({ qty: 1, unitPrice: 19.99, taxRate: 15 }));
    let minor = 0;
    for (const line of lines) {
      const l = computeLineMinor({ qty: line.qty, price: line.unitPrice, taxRate: line.taxRate });
      minor += l.totalMinor;
    }
    // 1999 + round(1999 × 15%) = 2299 per line → 500 lines = 1149500 exactly.
    assert.equal(minor, 1149500);
    // Same cart through the canonical service must agree to the halala.
    assert.equal(computeInvoiceTotals(lines).totalMinor, minor);
  });
});

describe('one money implementation (structural gate)', () => {
  it('no runtime file other than lib/money.js re-implements the VAT split', () => {
    const offenders = [];
    for (const dir of RUNTIME_DIRS) {
      const abs = join(SERVER, dir);
      let files = [];
      try { files = walk(abs); } catch { continue; }
      for (const file of files) {
        const rel = relative(SERVER, file).replaceAll('\\', '/');
        if (ALLOWED.has(rel)) continue;
        if (SPLIT_RE.test(readFileSync(file, 'utf8'))) offenders.push(rel);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `${offenders.join(', ')} re-implements the inclusive VAT split — move the line math into lib/money.js#computeLineMinor`,
    );
  });
});
