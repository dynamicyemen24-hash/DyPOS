import { describe, expect, it, vi } from "vitest"

vi.mock("@/utils/logger", () => ({
	logger: {
		create: () =>
			new Proxy(
				{},
				{
					get: () => () => {},
				},
			),
	},
}))

vi.mock("@/utils/printInvoice", () => ({
	buildReceiptHTML: (data) => `<div class="receipt">MOCK:${data.name}</div>`,
	printInvoiceCustom: vi.fn(),
}))

import {
	buildBlockHTML,
	buildCopyMarks,
	buildFormVars,
	buildQrBlock,
	docTypeToDoctype,
	escapeHTML,
	interpolate,
	renderCustomTemplate,
} from "@/print/forms/formRenderer"

describe("escapeHTML", () => {
	it("escapes markup and quotes", () => {
		expect(escapeHTML("<b>&\"'")).toBe("&lt;b&gt;&amp;&quot;&#39;")
		expect(escapeHTML(0)).toBe("0")
		expect(escapeHTML(null)).toBe("")
	})
})

describe("interpolate", () => {
	it("substitutes nested dotted paths", () => {
		expect(interpolate("{{name}}", { name: "X" })).toBe("X")
		expect(interpolate("{{customer.name}}", { customer: { name: "Y" } })).toBe(
			"Y",
		)
		expect(interpolate("{{total}}", { total: 12.5 })).toBe("12.5")
	})

	it("escapes inserted values and blank unknown tokens", () => {
		expect(interpolate("a{{x}}b", { x: "<i>" })).toBe("a&lt;i&gt;b")
		expect(interpolate("{{missing}}", {})).toBe("")
	})

	it("tolerates non-string templates", () => {
		expect(interpolate(null, {})).toBe("")
	})
})

describe("buildFormVars", () => {
	it("flattens payload plus spool context", () => {
		const vars = buildFormVars({
			docId: "INV-1",
			spoolNo: "SPR-000001",
			copies: 2,
			copyNo: 1,
			payload: {
				name: "INV-1",
				company: "ACME",
				customer_name: "Ali",
				posting_date: "2026-01-01",
			},
		})
		expect(vars.invoice_no).toBe("INV-1")
		expect(vars.company_name).toBe("ACME")
		expect(vars.customer).toBe("Ali")
		expect(vars.spool_no).toBe("SPR-000001")
	})

	it("marks reprints with a COPY flag", () => {
		const vars = buildFormVars({ reprintOf: "orig", copies: 1 })
		expect(vars.is_reprint).toBe("COPY")
	})
})

describe("buildQrBlock", () => {
	it("prefers a pre-rendered base64 QR", () => {
		const html = buildQrBlock({ qrBase64: "AAAA" }, {})
		expect(html).toContain('<img src="data:image/png;base64,AAAA"')
	})

	it("accepts an already-prefixed data URI", () => {
		const html = buildQrBlock({ qrBase64: "data:image/png;base64,BBBB" }, {})
		expect(html).toContain('src="data:image/png;base64,BBBB"')
	})

	it("renders a JSON fallback only when identity data exists", () => {
		expect(buildQrBlock({}, {})).toBe("")
		const html = buildQrBlock({}, { company_name: "ACME", vat_number: "123" })
		expect(html).toContain("ACME")
	})
})

describe("buildCopyMarks", () => {
	it("draws a COPY watermark on reprints", () => {
		expect(buildCopyMarks({ is_reprint: "COPY" })).toContain("COPY")
	})

	it("draws copy numbering for multi-copy jobs", () => {
		expect(
			buildCopyMarks({ total_copies: 3, copy_no: 2, spool_no: "SPR-1" }),
		).toContain("2 / 3")
	})
})

describe("buildBlockHTML", () => {
	it("renders items and totals from a payload", () => {
		const html = buildBlockHTML(
			{
				items: [{ item_name: "Coke", quantity: 2, rate: 5 }],
				grand_total: 10,
				total_taxes_and_charges: 0,
				is_offline: true,
			},
			buildFormVars({ docId: "INV-1" }),
		)
		expect(html).toContain("Coke")
		expect(html).toContain("10.00")
		expect(html).toContain("OFFLINE — PENDING SYNC")
	})
})

describe("renderCustomTemplate", () => {
	it("substitutes tokens in a custom template", () => {
		const html = renderCustomTemplate(
			"<h1>{{invoice_no}}</h1><p>{{company_name}}</p>",
			{ invoice_no: "INV-9", company_name: "ACME" },
			{},
		)
		expect(html).toContain("INV-9")
		expect(html).toContain("ACME")
	})
})

describe("docTypeToDoctype", () => {
	it("maps spool docTypes to register doctypes", () => {
		expect(docTypeToDoctype("invoice")).toBe("Sales Invoice")
		expect(docTypeToDoctype("eod")).toBe("POS Closing Shift")
		expect(docTypeToDoctype("quotation")).toBe("Quotation")
	})
})
