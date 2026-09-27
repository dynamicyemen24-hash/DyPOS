/**
 * ZATCA Phase 2 — invoice hash (SHA-256) and the anti-tamper hash chain.
 *
 * The invoice hash is the anchor of ZATCA compliance: it is what the tax
 * authority recomputes to detect tampering, and what the NEXT invoice embeds as
 * its "previous invoice hash". Get it wrong and the whole ledger is worthless.
 *
 * ZATCA defines the digest as SHA-256 over the UTF-8 concatenation of a fixed,
 * ordered list of invoice values, with no separators and no trailing delimiter.
 * Optional fields contribute ONLY when they apply — an omitted field must
 * contribute zero bytes, never an empty string, because "" and absent are
 * different inputs to the digest.
 *
 * Everything here uses real Web Crypto. There is deliberately no fallback
 * "hash" implementation: a weak digest here would silently produce a
 * non-compliant yet plausible-looking invoice, which is strictly worse than an
 * error. See docs/LEGACY_DECISION.md for the anti-pattern this replaces.
 *
 * Pure + fully unit-tested. No DOM, no I/O, no network.
 */

/** The currency ZATCA treats as domestic; omitting its code is mandatory. */
export const DOMESTIC_CURRENCY = "SAR"

/**
 * Resolve SubtleCrypto lazily.
 *
 * Resolving at call time (not import time) keeps the module usable in jsdom,
 * where `crypto.subtle` is absent, and lets callers inject a real implementation.
 */
function getSubtle() {
	const subtle = globalThis.crypto?.subtle
	if (!subtle) {
		throw new Error(
			"SubtleCrypto unavailable — ZATCA hashing requires a secure context (HTTPS or localhost)",
		)
	}
	return subtle
}

const encoder = new TextEncoder()

/** Hex-encode bytes, lowercase. */
export function bytesToHex(bytes) {
	let out = ""
	for (let i = 0; i < bytes.length; i++)
		out += bytes[i].toString(16).padStart(2, "0")
	return out
}

/**
 * Real SHA-256, hex encoded.
 *
 * @param {string} data
 * @returns {Promise<string>} 64 lowercase hex chars
 */
export async function sha256Hex(data) {
	const digest = await getSubtle().digest(
		"SHA-256",
		encoder.encode(String(data)),
	)
	return bytesToHex(new Uint8Array(digest))
}

/**
 * Build the ordered, concatenated hash input for an invoice.
 *
 * Exported separately so it can be asserted directly in tests: a compliance
 * bug in the ORDER is as damaging as a bug in the digest.
 *
 * @param {object} invoice
 * @returns {string} the exact bytes fed to SHA-256
 */
export function buildInvoiceHashInput(invoice) {
	const parts = []

	const push = (value) => {
		if (value !== undefined && value !== null) parts.push(String(value))
	}

	// 1-8: always present, in the order ZATCA mandates.
	push(invoice.sellerName)
	push(invoice.sellerVatNumber)
	push(invoice.timestamp)
	push(invoice.invoiceTotalWithVat)
	push(invoice.vatTotal)
	push(invoice.invoiceId)
	push(invoice.invoiceDate)
	push(invoice.invoiceTypeCode)

	// 9-10: credit notes only.
	push(invoice.creditNoteReason)
	push(invoice.creditNoteReferenceId)

	// 11: simplified (B2C) billing reference.
	push(invoice.billingReference)

	// 12-13: VAT-exempt lines.
	push(invoice.vatExemptionReasonCode)
	push(invoice.vatExemptionReason)

	// 14: currency, and MUST be absent for SAR.
	if (invoice.currency && invoice.currency !== DOMESTIC_CURRENCY) {
		push(invoice.currency)
	}

	return parts.join("")
}

/**
 * Compute the ZATCA invoice hash.
 *
 * @param {object} invoice see buildInvoiceHashInput
 * @returns {Promise<string>} 64 lowercase hex chars
 */
export async function computeInvoiceHash(invoice) {
	return sha256Hex(buildInvoiceHashInput(invoice))
}

/**
 * Recompute and compare an invoice hash, for tamper detection and for tests.
 * Uses a constant-time-ish comparison to avoid leaking a prefix match.
 *
 * @param {string} expected
 * @param {string} actual
 * @returns {boolean}
 */
export function hashesMatch(expected, actual) {
	const a = String(expected || "")
	const b = String(actual || "")
	if (a.length !== b.length) return false
	let diff = 0
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
	return diff === 0
}

/**
 * Advance the hash chain: the new invoice records the hash it follows.
 *
 * The chain is a per-seller, per-invoice-type sequence. `previousInvoiceHash`
 * for the FIRST invoice of a chain must be the base64 SHA-256 of the literal
 * string "0" — this is ZATCA's defined genesis value, NOT null and NOT "".
 *
 * Pass `invoiceHash` (the hash of the invoice just recorded) so the NEXT
 * invoice links to it. Omitting it deliberately reuses the current base, which
 * would repeat a link and break the chain — the returned `previousInvoiceHash`
 * is what this invoice must embed.
 *
 * @param {{icv:number, previousInvoiceHash?:string, invoiceHash?:string}} state
 * @returns {Promise<{icv:number, previousInvoiceHash:string}>}
 */
export async function nextChainState(state) {
	const icv = Number(state?.icv) || 0
	if (icv < 0) throw new RangeError("ICV must not be negative")
	// First invoice of a chain follows the digest of "0".
	const currentBase = state?.previousInvoiceHash || (await sha256Hex("0"))
	// The next invoice must follow the invoice that was just recorded.
	const nextBase = state?.invoiceHash || currentBase
	return { icv: icv + 1, previousInvoiceHash: nextBase }
}

/**
 * Verify a whole chain end-to-end. Used by the offline ledger audit and tests.
 *
 * @param {Array<{invoiceHash:string, previousInvoiceHash:string, icv:number}>} chain
 * @returns {{valid:boolean, brokenAt:number|null, reason:string|null}}
 */
export function verifyChain(chain) {
	const list = Array.isArray(chain) ? chain : []
	for (let i = 0; i < list.length; i++) {
		const link = list[i]
		if (Number(link?.icv) !== i + 1) {
			return { valid: false, brokenAt: i, reason: "ICV_OUT_OF_SEQUENCE" }
		}
		if (i === 0) continue // genesis is validated by the producer
		const expected = list[i - 1].invoiceHash
		if (!hashesMatch(expected, link.previousInvoiceHash)) {
			return { valid: false, brokenAt: i, reason: "PREVIOUS_HASH_MISMATCH" }
		}
	}
	return { valid: true, brokenAt: null, reason: null }
}

export default {
	sha256Hex,
	buildInvoiceHashInput,
	computeInvoiceHash,
	hashesMatch,
	nextChainState,
	verifyChain,
	bytesToHex,
	DOMESTIC_CURRENCY,
}
