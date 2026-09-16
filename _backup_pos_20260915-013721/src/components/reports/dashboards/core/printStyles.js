/**
 * Dashboard print styles.
 *
 * Applied globally when printing any dashboard.
 * Hides non-essential UI, ensures charts render at correct sizes,
 * and formats KPIs for paper.
 */

export function initPrintStyles() {
	if (typeof document === "undefined") return

	const styleId = "dypos-dashboard-print-styles"
	if (document.getElementById(styleId)) return

	const style = document.createElement("style")
	style.id = styleId
	style.textContent = `
		@media print {
			/* Hide non-printable elements */
			.no-print,
			.shell-header,
			.shell-filters,
			nav,
			aside,
			.toast,
			.dialog {
				display: none !important;
			}

			/* Reset body */
			body {
				background: white !important;
				margin: 0;
				padding: 0;
				font-size: 11pt;
				color: #000;
			}

			/* Dashboard shell */
			.dashboard-shell {
				padding: 0 !important;
				max-width: none !important;
			}

			.dashboard-shell.full-screen {
				position: static !important;
				z-index: auto !important;
			}

			/* Content area */
			.shell-content {
				padding: 0 !important;
			}

			/* Charts */
			.chart-card {
				break-inside: avoid;
				page-break-inside: avoid;
				border: 1px solid #e5e7eb;
				margin-bottom: 12px;
			}

			canvas {
				max-width: 100% !important;
				height: auto !important;
			}

			/* KPI cards */
			.kpi-grid {
				display: grid;
				grid-template-columns: repeat(4, 1fr);
				gap: 8px;
				margin-bottom: 16px;
			}

			/* Tables */
			table {
				width: 100%;
				border-collapse: collapse;
				font-size: 10pt;
				break-inside: auto;
			}

			tr {
				break-inside: avoid;
				page-break-inside: avoid;
			}

			th, td {
				border: 1px solid #d1d5db;
				padding: 4px 8px;
				text-align: left;
			}

			th {
				background: #f3f4f6 !important;
				font-weight: 600;
				color: #111827;
			}

			/* Page header */
			.print-header {
				display: block !important;
				text-align: center;
				margin-bottom: 20px;
				padding-bottom: 10px;
				border-bottom: 2px solid #111827;
			}

			.print-header h1 {
				font-size: 18pt;
				margin: 0;
			}

			.print-header p {
				font-size: 10pt;
				color: #6b7280;
				margin: 4px 0 0;
			}

			/* Grid adjustments */
			.grid {
				display: block !important;
			}

			.grid > div {
				margin-bottom: 12px;
			}

			/* Page margins */
			@page {
				margin: 1.5cm;
				size: A4 landscape;
			}
		}
	`

	document.head.appendChild(style)
}
