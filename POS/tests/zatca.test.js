import { webcrypto } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import {
	buildQrTags,
	tlvEncode,
	tlvToBase64,
	ZATCA_QR_TAGS,
} from "@/utils/zatca/tlv"
import {
	buildInvoiceHashInput,
	computeInvoiceHash,
	hashesMatch,
	nextChainState,
	sha256Hex,
	verifyChain,
} from "@/utils/zatca/hash"
import {
	buildInvoiceXml,
	escapeXml,
	INVOICE_TYPE_CODES,
	TAX_CATEGORY_CODES,
} from "@/utils/zatca/ubl"
import {
	createCryptographicStamp,
	isSigningAvailable,
	registerSecp256k1Provider,
	resetProvider,
	signDigest,
} from "@/utils/zatca/signature"
import { buildZatcaInvoice, formatMinor } from "@/utils/zatca"

// jsdom ships `crypto` without SubtleCrypto. The zatca modules resolve it
// lazily, so injecting here is enough.
if (!globalThis.crypto?.subtle) {
	Object.defineProperty(globalThis, "crypto", {
		value: webcrypto,
		configurable: true,
		writable: true,
	})
}

const SELLER = {
	sellerName: "مؤسسة النور التجارية",
	sellerVatNumber: "300000000000003",
	address: {
		street: "شارع الملك",
		city: "الرياض",
		region: "الرياض",
		postalCode: "12345",
	},
}

/** Golden vectors computed independently with node:crypto, not with this module. */
const GOLDEN = {
	sha256Empty:
		"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
	sha256Abc: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
	sha256Zero:
		"5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9",
	tlvBytes: [
		1, 10, 217, 133, 216, 164, 216, 179, 216, 179, 216, 169, 2, 15, 51, 48, 48,
		48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 51, 3, 20, 50, 48, 50, 54, 45,
		48, 57, 45, 50, 54, 84, 49, 50, 58, 48, 48, 58, 48, 48, 90,
	],
	tlvBase64:
		"AQrZhdik2LPYs9ipAg8zMDAwMDAwMDAwMDAwMDMDFDIwMjYtMDktMjZUMTI6MDA6MDBa",
	hashInput:
		"مؤسسة النور التجارية3000000000000032026-09-26T12:00:00Z1150.00150.00INV-00012026-09-260100000",
	invoiceHash:
		"792d34c3941f705f9a7c92547bfc4109081c6ff19f9dee0cdd6ec2ffa495318c",
}

/** Input for buildZatcaInvoice — amounts are integer MINOR units. */
const SAMPLE = {
	seller: SELLER,
	customer: {
		customerName: "شركة العميل",
		customerVatNumber: "310000000000103",
	},
	timestamp: "2026-09-26T12:00:00Z",
	icv: 1,
	invoiceId: "INV-0001",
	invoiceType: "STANDARD",
	currency: "SAR",
	totals: {
		payableAmount: 115000,
		taxTotal: 15000,
		lineExtensionAmount: 100000,
		taxExclusiveAmount: 100000,
		taxInclusiveAmount: 115000,
	},
	tax: {
		categories: [
			{
				code: TAX_CATEGORY_CODES.STANDARD,
				percent: 15,
				taxableAmount: 100000,
				taxAmount: 15000,
			},
		],
	},
	lines: [
		{
			name: "خدمة استشارية",
			quantity: 1,
			unitPrice: 100000,
			lineExtensionAmount: 100000,
		},
	],
}

/** Input for buildInvoiceXml — amounts must ALREADY be exact 2-decimal strings. */
function xmlInput(overrides = {}) {
	return {
		seller: SELLER,
		customer: {
			customerName: "شركة العميل",
			customerVatNumber: "310000000000103",
		},
		profileId: "reporting:1.0",
		icv: "1",
		invoiceId: "INV-0001",
		invoiceDate: "2026-09-26",
		invoiceTime: "12:00:00",
		invoiceType: "STANDARD",
		currency: "SAR",
		invoiceTotalWithVat: "1150.00",
		taxTotal: "150.00",
		qrBase64: GOLDEN.tlvBase64,
		tax: {
			currency: "SAR",
			taxAmount: "150.00",
			categories: [
				{
					code: TAX_CATEGORY_CODES.STANDARD,
					percent: 15,
					taxableAmount: "1000.00",
					taxAmount: "150.00",
				},
			],
		},
		totals: {
			lineExtensionAmount: "1000.00",
			taxExclusiveAmount: "1000.00",
			taxInclusiveAmount: "1150.00",
			payableAmount: "1150.00",
		},
		lines: [
			{
				name: "خدمة استشارية",
				quantity: 1,
				unitPrice: "1000.00",
				lineExtensionAmount: "1000.00",
				taxCategoryCode: TAX_CATEGORY_CODES.STANDARD,
			},
		],
		...overrides,
	}
}

/** Decode a Base64 TLV payload back into {tag, value} pairs. */
function decodeTlv(base64) {
	const binary = atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	const decoder = new TextDecoder()
	const out = []
	let i = 0
	while (i < bytes.length) {
		const tag = bytes[i]
		const length = bytes[i + 1]
		out.push({
			tag,
			value: decoder.decode(bytes.subarray(i + 2, i + 2 + length)),
		})
		i += 2 + length
	}
	return out
}

describe("zatca sha256 (real digest, NIST vectors)", () => {
	it("matches the published SHA-256 of the empty string", async () => {
		expect(await sha256Hex("")).toBe(GOLDEN.sha256Empty)
	})

	it("matches the published SHA-256 of 'abc'", async () => {
		expect(await sha256Hex("abc")).toBe(GOLDEN.sha256Abc)
	})

	it("produces 64 lowercase hex chars", async () => {
		expect(await sha256Hex("anything")).toMatch(/^[0-9a-f]{64}$/)
	})

	it("hashes Arabic text by UTF-8 bytes, not code units", async () => {
		expect(await sha256Hex("نور")).toMatch(/^[0-9a-f]{64}$/)
		expect(await sha256Hex("نور")).not.toBe(await sha256Hex("نوr"))
	})
})

describe("zatca TLV encoding", () => {
	const tags = [
		{ tag: 1, value: "مؤسسة" },
		{ tag: 2, value: "300000000000003" },
		{ tag: 3, value: "2026-09-26T12:00:00Z" },
	]

	it("emits byte-exact TLV triplets (1 byte tag, 1 byte length)", () => {
		expect([...tlvEncode(tags)]).toEqual(GOLDEN.tlvBytes)
	})

	it("produces the golden Base64 payload", () => {
		expect(tlvToBase64(tags)).toBe(GOLDEN.tlvBase64)
	})

	it("counts length in UTF-8 BYTES, not characters", () => {
		expect(tlvEncode([{ tag: 1, value: "نور" }])[1]).toBe(6)
	})

	it("round-trips every tag through decode", () => {
		expect(decodeTlv(tlvToBase64(tags))).toEqual(tags)
	})

	it("rejects a value longer than 255 bytes", () => {
		expect(() => tlvEncode([{ tag: 1, value: "x".repeat(256) }])).toThrow(
			/max 255/,
		)
	})

	it("accepts exactly 255 bytes", () => {
		expect(() => tlvEncode([{ tag: 1, value: "x".repeat(255) }])).not.toThrow()
	})

	it("rejects non-ascending and invalid tags", () => {
		expect(() =>
			tlvEncode([
				{ tag: 2, value: "a" },
				{ tag: 1, value: "b" },
			]),
		).toThrow(/ascend/)
		expect(() => tlvEncode([{ tag: 0, value: "a" }])).toThrow(/out of range/)
	})

	it("builds the nine mandatory tags in canonical order", () => {
		const built = buildQrTags({
			sellerName: "S",
			sellerVatNumber: "3",
			timestamp: "2026-09-26T12:00:00Z",
			invoiceTotalWithVat: "115.00",
			vatTotal: "15.00",
			invoiceId: "INV-1",
			invoiceDate: "2026-09-26",
			invoiceTypeCode: "01",
		})
		expect(built.map((t) => t.tag)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
	})

	it("treats an empty tag 9 as absent, and encodes a real reference when present", () => {
		const base = {
			sellerName: "S",
			sellerVatNumber: "3",
			timestamp: "T",
			invoiceTotalWithVat: "1.00",
			vatTotal: "0.15",
			invoiceId: "I",
			invoiceDate: "D",
			invoiceTypeCode: "01",
		}
		const withoutRef = buildQrTags(base)
		const withEmptyRef = buildQrTags({
			...base,
			additionalStructuredReference: "",
		})
		const withRef = buildQrTags({
			...base,
			additionalStructuredReference: "INV-0000",
		})

		expect(withoutRef.map((t) => t.tag)).not.toContain(
			ZATCA_QR_TAGS.ADDITIONAL_STRUCTURED_REFERENCE,
		)
		// An empty conditional tag is meaningless, so it is dropped rather than
		// encoded as a 0-length triplet.
		expect(withEmptyRef).toEqual(withoutRef)
		expect(withRef.map((t) => t.tag)).toContain(
			ZATCA_QR_TAGS.ADDITIONAL_STRUCTURED_REFERENCE,
		)
		expect(tlvToBase64(withRef)).not.toBe(tlvToBase64(withoutRef))
	})

	it("rejects a QR missing any mandatory field", () => {
		expect(() => buildQrTags({ sellerName: "S" })).toThrow(
			/missing required field/,
		)
	})
})

describe("zatca invoice hash (canonical field order)", () => {
	const fields = {
		sellerName: SELLER.sellerName,
		sellerVatNumber: SELLER.sellerVatNumber,
		timestamp: "2026-09-26T12:00:00Z",
		invoiceTotalWithVat: "1150.00",
		vatTotal: "150.00",
		invoiceId: "INV-0001",
		invoiceDate: "2026-09-26",
		invoiceTypeCode: "0100000",
	}

	it("concatenates in the exact ZATCA order (golden string)", () => {
		expect(buildInvoiceHashInput(fields)).toBe(GOLDEN.hashInput)
	})

	it("produces the golden SHA-256 invoice hash", async () => {
		expect(await computeInvoiceHash(fields)).toBe(GOLDEN.invoiceHash)
	})

	it("omits the currency code for SAR and appends it otherwise", () => {
		expect(buildInvoiceHashInput({ ...fields, currency: "SAR" })).toBe(
			GOLDEN.hashInput,
		)
		expect(buildInvoiceHashInput({ ...fields, currency: "USD" })).toBe(
			`${GOLDEN.hashInput}USD`,
		)
	})

	it("appends credit-note references when supplied", () => {
		expect(
			buildInvoiceHashInput({
				...fields,
				creditNoteReason: "R",
				creditNoteReferenceId: "INV-0000",
			}),
		).toBe(`${GOLDEN.hashInput}RINV-0000`)
	})

	it("appends the billing reference for a simplified invoice", () => {
		expect(buildInvoiceHashInput({ ...fields, billingReference: "BI-9" })).toBe(
			`${GOLDEN.hashInput}BI-9`,
		)
	})

	it("changes the hash when any single field changes", async () => {
		const base = await computeInvoiceHash(fields)
		for (const key of Object.keys(fields)) {
			expect(
				await computeInvoiceHash({
					...fields,
					[key]: `${fields[key]}-tampered`,
				}),
			).not.toBe(base)
		}
	})

	it("compares hashes safely", () => {
		expect(hashesMatch("abc", "abc")).toBe(true)
		expect(hashesMatch("abc", "abd")).toBe(false)
		expect(hashesMatch("abc", "abcd")).toBe(false)
	})
})

describe("zatca hash chain", () => {
	it("chains the first invoice to the digest of '0' (ZATCA genesis)", async () => {
		const state = await nextChainState({ icv: 0 })
		expect(state.icv).toBe(1)
		expect(state.previousInvoiceHash).toBe(await sha256Hex("0"))
		expect(state.previousInvoiceHash).toBe(GOLDEN.sha256Zero)
	})

	it("advances the link to the recorded invoice hash", async () => {
		const first = await nextChainState({ icv: 0 })
		const h1 = await sha256Hex("inv-1")
		const second = await nextChainState({ ...first, invoiceHash: h1 })
		expect(second.icv).toBe(2)
		expect(second.previousInvoiceHash).toBe(h1)
	})

	it("rejects a negative ICV", async () => {
		await expect(nextChainState({ icv: -1 })).rejects.toThrow(/negative/)
	})

	it("rejects an ICV that would repeat or regress", async () => {
		await expect(buildZatcaInvoice({ ...SAMPLE, icv: 0 })).rejects.toThrow(
			/start at 1/,
		)
	})

	it("verifies an intact three-invoice chain", async () => {
		const chain = []
		let state = { icv: 0 }
		for (let i = 0; i < 3; i++) {
			state = await nextChainState(state)
			const invoiceHash = await sha256Hex(`inv-${state.icv}`)
			chain.push({
				icv: state.icv,
				previousInvoiceHash: state.previousInvoiceHash,
				invoiceHash,
			})
			state = { ...state, invoiceHash }
		}
		expect(verifyChain(chain)).toEqual({
			valid: true,
			brokenAt: null,
			reason: null,
		})
	})

	it("detects a tampered link", () => {
		const chain = [
			{ icv: 1, previousInvoiceHash: "genesis", invoiceHash: "h1" },
			{ icv: 2, previousInvoiceHash: "h1", invoiceHash: "h2" },
		]
		chain[1].previousInvoiceHash = "forged"
		expect(verifyChain(chain)).toEqual({
			valid: false,
			brokenAt: 1,
			reason: "PREVIOUS_HASH_MISMATCH",
		})
	})

	it("detects an out-of-sequence ICV", () => {
		expect(
			verifyChain([{ icv: 2, previousInvoiceHash: "x", invoiceHash: "h" }]),
		).toEqual({
			valid: false,
			brokenAt: 0,
			reason: "ICV_OUT_OF_SEQUENCE",
		})
	})
})

describe("formatMinor (integer-only amounts)", () => {
	it("formats exactly without float drift", () => {
		expect(formatMinor(0)).toBe("0.00")
		expect(formatMinor(5)).toBe("0.05")
		expect(formatMinor(115000)).toBe("1150.00")
		expect(formatMinor(1999)).toBe("19.99")
		expect(formatMinor(100)).toBe("1.00")
	})

	it("handles negatives and large values", () => {
		expect(formatMinor(-1999)).toBe("-19.99")
		expect(formatMinor(99999999999)).toBe("999999999.99")
	})
})

describe("zatca UBL XML", () => {
	it("uses UN/CEFACT namespaces and never the Peruvian SUNAT schema", () => {
		const xml = buildInvoiceXml(xmlInput())
		expect(xml).toContain(
			"urn:un:unece:uncefact:data:standard:AggregateComponents-1",
		)
		expect(xml).not.toContain("urn:sunat")
		expect(xml).not.toContain("CustomizationID")
	})

	it("declares the reporting profile and the UN/CEFACT invoice type", () => {
		const xml = buildInvoiceXml(xmlInput())
		expect(xml).toContain("<cbc:ProfileID>reporting:1.0</cbc:ProfileID>")
		expect(xml).toContain(
			`<cbc:InvoiceTypeCode name="${INVOICE_TYPE_CODES.STANDARD.name}" category="${INVOICE_TYPE_CODES.STANDARD.category}">`,
		)
	})

	it("escapes customer-controlled text (no XML injection)", () => {
		const xml = buildInvoiceXml(
			xmlInput({
				customer: { customerName: `Acme & Sons <script>alert("x")</script>` },
			}),
		)
		expect(xml).toContain("Acme &amp; Sons &lt;script&gt;")
		expect(xml).not.toContain("<script>")
	})

	it("escapes all five XML metacharacters", () => {
		expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;")
		expect(escapeXml(null)).toBe("")
	})

	it("emits a real InvoiceLine per line and a matching count", () => {
		const xml = buildInvoiceXml(
			xmlInput({
				lines: [
					{
						name: "أ",
						quantity: 1,
						unitPrice: "400.00",
						lineExtensionAmount: "400.00",
					},
					{
						name: "ب",
						quantity: 2,
						unitPrice: "300.00",
						lineExtensionAmount: "600.00",
					},
				],
			}),
		)
		expect(xml.match(/<cac:InvoiceLine>/g)).toHaveLength(2)
		expect(xml).toContain("<cbc:LineCountNumeric>2</cbc:LineCountNumeric>")
	})

	it("carries the ICV and the previous-invoice hash", () => {
		const xml = buildInvoiceXml(
			xmlInput({ icv: "7", previous: { previousInvoiceHash: "a".repeat(64) } }),
		)
		expect(xml).toContain("<cbc:UUID>7</cbc:UUID>")
		expect(xml).toContain("a".repeat(64))
		expect(xml).toContain("<cbc:ID>ICV</cbc:ID>")
	})

	it("carries the QR payload plus its six human-readable sub-elements", () => {
		const xml = buildInvoiceXml(xmlInput())
		expect(xml).toContain(GOLDEN.tlvBase64)
		expect(xml.match(/<cbc:ID>QR<\/cbc:ID>/g)).toHaveLength(1)
		expect(xml).toContain(
			'<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">',
		)
	})

	it("declares the tax category with a 2-decimal percent", () => {
		const xml = buildInvoiceXml(xmlInput())
		expect(xml).toContain("<cbc:Percent>15.00</cbc:Percent>")
		expect(xml).toContain(`<cbc:ID>${TAX_CATEGORY_CODES.STANDARD}</cbc:ID>`)
	})

	it("renders a zero-rated line without a percent of 15", () => {
		const xml = buildInvoiceXml(
			xmlInput({
				taxTotal: "0.00",
				invoiceTotalWithVat: "1000.00",
				tax: {
					currency: "SAR",
					taxAmount: "0.00",
					categories: [
						{
							code: TAX_CATEGORY_CODES.ZERO_RATED,
							percent: 0,
							taxableAmount: "1000.00",
							taxAmount: "0.00",
						},
					],
				},
				totals: {
					lineExtensionAmount: "1000.00",
					taxExclusiveAmount: "1000.00",
					taxInclusiveAmount: "1000.00",
					payableAmount: "1000.00",
				},
			}),
		)
		expect(xml).toContain(`<cbc:ID>${TAX_CATEGORY_CODES.ZERO_RATED}</cbc:ID>`)
		expect(xml).toContain("<cbc:Percent>0.00</cbc:Percent>")
	})

	it("rejects an invalid ProfileID", () => {
		expect(() => buildInvoiceXml(xmlInput({ profileId: "1.0" }))).toThrow(
			/reporting:1\.0|clearance:1\.0/,
		)
	})

	it("rejects a float-shaped amount instead of silently rounding", () => {
		expect(() =>
			buildInvoiceXml(xmlInput({ invoiceTotalWithVat: 1150 })),
		).toThrow(/exact 2-decimal string/)
	})

	it("rejects a missing required field", () => {
		expect(() => buildInvoiceXml(xmlInput({ icv: "" }))).toThrow(
			/missing required field/,
		)
	})

	it("refuses an invoice with no lines, before rendering amounts", () => {
		expect(() => buildInvoiceXml(xmlInput({ lines: [] }))).toThrow(
			/at least one InvoiceLine/,
		)
	})

	it("requires an exemption reason for a VAT-exempt line", () => {
		expect(() =>
			buildInvoiceXml(
				xmlInput({
					tax: {
						currency: "SAR",
						taxAmount: "0.00",
						categories: [
							{
								code: TAX_CATEGORY_CODES.EXEMPT,
								taxableAmount: "1000.00",
								taxAmount: "0.00",
							},
						],
					},
				}),
			),
		).toThrow(/exemption reason code/)
	})

	it("rejects an unknown invoice type", () => {
		expect(() =>
			buildInvoiceXml(xmlInput({ invoiceType: "NONSENSE" })),
		).toThrow(/Unknown invoice type/)
	})
})

describe("buildZatcaInvoice (artefacts must agree)", () => {
	it("produces a hash matching the independent golden vector", async () => {
		const result = await buildZatcaInvoice(SAMPLE)
		expect(result.hashInput).toBe(GOLDEN.hashInput)
		expect(result.invoiceHash).toBe(GOLDEN.invoiceHash)
		expect(result.qrBase64).toMatch(/^[A-Za-z0-9+/]+=*$/)
	})

	it("emits ICV 1 with no previous-invoice link", async () => {
		const result = await buildZatcaInvoice(SAMPLE)
		expect(result.icv).toBe("1")
		expect(result.xml).not.toContain("<cbc:ID>ICV</cbc:ID>")
	})

	it("embeds the same QR base64 it reports", async () => {
		const result = await buildZatcaInvoice(SAMPLE)
		expect(result.xml).toContain(result.qrBase64)
	})

	it("puts the nine QR values in the payload it returns", async () => {
		const result = await buildZatcaInvoice(SAMPLE)
		const decoded = decodeTlv(result.qrBase64)
		expect(decoded).toEqual([
			{ tag: 1, value: SELLER.sellerName },
			{ tag: 2, value: SELLER.sellerVatNumber },
			{ tag: 3, value: "2026-09-26T12:00:00Z" },
			{ tag: 4, value: "1150.00" },
			{ tag: 5, value: "150.00" },
			{ tag: 6, value: "INV-0001" },
			{ tag: 7, value: "2026-09-26" },
			{ tag: 8, value: "01" },
		])
	})

	it("derives the date/time from the timestamp in UTC", async () => {
		const result = await buildZatcaInvoice(SAMPLE)
		expect(result.invoiceDate).toBe("2026-09-26")
		expect(result.invoiceTime).toBe("12:00:00")
	})

	it("uses the 7-digit UN/CEFACT code in the hash and the 2-digit code in the QR", async () => {
		const result = await buildZatcaInvoice(SAMPLE)
		expect(result.hashInput).toContain(INVOICE_TYPE_CODES.STANDARD.name)
		expect(result.xml).toContain(`name="${INVOICE_TYPE_CODES.STANDARD.name}"`)
		const tag8 = decodeTlv(result.qrBase64).find((t) => t.tag === 8)
		expect(tag8.value).toBe(INVOICE_TYPE_CODES.STANDARD.qrTagValue)
	})

	it("carries the previous hash forward for the next invoice in the chain", async () => {
		const first = await buildZatcaInvoice(SAMPLE)
		// Invoice 1 consumed ICV 1, so the next invoice is ICV 2 and must link to
		// invoice 1's hash.
		const state = await nextChainState({
			icv: 1,
			invoiceHash: first.invoiceHash,
		})
		expect(state.icv).toBe(2)
		expect(state.previousInvoiceHash).toBe(first.invoiceHash)

		const second = await buildZatcaInvoice({
			...SAMPLE,
			icv: 2,
			invoiceId: "INV-0002",
			previous: { previousInvoiceHash: first.invoiceHash },
		})
		expect(second.xml).toContain(first.invoiceHash)
		expect(
			verifyChain([
				{
					icv: 1,
					previousInvoiceHash: await sha256Hex("0"),
					invoiceHash: first.invoiceHash,
				},
				{
					icv: 2,
					previousInvoiceHash: first.invoiceHash,
					invoiceHash: second.invoiceHash,
				},
			]).valid,
		).toBe(true)
	})

	it("places the credit-note reference in tag 9 for a credit note", async () => {
		const result = await buildZatcaInvoice({
			...SAMPLE,
			invoiceType: "STANDARD_CREDIT_NOTE",
			creditNote: { reason: "R", referenceId: "INV-0001" },
		})
		const tag9 = decodeTlv(result.qrBase64).find((t) => t.tag === 9)
		expect(tag9.value).toBe("INV-0001")
		expect(result.xml).toContain(
			`category="${INVOICE_TYPE_CODES.STANDARD_CREDIT_NOTE.category}"`,
		)
	})

	it("requires a seller VAT number", async () => {
		await expect(
			buildZatcaInvoice({ ...SAMPLE, seller: { sellerName: "X" } }),
		).rejects.toThrow(/sellerVatNumber/)
	})

	it("works with no customer (walk-in) using the cash-customer party", async () => {
		const result = await buildZatcaInvoice({ ...SAMPLE, customer: undefined })
		expect(result.xml).toContain("Cash Customer")
	})
})

describe("zatca signature refuses to fabricate (secp256k1 unavailable)", () => {
	beforeEach(() => resetProvider())

	it("reports signing unavailable with no provider", () => {
		expect(isSigningAvailable()).toBe(false)
	})

	it("refuses to sign and explains why, in Arabic and English", async () => {
		await expect(
			signDigest(new Uint8Array(32), new Uint8Array(32)),
		).rejects.toThrow(/secp256k1/)
		await expect(
			signDigest(new Uint8Array(32), new Uint8Array(32)),
		).rejects.toThrow(/هيئة الزكاة/)
	})

	it("refuses to build a cryptographic stamp without a provider", async () => {
		await expect(createCryptographicStamp(new Uint8Array(32))).rejects.toThrow(
			/secp256k1/,
		)
	})

	it("validates provider shape and digest length", async () => {
		expect(() => registerSecp256k1Provider({})).toThrow(/must expose/)
		registerSecp256k1Provider({
			sign: async () => "c2ln",
			getPublicKeyBase64: async () => "cHVi",
			name: "test-stub",
		})
		expect(isSigningAvailable()).toBe(true)
		await expect(
			signDigest(new Uint8Array(31), new Uint8Array(32)),
		).rejects.toThrow(/32-byte/)
		expect(await signDigest(new Uint8Array(32), new Uint8Array(32))).toBe(
			"c2ln",
		)
	})
})
