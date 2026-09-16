import type { KPI } from "../../types/report.types"
import { safePercent } from "../../core/formatters/reportFormatters"
import type {
	ProfitabilityItemRow,
	ProfitabilityReportModel,
	SalesInvoiceFact,
	SalesInvoiceItemFact,
} from "../financial.types"
import { sumBy } from "../revenue/revenueCalc"

/**
 * Profitability report calculator — pure functions only.
 *
 * COGS is derived from item valuation rates. When the backend does not
 * expose `valuation_rate` the cost side is marked unavailable and the
 * margin KPIs degrade gracefully instead of showing wrong numbers.
 */

export function buildProfitabilityModel(
	invoices,
	items = [],
): ProfitabilityReportModel {
	const rows = invoices || []
	const itemRows = items || []

	const netSales = sumBy(rows, "base_net_total")
	const taxes = sumBy(rows, "base_total_taxes_and_charges")
	const discount = sumBy(rows, "base_discount_amount")

	const costDataAvailable =
		itemRows.length > 0 && itemRows.some((row) => row.valuation_rate != null)

	const cogs = costDataAvailable
		? itemRows.reduce(
				(total, row) =>
					total + (Number(row.qty) || 0) * (Number(row.valuation_rate) || 0),
				0,
			)
		: null
	const grossProfit = cogs == null ? null : netSales - cogs
	const grossMargin =
		grossProfit == null ? null : safePercent(grossProfit, netSales)

	const kpis: KPI[] = [
		{ id: "net-sales", label: "Net Sales", value: netSales },
		{
			id: "cogs",
			label: "Cost of Goods Sold",
			value: cogs ?? 0,
			status: cogs == null ? "neutral" : "good",
		},
		{
			id: "gross-profit",
			label: "Gross Profit",
			value: grossProfit ?? 0,
			status:
				grossProfit == null ? "neutral" : grossProfit >= 0 ? "good" : "danger",
		},
		{
			id: "gross-margin",
			label: "Gross Margin",
			value: grossMargin ?? 0,
			status: grossMargin == null ? "neutral" : "good",
		},
		{ id: "discounts", label: "Discounts Given", value: discount },
		{ id: "taxes", label: "Taxes Collected", value: taxes },
	]

	return {
		kpis,
		items: buildItemRows(itemRows, netSales, costDataAvailable),
		costDataAvailable,
	}
}

function buildItemRows(
	itemRows,
	netSales,
	costDataAvailable,
): ProfitabilityItemRow[] {
	const byItem = new Map()
	for (const row of itemRows) {
		const key = String(row.item_code || "-")
		let bucket = byItem.get(key)
		if (!bucket) {
			bucket = {
				itemCode: key,
				itemName: row.item_name || key,
				qty: 0,
				revenue: 0,
				cost: 0,
			}
			byItem.set(key, bucket)
		}
		bucket.qty += Number(row.qty) || 0
		bucket.revenue += Number(row.base_net_amount) || 0
		if (costDataAvailable && row.valuation_rate != null) {
			bucket.cost += (Number(row.qty) || 0) * (Number(row.valuation_rate) || 0)
		}
	}
	return [...byItem.values()]
		.map((bucket) => {
			const profit = costDataAvailable ? bucket.revenue - bucket.cost : null
			return {
				...bucket,
				profit: profit ?? 0,
				marginPercent:
					profit == null ? null : safePercent(profit, bucket.revenue),
			}
		})
		.sort((a, b) => b.revenue - a.revenue)
		.slice(0, 25)
}
