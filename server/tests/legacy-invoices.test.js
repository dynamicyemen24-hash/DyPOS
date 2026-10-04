/**
 * Legacy invoice import — the accounting rules, pinned.
 *
 * ## Why a test and not a code review
 *
 * Every rule below exists because the alternative is a WRONG LEDGER that looks
 * right. A migrated invoice feeds tax periods, aging and receivables, so a
 * one-halala drift or a silently-adjusted total is not a display bug — it is an
 * audit finding months later, with no way to tell which row caused it. These
 * tests assert the REFUSALS, because the refusals are the product.
 *
 * ## The tax rule is asserted against `lib/money.js` itself
 *
 * The import path must not re-derive VAT (invariant 3). Rather than hard-coding
 * expected numbers, the tax assertions run `computeLineMinor` and compare — so
 * if the canonical rule ever changes, this file follows it instead of pinning a
 * stale second implementation of the truth.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeLineMinor, toMinor } from '../lib/money.js';
import {
	LEGACY_NOTE_PREFIX,
	LegacyInvoiceError,
	normalizeLegacyDate,
	normalizeLegacyInvoice,
	normalizeLegacyLine,
	parseLegacyInvoicesCsv,
} from '../lib/legacy-invoices.js';

/** A one-line invoice: 2 × 50 at 15% = 115.00 total, 15.00 tax. */
const invoice = (over = {}) => ({
	number: 'INV-1',
	date: '2025-03-04',
	total: '115',
	lines: [{ name: 'صنف', qty: 2, price: 50, taxRate: 15 }],
	...over,
});

describe('legacy line money comes from the one sale-line rule', () => {
	it('agrees with computeLineMinor rather than a second implementation', () => {
		const line = normalizeLegacyLine({ name: 'صنف', qty: 2, price: 50, taxRate: 15 });
		const canonical = computeLineMinor({ qty: 2, price: 50, taxRate: 15 });

		assert.equal(toMinor(line.taxAmount), canonical.taxMinor);
		assert.equal(toMinor(line.total), canonical.grossMinor);
		assert.equal(toMinor(line.net), canonical.netMinor);
	});

	it('clamps a discount larger than the line instead of going negative', () => {
		// The shared rule clamps into [0, qty×price]. A legacy export with a
		// discount typo must not produce a negative total the import would store.
		const line = normalizeLegacyLine({
			name: 'صنف',
			qty: 1,
			price: 10,
			discount: 500,
			taxRate: 0,
		});
		assert.ok(toMinor(line.total) >= 0, 'a clamped discount cannot go negative');
		assert.equal(line.total, 0);
	});

	it('backs tax OUT for an inclusive line so net + tax is the stated gross', () => {
		const line = normalizeLegacyLine({
			name: 'صنف',
			qty: 1,
			price: 115,
			taxRate: 15,
			taxInclusive: '1',
		});
		const canonical = computeLineMinor({
			qty: 1,
			price: 115,
			taxRate: 15,
			taxInclusive: true,
		});
		assert.equal(toMinor(line.net) + toMinor(line.taxAmount), toMinor(line.total));
		assert.equal(toMinor(line.taxAmount), canonical.taxMinor);
	});

	it('reads Arabic-Indic digits and the Arabic decimal separator', () => {
		// A spreadsheet saved in an Arabic locale writes exactly this, and
		// `Number()` returns NaN for all of it.
		const line = normalizeLegacyLine({ name: 'صنف', qty: '٢', price: '٥٠٫٠٠', taxRate: '١٥' });
		assert.equal(line.qty, 2);
		assert.equal(line.unitPrice, 50);
		assert.equal(line.taxRate, 15);
	});
});

describe('header totals are recomputed, never trusted', () => {
	it('REFUSES a stated total that disagrees with the lines', () => {
		// The whole point. An export whose header used a different tax rate would
		// otherwise silently poison every fiscal report from the migration date.
		assert.throws(
			() => normalizeLegacyInvoice(invoice({ total: '999' })),
			(e) => e instanceof LegacyInvoiceError && /لا يطابق بنودها/.test(e.message),
		);
	});

	it('names BOTH numbers so the operator can fix the file', () => {
		try {
			normalizeLegacyInvoice(invoice({ total: '999' }));
			assert.fail('must refuse');
		} catch (e) {
			assert.match(e.message, /999/);
			assert.match(e.message, /115/);
		}
	});

	it('accepts a one-halala rounding difference from per-line rounding', () => {
		// An export that rounded each line independently can differ by a few
		// halalas; refusing that would make the tool unusable for real files.
		assert.equal(normalizeLegacyInvoice(invoice({ total: '115.01' })).total, 115);
	});

	it('derives the status from the money, not from the source claim', () => {
		// The one thing this import must get right: aging and receivables read
		// the truth. A file claiming PAID with a blank paid column records UNPAID,
		// because believing it understates what the shop is owed.
		assert.equal(normalizeLegacyInvoice(invoice({ status: 'PAID' })).status, 'UNPAID');
		assert.equal(normalizeLegacyInvoice(invoice({ paid: '115' })).status, 'PAID');
		assert.equal(normalizeLegacyInvoice(invoice({ paid: '50' })).status, 'PARTIAL');
	});

	it('rejects an overpayment rather than truncating it to the total', () => {
		assert.throws(
			() => normalizeLegacyInvoice(invoice({ paid: '500' })),
			(e) => e instanceof LegacyInvoiceError && /يتجاوز إجمالي/.test(e.message),
		);
	});

	it('rejects a negative paid amount', () => {
		assert.throws(
			() => normalizeLegacyInvoice(invoice({ paid: '-5' })),
			(e) => e instanceof LegacyInvoiceError && /سالب/.test(e.message),
		);
	});

	it('marks every imported invoice so a report can exclude it', () => {
		assert.ok(normalizeLegacyInvoice(invoice()).notes.startsWith(LEGACY_NOTE_PREFIX));
	});
});

describe('dates are never defaulted to today', () => {
	it('accepts ISO', () => {
		assert.equal(normalizeLegacyDate('2025-03-04'), '2025-03-04');
	});

	it('reads DD/MM/YYYY day-first', () => {
		// Read as MM/DD this would move an invoice into the wrong tax period
		// silently, which is the failure this spelling exists to prevent.
		assert.equal(normalizeLegacyDate('05/03/2025'), '2025-03-05');
	});

	it('REFUSES a blank date instead of dating it to the import day', () => {
		assert.throws(
			() => normalizeLegacyDate(''),
			(e) => e instanceof LegacyInvoiceError,
		);
		assert.throws(
			() => normalizeLegacyDate('not-a-date'),
			(e) => e instanceof LegacyInvoiceError,
		);
	});
});

describe('CSV parsing groups lines into invoices and reports bad ones', () => {
	const csv = [
		'number,date,customer,total,paid,name,qty,price,taxRate',
		'INV-1,2025-03-04,سالم,115,115,صنف أ,2,50,15',
		'INV-1,2025-03-04,سالم,115,115,صنف ب,1,0,0',
		'INV-2,2025-04-01,ليلى,25,0,صنف ج,1,25,0',
	].join('\n');

	it('groups repeated header rows into one invoice per number', () => {
		const { invoices, errors } = parseLegacyInvoicesCsv(csv);
		assert.equal(errors.length, 0);
		assert.equal(invoices.length, 2);

		const first = invoices.find((i) => i.number === 'INV-1');
		assert.equal(first.lines.length, 2);
		assert.equal(first.total, 115);
		assert.equal(first.status, 'PAID');
	});

	it('reports a bad line as a LINE rather than failing the file', () => {
		const broken = ['number,date,total,name,qty,price', 'INV-9,2025-01-01,10,صنف,99999999999,1'].join('\n');
		const { invoices, errors } = parseLegacyInvoicesCsv(broken);
		assert.equal(invoices.length, 0);
		assert.equal(errors.length, 1);
		assert.equal(errors[0].row, 2);
	});

	it('returns empty for a header-only file rather than throwing', () => {
		assert.deepEqual(parseLegacyInvoicesCsv('number,date,total'), {
			invoices: [],
			errors: [],
		});
	});
});
