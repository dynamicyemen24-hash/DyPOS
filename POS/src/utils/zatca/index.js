/**
 * ZATCA Phase 2 — public API.
 *
 * One call produces the three coupled artefacts that must agree with each other
 * and with the tax authority's recomputation:
 *
 *   1. `qrBase64`   — the TLV payload for the scannable QR
 *   2. `invoiceHash` — SHA-256 over the canonical field order (the chain anchor)
 *   3. `xml`        — the UBL 2.1 document
 *
 * If these three ever disagree, the invoice is invalid. So they are derived from
 * a SINGLE set of values here rather than assembled at three call sites.
 *
 * Offline-first note: everything in this module is local and synchronous except
 * the SHA-256 digests, which use Web Crypto. No network call is made, so an
 * invoice can be produced with the radio off; clearance/reporting is a separate
 * queued step (see the offline queue) and is never a precondition for selling.
 *
 * Pure + fully unit-tested. No DOM, no I/O, no network.
 */

import { buildQrBase64 } from "./tlv.js"
import {
	buildInvoiceHashInput,
	computeInvoiceHash,
	DOMESTIC_CURRENCY,
} from "./hash.js"
import {
	buildInvoiceXml,
	INVOICE_TYPE_CODES,
	TAX_CATEGORY_CODES,
} from "./ubl.js"

export * from "./tlv.js"
export * from "./hash.js"
export * from "./ubl.js"
export * from "./signature.js"
export * from "./secp256k1Provider.js"
export * from "./der.js"
export * from "./base64.js"
export * from "./csid.js"

/**
 * Format an integer minor amount (halalas) as an exact 2-decimal string.
 *
 * Deliberately integer-only: no division, no toFixed on a float, so the result
 * is exact for every value and identical in every JavaScript engine.
 *
 * @param {number} minor
 * @returns {string} e.g. "115.00"
 */
export function formatMinor(minor) {
	const m = Math.round(Number(minor) || 0)
	const sign = m < 0 ? "-" : ""
	const abs = Math.abs(m)
	return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}

/** Normalise a Date (or pass-through string) to ZATCA's Zulu form. */
function toZuluTimestamp(value) {
	if (typeof value === "string") return value
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime()))
		throw new TypeError("Invalid invoice timestamp")
	return `${date.toISOString().slice(0, 19)}Z`
}

/** UTC calendar date + time, which is what ZATCA expects. */
function toDateAndTime(value) {
	const zulu = toZuluTimestamp(value)
	return { date: zulu.slice(0, 10), time: zulu.slice(11, 19), zulu }
}

/**
 * Build a complete, internally consistent ZATCA invoice.
 *
 * @param {object} input
 * @param {object} input.seller   {sellerName, sellerVatNumber, address?}
 * @param {object} [input.customer] {customerName?, customerVatNumber?}
 * @param {string|number} [input.timestamp] defaults to now (UTC)
 * @param {string|number} input.icv invoice counter value (1-based)
 * @param {string} input.invoiceId serial / ID
 * @param {keyof INVOICE_TYPE_CODES} [input.invoiceType="STANDARD"]
 * @param {string} [input.currency="SAR"]
 * @param {string} [input.profileId="reporting:1.0"]
 * @param {object} input.totals   integer minor units:
 *        {lineExtensionAmount, taxExclusiveAmount, taxInclusiveAmount,
 *         payableAmount, taxTotal}
 * @param {object} input.tax      {categories:[{code, percent, taxableAmount, taxAmount}]}
 *        where taxableAmount/taxAmount are integer minor units
 * @param {Array}  input.lines    [{name, description?, quantity, unitPrice,
 *        lineExtensionAmount (minor), taxCategoryCode?}]
 * @param {object} [input.previous] {previousInvoiceHash}
 * @param {string} [input.billingReference] simplified invoices only
 * @param {object} [input.exemption] {reasonCode, reason} VAT-exempt invoices
 * @param {string} [input.creditNote] {reason, referenceId}
 * @returns {Promise<{qrBase64:string, invoiceHash:string, xml:string,
 *                    icv:string, invoiceDate:string, invoiceTime:string,
 *                    hashInput:string}>}
 */
export async function buildZatcaInvoice(input) {
	if (!input?.seller?.sellerVatNumber) {
		throw new TypeError(
			"seller.sellerVatNumber is required for a ZATCA invoice",
		)
	}
	if (!input?.icv || Number(input.icv) < 1) {
		throw new RangeError(
			"ICV must start at 1 (ZATCA numbers invoices from 1, no gaps)",
		)
	}

	const type = INVOICE_TYPE_CODES[input.invoiceType || "STANDARD"]
	if (!type) throw new TypeError(`Unknown invoice type: ${input.invoiceType}`)

	const currency = String(input.currency || DOMESTIC_CURRENCY)
	const { date, time, zulu } = toDateAndTime(input.timestamp ?? new Date())

	// One formatting pass, reused by the QR, the hash and the XML, so the three
	// artefacts cannot drift apart.
	const amount = {
		invoiceTotalWithVat: formatMinor(input.totals?.payableAmount),
		vatTotal: formatMinor(input.totals?.taxTotal),
		lineExtensionAmount: formatMinor(input.totals?.lineExtensionAmount),
		taxExclusiveAmount: formatMinor(input.totals?.taxExclusiveAmount),
		taxInclusiveAmount: formatMinor(input.totals?.taxInclusiveAmount),
	}

	const isCredit = type.category === "CREDIT"
	const hashFields = {
		sellerName: input.seller.sellerName,
		sellerVatNumber: input.seller.sellerVatNumber,
		timestamp: zulu,
		invoiceTotalWithVat: amount.invoiceTotalWithVat,
		vatTotal: amount.vatTotal,
		invoiceId: String(input.invoiceId),
		invoiceDate: date,
		invoiceTypeCode: type.name,
		currency,
		...(isCredit && input.creditNote
			? {
					creditNoteReason: input.creditNote.reason,
					creditNoteReferenceId: input.creditNote.referenceId,
				}
			: {}),
		...(input.billingReference
			? { billingReference: input.billingReference }
			: {}),
		...(input.exemption?.reasonCode
			? {
					vatExemptionReasonCode: input.exemption.reasonCode,
					vatExemptionReason: input.exemption.reason,
				}
			: {}),
	}

	// Tag 8 carries the two-digit phase-1 style code; the XML uses the
	// seven-digit UN/CEFACT name. Both are correct in their own place.
	const qrBase64 = buildQrBase64({
		sellerName: hashFields.sellerName,
		sellerVatNumber: hashFields.sellerVatNumber,
		timestamp: zulu,
		invoiceTotalWithVat: amount.invoiceTotalWithVat,
		vatTotal: amount.vatTotal,
		invoiceId: hashFields.invoiceId,
		invoiceDate: date,
		invoiceTypeCode: type.qrTagValue,
		additionalStructuredReference: isCredit
			? input.creditNote?.referenceId
			: input.billingReference,
	})

	const hashInput = buildInvoiceHashInput(hashFields)
	const invoiceHash = await computeInvoiceHash(hashFields)

	const xml = buildInvoiceXml({
		seller: input.seller,
		customer: input.customer,
		profileId: input.profileId || "reporting:1.0",
		icv: String(input.icv),
		invoiceId: String(input.invoiceId),
		invoiceDate: date,
		invoiceTime: time,
		invoiceType: input.invoiceType || "STANDARD",
		currency,
		invoiceTotalWithVat: amount.invoiceTotalWithVat,
		taxTotal: amount.vatTotal,
		previous: input.previous,
		qrBase64,
		tax: {
			currency,
			taxAmount: amount.vatTotal,
			categories: (input.tax?.categories || []).map((c) => ({
				...c,
				taxableAmount: formatMinor(c.taxableAmount),
				taxAmount: formatMinor(c.taxAmount),
			})),
		},
		totals: {
			lineExtensionAmount: amount.lineExtensionAmount,
			taxExclusiveAmount: amount.taxExclusiveAmount,
			taxInclusiveAmount: amount.taxInclusiveAmount,
			payableAmount: amount.invoiceTotalWithVat,
		},
		lines: (input.lines || []).map((l) => ({
			...l,
			unitPrice: formatMinor(l.unitPrice),
			lineExtensionAmount: formatMinor(l.lineExtensionAmount),
		})),
	})

	return {
		qrBase64,
		invoiceHash,
		xml,
		icv: String(input.icv),
		invoiceDate: date,
		invoiceTime: time,
		hashInput,
	}
}

export { INVOICE_TYPE_CODES, TAX_CATEGORY_CODES }

export default { buildZatcaInvoice, formatMinor }
