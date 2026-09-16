import CashflowReport from "./cashflow/CashflowReport.vue"
import PayablesReport from "./payables/PayablesReport.vue"
import ProfitabilityReport from "./profitability/ProfitabilityReport.vue"
import ReceivablesReport from "./receivables/ReceivablesReport.vue"
import RevenueReport from "./revenue/RevenueReport.vue"
import TaxReport from "./tax/TaxReport.vue"

/**
 * Financial reports registry.
 *
 * Ids match the report catalog (core/registry/reportCatalog.ts).
 * Components are referenced directly (not lazily) because this module
 * itself is mounted through a dynamic import from the shell.
 */
export const FINANCIAL_REPORTS = [
	{
		id: "revenue",
		name: "Revenue Report",
		component: RevenueReport,
	},
	{
		id: "tax-report",
		name: "Tax Report",
		component: TaxReport,
	},
	{
		id: "profitability",
		name: "Profitability Analysis",
		component: ProfitabilityReport,
	},
	{
		id: "cashflow",
		name: "Cash Flow",
		component: CashflowReport,
	},
	{
		id: "receivables",
		name: "Receivables",
		component: ReceivablesReport,
	},
	{
		id: "payables",
		name: "Payables",
		component: PayablesReport,
	},
]
