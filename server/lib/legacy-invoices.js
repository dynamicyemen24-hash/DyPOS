/**
 * Legacy invoice import (استيراد فواتير قديمة) — the rules, in one place.
 *
 * ## Why this exists
 *
 * A shop that moves onto DyPOS arrives with history: last year's invoices, the
 * customers who still owe money, the stock it already had. Opening balances
 * (`lib/opening-balances.js`) cover the CASH position and the CUSTOMER debt.
 * They deliberately do NOT cover invoices, and that gap is not an oversight:
 *
 *  - an opening balance is a POSITION (a number as of a date),
 *  - an invoice is a TRANSACTION (a set of lines that must sum correctly).
 *
 * Importing old invoices as balances would destroy the audit trail: every report
 * counting invoice COUNT, every tax-period total and every "sales in March"
 * question would read the migration as one lump on the opening date. So they are
 * imported as real `invoices` + `invoice_items` rows, back-dated and marked, so
 * they can never be mistaken for this year's business.
 *
 * ## The one money rule
 *
 * This module IMPORTS `computeLineMinor` from `lib/money.js` rather than
 * re-deriving tax. Invariant 3 in AGENTS.md is that the sale-line rule exists in
 * exactly one place; an import path computing its own VAT would make a migrated
 * invoice's tax disagree with a freshly-created one — the exact "two
 * implementations of the same rule" defect that rule exists to kill.
 */
import { computeLineMinor, toMinor, toMajor } from './money.js';

/** Statuses a legacy row may claim. The MONEY decides the stored one. */
export const LEGACY_STATUSES = Object.freeze(['PAID', 'UNPAID', 'PARTIAL']);

/**
 * Every imported invoice is marked, and the marker is why a report can exclude
 * them: real invoices for real tax periods, but not this year's business.
 * `notes` carries it because `notes` is already user-visible on the invoice — a
 * human reading the ledger sees the same fact an automated report would.
 */
export const LEGACY_NOTE_PREFIX = '[مستورد]';

/** Longest invoice number we accept; longer is a corrupted export. */
export const MAX_NUMBER_LENGTH = 64;
/** Longest customer name; matches the customers column. */
export const MAX_NAME_LENGTH = 200;
/** Guard on a single line's quantity, same shifted-decimal reasoning. */
export const MAX_QTY = 1_000_000;

/** Header aliases a real export carries (Arabic and English, both spellings). */
const FIELD_ALIASES = {
	number: ['number', 'invoiceNumber', 'invoice_number', 'رقم_الفاتورة', 'رقم الفاتورة', 'الفاتورة'],
	date: ['date', 'createdAt', 'created_at', 'invoiceDate', 'invoice_date', 'التاريخ', 'تاريخ الفاتورة'],
	customer: ['customer', 'customerName', 'customer_name', 'العميل', 'اسم العميل'],
	customerId: ['customerId', 'customer_id', 'customer_ref', 'رقم العميل'],
	terminal: ['terminal', 'terminalId', 'terminal_id', 'نقطة البيع', 'الجهاز'],
	branch: ['branch', 'branchId', 'branch_id', 'الفرع'],
	status: ['status', 'الحالة'],
	paid: ['paid', 'paidAmount', 'paid_amount', 'المدفوع', 'المبلغ المدفوع'],
	total: ['total', 'amount', 'grandTotal', 'grand_total', 'الإجمالي', 'المبلغ الإجمالي'],
	notes: ['notes', 'note', 'ملاحظات'],
};

/** The line-level aliases. */
const LINE_ALIASES = {
	name: ['name', 'productName', 'product_name', 'الصنف', 'اسم الصنف'],
	code: ['code', 'productCode', 'product_code', 'كود الصنف'],
	qty: ['qty', 'quantity', 'الكمية'],
	price: ['price', 'unitPrice', 'unit_price', 'سعر الوحدة', 'السعر'],
	discount: ['discount', 'الخصم'],
	taxRate: ['taxRate', 'tax_rate', 'نسبة الضريبة', 'الضريبة'],
	taxInclusive: ['taxInclusive', 'tax_inclusive', 'شامل الضريبة'],
};

/** Read the first present alias, so one parser serves every tenant's export. */
function pick(row, aliases) {
	for (const key of aliases) {
		const value = row?.[key];
		if (value !== undefined && value !== null && String(value).trim() !== '') {
			return value;
		}
	}
	return undefined;
}

/**
 * Normalize an Arabic-locale number.
 *
 * Same reason as `lib/opening-balances.js`: a spreadsheet saved in an Arabic
 * locale writes Arabic-Indic digits and U+066B as the decimal separator, and
 * `Number()` returns NaN for all of it. Re-declared rather than imported because
 * that helper is not exported, and exporting it would couple two otherwise
 * independent features. Both files pin the behaviour with tests, so a divergence
 * fails the build rather than the ledger.
 */
function normalizeNumericText(value) {
	return String(value)
		.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
		.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
		.replace(/٫/g, '.')
		.replace(/٬/g, '')
		.replace(/,/g, '')
		.trim();
}

/** An error carrying the offending row, so the report points at the LINE. */
export class LegacyInvoiceError extends Error {
	constructor(message, row = null) {
		super(message);
		this.name = 'LegacyInvoiceError';
		this.row = row;
		this.statusCode = 400;
	}
}

/**
 * Accept an ISO date or the common `DD/MM/YYYY` shape.
 *
 * Returns `YYYY-MM-DD`, or throws. We do NOT default to today: an import that
 * silently dates every invoice to the migration day destroys the per-period
 * reporting the migration exists to preserve. A blank date is an error the
 * operator must resolve.
 */
export function normalizeLegacyDate(value, row = null) {
	const raw = normalizeNumericText(value)
		.replace(/[年月]/g, '-')
		.replace(/日/g, '')
		.trim();
	if (!raw) throw new LegacyInvoiceError('تاريخ الفاتورة مطلوب', row);

	const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
	if (iso) {
		const [, y, m, d] = iso;
		if (+m < 1 || +m > 12 || +d < 1 || +d > 31) {
			throw new LegacyInvoiceError(`تاريخ غير صالح: ${value}`, row);
		}
		return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}

	// DD/MM/YYYY — day-first, the form an Arabic-locale spreadsheet actually
	// writes. Read as MM/DD it would silently move every invoice whose day is
	// ≤ 12 into the wrong month: silent corruption of a tax period.
	const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(raw);
	if (dmy) {
		const [, d, m, y] = dmy;
		if (+m < 1 || +m > 12 || +d < 1 || +d > 31) {
			throw new LegacyInvoiceError(`تاريخ غير صالح: ${value}`, row);
		}
		return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}

	throw new LegacyInvoiceError(`تاريخ غير مفهوم: ${value} (المتوقع YYYY-MM-DD أو DD/MM/YYYY)`, row);
}

/**
 * Normalize and validate ONE legacy line, computing its money with the shared
 * sale-line rule.
 *
 * The figures returned are the recomputed truth; a caller comparing them against
 * a stated invoice total is comparing the SOURCE against the canonical rule, not
 * two implementations of it.
 */
export function normalizeLegacyLine(raw, row = null) {
	const name = String(pick(raw, LINE_ALIASES.name) ?? '')
		.trim()
		.slice(0, MAX_NAME_LENGTH);
	if (!name) throw new LegacyInvoiceError('اسم الصنف مطلوب في السطر', row);

	const qtyRaw = pick(raw, LINE_ALIASES.qty);
	const qty = Number(normalizeNumericText(qtyRaw ?? ''));
	if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) {
		throw new LegacyInvoiceError(`كمية غير صالحة: ${qtyRaw}`, row);
	}

	const priceRaw = pick(raw, LINE_ALIASES.price);
	const price = Number(normalizeNumericText(priceRaw ?? ''));
	if (!Number.isFinite(price) || price < 0) {
		throw new LegacyInvoiceError(`سعر غير صالح: ${priceRaw}`, row);
	}

	const discountMinor = toMinor(normalizeNumericText(pick(raw, LINE_ALIASES.discount) ?? 0) || 0);

	const taxRateRaw = pick(raw, LINE_ALIASES.taxRate);
	const taxRateText = normalizeNumericText(taxRateRaw ?? 0);
	const taxRate = taxRateText === '' ? 0 : Number(taxRateText);
	if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
		throw new LegacyInvoiceError(`نسبة ضريبة غير صالحة: ${taxRateRaw}`, row);
	}

	const inclusiveText = String(pick(raw, LINE_ALIASES.taxInclusive) ?? '')
		.trim()
		.toLowerCase();
	const taxInclusive = ['1', 'true', 'yes', 'نعم'].includes(inclusiveText);

	// The ONE money path. The shared rule clamps the discount into [0, qty×price],
	// so a legacy discount larger than the line can never make a negative total.
	const computed = computeLineMinor({
		qty,
		price,
		discount: toMajor(discountMinor),
		taxRate,
		taxInclusive,
	});

	return {
		productName: name,
		productCode: String(pick(raw, LINE_ALIASES.code) ?? '')
			.trim()
			.slice(0, 64),
		qty,
		unitPrice: price,
		discount: toMajor(computed.discountMinor),
		taxRate: computed.taxRate,
		taxInclusive,
		taxAmount: toMajor(computed.taxMinor),
		// `total` is the GROSS figure the schema stores on a line, matching what
		// a fresh sale writes.
		total: toMajor(computed.grossMinor),
		net: toMajor(computed.netMinor),
	};
}

/**
 * Normalize ONE legacy invoice: header + lines + the reconciliation check.
 *
 * The reconciliation is the point of this function: every total is recomputed
 * from the lines, and a source whose stated total disagrees is REFUSED rather
 * than adjusted. An export whose header was computed at a different tax rate —
 * or rounded per line instead of per invoice — would otherwise silently poison
 * every fiscal report from the migration date onward. Failing the row with BOTH
 * numbers lets an operator fix the file; a silently-adjusted total is how a
 * ledger stops being auditable.
 */
export function normalizeLegacyInvoice(raw, row = null) {
	const number = String(pick(raw, FIELD_ALIASES.number) ?? '')
		.trim()
		.slice(0, MAX_NUMBER_LENGTH);
	if (!number) throw new LegacyInvoiceError('رقم الفاتورة مطلوب', row);

	const date = normalizeLegacyDate(pick(raw, FIELD_ALIASES.date), row);

	const linesRaw = Array.isArray(raw.lines) ? raw.lines : Array.isArray(raw.items) ? raw.items : [];
	if (!linesRaw.length) throw new LegacyInvoiceError(`الفاتورة ${number} بلا بنود`, row);

	const lines = linesRaw.map((line, i) => normalizeLegacyLine(line, { row, line: i + 1 }));

	// Recompute the header from the lines. This is the authoritative total: the
	// source's stated total is only ever used as a COMPARISON, never stored.
	const subtotalMinor = lines.reduce((sum, l) => sum + toMinor(l.net), 0);
	const taxMinor = lines.reduce((sum, l) => sum + toMinor(l.taxAmount), 0);
	const discountMinor = lines.reduce((sum, l) => sum + toMinor(l.discount), 0);
	const totalMinor = subtotalMinor + taxMinor;

	const totalRaw = pick(raw, FIELD_ALIASES.total);
	const totalText = normalizeNumericText(totalRaw ?? '');
	if (totalText !== '') {
		const statedMinor = toMinor(Number(totalText));
		if (!Number.isFinite(statedMinor)) {
			throw new LegacyInvoiceError(`إجمالي غير صالح: ${totalRaw}`, row);
		}
		// One halala of tolerance: an export that rounded each line independently
		// can differ from per-invoice rounding by a few halalas. Beyond that it is
		// a real disagreement, not a rounding artefact.
		if (Math.abs(statedMinor - totalMinor) > 1) {
			throw new LegacyInvoiceError(
				`إجمالي الفاتورة ${number} لا يطابق بنودها: المصدر ${toMajor(statedMinor)} · الحساب ${toMajor(totalMinor)} — صحّح الملف ثم أعد الاستيراد`,
				row,
			);
		}
	}

	const paidRaw = pick(raw, FIELD_ALIASES.paid);
	const paidMinor = toMinor(normalizeNumericText(paidRaw ?? 0) || 0);
	if (paidMinor < 0) {
		throw new LegacyInvoiceError('المبلغ المدفوع لا يمكن أن يكون سالبًا', row);
	}
	// Over-payment is a settlement decision, not an import fact. A legacy row
	// claiming more paid than the total is either a data error or a receipt that
	// included a tip; either way the invoice ledger must not carry it, so the
	// excess is refused rather than silently dropped.
	if (paidMinor > totalMinor) {
		throw new LegacyInvoiceError(`المدفوع ${toMajor(paidMinor)} يتجاوز إجمالي الفاتورة ${toMajor(totalMinor)}`, row);
	}

	const statusText = String(pick(raw, FIELD_ALIASES.status) ?? '')
		.trim()
		.toUpperCase();
	if (statusText && !LEGACY_STATUSES.includes(statusText)) {
		throw new LegacyInvoiceError(`حالة غير معروفة: ${statusText}`, row);
	}

	// The MONEY decides the stored status, never the source's claim. A stated
	// status is advisory: the one thing this import must get right is that aging
	// and receivables read the truth. When the source says PAID and the paid
	// column is blank we record UNPAID — the alternative is a shop whose reports
	// understate what it is owed.
	const remainingMinor = totalMinor - paidMinor;
	const status = remainingMinor === 0 ? 'PAID' : paidMinor > 0 ? 'PARTIAL' : 'UNPAID';

	return {
		number,
		date,
		customerId: String(pick(raw, FIELD_ALIASES.customerId) ?? '')
			.trim()
			.slice(0, 64),
		customerName: String(pick(raw, FIELD_ALIASES.customer) ?? 'عميل نقدي')
			.trim()
			.slice(0, MAX_NAME_LENGTH),
		terminalId: String(pick(raw, FIELD_ALIASES.terminal) ?? '')
			.trim()
			.slice(0, 32),
		branchId: String(pick(raw, FIELD_ALIASES.branch) ?? '')
			.trim()
			.slice(0, 32),
		status,
		subtotal: toMajor(subtotalMinor),
		taxAmount: toMajor(taxMinor),
		discountAmount: toMajor(discountMinor),
		total: toMajor(totalMinor),
		paidAmount: toMajor(paidMinor),
		remainingAmount: toMajor(remainingMinor),
		notes: `${LEGACY_NOTE_PREFIX} ${String(pick(raw, FIELD_ALIASES.notes) ?? '').trim()}`.trim(),
		lines,
	};
}

/**
 * Split one CSV line, honouring quoted fields.
 *
 * Scoped to this module rather than reusing `lib/csv.js` because the two need
 * different limits: `parseCsv` caps at 5000 rows, which is right for a flat
 * product import. A legacy export is one row per invoice LINE and routinely
 * carries more than 5000 of them for a single year, so it needs its own ceiling
 * and its own grouping into invoices.
 */
function splitCsvLine(line) {
	const out = [];
	let field = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"') {
				if (line[i + 1] === '"') {
					field += '"';
					i++;
				} else inQuotes = false;
			} else field += ch;
		} else if (ch === '"') inQuotes = true;
		else if (ch === ',') {
			out.push(field);
			field = '';
		} else if (ch !== '\r') field += ch;
	}
	out.push(field);
	return out;
}

/**
 * Parse a CSV of legacy invoices.
 *
 * The format is deliberately flat and spreadsheet-friendly: ONE ROW PER INVOICE
 * LINE, with the invoice header repeated on each row. That is the shape every
 * accounting export produces and the only one an accountant can type in a
 * spreadsheet — a nested document is not.
 *
 * Rows sharing an invoice number group into one invoice. A row with no number is
 * an error naming its line, because silently merging those rows would fabricate
 * an invoice nobody recorded.
 *
 * @returns {{invoices: Array, errors: Array<{row:number|null,error:string}>}}
 */
export function parseLegacyInvoicesCsv(text, { maxRows = 200_000, maxInvoices = 20_000 } = {}) {
	const lines = String(text)
		.replace(/^﻿/, '')
		.split(/\n/)
		.filter((l) => l.trim() !== '');
	if (lines.length < 2) return { invoices: [], errors: [] };

	const headers = splitCsvLine(lines[0]).map((h) => h.trim());
	if (!headers.length) return { invoices: [], errors: [] };

	/** number → { header record, lines[] } */
	const grouped = new Map();
	const errors = [];

	for (let i = 1; i < lines.length && i - 1 < maxRows; i++) {
		const cells = splitCsvLine(lines[i]);
		if (cells.length !== headers.length) {
			errors.push({
				row: i + 1,
				error: `عدد الأعمدة ${cells.length} لا يطابق الترويسة ${headers.length}`,
			});
			continue;
		}

		const record = {};
		headers.forEach((h, idx) => {
			record[h] = (cells[idx] ?? '').trim();
		});

		try {
			const number = String(pick(record, FIELD_ALIASES.number) ?? '').trim();
			if (!number) throw new LegacyInvoiceError('رقم الفاتورة مطلوب');

			// Validate the LINE here so a bad line is reported as a line rather
			// than failing the whole file the way a thrown parse would.
			const lineRecord = {};
			for (const [field, aliases] of Object.entries(LINE_ALIASES)) {
				lineRecord[field] = pick(record, aliases);
			}
			const normalized = normalizeLegacyLine(lineRecord, i + 1);

			if (!grouped.has(number)) {
				if (grouped.size >= maxInvoices) {
					errors.push({ row: i + 1, error: `تجاوز الحد (${maxInvoices} فاتورة)` });
					continue;
				}
				grouped.set(number, { record, lines: [] });
			}
			grouped.get(number).lines.push(normalized);
		} catch (e) {
			errors.push({ row: i + 1, error: String(e.message).slice(0, 200) });
		}
	}

	const invoices = [];
	for (const [number, group] of grouped) {
		try {
			invoices.push(normalizeLegacyInvoice({ ...group.record, lines: group.lines }, number));
		} catch (e) {
			// A reconciliation failure is reported as an error, NOT repaired: the
			// operator must decide whether the file or the ledger is right.
			errors.push({ row: null, error: String(e.message).slice(0, 200) });
		}
	}

	return { invoices, errors };
}

export default {
	LEGACY_NOTE_PREFIX,
	LEGACY_STATUSES,
	LegacyInvoiceError,
	MAX_NAME_LENGTH,
	MAX_NUMBER_LENGTH,
	MAX_QTY,
	normalizeLegacyDate,
	normalizeLegacyInvoice,
	normalizeLegacyLine,
	parseLegacyInvoicesCsv,
};
