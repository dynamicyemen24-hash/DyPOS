/**
 * Opening balances — the rules, pinned.
 *
 * The behaviours asserted here are the ones that would otherwise be discovered
 * by an auditor, months later, as an unexplained gap in the ledger:
 *
 *   - money survives as INTEGER minor units (no float drift);
 *   - a BLANK cell is an error, never a silent 0.00;
 *   - a CSV with a BOM, CRLF and a quoted comma parses correctly;
 *   - export→import is a round trip, so a downloaded file can be re-uploaded
 *     without silently multiplying a customer's debt by 100.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	ACCOUNT_TYPES,
	MAX_AMOUNT_MINOR,
	OpeningBalanceError,
	buildProductIndex,
	normaliseAccountType,
	normaliseFiscalYear,
	normaliseOpeningBalance,
	openingBalanceKey,
	parseAmountMinor,
	parseOpeningBalanceCsv,
	parseQuantity,
	summariseOpeningBalances,
	toOpeningBalanceCsv,
} from '../lib/opening-balances.js';
import { toMajor } from '../lib/money.js';

describe('normaliseFiscalYear', () => {
	it('accepts a 4-digit year', () => {
		assert.equal(normaliseFiscalYear('2026'), '2026');
		assert.equal(normaliseFiscalYear(2026), '2026');
		assert.equal(normaliseFiscalYear(' 2026 '), '2026');
	});

	it('rejects anything that is not a year, naming the value', () => {
		for (const bad of ['', null, undefined, '26', '2026-01', 'abcd', 0]) {
			assert.throws(() => normaliseFiscalYear(bad), OpeningBalanceError);
		}
	});
});

describe('parseAmountMinor', () => {
	it('converts to integer minor units exactly', () => {
		assert.equal(parseAmountMinor('19.99'), 1999);
		assert.equal(parseAmountMinor(0), 0);
		assert.equal(parseAmountMinor('-50.50'), -5050);
		assert.equal(parseAmountMinor('0.1') + parseAmountMinor('0.2'), parseAmountMinor('0.3'));
	});

	it('reads the way a human actually types in a spreadsheet', () => {
		assert.equal(parseAmountMinor('1,250.50'), 125050);
		assert.equal(parseAmountMinor('١٢٥٠٫٥٠'), 125050);
	});

	it('refuses a blank instead of inventing a zero', () => {
		// A blank cell that became 0.00 is the exact "confident zero" failure.
		for (const blank of ['', '   ', null, undefined]) {
			assert.throws(() => parseAmountMinor(blank), OpeningBalanceError);
		}
		assert.equal(parseAmountMinor('', { allowBlank: true }), 0);
	});

	it('rejects a shifted decimal instead of storing a nine-figure balance', () => {
		assert.throws(() => parseAmountMinor(MAX_AMOUNT_MINOR / 100 + 1), OpeningBalanceError);
	});

	it('rejects non-numeric input', () => {
		assert.throws(() => parseAmountMinor('abc'), OpeningBalanceError);
	});
});

describe('parseQuantity', () => {
	it('keeps 4 decimal places (matching NUMERIC(18,4))', () => {
		assert.equal(parseQuantity('2.5'), 2.5);
		assert.equal(parseQuantity('0.0001'), 0.0001);
		assert.equal(parseQuantity('12'), 12);
	});

	it('allows blank for a pure-money row but not a non-number', () => {
		assert.equal(parseQuantity('', { allowBlank: true }), 0);
		assert.throws(() => parseQuantity('abc'), OpeningBalanceError);
	});
});

describe('normaliseAccountType', () => {
	it('accepts the canonical keys', () => {
		for (const type of ACCOUNT_TYPES) {
			assert.equal(normaliseAccountType(type), type);
		}
	});

	it('accepts the Arabic labels a spreadsheet actually contains', () => {
		assert.equal(normaliseAccountType('عميل'), 'customer');
		assert.equal(normaliseAccountType('نقدية'), 'cash');
		assert.equal(normaliseAccountType('مخزون'), 'stock');
	});

	it('rejects an unknown type and lists the valid ones', () => {
		assert.throws(() => normaliseAccountType('spaceship'), /المسموح/);
	});
});

describe('normaliseOpeningBalance', () => {
	const base = { fiscalYear: '2026', accountType: 'customer', accountId: 'c1', amount: '100' };

	it('produces the storage shape', () => {
		const row = normaliseOpeningBalance(base, { tenantId: 't1' });
		assert.equal(row.amount_minor, 10000);
		assert.equal(row.tenant_id, 't1');
		assert.equal(row.fiscal_year, '2026');
		assert.equal(row.account_type, 'customer');
	});

	it('ignores a client-supplied id so rows cannot address another tenant', () => {
		const row = normaliseOpeningBalance({ ...base, id: 'attacker-chosen' }, { tenantId: 't1' });
		assert.equal(row.id, undefined);
		assert.equal(row.tenant_id, 't1');
	});

	it('requires a customer id for a customer balance', () => {
		assert.throws(() => normaliseOpeningBalance({ ...base, accountId: '' }), /معرّف العميل مطلوب/);
	});

	it('allows a cash position with no counterparty', () => {
		const row = normaliseOpeningBalance({ fiscalYear: '2026', accountType: 'cash', amount: '500' }, { tenantId: 't1' });
		assert.equal(row.account_id, '');
		assert.equal(row.amount_minor, 50000);
	});

	it('accepts pre-converted minor units without dividing them twice', () => {
		assert.equal(normaliseOpeningBalance({ ...base, amountMinor: 1234 }).amount_minor, 1234);
	});

	it('reports the offending row number', () => {
		try {
			normaliseOpeningBalance({ ...base, amount: '' }, { row: 7 });
			assert.fail('should have thrown');
		} catch (error) {
			assert.equal(error.row, 7);
			assert.match(error.message, /المبلغ مطلوب/);
		}
	});
});

describe('the item link (product_id) — a stock row must name an item that EXISTS', () => {
	// The failure this closes: a stock balance whose item lives only in free text
	// is a movement nobody can approve or join to the catalogue. "I could not
	// verify the item" must therefore be an ERROR, never a silently unlinked row.
	// Both keys — exactly what buildProductIndex produces (id AND code).
	const products = new Map([
		['PRD-1', { id: 'u-1', code: 'PRD-1', name: 'عطر' }],
		['u-1', { id: 'u-1', code: 'PRD-1', name: 'عطر' }],
		['PRD-2', { id: 'u-2', code: 'PRD-2', name: 'كريم' }],
		['u-2', { id: 'u-2', code: 'PRD-2', name: 'كريم' }],
	]);
	const stock = {
		fiscalYear: '2026',
		accountType: 'stock',
		accountCode: 'PRD-1',
		amount: '10',
		quantity: '5',
	};

	it('resolves the item from the account code a spreadsheet carries', () => {
		const row = normaliseOpeningBalance(stock, { tenantId: 't1', products });
		assert.equal(row.product_id, 'u-1');
	});

	it('resolves the item from an explicit productId (the UUID)', () => {
		const row = normaliseOpeningBalance(
			{ ...stock, accountCode: '', accountId: 'PRD-2', productId: 'u-2' },
			{ products },
		);
		assert.equal(row.product_id, 'u-2');
	});

	it('refuses a stock row whose item is not in the catalogue, naming the reference', () => {
		assert.throws(
			() => normaliseOpeningBalance({ ...stock, accountCode: 'GHOST-9' }, { row: 4, products }),
			(error) => error.row === 4 && /GHOST-9/.test(error.message) && /جدول الأصناف/.test(error.message),
		);
	});

	it('refuses a stock row with NO reference at all', () => {
		assert.throws(
			() => normaliseOpeningBalance({ fiscalYear: '2026', accountType: 'stock', amount: '10' }, { products }),
			/الصنف غير موجود/,
		);
	});

	it('requires the item index whenever a stock row is normalised', () => {
		// Without an index there is nothing to check against, and "unchecked" must
		// never be reported as "fine" — the same rule that makes a blank amount an
		// error instead of a 0.00.
		assert.throws(() => normaliseOpeningBalance(stock, { tenantId: 't1' }), /فهرس الأصناف مطلوب/);
	});

	it('never links an item to a customer or cash position', () => {
		const customer = {
			fiscalYear: '2026',
			accountType: 'customer',
			accountId: 'c1',
			amount: '100',
		};
		assert.throws(() => normaliseOpeningBalance({ ...customer, productId: 'u-1' }, { products }), /أرصدة المخزون فقط/);
		assert.equal(normaliseOpeningBalance(customer, { products }).product_id, '');
	});
});

describe('buildProductIndex', () => {
	const rows = [
		{ id: 'p1', code: 'C-1', name: 'أ' },
		{ id: 'p2', code: 'C-2', name: 'ب' },
	];
	const fakeDb = (scoped) => ({
		prepare(sql) {
			scoped.sql = sql;
			scoped.args = null;
			return {
				all(...args) {
					scoped.args = args;
					return rows;
				},
			};
		},
	});

	it('keys by BOTH id and code, so a code and a UUID resolve the same item', () => {
		const index = buildProductIndex(fakeDb({}), 't1');
		assert.equal(index.get('C-1').id, 'p1');
		assert.equal(index.get('p1').id, 'p1');
		assert.equal(index.size, 4);
	});

	it('scopes the read to the caller tenant (a foreign code must not resolve)', () => {
		const scoped = {};
		buildProductIndex(fakeDb(scoped), 't1');
		assert.match(scoped.sql, /tenant_id=\? OR tenant_id IS NULL/);
		assert.deepEqual(scoped.args, ['t1']);
	});

	it('reads unscoped only when no tenant is given (the system plane)', () => {
		const scoped = {};
		buildProductIndex(fakeDb(scoped), '');
		assert.ok(!/tenant_id/.test(scoped.sql), 'no tenant clause for a system read');
		assert.deepEqual(scoped.args, []);
	});
});

describe('parseOpeningBalanceCsv — the item link survives the file', () => {
	// Both keys — exactly what buildProductIndex produces (id AND code).
	const products = new Map([
		['GMN1', { id: 'u-g1', code: 'GMN1', name: 'عطر' }],
		['u-g1', { id: 'u-g1', code: 'GMN1', name: 'عطر' }],
	]);

	it('links a stock row through its account code', () => {
		const csv = 'fiscalYear,accountType,accountCode,quantity,amount\r\n' + '2026,مخزون,GMN1,24,158.40\r\n';
		const { rows, errors } = parseOpeningBalanceCsv(csv, { tenantId: 't1', products });
		assert.deepEqual(errors, []);
		assert.equal(rows[0].product_id, 'u-g1');
		assert.equal(rows[0].amount_minor, 15840);
	});

	it('reports a missing item by LINE NUMBER while the other rows still import', () => {
		const csv =
			'fiscalYear,accountType,accountCode,amount\r\n' + '2026,stock,GMN1,10.00\r\n' + '2026,stock,GHOST,20.00\r\n';
		const { rows, errors } = parseOpeningBalanceCsv(csv, { products });
		assert.equal(rows.length, 1, 'the good row must survive');
		assert.equal(errors.length, 1);
		assert.equal(errors[0].row, 3, 'the header is line 1');
		assert.match(errors[0].message, /GHOST/);
	});

	it('honours an explicit productId column', () => {
		const csv = 'fiscalYear,accountType,productId,amount\r\n' + '2026,stock,u-g1,10.00\r\n';
		const { rows, errors } = parseOpeningBalanceCsv(csv, { products });
		assert.deepEqual(errors, []);
		assert.equal(rows[0].product_id, 'u-g1');
	});
});

describe('openingBalanceKey', () => {
	it('is stable and distinguishes tenant + year + account', () => {
		const a = openingBalanceKey({
			fiscal_year: '2026',
			account_type: 'cash',
			account_id: '',
			tenant_id: 't1',
		});
		const b = openingBalanceKey({
			fiscal_year: '2026',
			account_type: 'cash',
			account_id: '',
			tenant_id: 't2',
		});
		assert.equal(
			a,
			openingBalanceKey({
				fiscal_year: '2026',
				account_type: 'cash',
				account_id: '',
				tenant_id: 't1',
			}),
		);
		assert.notEqual(a, b);
	});
});

describe('parseOpeningBalanceCsv', () => {
	it('parses a BOM + CRLF file the way Excel writes it', () => {
		const csv = '﻿fiscalYear,accountType,accountId,accountName,amount\r\n' + '2026,عميل,c1,أحمد,"1,250.50"\r\n';
		const { rows, errors } = parseOpeningBalanceCsv(csv, { tenantId: 't1' });
		assert.deepEqual(errors, []);
		assert.equal(rows.length, 1);
		assert.equal(rows[0].fiscal_year, '2026', 'BOM must not corrupt the first header');
		assert.equal(rows[0].account_type, 'customer');
		assert.equal(rows[0].amount_minor, 125050);
	});

	it('treats an unquoted comma as a delimiter, not as a thousands separator', () => {
		// `1,250.50` unquoted IS two CSV fields. A conforming parser must split
		// it; accepting it as one number would silently swallow the next column.
		const csv = 'fiscalYear,accountType,accountId,amount\r\n2026,customer,c1,1,250.50\r\n';
		const { rows } = parseOpeningBalanceCsv(csv);
		assert.equal(rows[0].amount_minor, 100);
	});

	it('handles a quoted field containing a comma', () => {
		const csv = 'fiscalYear,accountType,accountId,accountName,amount\r\n' + '2026,customer,c1,"محمد, أحمد",100\r\n';
		const { rows } = parseOpeningBalanceCsv(csv);
		assert.equal(rows[0].account_name, 'محمد, أحمد');
	});

	it('keeps good rows and reports bad ones by line number', () => {
		const csv =
			'fiscalYear,accountType,accountId,amount\r\n' +
			'2026,customer,c1,100\r\n' +
			'2026,customer,c2,abc\r\n' +
			'2026,customer,c3,300\r\n';
		const { rows, errors } = parseOpeningBalanceCsv(csv);
		assert.equal(rows.length, 2, 'valid rows must survive');
		assert.equal(errors.length, 1);
		assert.equal(errors[0].row, 3);
		assert.match(errors[0].message, /المبلغ ليس رقمًا/);
	});

	it('rejects a file missing the fiscal-year column outright', () => {
		const { errors } = parseOpeningBalanceCsv('accountType,amount\r\ncustomer,100\r\n');
		assert.match(errors[0].message, /fiscalYear/);
	});

	it('rejects an empty file', () => {
		assert.match(parseOpeningBalanceCsv('').errors[0].message, /فارغ/);
	});
});

describe('CSV round trip', () => {
	it('export → import preserves the exact amount (no 100× error)', () => {
		const original = [
			{
				fiscal_year: '2026',
				account_type: 'customer',
				account_id: 'c1',
				account_code: 'C-1',
				account_name: 'عميل قديم',
				amount_minor: 1999,
				quantity: 0,
				notes: 'رصيد مثبت من النظام',
			},
		];
		const csv = toOpeningBalanceCsv(original);
		const { rows, errors } = parseOpeningBalanceCsv(csv, { tenantId: 't1' });
		assert.deepEqual(errors, []);
		assert.equal(rows[0].amount_minor, 1999);
		assert.equal(rows[0].account_name, 'عميل قديم');
		assert.equal(toMajor(rows[0].amount_minor), 19.99);
	});

	it('escapes a field that contains a quote', () => {
		const csv = toOpeningBalanceCsv([
			{
				fiscal_year: '2026',
				account_type: 'cash',
				account_id: '',
				account_code: '',
				account_name: 'a"b',
				amount_minor: 100,
				quantity: 0,
				notes: '',
			},
		]);
		const { rows, errors } = parseOpeningBalanceCsv(csv);
		assert.deepEqual(errors, []);
		assert.equal(rows[0].account_name, 'a"b');
	});
});

describe('summariseOpeningBalances', () => {
	// The summary is rendered on a header strip, so it must show all four
	// positions even when a type has no rows: an ABSENT bucket reads as
	// "not measured", which is the confusion this feature exists to remove.
	it('seeds every account type, so a 0.00 position still renders', () => {
		const summary = summariseOpeningBalances([{ account_type: 'customer', amount_minor: 500, quantity: 0 }]);
		assert.deepEqual(Object.keys(summary).sort(), [...ACCOUNT_TYPES].sort());
		assert.equal(summary.cash.amountMinor, 0);
		assert.equal(summary.cash.count, 0);
	});

	it('totals minor units and counts rows per type', () => {
		const summary = summariseOpeningBalances([
			{ account_type: 'customer', amount_minor: 1000, quantity: 1 },
			{ account_type: 'customer', amount_minor: 250, quantity: 2 },
			{ account_type: 'stock', amount_minor: 75, quantity: 5 },
		]);
		assert.equal(summary.customer.amountMinor, 1250);
		assert.equal(summary.customer.count, 2);
		assert.equal(summary.customer.quantity, 3);
		assert.equal(summary.stock.amountMinor, 75);
		assert.equal(summary.stock.quantity, 5);
	});

	it('keeps fractional cents exact (sums are integers, never 0.1+0.2 drift)', () => {
		const summary = summariseOpeningBalances([
			{ account_type: 'cash', amount_minor: 10 },
			{ account_type: 'cash', amount_minor: 20 },
		]);
		assert.equal(summary.cash.amountMinor, 30);
		assert.equal(Number.isInteger(summary.cash.amountMinor), true);
	});

	it('counts an unrecognised type rather than dropping its money', () => {
		const summary = summariseOpeningBalances([{ account_type: 'legacy', amount_minor: 999, quantity: 0 }]);
		assert.equal(summary.legacy.amountMinor, 999, 'a row the summary cannot classify must still be visible');
	});

	it('an empty ledger summarises to zeros, not nulls', () => {
		const summary = summariseOpeningBalances([]);
		for (const type of ACCOUNT_TYPES) {
			assert.deepEqual(summary[type], { amountMinor: 0, quantity: 0, count: 0 });
		}
	});
});
