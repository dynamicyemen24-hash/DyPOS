/**
 * ZATCA Phase 2 — UBL 2.1 invoice XML (Saudi Arabia).
 *
 * Namespaces are UN/CEFACT (`urn:un:unece:uncefact:...AggregateComponents-1`).
 * This is the detail the abandoned legacy implementation got wrong: it emitted
 * the SUNAT/Peru namespace and `CustomizationID 1.0`, neither of which any
 * Saudi invoice may use. See docs/LEGACY_DECISION.md.
 *
 * Every interpolated value is XML-escaped. Customer and counter values are
 * attacker-influenced text, and the legacy version injected them raw.
 *
 * Money is accepted ONLY as exact decimal strings ("115.00"), never floats:
 * a float that renders as "114.99999999999999" is a rejected invoice, not a
 * rounding nuisance. Build those strings from integer minor units via
 * utils/money.js.
 *
 * NOTE ON VALIDATION: this module produces spec-shaped, well-formed, escaped
 * XML. It is not an XSD validator. Before going live, invoices must additionally
 * be validated against ZATCA's official UBL schema and SDK — that gate is
 * separate and is not claimed here.
 *
 * Pure + fully unit-tested. No DOM, no I/O, no network.
 */

/** UN/CEFACT invoice type codes used by ZATCA. */
export const INVOICE_TYPE_CODES = Object.freeze({
	STANDARD: { name: "0100000", category: "SALE", qrTagValue: "01" },
	SIMPLIFIED: { name: "0200000", category: "SALE", qrTagValue: "02" },
	STANDARD_CREDIT_NOTE: {
		name: "0101000",
		category: "CREDIT",
		qrTagValue: "01",
	},
	SIMPLIFIED_CREDIT_NOTE: {
		name: "0201000",
		category: "CREDIT",
		qrTagValue: "02",
	},
})

/** UN/CEFACT tax category codes. */
export const TAX_CATEGORY_CODES = Object.freeze({
	STANDARD: "S",
	ZERO_RATED: "Z",
	EXEMPT: "E",
	OUT_OF_SCOPE: "O",
})

const NS = {
	ubl: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
	cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
	cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
	ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
	sig: "urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2",
	sac: "urn:un:unece:uncefact:data:standard:AggregateComponents-1",
}

/** Matches an exact 2-decimal amount. Rejects floats, exponents, NaN, 3+ dp. */
const AMOUNT_RE = /^-?\d+\.\d{2}$/

/**
 * Escape text for use in an XML text node or attribute value.
 * `'` is escaped as &apos; because ZATCA schemas use it in attributes.
 */
export function escapeXml(value) {
	if (value == null) return ""
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

/** Validate an exact decimal amount string, or throw with an actionable message. */
export function assertAmount(value, field) {
	const str = String(value ?? "")
	if (!AMOUNT_RE.test(str)) {
		throw new TypeError(
			`${field} must be an exact 2-decimal string like "115.00" (got ${JSON.stringify(str)}). Build it from integer minor units via utils/money.js — never from float math.`,
		)
	}
	return str
}

function el(name, value) {
	return `<${name}>${escapeXml(value)}</${name}>`
}

function taxCategory({ code, percent, exemptionReasonCode, exemptionReason }) {
	if (code === TAX_CATEGORY_CODES.EXEMPT) {
		if (!exemptionReasonCode) {
			throw new TypeError(
				"A VAT-exempt line requires a VAT exemption reason code",
			)
		}
		return [
			el("cbc:ID", code),
			el("cbc:Percent", "0.00"),
			el("cbc:TaxExemptionReasonCode", exemptionReasonCode),
			el("cbc:TaxExemptionReason", exemptionReason || ""),
			`<cac:TaxScheme>${el("cbc:ID", "VAT")}</cac:TaxScheme>`,
		].join("")
	}
	if (code === TAX_CATEGORY_CODES.ZERO_RATED) {
		return [
			el("cbc:ID", code),
			el("cbc:Percent", "0.00"),
			`<cac:TaxScheme>${el("cbc:ID", "VAT")}</cac:TaxScheme>`,
		].join("")
	}
	return [
		el("cbc:ID", code),
		el("cbc:Percent", Number(percent ?? 0).toFixed(2)),
		`<cac:TaxScheme>${el("cbc:ID", "VAT")}</cac:TaxScheme>`,
	].join("")
}

/**
 * Build the QR <cac:AdditionalDocumentReference>.
 * ZATCA requires the base64 payload plus the six human-readable sub-elements.
 */
function qrDocumentReference(qr) {
	const inner = [
		`<cac:AdditionalDocumentReference>${el("cbc:ID", qr.invoiceId)}</cac:AdditionalDocumentReference>`,
		`<cac:AdditionalDocumentReference>${el("cbc:IssueDate", qr.invoiceDate)}</cac:AdditionalDocumentReference>`,
		`<cac:AdditionalDocumentReference>${el("cbc:IssueTime", qr.invoiceTime)}</cac:AdditionalDocumentReference>`,
		`<cac:AdditionalDocumentReference>${el("cbc:Name", qr.sellerName)}</cac:AdditionalDocumentReference>`,
		`<cac:AdditionalDocumentReference>${el("cbc:PayableAmount", qr.vatTotal)}</cac:AdditionalDocumentReference>`,
		`<cac:LegalMonetaryTotal>${el("cbc:PayableAmount", qr.invoiceTotalWithVat)}</cac:LegalMonetaryTotal>`,
	].join("")

	return [
		"<cac:AdditionalDocumentReference>",
		el("cbc:ID", "QR"),
		"<cac:Attachment>",
		`<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escapeXml(qr.base64)}</cbc:EmbeddedDocumentBinaryObject>`,
		"</cac:Attachment>",
		inner,
		"</cac:AdditionalDocumentReference>",
	].join("")
}

/** The previous-invoice link that makes the ledger tamper-evident. */
function previousInvoiceReference(previous) {
	if (!previous?.previousInvoiceHash) return ""
	return [
		"<cac:AdditionalDocumentReference>",
		el("cbc:ID", "ICV"),
		el("cbc:UUID", previous.previousInvoiceHash),
		"</cac:AdditionalDocumentReference>",
	].join("")
}

function supplierParty(seller) {
	const address = seller.address || {}
	return [
		"<cac:AccountingSupplierParty>",
		"<cac:Party>",
		`<cac:PartyIdentification>${el("cbc:ID", `SCHEME-${seller.sellerVatNumber}`)}</cac:PartyIdentification>`,
		"<cac:PostalAddress>",
		el("cbc:Street", address.street || ""),
		el("cbc:BuildingName", address.buildingName || ""),
		el("cbc:CitySubdivisionName", address.district || ""),
		el("cbc:CityName", address.city || ""),
		el("cbc:PostalZone", address.postalCode || ""),
		el("cbc:CountrySubentity", address.region || ""),
		el("cbc:Country", "SA"),
		"</cac:PostalAddress>",
		"<cac:PartyTaxScheme>",
		el("cbc:CompanyID", seller.sellerVatNumber),
		`<cac:TaxScheme>${el("cbc:ID", "VAT")}</cac:TaxScheme>`,
		"</cac:PartyTaxScheme>",
		`<cac:PartyLegalEntity>${el("cbc:RegistrationName", seller.sellerName)}</cac:PartyLegalEntity>`,
		"</cac:Party>",
		"</cac:AccountingSupplierParty>",
	].join("")
}

function customerParty(customer) {
	const name = customer?.customerName
	if (!name) {
		// Walk-in / simplified buyer: ZATCA still requires a party block.
		return [
			"<cac:AccountingCustomerParty>",
			"<cac:Party>",
			"<cac:PartyLegalEntity>",
			el("cbc:RegistrationName", "Cash Customer"),
			"</cac:PartyLegalEntity>",
			"</cac:Party>",
			"</cac:AccountingCustomerParty>",
		].join("")
	}
	return [
		"<cac:AccountingCustomerParty>",
		"<cac:Party>",
		`<cac:PartyTaxScheme>${[
			el("cbc:CompanyID", customer.customerVatNumber || ""),
			`<cac:TaxScheme>${el("cbc:ID", "VAT")}</cac:TaxScheme>`,
		].join("")}</cac:PartyTaxScheme>`,
		`<cac:PartyLegalEntity>${el("cbc:RegistrationName", name)}</cac:PartyLegalEntity>`,
		"</cac:Party>",
		"</cac:AccountingCustomerParty>",
	].join("")
}

function taxTotal(tax) {
	const sub = (tax.categories || []).map((category) =>
		[
			"<cac:TaxSubtotal>",
			`<cbc:TaxableAmount currencyID="${escapeXml(tax.currency)}">${escapeXml(assertAmount(category.taxableAmount, "TaxableAmount"))}</cbc:TaxableAmount>`,
			`<cbc:TaxAmount currencyID="${escapeXml(tax.currency)}">${escapeXml(assertAmount(category.taxAmount, "TaxAmount"))}</cbc:TaxAmount>`,
			`<cac:TaxCategory>${taxCategory(category)}</cac:TaxCategory>`,
			"</cac:TaxSubtotal>",
		].join(""),
	)
	return [
		"<cac:TaxTotal>",
		`<cbc:TaxAmount currencyID="${escapeXml(tax.currency)}">${escapeXml(assertAmount(tax.taxAmount, "TaxAmount"))}</cbc:TaxAmount>`,
		...sub,
		"</cac:TaxTotal>",
	].join("")
}

function invoiceLines(lines, currency) {
	if (!Array.isArray(lines) || lines.length === 0) {
		throw new TypeError("A ZATCA invoice requires at least one InvoiceLine")
	}
	return lines
		.map((line, index) =>
			[
				"<cac:InvoiceLine>",
				el("cbc:ID", String(index + 1)),
				el("cbc:InvoicedQuantity", line.quantity),
				el("cbc:UnitPrice", assertAmount(line.unitPrice, "UnitPrice")),
				`<cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${escapeXml(assertAmount(line.lineExtensionAmount, "LineExtensionAmount"))}</cbc:LineExtensionAmount>`,
				"<cac:Item>",
				el("cbc:Name", line.name),
				el("cbc:Description", line.description || line.name),
				`<cac:ClassifiedTaxCategory>${el("cbc:ID", line.taxCategoryCode || TAX_CATEGORY_CODES.STANDARD)}</cac:ClassifiedTaxCategory>`,
				"</cac:Item>",
				`<cac:Price>${[
					`<cbc:PriceAmount currencyID="${escapeXml(currency)}">${escapeXml(assertAmount(line.unitPrice, "PriceAmount"))}</cbc:PriceAmount>`,
					`<cac:AllowanceCharge>${el("cbc:ChargeIndicator", "false")}${el("cbc:AllowanceChargeReason", "Agreed in invoice")}</cac:AllowanceCharge>`,
				].join("")}</cac:Price>`,
				"</cac:InvoiceLine>",
			].join(""),
		)
		.join("")
}

/**
 * Render a ZATCA-compliant UBL 2.1 invoice.
 *
 * @param {object} invoice
 * @param {object} invoice.seller        {sellerName, sellerVatNumber, address}
 * @param {object} invoice.customer      {customerName?, customerVatNumber?}
 * @param {string} invoice.profileId      "reporting:1.0" | "clearance:1.0"
 * @param {string} invoice.icv           invoice counter value (string)
 * @param {string} invoice.invoiceId     serial / ID
 * @param {string} invoice.invoiceDate   YYYY-MM-DD
 * @param {string} invoice.invoiceTime   HH:MM:SS
 * @param {string} invoice.invoiceType   key of INVOICE_TYPE_CODES
 * @param {string} invoice.currency      ISO 4217
 * @param {string} invoice.invoiceTotalWithVat exact decimal string
 * @param {string} invoice.taxTotal      exact decimal string
 * @param {object} invoice.tax           {currency, taxAmount, categories[]}
 * @param {object} invoice.totals        {lineExtensionAmount, taxExclusiveAmount, taxInclusiveAmount, payableAmount}
 * @param {Array}  invoice.lines         invoice lines
 * @param {string} invoice.qrBase64      Base64 TLV payload
 * @param {object} [invoice.previous]    {previousInvoiceHash}
 * @param {string} [invoice.signature]   Base64 DER ECDSA signature; omitted => unsigned
 * @returns {string} XML
 */
export function buildInvoiceXml(invoice) {
	const type = INVOICE_TYPE_CODES[invoice.invoiceType]
	if (!type) throw new TypeError(`Unknown invoice type: ${invoice.invoiceType}`)
	const currency = String(invoice.currency || "SAR")
	const required = [
		"profileId",
		"icv",
		"invoiceId",
		"invoiceDate",
		"invoiceTime",
		"qrBase64",
	]
	for (const key of required) {
		if (invoice[key] == null || invoice[key] === "") {
			throw new TypeError(`ZATCA invoice is missing required field: ${key}`)
		}
	}
	if (
		invoice.profileId !== "reporting:1.0" &&
		invoice.profileId !== "clearance:1.0"
	) {
		throw new TypeError(
			`ProfileID must be "reporting:1.0" or "clearance:1.0" (got ${invoice.profileId})`,
		)
	}
	// Validate the document's structure before rendering anything, so a
	// structurally invalid invoice fails on its real defect rather than on
	// whichever amount happens to be rendered first.
	if (!Array.isArray(invoice.lines) || invoice.lines.length === 0) {
		throw new TypeError("A ZATCA invoice requires at least one InvoiceLine")
	}

	const signatureBlock = invoice.signature
		? [
				"<cac:Signature>",
				el("cbc:ID", "Signature"),
				`<cac:SignatoryParty>${el("cbc:PartyID", invoice.seller.sellerVatNumber)}</cac:SignatoryParty>`,
				"<cac:DigitalSignatureAttachment>",
				`<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escapeXml(invoice.signature)}</cbc:EmbeddedDocumentBinaryObject>`,
				"</cac:DigitalSignatureAttachment>",
				"</cac:Signature>",
			].join("")
		: ""

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		`<Invoice xmlns="${NS.ubl}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}" xmlns:ext="${NS.ext}" xmlns:sig="${NS.sig}" xmlns:sac="${NS.sac}">`,
		el("cbc:ProfileID", invoice.profileId),
		el("cbc:ID", invoice.invoiceId),
		el("cbc:UUID", invoice.icv),
		el("cbc:IssueDate", invoice.invoiceDate),
		el("cbc:IssueTime", invoice.invoiceTime),
		`<cbc:InvoiceTypeCode name="${type.name}" category="${type.category}">${type.name}</cbc:InvoiceTypeCode>`,
		`<cac:DocumentCurrencyCode currencyID="${escapeXml(currency)}">${escapeXml(currency)}</cac:DocumentCurrencyCode>`,
		`<cbc:LineCountNumeric>${(invoice.lines || []).length}</cbc:LineCountNumeric>`,
		previousInvoiceReference(invoice.previous),
		qrDocumentReference({
			base64: invoice.qrBase64,
			invoiceId: invoice.invoiceId,
			invoiceDate: invoice.invoiceDate,
			invoiceTime: invoice.invoiceTime,
			sellerName: invoice.seller.sellerName,
			vatTotal: assertAmount(invoice.taxTotal, "taxTotal"),
			invoiceTotalWithVat: assertAmount(
				invoice.invoiceTotalWithVat,
				"invoiceTotalWithVat",
			),
		}),
		supplierParty(invoice.seller),
		customerParty(invoice.customer),
		taxTotal(invoice.tax),
		[
			"<cac:LegalMonetaryTotal>",
			`<cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${escapeXml(assertAmount(invoice.totals.lineExtensionAmount, "LineExtensionAmount"))}</cbc:LineExtensionAmount>`,
			`<cbc:TaxExclusiveAmount currencyID="${escapeXml(currency)}">${escapeXml(assertAmount(invoice.totals.taxExclusiveAmount, "TaxExclusiveAmount"))}</cbc:TaxExclusiveAmount>`,
			`<cbc:TaxInclusiveAmount currencyID="${escapeXml(currency)}">${escapeXml(assertAmount(invoice.totals.taxInclusiveAmount, "TaxInclusiveAmount"))}</cbc:TaxInclusiveAmount>`,
			`<cbc:PayableAmount currencyID="${escapeXml(currency)}">${escapeXml(assertAmount(invoice.totals.payableAmount, "PayableAmount"))}</cbc:PayableAmount>`,
			"</cac:LegalMonetaryTotal>",
		].join(""),
		invoiceLines(invoice.lines, currency),
		signatureBlock,
		"</Invoice>",
	]
		.filter((line) => line !== "")
		.join("\n")
}

export default {
	buildInvoiceXml,
	escapeXml,
	assertAmount,
	INVOICE_TYPE_CODES,
	TAX_CATEGORY_CODES,
}
