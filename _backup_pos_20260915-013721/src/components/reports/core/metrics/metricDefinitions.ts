export interface MetricDefinition {
	id: string

	name: string

	description: string

	unit: "currency" | "number" | "percent" | "days" | "ratio"

	category:
		| "sales"
		| "profit"
		| "inventory"
		| "customer"
		| "supplier"
		| "finance"
		| "operations"

	critical?: boolean
}

/*
 * IMPORTANT:
 * Metric calculations must be connected to the existing
 * DyPOS domain/data layer.
 *
 * Never duplicate business formulas inside individual reports.
 */

export const METRIC_DEFINITIONS: MetricDefinition[] = [
	{
		id: "gross-sales",
		name: "Gross Sales",
		description: "Total sales before discounts and returns.",
		unit: "currency",
		category: "sales",
		critical: true,
	},

	{
		id: "net-sales",
		name: "Net Sales",
		description: "Sales after discounts and returns.",
		unit: "currency",
		category: "sales",
		critical: true,
	},

	{
		id: "cogs",
		name: "Cost of Goods Sold",
		description: "Cost associated with sold products.",
		unit: "currency",
		category: "profit",
		critical: true,
	},

	{
		id: "gross-profit",
		name: "Gross Profit",
		description: "Net sales minus COGS.",
		unit: "currency",
		category: "profit",
		critical: true,
	},

	{
		id: "gross-margin",
		name: "Gross Margin",
		description: "Gross profit as a percentage of net sales.",
		unit: "percent",
		category: "profit",
		critical: true,
	},

	{
		id: "inventory-turnover",
		name: "Inventory Turnover",
		description: "Rate at which inventory is sold and replaced.",
		unit: "ratio",
		category: "inventory",
	},

	{
		id: "average-ticket",
		name: "Average Ticket",
		description: "Average transaction value.",
		unit: "currency",
		category: "sales",
	},

	{
		id: "return-rate",
		name: "Return Rate",
		description: "Returned sales relative to sales.",
		unit: "percent",
		category: "sales",
	},

	{
		id: "customer-retention",
		name: "Customer Retention",
		description: "Repeat customer retention rate.",
		unit: "percent",
		category: "customer",
	},
]
