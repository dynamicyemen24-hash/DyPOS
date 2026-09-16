export interface ReportDefinition {
	id: string

	name: string

	category:
		| "operational"
		| "financial"
		| "inventory"
		| "sales"
		| "customer"
		| "supplier"
		| "bi"
		| "decision"

	importance: "critical" | "high" | "medium" | "low"

	description: string

	permissions?: string[]
}

export const REPORT_CATALOG: ReportDefinition[] = [
	{
		id: "executive-dashboard",
		name: "Executive Intelligence Dashboard",
		category: "bi",
		importance: "critical",
		description:
			"Executive overview of revenue, profit, inventory, cash and risk.",
	},

	{
		id: "sales-summary",
		name: "Sales Summary",
		category: "sales",
		importance: "critical",
		description: "Comprehensive sales performance.",
	},

	{
		id: "profitability",
		name: "Profitability Analysis",
		category: "financial",
		importance: "critical",
		description: "Revenue, COGS, gross profit and margin.",
	},

	{
		id: "revenue",
		name: "Revenue Report",
		category: "financial",
		importance: "critical",
		description: "Gross and net revenue, taxes, discounts and collections.",
	},

	{
		id: "tax-report",
		name: "Tax Report",
		category: "financial",
		importance: "critical",
		description: "Taxable amounts, tax collected and per-account breakdown.",
	},

	{
		id: "cashflow",
		name: "Cash Flow",
		category: "financial",
		importance: "high",
		description: "Cash inflow, outflow and running balance by day and mode.",
	},

	{
		id: "receivables",
		name: "Receivables",
		category: "financial",
		importance: "high",
		description: "Customer outstanding balances and aging.",
	},

	{
		id: "payables",
		name: "Payables",
		category: "financial",
		importance: "high",
		description: "Supplier outstanding balances and aging.",
	},

	{
		id: "inventory-intelligence",
		name: "Inventory Intelligence",
		category: "inventory",
		importance: "critical",
		description: "Inventory health, turnover and capital utilization.",
	},

	{
		id: "customer-intelligence",
		name: "Customer Intelligence",
		category: "customer",
		importance: "high",
		description: "Customer behavior, retention and value.",
	},

	{
		id: "supplier-performance",
		name: "Supplier Performance",
		category: "supplier",
		importance: "high",
		description: "Supplier cost, delivery and reliability.",
	},

	{
		id: "abc-analysis",
		name: "ABC Analysis",
		category: "inventory",
		importance: "high",
		description: "Inventory classification by contribution.",
	},

	{
		id: "xyz-analysis",
		name: "XYZ Demand Analysis",
		category: "inventory",
		importance: "high",
		description: "Demand stability and predictability.",
	},

	{
		id: "demand-forecast",
		name: "Demand Forecast",
		category: "decision",
		importance: "high",
		description: "Demand trend and forecasting.",
	},

	{
		id: "reorder-recommendations",
		name: "Reorder Recommendations",
		category: "decision",
		importance: "critical",
		description: "Recommended replenishment decisions.",
	},

	{
		id: "pricing-intelligence",
		name: "Pricing Intelligence",
		category: "decision",
		importance: "high",
		description: "Margin and pricing analysis.",
	},

	{
		id: "management-alerts",
		name: "Management Alerts",
		category: "decision",
		importance: "critical",
		description: "Business anomalies and risks.",
	},
]
