/**
 * Shared dashboard export composable.
 *
 * Provides CSV, Excel, and PDF export capabilities for all dashboards.
 * Integrates with the existing exportData utility.
 */
import {
	exportRows,
	downloadFile,
	toCSV,
	toExcelHTML,
	withDateStamp,
} from "@/utils/exportData"
import { useToast } from "@/composables/useToast"

const htmlEscape = (v) =>
	String(v == null ? "" : v)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")

/**
 * Generates a printable HTML document from dashboard model data.
 * @param {Object} models - computed dashboard models
 * @param {string} dashboardName - name for the document title
 * @returns {string} HTML string
 */
function buildPrintHTML(models, dashboardName) {
	const m = models?.value || models
	if (!m) return ""

	const sections = Object.entries(m).filter(
		([, value]) => Array.isArray(value) && value.length > 0,
	)

	const title = dashboardName
		.replace(/-/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase())

	const rows = []
	for (const [, rowsArr] of sections) {
		for (const r of rowsArr) {
			if (typeof r === "object" && r !== null) {
				rows.push(r)
			}
		}
	}

	const colKeys = rows.length > 0 ? Object.keys(rows[0]) : []
	const tableHTML = `
		<table style="width:100%;border-collapse:collapse;font-size:9pt;">
			<thead>
				<tr style="background:#1e40af;color:#fff;">
					${colKeys.map((k) => `<th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left;">${htmlEscape(k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()))}</th>`).join("")}
				</tr>
			</thead>
			<tbody>
				${rows.map((r) => `<tr style="border-bottom:1px solid #e5e7eb;">${colKeys.map((k) => `<td style="padding:5px 8px;border:1px solid #e5e7eb;">${htmlEscape(r[k])}</td>`).join("")}</tr>`).join("")}
			</tbody>
		</table>
	`

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<title>${htmlEscape(title)}</title>
	<style>
		@page { size: A4 landscape; margin: 1.5cm; }
		body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #000; background: #fff; }
		h1 { text-align: center; font-size: 18pt; margin-bottom: 4px; }
		p { text-align: center; color: #6b7280; font-size: 10pt; margin-bottom: 20px; }
		table { width: 100%; border-collapse: collapse; }
		th { background: #1e40af !important; color: #fff !important; }
		th, td { padding: 6px 8px; border: 1px solid #d1d5db; text-align: left; }
		tr:nth-child(even) { background: #f9fafb; }
		@media print { body { padding: 0; } }
	</style>
</head>
<body>
	<h1>${htmlEscape(title)}</h1>
	<p>Generated on ${new Date().toLocaleString()}</p>
	${tableHTML}
</body>
</html>`
}

/**
 * @param {Object} options
 * @param {import("vue").Ref<Object>} options.models - computed dashboard models
 * @param {string} options.dashboardName - name for exported files
 */
export function useDashboardExport(options = {}) {
	const { models, dashboardName = "dashboard" } = options
	const { showSuccess, showError } = useToast()

	/**
	 * Export all dashboard tables as PDF (printable HTML).
	 * Generates a self-contained HTML document and triggers download.
	 */
	function exportPDF() {
		try {
			const m = models?.value || models
			if (!m) {
				showError("No data to export")
				return
			}

			const sections = Object.entries(m).filter(
				([, value]) => Array.isArray(value) && value.length > 0,
			)

			if (sections.length === 0) {
				showError("No data to export")
				return
			}

			const html = buildPrintHTML(models, dashboardName)
			const filename = withDateStamp(dashboardName, "html")
			downloadFile(html, filename, "text/html")

			showSuccess("Exported as PDF-ready HTML")
		} catch (err) {
			showError(`PDF export failed: ${err?.message || err}`)
		}
	}

	/**
	 * Export a specific table as PDF (printable HTML).
	 */
	function exportTablePDF(rows, filename) {
		try {
			if (!rows || rows.length === 0) {
				showError("No data to export")
				return
			}
			const colKeys = Object.keys(rows[0])
			const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<title>${filename}</title>
	<style>
		@page { size: A4 landscape; margin: 1.5cm; }
		body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #000; }
		h1 { text-align: center; font-size: 16pt; margin-bottom: 4px; }
		table { width: 100%; border-collapse: collapse; margin-top: 10px; }
		th { background: #1e40af; color: #fff; padding: 6px 8px; border: 1px solid #cbd5e1; }
		td { padding: 5px 8px; border: 1px solid #d1d5db; }
		tr:nth-child(even) { background: #f9fafb; }
		@media print { body { padding: 0; } }
	</style>
</head>
<body>
			<h1>${htmlEscape(filename)}</h1>
			<p>Generated on ${new Date().toLocaleString()}</p>
			<table>
				<thead><tr>${colKeys.map((k) => `<th>${htmlEscape(k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()))}</th>`).join("")}</tr></thead>
				<tbody>${rows.map((r) => `<tr>${colKeys.map((k) => `<td>${htmlEscape(r[k] != null ? r[k] : "")}</td>`).join("")}</tr>`).join("")}</tbody>
	</table>
</body>
</html>`
			const file = withDateStamp(filename, "html")
			downloadFile(html, file, "text/html")
			showSuccess(`Exported ${filename} as PDF-ready HTML`)
		} catch (err) {
			showError(`PDF export failed: ${err?.message || err}`)
		}
	}

	/**
	 * Export all dashboard tables as CSV or Excel.
	 * Each model array becomes a separate sheet/section.
	 */
	function exportDashboard(format = "csv") {
		try {
			const m = models?.value || models
			if (!m) {
				showError("No data to export")
				return
			}

			const sections = Object.entries(m).filter(
				([, value]) => Array.isArray(value) && value.length > 0,
			)

			if (sections.length === 0) {
				showError("No data to export")
				return
			}

			const allRows = []
			const allColumns = []
			let columnsDefined = false

			for (const [key, rows] of sections) {
				if (!columnsDefined && rows.length > 0) {
					const keys = Object.keys(rows[0])
					allColumns.push(
						...keys.map((k) => ({
							key: k,
							label: k
								.replace(/([A-Z])/g, " $1")
								.replace(/^./, (s) => s.toUpperCase()),
						})),
					)
					columnsDefined = true
				}
				allRows.push(...rows)
			}

			const filename = withDateStamp(
				dashboardName,
				format === "excel" ? "xls" : "csv",
			)
			exportRows(allRows, {
				format,
				filename: dashboardName,
				columns: allColumns.length > 0 ? allColumns : undefined,
				title: dashboardName
					.replace(/-/g, " ")
					.replace(/\b\w/g, (c) => c.toUpperCase()),
			})

			showSuccess(`Exported as ${format.toUpperCase()}`)
		} catch (err) {
			showError(`Export failed: ${err?.message || err}`)
		}
	}

	/**
	 * Export a specific table from the models.
	 */
	function exportTable(rows, filename, format = "csv") {
		try {
			if (!rows || rows.length === 0) {
				showError("No data to export")
				return
			}
			const columns = Object.keys(rows[0]).map((k) => ({
				key: k,
				label: k
					.replace(/([A-Z])/g, " $1")
					.replace(/^./, (s) => s.toUpperCase()),
			}))
			exportRows(rows, { format, filename, columns, title: filename })
			showSuccess(`Exported ${filename}`)
		} catch (err) {
			showError(`Export failed: ${err?.message || err}`)
		}
	}

	/**
	 * Print the current dashboard.
	 */
	function printDashboard() {
		window.print()
	}

	return {
		exportDashboard,
		exportTable,
		printDashboard,
		exportPDF,
		exportTablePDF,
	}
}
