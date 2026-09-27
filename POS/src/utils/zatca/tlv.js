/**
 * ZATCA Phase 2 — TLV QR payload encoder.
 *
 * The Phase 2 QR is a Base64 blob over a concatenation of TLV triplets:
 *   1 byte tag | 1 byte length | length bytes of UTF-8 value
 * Tags are emitted in ascending order and every length must fit in one byte.
 *
 * This is a byte-level encoder, NOT a hex-string approximation, and it is
 * browser-safe: TextEncoder + btoa only. Node's `Buffer` is deliberately never
 * used (see server/tests/crypto-integrity.test.js, which enforces that).
 *
 * Pure + fully unit-tested. No DOM, no I/O, no network.
 */

/** ZATCA limits each TLV value to 255 bytes (1-byte length prefix). */
const MAX_VALUE_BYTES = 255

/**
 * The nine mandatory QR tags, in the exact order ZATCA specifies.
 * Tag 9 is conditional: for a credit note it carries the referenced invoice,
 * and for a simplified invoice it carries the billing reference.
 */
export const ZATCA_QR_TAGS = Object.freeze({
	SELLER_NAME: 1,
	SELLER_VAT_NUMBER: 2,
	TIMESTAMP: 3,
	INVOICE_TOTAL_WITH_VAT: 4,
	VAT_TOTAL: 5,
	INVOICE_ID: 6,
	INVOICE_DATE: 7,
	INVOICE_TYPE_CODE: 8,
	ADDITIONAL_STRUCTURED_REFERENCE: 9,
})

function utf8Bytes(value) {
	return new TextEncoder().encode(value == null ? "" : String(value))
}

function bytesToBase64(bytes) {
	let binary = ""
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
	return btoa(binary)
}

/**
 * Encode tag/value pairs into raw TLV bytes.
 *
 * @param {Array<{tag:number, value:string}>} tags
 * @returns {Uint8Array}
 */
export function tlvEncode(tags) {
	if (!Array.isArray(tags))
		throw new TypeError("tlvEncode expects an array of {tag, value}")
	const out = []
	let previousTag = 0
	for (const entry of tags) {
		const tag = Number(entry?.tag)
		if (!Number.isInteger(tag) || tag < 1 || tag > 255) {
			throw new RangeError(`TLV tag out of range: ${entry?.tag}`)
		}
		if (tag <= previousTag) {
			throw new RangeError(`TLV tags must ascend: ${tag} after ${previousTag}`)
		}
		previousTag = tag
		const bytes = utf8Bytes(entry?.value)
		if (bytes.length > MAX_VALUE_BYTES) {
			throw new RangeError(
				`TLV tag ${tag} value is ${bytes.length} bytes, max ${MAX_VALUE_BYTES}`,
			)
		}
		out.push(tag, bytes.length, ...bytes)
	}
	return new Uint8Array(out)
}

/**
 * Encode tag/value pairs into the Base64 string embedded in the QR.
 *
 * @param {Array<{tag:number, value:string}>} tags
 * @returns {string} Base64
 */
export function tlvToBase64(tags) {
	return bytesToBase64(tlvEncode(tags))
}

/**
 * Build the nine mandatory tags in canonical order.
 *
 * Amounts MUST already be exact decimal strings (e.g. "115.00") produced from
 * integer minor units via utils/money.js — never from float arithmetic.
 *
 * @param {object} invoice
 * @returns {Array<{tag:number, value:string}>}
 */
export function buildQrTags(invoice) {
	const required = (value, field) => {
		if (value == null || value === "") {
			throw new TypeError(`ZATCA QR is missing required field: ${field}`)
		}
		return String(value)
	}

	const tags = [
		{
			tag: ZATCA_QR_TAGS.SELLER_NAME,
			value: required(invoice.sellerName, "sellerName"),
		},
		{
			tag: ZATCA_QR_TAGS.SELLER_VAT_NUMBER,
			value: required(invoice.sellerVatNumber, "sellerVatNumber"),
		},
		{
			tag: ZATCA_QR_TAGS.TIMESTAMP,
			value: required(invoice.timestamp, "timestamp"),
		},
		{
			tag: ZATCA_QR_TAGS.INVOICE_TOTAL_WITH_VAT,
			value: required(invoice.invoiceTotalWithVat, "invoiceTotalWithVat"),
		},
		{
			tag: ZATCA_QR_TAGS.VAT_TOTAL,
			value: required(invoice.vatTotal, "vatTotal"),
		},
		{
			tag: ZATCA_QR_TAGS.INVOICE_ID,
			value: required(invoice.invoiceId, "invoiceId"),
		},
		{
			tag: ZATCA_QR_TAGS.INVOICE_DATE,
			value: required(invoice.invoiceDate, "invoiceDate"),
		},
		{
			tag: ZATCA_QR_TAGS.INVOICE_TYPE_CODE,
			value: required(invoice.invoiceTypeCode, "invoiceTypeCode"),
		},
	]

	// Tag 9 is conditional and is omitted entirely when there is no reference,
	// because a present-but-empty tag encodes different bytes than an absent one.
	const additional = invoice.additionalStructuredReference
	if (additional) {
		tags.push({
			tag: ZATCA_QR_TAGS.ADDITIONAL_STRUCTURED_REFERENCE,
			value: required(additional, "additionalStructuredReference"),
		})
	}

	return tags
}

/** Convenience: canonical nine tags → Base64 QR payload. */
export function buildQrBase64(invoice) {
	return tlvToBase64(buildQrTags(invoice))
}

export default {
	tlvEncode,
	tlvToBase64,
	buildQrTags,
	buildQrBase64,
	ZATCA_QR_TAGS,
}
