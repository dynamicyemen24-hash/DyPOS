/**
 * ============================================================================
 * ⛔ QUARANTINED — DO NOT REUSE, DO NOT "FIX"
 * ============================================================================
 * This is a React component in a VUE 3 codebase. It imports `react`, which is
 * NOT a dependency of this project, so it can never compile or run here.
 *
 * Nothing imports this folder: `src/components/reports/operational/` has zero
 * inbound references, and the sibling `ProfitabilityReport.vue` (not this .tsx)
 * is what `financial/index.ts` actually loads.
 *
 * Treat it as a REQUIREMENTS MINE only — the report fields, metrics and layout
 * it encodes may be worth rebuilding in Vue, exactly as `legacy/pos_next` is
 * mined rather than revived (see docs/LEGACY_DECISION.md). Do not "solve" the
 * type errors below by installing React; that would add a second UI runtime.
 *
 * Excluded from the `typecheck` gate via POS/tsconfig.json.
 * ============================================================================
 */
import React from "react"

export default function DailySalesReport() {
	/*
	 * Required metrics:
	 * - Gross sales
	 * - Discounts
	 * - Returns
	 * - Net sales
	 * - Taxes
	 * - Transactions
	 * - Average ticket
	 * - COGS
	 * - Gross profit
	 * - Gross margin
	 *
	 * Must support:
	 * - Date range
	 * - Branch
	 * - Cashier
	 * - Payment method
	 * - Drill-down to transactions
	 */

	return <section data-report="daily-sales" />
}
