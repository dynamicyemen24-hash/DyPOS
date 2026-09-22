/**
 * FormRenderer — template engine that turns a PrintJob into printable HTML.
 *
 * Rendering-only: no device is ever touched from here. Output shape is
 * `{ html, paper, orientation, printer }` consumed by the PrintDispatcher.
 *
 * Block model (SAP Smart-Forms equivalent):
 *   header → invoice_info → items → totals → payments → qr → footer
 * Variables use `{{name}}` substitution against the frozen job payload.
 * An optional `templateBody` (custom HTML) bypasses the built-in blocks.
 */

import { logger } from "@/utils/logger"
import { buildReceiptHTML } from "@/utils/printInvoice"
import { printInvoiceCustom } from "@/utils/printInvoice"

const log = logger.create("FormRenderer")

const COPY_WATERMARK_CLASS = "copy-watermark"

const DOC_TYPE_TO_DOCTYPE = Object.freeze({
	invoice: "Sales Invoice",
	return_receipt: "Sales Invoice",
	draft: "Sales Invoice",
	quotation: "Quotation",
	eod: "POS Closing Shift",
})

/** Map a spool docType to its Frappe register doctype. */
export function docTypeToDoctype(docType) {
	return DOC_TYPE_TO_DOCTYPE[docType] || "Sales Invoice"
}

/**
 * Substitute `{{name}}` tokens with payload values (HTML-escaped).
 * Unknown tokens resolve to an empty string — safe, never raw.
 */
export function interpolate(template, vars) {
	if (typeof template !== "string") return ""
	return template.replace(/\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g, (match, path) => {
		let value = vars
		for (const part of String(path).split(".")) {
			if (value == null) return ""
			value = value[part]
		}
		if (value == null) return ""
		return escapeHTML(String(value))
	})
}

export function escapeHTML(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
}

/**
 * Build a ZATCA-style QR block.
 * Prefers a pre-rendered base64 QR (payload.qrBase64 / payload.zatca_qr);
 * otherwise renders the TLV fields as a JSON payload (dev/tolerance fallback),
 * mirroring server `print.js:zatcaQrBase64` behaviour without the VAT config.
 */
export function buildQrBlock(payload, vars) {
	const qrBase64 =
		payload?.qrBase64 || payload?.zatca_qr || payload?.qr_data || null

	if (qrBase64) {
		const src = qrBase64.startsWith("data:image")
			? qrBase64
			: `data:image/png;base64,${qrBase64}`
		return `<div class="qr"><img src="${src}" width="90" height="90" alt="QR"/></div>`
	}

	const qrPayload = {
		seller: vars.company_name || "",
		vat_number: vars.vat_number || vars.tax_id || vars.company_tax_id || "",
		timestamp: vars.posting_date || "",
		total: vars.grand_total || "",
		tax_amount: vars.total_taxes_and_charges || "",
	}
	// Only render when at least one identity value exists; otherwise omit.
	if (!qrPayload.seller && !qrPayload.vat_number) return ""
	return `<div class="qr-json"><code>${escapeHTML(
		JSON.stringify(qrPayload),
	)}</code></div>`
}

/**
 * Flatten a payload into a variable map for `{{name}}` substitution plus
 * registered invoice / profile metadata.
 */
export function buildFormVars(job) {
	const payload = job?.payload || {}
	const vars = {
		...payload,
		company_name: payload.company || payload.company_name || "DyPOS",
		invoice_no: payload.name || payload.invoice_no || job?.docId || "",
		customer:
			payload.customer_name || payload.customer || payload.customer_name || "",
		doc_id: job?.docId || "",
		spool_no: job?.spoolNo || "",
		copy_no: job?.copyNo ?? 1,
		total_copies: job?.copies || 1,
		is_reprint: job?.reprintOf ? "COPY" : "",
	}
	return vars
}

/**
 * Render a terminal banner (COPY for reprints, copy numbering).
 * Reads from the flattened form vars.
 * @returns {string}
 */
export function buildCopyMarks(vars) {
	const parts = []
	if (vars?.is_reprint) {
		parts.push(`<div class="${COPY_WATERMARK_CLASS}">COPY</div>`)
	}
	if ((vars?.total_copies || 1) > 1) {
		parts.push(
			`<div class="copy-no">${vars.copy_no || 1} / ${vars.total_copies} — ${vars.spool_no || ""}</div>`,
		)
	}
	return parts.join("")
}

/**
 * Template blocks for invoice-family documents.
 * Each block receives `(payload, vars)` and returns an HTML string or "".
 */
export const DEFAULT_BLOCKS = {
	header: (payload, vars) =>
		`<div class="header"><div class="company-name">${escapeHTML(
			vars.company_name,
		)}</div><div style="font-size:12px">${escapeHTML(
			payload.header || "TAX INVOICE",
		)}</div></div>`,
	invoice_info: (payload, vars) =>
		`<div class="invoice-info">
			<div><span>Invoice #:</span><span><strong>${escapeHTML(
				vars.invoice_no,
			)}</strong></span></div>
			<div><span>Date:</span><span>${escapeHTML(
				payload.posting_date || "",
			)}</span></div>
			${vars.customer ? `<div><span>Customer:</span><span>${escapeHTML(vars.customer)}</span></div>` : ""}
		</div>`,
	items: (payload) => {
		const items = Array.isArray(payload.items) ? payload.items : []
		if (!items.length) return ""
		return `<div class="items-table">${items
			.map((it) => {
				const qty = it.quantity || it.qty || 0
				const rate = it.price_list_rate || it.rate || 0
				return `<div class="item-row">
					<div class="item-name">${escapeHTML(it.item_name || it.item_code)}</div>
					<div class="item-details"><span>${qty} x ${Number(rate).toFixed(2)}</span><strong>${Number(qty * rate).toFixed(2)}</strong></div>
				</div>`
			})
			.join("")}</div>`
	},
	totals: (payload) =>
		`<div class="totals"><div class="total-row"><span>Subtotal</span><span>${Number(
			(payload.grand_total || 0) - (payload.total_taxes_and_charges || 0),
		).toFixed(2)}</span></div>
		${payload.total_taxes_and_charges ? `<div class="total-row"><span>Tax</span><span>${Number(payload.total_taxes_and_charges).toFixed(2)}</span></div>` : ""}
		<div class="total-row grand-total"><span>TOTAL</span><span>${Number(payload.grand_total || 0).toFixed(2)}</span></div></div>`,
	payments: (payload) => {
		const payments = Array.isArray(payload.payments) ? payload.payments : []
		if (!payments.length) return ""
		return `<div class="payments"><div style="font-weight:bold">Payments</div>${payments
			.map((p) => `<div class="payment-row"><span>${escapeHTML(p.mode_of_payment)}</span><span>${Number(p.amount).toFixed(2)}</span></div>`)
			.join("")}</div>`
	},
	qr: (payload, vars) => buildQrBlock(payload, vars),
	footer: (payload) =>
		`<div class="footer">${escapeHTML(
			payload.footer || "Thank you for your business!",
		)}</div>`,
}

const BUILT_IN_CSS = `
	*{margin:0;padding:0;box-sizing:border-box}
	body{font-family:'Courier New',monospace;padding:10px;width:80mm;margin:0;max-width:80mm;font-weight:bold;color:black}
	.receipt{width:100%}
	.header{text-align:center;margin-bottom:20px;border-bottom:2px dashed #000;padding-bottom:10px}
	.company-name{font-size:18px;font-weight:bold;margin-bottom:5px}
	.invoice-info{margin-bottom:15px;font-size:12px}
	.invoice-info div{display:flex;justify-content:space-between;margin-bottom:3px}
	.items-table{width:100%;margin-bottom:15px;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:10px 0}
	.item-row{margin-bottom:10px;font-size:12px}
	.item-name{font-weight:bold;margin-bottom:3px}
	.item-details{display:flex;justify-content:space-between;font-size:11px}
	.totals{margin-top:15px;border-top:1px dashed #000;padding-top:10px}
	.total-row{display:flex;justify-content:space-between;margin-bottom:5px;font-size:12px}
	.grand-total{font-size:16px;font-weight:bold;border-top:2px solid #000;padding-top:10px;margin-top:10px}
	.payments{margin-top:15px;border-top:1px dashed #000;padding-top:10px}
	.payment-row{display:flex;justify-content:space-between;margin-bottom:3px;font-size:11px}
	.footer{text-align:center;margin-top:20px;padding-top:10px;border-top:2px dashed #000;font-size:11px}
	.copy-watermark{text-align:center;font-size:14px;font-weight:bold;border:2px solid #000;padding:4px;margin:6px 0;letter-spacing:2px}
	.copy-no{text-align:center;font-size:10px;margin:4px 0}
	.qr{text-align:center;margin:10px 0}
	.qr img{display:inline-block}
	.qr-json{font-size:8px;word-break:break-all;margin:8px 0;border:1px dashed #000;padding:4px}
	@media print{@page{size:80mm auto;margin:0}body{width:80mm;padding:5mm;margin:0}}
`

/**
 * Render the built-in block layout for a local/offline document.
 */
export function buildBlockHTML(payload, vars) {
	const blocks = DEFAULT_BLOCKS
	return `<div class="receipt">
		${buildCopyMarks(vars)}
		${blocks.header(payload, vars)}
		${payload.is_offline ? '<div class="offline-badge">OFFLINE — PENDING SYNC</div>' : ""}
		${blocks.invoice_info(payload, vars)}
		${blocks.items(payload, vars)}
		${blocks.totals(payload, vars)}
		${blocks.payments(payload, vars)}
		${blocks.qr(payload, vars)}
		${blocks.footer(payload, vars)}
	</div>`
}

/**
 * Custom template rendering with {{var}} substitution and the built-in blocks
 * available as a fallback section when `templateBody` omits a block.
 */
export function renderCustomTemplate(templateBody, vars, payload) {
	if (!templateBody || typeof templateBody !== "string") return null
	const html = interpolate(templateBody, vars)
	return `<div class="receipt">${buildCopyMarks(vars)}${html}</div>`
}

function wrapDocument(innerHtml, { paper = "80mm", css = BUILT_IN_CSS } = {}) {
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>DyPOS Receipt</title><style>${css}</style></head><body>${innerHtml}</body></html>`
}

/**
 * Fetch server-rendered print format HTML for a registered document —
 * rendering only; the dispatcher sends the result to the device.
 */
export async function fetchServerPrintHTML(doctype, name, printFormat) {
	const { call } = await import("@/utils/apiWrapper")
	const result = await call("frappe.www.printview.get_html_and_style", {
		doc: doctype,
		name,
		print_format: printFormat || "DyPOS Receipt",
		no_letterhead: 1,
	})
	const html = result?.html || result?.message?.html
	const style = result?.style || result?.message?.style || ""
	if (!html) throw new Error("Failed to get print HTML from server")
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${style}</style></head><body>${html}</body></html>`
}

/**
 * Render a job to HTML.
 *
 * - Server-registered documents: fetch the registered print format HTML.
 * - Local-only documents (payload with items): built-in blocks or a custom
 *   `templateBody`.
 *
 * @param {PrintJob} job
 * @param {Object} [opts] — { paper, orientation, formId }
 * @returns {Promise<{html:string, paper:string, orientation:string, printer:string|null}>}
 */
export async function render(job, opts = {}) {
	const payload = job?.payload || {}
	const vars = buildFormVars(job)
	const paper = opts.paper || job?.paper || "80mm"
	const orientation =
		opts.orientation ||
		job?.orientation ||
		(payload.is_offline ? "portrait" : "portrait")

	// Server-registered document without a frozen local payload: fetch the
	// registered print format HTML (render only — no printing here).
	if (!payload?.items?.length && job?.docId) {
		const registered = [
			"invoice",
			"eod",
			"quotation",
			"return_receipt",
		].includes(job?.docType)
		if (registered) {
			try {
				const html = await fetchServerPrintHTML(
					docTypeToDoctype(job.docType),
					job.docId,
					job.formId || null,
				)
				return { html, paper, orientation, printer: job.qzPrinter || null }
			} catch (error) {
				log.warn("Server print render unavailable; using local blocks", {
					docId: job.docId,
					error: error?.message,
				})
			}
		}
	}

	// Local-only invoice/return with a frozen payload: preserve the exact
	// current receipt layout via buildReceiptHTML, plus copy/reprint marks.
	const invoiceFamily = ["invoice", "return_receipt", "draft"]
	if (invoiceFamily.includes(job?.docType) && payload?.items?.length) {
		const inner = `<div class="receipt">${buildCopyMarks(vars)}${buildReceiptHTML(payload)}</div>`
		return {
			html: wrapDocument(inner, { paper }),
			paper,
			orientation,
			printer: job.qzPrinter || null,
		}
	}

	// Custom template (developer-friendly) over built-in blocks.
	const templateBody = opts.templateBody || job?.templateBody || null
	const custom = renderCustomTemplate(templateBody, vars, payload)
	const innerHtml = custom || buildBlockHTML(payload, vars)

	return {
		html: wrapDocument(innerHtml, { paper }),
		paper,
		orientation,
		printer: job.qzPrinter || null,
	}
}

/**
 * Legacy alias used by the fallback path — opens the local receipt in a
 * popup. Kept for browser-fallback dispatch.
 */
export function openBrowserPrint(invoiceData) {
	return printInvoiceCustom(invoiceData)
}