/**
 * Opening balances (أرصدة افتتاحية) — the rules, in one place.
 *
 * ## What an opening balance is
 *
 * The position a business carries INTO a fiscal year: what customers already
 * owed, cash in the drawer, stock on hand. A migrated or freshly-imported shop
 * has no history, so without these every aging, receivable and stock-valuation
 * report reads a confident `0.00` for the period BEFORE the first invoice —
 * a zero that means "unknown", not "nothing". This module is the difference.
 *
 * ## Why these rules live here
 *
 * Three consumers touch opening balances — the method router (UI), the export
 * path, and the import path — and a validation rule that drifts between them is
 * a rule that silently accepts a bad ledger. So normalization, clamping and CSV
 * parsing are defined ONCE and imported, exactly as `lib/money.js` owns the
 * sale-line rule.
 *
 * ## Money
 *
 * Amounts are INTEGER MINOR UNITS (halalas) end to end, never floats.
 * `lib/money.js` exists because float drift across many rows becomes millions,
 * and an opening balance is the baseline every later figure is measured against:
 * a one-halala error here is a permanent, unexplainable gap in the ledger. We
 * reuse `toMinor`/`r2` rather than rounding locally so there is one rounding
 * rule in the product.
 */
import { toMinor, toMajor, r2 } from './money.js';

/** The kinds of position an opening balance can carry. */
export const ACCOUNT_TYPES = Object.freeze(['customer', 'cash', 'stock', 'supplier']);

/** Human-readable Arabic labels, shown in the UI and in CSV errors. */
export const ACCOUNT_TYPE_LABELS = Object.freeze({
	customer: 'عميل',
	cash: 'نقدية',
	stock: 'مخزون',
	supplier: 'مورّد',
});

/**
 * Largest single opening balance we accept, in MINOR units.
 *
 * One billion major units. Beyond that the row is almost certainly a shifted
 * decimal (a 100 SAR entry typed as 10000) or a units mix-up, and importing it
 * would poison receivables for every report that reads the opening column.
 * Rejecting loudly is recoverable; a nine-figure silent entry is not.
 */
export const MAX_AMOUNT_MINOR = 100_000_000_000;

/** Upper bound on a quantity, guarding the same shifted-decimal failure. */
export const MAX_QUANTITY = 1_000_000_000;

/** Current + previous fiscal year codes — what a user can realistically open. */
const FISCAL_YEAR_RE = /^\d{4}$/;

/**
 * An error that carries the row it came from, so the import report can point
 * at the offending LINE rather than the file as a whole.
 */
export class OpeningBalanceError extends Error {
	constructor(message, row = null) {
		super(message);
		this.name = 'OpeningBalanceError';
		this.row = row;
		this.statusCode = 400;
	}
}

/**
 * Normalize a human-typed number into a form `Number()` accepts.
 *
 * Spreadsheets in an Arabic locale produce Arabic-Indic digits (٠-٩ / ۰-۹), the
 * Arabic DECIMAL separator U+066B (`٫`) and the Arabic THOUSANDS separator
 * U+066C (`٬`) — a cell entered as "١٢٥٠٫٥٠" is what a real user saves, and
 * `Number()` returns NaN for it. Converting only the digits is not enough: the
 * decimal point is a different character too, so the value must be rewritten
 * before it can be parsed.
 */
function normalizeNumericText(value) {
	return String(value)
		.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
		.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
		.replace(/٫/g, '.') // Arabic decimal separator
		.replace(/٬/g, '') // Arabic thousands separator
		.replace(/,/g, '') // ASCII thousands separator
		.trim();
}

/**
 * Coerce a value to minor units, refusing anything that is not a finite number.
 *
 * `Number('')` is 0 and `Number(null)` is 0, which would let a blank cell
 * silently become a real 0.00 balance — precisely the "confident zero" this
 * feature exists to eliminate. A blank cell is therefore an ERROR unless the
 * caller explicitly passes `allowBlank`.
 */
export function parseAmountMinor(value, { field = 'المبلغ', row = null, allowBlank = false } = {}) {
	if (value === null || value === undefined || String(value).trim() === '') {
		if (allowBlank) return 0;
		throw new OpeningBalanceError(`${field} مطلوب`, row);
	}
	const normalized = normalizeNumericText(value);
	const n = Number(normalized);
	if (!Number.isFinite(n)) {
		throw new OpeningBalanceError(`${field} ليس رقمًا صالحًا: ${value}`, row);
	}
	const minor = toMinor(n);
	if (Math.abs(minor) > MAX_AMOUNT_MINOR) {
		throw new OpeningBalanceError(`${field} يتجاوز الحد المسموح (${r2(MAX_AMOUNT_MINOR)})`, row);
	}
	return minor;
}

/**
 * Validate a value that is ALREADY in minor units.
 *
 * Kept separate from {@link parseAmountMinor} precisely so the ×100 conversion
 * cannot be applied twice. Any caller holding minor units must come here; the
 * distinction is invisible at the call site, which is why it gets its own name.
 */
export function parseMinorAmount(value, { field = 'المبلغ', row = null } = {}) {
	const n = Number(value);
	if (!Number.isFinite(n)) {
		throw new OpeningBalanceError(`${field} ليس رقمًا صالحًا: ${value}`, row);
	}
	const minor = Math.round(n);
	if (Math.abs(minor) > MAX_AMOUNT_MINOR) {
		throw new OpeningBalanceError(`${field} يتجاوز الحد المسموح`, row);
	}
	return minor;
}

/** Coerce a quantity, same blank/magnitude discipline as the amount. */
export function parseQuantity(value, { field = 'الكمية', row = null, allowBlank = false } = {}) {
	if (value === null || value === undefined || String(value).trim() === '') {
		if (allowBlank) return 0;
		throw new OpeningBalanceError(`${field} مطلوب`, row);
	}
	const normalized = normalizeNumericText(value);
	const n = Number(normalized);
	if (!Number.isFinite(n)) {
		throw new OpeningBalanceError(`${field} ليس رقمًا صالحًا: ${value}`, row);
	}
	if (Math.abs(n) > MAX_QUANTITY) {
		throw new OpeningBalanceError(`${field} يتجاوز الحد المسموح`, row);
	}
	return r2(n * 10000) / 10000; // 4dp, matching NUMERIC(18,4) in Postgres
}

/** Validate a fiscal-year code, with an Arabic message naming the bad value. */
export function normaliseFiscalYear(value, row = null) {
	const year = String(value ?? '').trim();
	if (!FISCAL_YEAR_RE.test(year)) {
		throw new OpeningBalanceError(`السنة المالية غير صالحة: ${year || '(فارغة)'}`, row);
	}
	const n = Number(year);
	if (n < 1900 || n > 2999) {
		throw new OpeningBalanceError(`السنة المالية خارج النطاق: ${year}`, row);
	}
	return year;
}

/**
 * Validate the account type, accepting the Arabic labels as aliases.
 *
 * A spreadsheet typed by a human says "عميل", not `customer`. Rejecting that
 * would train users that import "failed" without saying why; accepting it means
 * the labels in {@link ACCOUNT_TYPE_LABELS} are a real input format.
 */
export function normaliseAccountType(value, row = null) {
	const raw = String(value ?? '')
		.trim()
		.toLowerCase();
	if (!raw) throw new OpeningBalanceError('نوع الحساب مطلوب', row);
	if (ACCOUNT_TYPES.includes(raw)) return raw;
	for (const [type, label] of Object.entries(ACCOUNT_TYPE_LABELS)) {
		if (label === raw) return type;
	}
	throw new OpeningBalanceError(`نوع حساب غير معروف: ${value} (المسموح: ${ACCOUNT_TYPES.join('، ')})`, row);
}

/**
 * Index of a tenant's items, keyed by BOTH `products.id` and `products.code`.
 *
 * ## Why an index and not a query per row
 *
 * A stock import resolves one item per row. A 5,000-row file (the documented
 * ceiling) would otherwise run 5,000 lookups against the same table, and the
 * resolution rule would live in the import loop — where the second caller
 * (single save, UI form) would re-implement it slightly differently.
 *
 * ## Why the tenant clause is not optional
 *
 * `products.code` is globally UNIQUE, so a code CANNOT exist for two tenants at
 * once; scoping the read is therefore about the SPOOFED/foreign case: a caller
 * whose tenant does not own the code must not be able to link a balance row to
 * another tenant's item by guessing it. Unscoped (`tenantId === ''`) is only for
 * the SYSTEM plane (migrations, seeds, tests) — a request path always has a
 * tenant, and `assertTenantScope` refuses to invent one.
 *
 * @param {{prepare: Function}} db a handle exposing `prepare(sql).all(...)`
 * @param {string} [tenantId] the owning tenant; `''` means "every tenant"
 * @returns {Map<string, {id: string, code: string, name: string}>}
 */
export function buildProductIndex(db, tenantId = '') {
	const sql = tenantId
		? 'SELECT id, code, name FROM products WHERE (tenant_id=? OR tenant_id IS NULL)'
		: 'SELECT id, code, name FROM products';
	const rows = tenantId ? db.prepare(sql).all(String(tenantId)) : db.prepare(sql).all();
	const map = new Map();
	// Two passes so an exact ID match always wins over a codeless/coincidental
	// code match, regardless of row order.
	for (const r of rows) {
		const key = String(r.id ?? '').trim();
		if (key) map.set(key, r);
	}
	for (const r of rows) {
		const key = String(r.code ?? '').trim();
		if (key && !map.has(key)) map.set(key, r);
	}
	return map;
}

/**
 * Summarise rows by account type — the "opening position at a glance" strip.
 *
 * Lives HERE, not in the two routes that need it, for the same reason the
 * normaliser does: a summary rule that exists twice is a summary that will
 * disagree. The REST list and the method verb must not be able to print two
 * different totals for the same rows, and a duplicated 15-line loop is exactly
 * the kind of copy that drifts when someone adds a column.
 *
 * Every bucket is pre-seeded from {@link ACCOUNT_TYPES} so the UI renders all
 * four positions (including a genuine 0.00) instead of hiding the ones with no
 * rows — an absent bucket reads as "not measured", which is the confusion this
 * whole feature exists to remove.
 */
export function summariseOpeningBalances(rows = []) {
	const totals = Object.fromEntries(ACCOUNT_TYPES.map((type) => [type, { amountMinor: 0, quantity: 0, count: 0 }]));
	for (const row of rows) {
		// An unknown type is still counted, never dropped: a row the summary cannot
		// classify is data the caller must be able to see.
		if (!totals[row.account_type]) totals[row.account_type] = { amountMinor: 0, quantity: 0, count: 0 };
		const bucket = totals[row.account_type];
		bucket.amountMinor += Number(row.amount_minor) || 0;
		bucket.quantity += Number(row.quantity) || 0;
		bucket.count += 1;
	}
	return Object.fromEntries(
		Object.entries(totals).map(([type, v]) => [type, { ...v, amountMinor: Math.round(v.amountMinor) }]),
	);
}

/**
 * Normalise ONE raw row (from JSON, CSV or the UI) into the column shape the
 * `opening_balances` table stores.
 *
 * `id` is deliberately NOT accepted from input: the row's identity is derived
 * from the natural key (fiscal year + type + account + tenant), which is what
 * makes a re-import correct the row rather than create a second one. A client
 * that could choose `id` could address another tenant's row on the unique key.
 *
 * ## The item link (`product_id`)
 *
 * A `stock` row is a movement ABOUT an item, so it must name one that exists:
 * the reference is accepted as the item UUID (`productId`) or its code
 * (`accountCode`/`accountId`, which is what a spreadsheet carries), and it is
 * resolved through the caller-supplied `products` index (see
 * {@link buildProductIndex}). An unresolvable reference is an ERROR, never a row
 * with a blank link: a stock balance pointing at nothing is a movement nobody can
 * approve, which is the exact gap the link exists to close, and failing loudly is
 * recoverable while a silently unlinked movement is not.
 *
 * Passing `products` is therefore MANDATORY for a stock row. Without the index
 * there is nothing to verify against, and "I could not check" must never be
 * reported as "fine" — the same discipline as a blank amount being an error
 * instead of a 0.00.
 */
export function normaliseOpeningBalance(input = {}, { row = null, tenantId = '', products = null } = {}) {
	if (!input || typeof input !== 'object') {
		throw new OpeningBalanceError('سجل غير صالح', row);
	}
	const accountType = normaliseAccountType(input.accountType ?? input.account_type, row);
	const accountId = String(input.accountId ?? input.account_id ?? '').trim();
	const accountCode = String(input.accountCode ?? input.account_code ?? '')
		.trim()
		.slice(0, 128);
	// cash/supplier positions legitimately have no counterparty row.
	if (accountType === 'customer' && !accountId) {
		throw new OpeningBalanceError('معرّف العميل مطلوب لرصيد افتتاحي لعميل', row);
	}
	const productRef = String(input.productId ?? input.product_id ?? '').trim();
	if (accountType !== 'stock' && productRef) {
		throw new OpeningBalanceError('ربط الصنف (productId) متاح لأرصدة المخزون فقط', row);
	}
	let productId = '';
	if (accountType === 'stock') {
		if (!products || typeof products.get !== 'function') {
			throw new OpeningBalanceError('فهرس الأصناف مطلوب للتحقق من ربط رصيد المخزون', row);
		}
		const ref = productRef || accountCode || accountId;
		const item = ref ? products.get(ref) : null;
		if (!item) {
			throw new OpeningBalanceError(
				`الصنف غير موجود في جدول الأصناف: ${ref || '(بلا مرجع)'} — أدخل الأصناف أولًا ثم أعد الاستيراد`,
				row,
			);
		}
		productId = String(item.id);
	}
	const amountMinor =
		input.amountMinor !== undefined && input.amountMinor !== null && String(input.amountMinor).trim() !== ''
			? // Already in minor units: validate the MAGNITUDE but do NOT convert
				// again. Running 1234 through parseAmountMinor would yield 123400,
				// inflating a 12.34 opening balance into 1234.00.
				parseMinorAmount(input.amountMinor, { field: 'المبلغ', row })
			: parseAmountMinor(input.amount, { field: 'المبلغ', row });
	const quantity =
		input.quantity !== undefined && input.quantity !== null && String(input.quantity).trim() !== ''
			? parseQuantity(input.quantity, { field: 'الكمية', row, allowBlank: true })
			: 0;
	return {
		tenant_id: String(tenantId || ''),
		fiscal_year: normaliseFiscalYear(input.fiscalYear ?? input.fiscal_year, row),
		account_type: accountType,
		account_id: accountId,
		account_code: accountCode,
		account_name: String(input.accountName ?? input.account_name ?? '')
			.trim()
			.slice(0, 256),
		// Empty string (never `null`) so callers can bind it uniformly; the SQL
		// layer writes NULL for '', because the column is a FOREIGN KEY and ''
		// is a non-NULL value no `products.id` can satisfy.
		product_id: productId,
		amount_minor: amountMinor,
		quantity,
		notes: String(input.notes ?? '')
			.trim()
			.slice(0, 1000),
	};
}

/** The natural key that makes an import idempotent. */
export function openingBalanceKey({ fiscal_year, account_type, account_id, tenant_id }) {
	return [fiscal_year, account_type, account_id || '', tenant_id || ''].join('|');
}

/**
 * Parse a CSV body into header-mapped records.
 *
 * Handles the three things a hand-typed spreadsheet always contains: a UTF-8
 * BOM (Excel writes one, and without stripping it the first header becomes
 * "﻿fiscalYear" and every column silently misses), CRLF line endings, and
 * quoted fields containing the delimiter or a newline.
 *
 * Returns `{ rows, errors }` — never throws on a bad row, so a 500-row file
 * with 3 mistakes reports 497 successes and 3 line-referenced errors instead of
 * rejecting the lot. That is the difference between a usable import and one
 * nobody runs twice.
 *
 * `products` is the item index (see {@link buildProductIndex}) and is passed
 * straight through to the normaliser so a stock row's item link is resolved —
 * and a missing item REPORTED BY LINE NUMBER, which can only happen here, where
 * the file's line numbers still exist.
 */
export function parseOpeningBalanceCsv(text, { tenantId = '', products = null } = {}) {
	const rows = [];
	const errors = [];
	const raw = String(text ?? '').replace(/^﻿/, '');
	if (!raw.trim()) {
		return { rows, errors: [{ row: null, message: 'الملف فارغ' }] };
	}
	const matrix = [];
	let field = '';
	let record = [];
	let inQuotes = false;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (inQuotes) {
			if (ch === '"') {
				if (raw[i + 1] === '"') {
					field += '"';
					i++;
				} else inQuotes = false;
			} else field += ch;
			continue;
		}
		if (ch === '"') inQuotes = true;
		else if (ch === ',') {
			record.push(field);
			field = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && raw[i + 1] === '\n') i++;
			record.push(field);
			matrix.push(record);
			record = [];
			field = '';
		} else field += ch;
	}
	if (field !== '' || record.length) {
		record.push(field);
		matrix.push(record);
	}
	const nonEmpty = matrix.filter((r) => r.some((c) => String(c).trim() !== ''));
	if (!nonEmpty.length) return { rows, errors: [{ row: null, message: 'الملف فارغ' }] };
	const header = nonEmpty[0].map((h) => String(h).trim().replace(/^﻿/, ''));
	const index = new Map();
	header.forEach((h, i) => {
		if (!index.has(h)) index.set(h, i);
	});
	const pick = (row, ...names) => {
		for (const name of names) {
			const i = index.get(name);
			if (i !== undefined && i < row.length) return row[i];
		}
		return '';
	};
	if (!index.has('fiscalYear') && !index.has('fiscal_year')) {
		return { rows, errors: [{ row: 1, message: 'الملف ينقصه العمود fiscalYear (السنة المالية)' }] };
	}
	for (let i = 1; i < nonEmpty.length; i++) {
		const recordRow = nonEmpty[i];
		// +1 for the header, +1 for 1-based human line numbers.
		const lineNo = i + 1;
		try {
			rows.push(
				normaliseOpeningBalance(
					{
						fiscalYear: pick(recordRow, 'fiscalYear', 'fiscal_year', 'السنة'),
						accountType: pick(recordRow, 'accountType', 'account_type', 'النوع'),
						accountId: pick(recordRow, 'accountId', 'account_id', 'المعرف'),
						accountCode: pick(recordRow, 'accountCode', 'account_code', 'الرمز'),
						accountName: pick(recordRow, 'accountName', 'account_name', 'الاسم'),
						// A stock row may name its item explicitly; otherwise the
						// account code/id is the item code, which is what a spreadsheet
						// can actually carry (see normaliseOpeningBalance).
						productId: pick(recordRow, 'productId', 'product_id', 'رقم الصنف', 'كود الصنف'),
						amount: pick(recordRow, 'amount', 'المبلغ'),
						quantity: pick(recordRow, 'quantity', 'الكمية'),
						notes: pick(recordRow, 'notes', 'ملاحظات'),
					},
					{ row: lineNo, tenantId, products },
				),
			);
		} catch (error) {
			errors.push({
				row: lineNo,
				message: String(error?.message || 'سجل غير صالح'),
			});
		}
	}
	return { rows, errors };
}

/** The CSV header an export/template writes. Arabic aliases are accepted back. */
export const CSV_HEADERS = Object.freeze([
	'fiscalYear',
	'accountType',
	'accountId',
	'accountCode',
	'accountName',
	'amount',
	'quantity',
	'notes',
]);

/** Quote a CSV field only when it needs it, and always double inner quotes. */
export function csvField(value) {
	const s = value === null || value === undefined ? '' : String(value);
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serialise balances to CSV. Amounts are written in MAJOR units with two
 * decimals (what a human reads and re-imports), never in minor units — a
 * template that exports halalas would be imported back 100× too large.
 */
export function toOpeningBalanceCsv(balances = []) {
	const head = CSV_HEADERS.join(',');
	const body = balances
		.map((b) =>
			[
				csvField(b.fiscal_year),
				csvField(b.account_type),
				csvField(b.account_id),
				csvField(b.account_code),
				csvField(b.account_name),
				csvField(toMajor(b.amount_minor)),
				csvField(b.quantity ?? 0),
				csvField(b.notes || ''),
			].join(','),
		)
		.join('\r\n');
	return `${head}\r\n${body}${body ? '\r\n' : ''}`;
}

export default {
	ACCOUNT_TYPES,
	ACCOUNT_TYPE_LABELS,
	CSV_HEADERS,
	MAX_AMOUNT_MINOR,
	MAX_QUANTITY,
	OpeningBalanceError,
	buildProductIndex,
	csvField,
	normaliseAccountType,
	normaliseFiscalYear,
	normaliseOpeningBalance,
	openingBalanceKey,
	parseAmountMinor,
	parseMinorAmount,
	parseOpeningBalanceCsv,
	parseQuantity,
	summariseOpeningBalances,
	toOpeningBalanceCsv,
};
