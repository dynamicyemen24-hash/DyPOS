/**
 * Data export utilities: CSV (Arabic-safe) and zero-dependency Excel.
 *
 * CSV is emitted with a UTF-8 BOM + CRLF so WPS/Excel open Arabic text
 * correctly instead of mojibake, with RFC 4180 quoting and OWASP
 * formula-injection protection (= + - @ prefixed with a tab).
 *
 * "Excel" export produces an HTML table saved as .xls — Excel, WPS and
 * LibreOffice render these natively with correct encoding, and we avoid
 * adding a spreadsheet library to the bundle.
 */

const FORMULA_CHARS = /^[=+\-@]/

export const CSV_DELIMITER = ","
export const CSV_BOM = "\uFEFF"
export const CSV_CRLF = "\r\n"

/**
 * ES2021 replaceAll is unsupported in older Android WebViews; polyfill via
 * split/join (works everywhere).
 */
export function replaceAllText(str, search, replacement) {
	return String(str).split(search).join(replacement)
}

/**
 * Escape a single CSV field (RFC 4180 + formula-injection guard).
 * @param {*} value
 * @param {Object} [opts] @param {string} [opts.delimiter=","]
 * @returns {string}
 */
export function escapeCSV(value, { delimiter = CSV_DELIMITER } = {}) {
	let str = value == null ? "" : String(value)
	if (typeof value === "string" && FORMULA_CHARS.test(str)) {
		str = `'${str}` // neutralize = + - @
	}
	if (
		str.includes(delimiter) ||
		str.includes('"') ||
		str.includes("\n") ||
		str.includes("\r")
	) {
		return `"${replaceAllText(str, '"', '""')}"`
	}
	return str
}

/**
 * Build a CSV document.
 * @param {Array<Object>|Array<Array>} rows
 * @param {Object} [opts]
 * @param {Array<{key:string,label?:string}>|Array<string>} [opts.columns] - Key order/labels.
 * @param {boolean} [opts.bom=true] - Prepend UTF-8 BOM (Excel Arabic safety).
 * @param {string} [opts.delimiter=","]
 * @returns {string}
 */
export function toCSV(
	rows = [],
	{ columns = null, bom = true, delimiter = CSV_DELIMITER } = {},
) {
	const colDefs = Array.isArray(columns)
		? columns.map((c) => (typeof c === "string" ? { key: c, label: c } : c))
		: []

	const lines = []
	if (colDefs.length > 0) {
		lines.push(
			colDefs
				.map((c) => escapeCSV(c.label ?? c.key, { delimiter }))
				.join(delimiter),
		)
	}

	const isArrayRows = Array.isArray(rows[0])
	for (const row of rows) {
		if (isArrayRows) {
			lines.push(row.map((v) => escapeCSV(v, { delimiter })).join(delimiter))
			continue
		}
		const line =
			colDefs.length > 0
				? colDefs
						.map((c) => escapeCSV(row?.[c.key], { delimiter }))
						.join(delimiter)
				: Object.values(row ?? {})
						.map((v) => escapeCSV(v, { delimiter }))
						.join(delimiter)
		lines.push(line)
	}

	return (bom ? CSV_BOM : "") + lines.join(CSV_CRLF)
}

/**
 * Build an Excel-openable HTML document (.xls) with a styled table.
 * @param {Array<Object>} rows
 * @param {Object} [opts]
 * @param {Array<{key:string,label?:string}>} [opts.columns]
 * @param {string} [opts.title]
 * @returns {string} HTML string for Blob download as .xls
 */
export function toExcelHTML(
	rows = [],
	{ columns = null, title = "Export" } = {},
) {
	const colDefs = Array.isArray(columns)
		? columns.map((c) => (typeof c === "string" ? { key: c, label: c } : c))
		: []

	const htmlEscape = (text) =>
		replaceAllText(
			replaceAllText(
				replaceAllText(String(text ?? ""), "&", "&amp;"),
				"<",
				"&lt;",
			),
			">",
			"&gt;",
		)
	const th = (text) =>
		`<th style="background:#1e40af;color:#fff;padding:6px 10px;border:1px solid #cbd5e1;font-weight:600">${htmlEscape(text)}</th>`
	const td = (text) =>
		`<td style="padding:5px 10px;border:1px solid #e2e8f0">${htmlEscape(text)}</td>`

	const head =
		colDefs.length > 0
			? `<tr>${colDefs.map((c) => th(c.label ?? c.key)).join("")}</tr>`
			: rows.length > 0 && !Array.isArray(rows[0])
				? `<tr>${Object.keys(rows[0]).map(th).join("")}</tr>`
				: ""

	const body = rows
		.map((row) => {
			if (Array.isArray(row)) return `<tr>${row.map(td).join("")}</tr>`
			const cells =
				colDefs.length > 0
					? colDefs.map((c) => td(row?.[c.key]))
					: Object.values(row ?? {}).map(td)
			return `<tr>${cells.join("")}</tr>`
		})
		.join("")

	return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"><title>${replaceAllText(replaceAllText(title, "<", ""), ">", "")}</title></head>
<body><table border="1">${head}${body}</table></body></html>`
}

/**
 * Trigger a browser download from a string/Buffer content.
 * @param {string|Blob} content
 * @param {string} filename
 * @param {string} [mime]
 */
export function downloadFile(
	content,
	filename,
	mime = "application/octet-stream",
) {
	if (typeof document === "undefined") return
	const blob =
		content instanceof Blob
			? content
			: new Blob([content], { type: `${mime};charset=utf-8` })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * Stamp date into a filename: `invoices_2026-09-13_1024.csv`.
 */
export function withDateStamp(base, ext, when = new Date()) {
	const p = (n) => String(n).padStart(2, "0")
	const stamp = `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}_${p(when.getHours())}${p(when.getMinutes())}`
	return `${base}_${stamp}.${ext}`
}

/**
 * Export rows as CSV or Excel and trigger download.
 * @param {Array<Object>} rows
 * @param {Object} opts
 * @param {"csv"|"excel"} opts.format
 * @param {string} opts.filename - Without extension.
 * @param {Array<Object>} [opts.columns]
 * @param {string} [opts.title]
 * @returns {void}
 */
export function exportRows(
	rows = [],
	{
		format = "csv",
		filename = "export",
		columns = null,
		title = "Export",
	} = {},
) {
	if (format === "excel") {
		downloadFile(
			toExcelHTML(rows, { columns, title }),
			`${filename}.xls`,
			"application/vnd.ms-excel",
		)
		return
	}
	downloadFile(toCSV(rows, { columns }), `${filename}.csv`, "text/csv")
}
