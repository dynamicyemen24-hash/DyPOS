/**
 * Sales dashboard data layer.
 *
 * Fetches sales data from Frappe API and builds the chart/table models
 * for the sales dashboard.
 */
import {
	fetchSalesInvoices,
	fetchSalesInvoiceItems,
} from "../../core/data/financialData"
import {
	changePercent,
	safePercent,
	trendOf,
} from "../../core/formatters/reportFormatters"
import { toISODate, previousPeriodFilter, sumBy, buildDailyTrend as _buildDailyTrend } from "../core/dashboardUtils"

/**
 * Load all sales dashboard facts.
 */
export async function loadSalesData(filter) {
	const prevFilter = previousPeriodFilter(filter)
	const [invoices, prevInvoices] = await Promise.all([
		fetchSalesInvoices(filter),
		prevFilter ? fetchSalesInvoices(prevFilter) : Promise.resolve([]),
	])

	const invoiceNames = invoices.map((r) => r.name)
	const items = await fetchSalesInvoiceItems(invoiceNames)

	return {
		invoices,
		prevInvoices,
		items,
	}
}

/**
 * Build chart-ready models from raw facts.
 */
export function buildSalesModels(facts) {
	const { invoices = [], prevInvoices = [], items = [] } = facts || {}

	const dailyTrend = buildDailyTrend(invoices, prevInvoices)
	const categoryBreakdown = buildCategoryBreakdown(items)
	const topProducts = buildTopProducts(items)
	const paymentMethods = buildPaymentMethods(invoices)
	const hourlyPattern = buildHourlyPattern(invoices)

	const kpis = buildKPIs(invoices, prevInvoices)

	return {
		kpis,
		dailyTrend,
		categoryBreakdown,
		topProducts,
		paymentMethods,
		hourlyPattern,
	}
}

function buildKPIs(invoices, prev) {
	const netSales = sumBy(invoices, "base_net_total")
	const grossSales = sumBy(invoices, "base_grand_total")
	const transactions = invoices.filter((r) => !r.is_return).length
	const returns = invoices.filter((r) => r.is_return).length
	const returnsValue = Math.abs(
		invoices
			.filter((r) => r.is_return)
			.reduce((s, r) => s + (Number(r.base_net_total) || 0), 0),
	)
	const avgTicket = transactions > 0 ? netSales / transactions : 0
	const collected = sumBy(invoices, "base_paid_amount")

	const prevNet = sumBy(prev, "base_net_total")
	const prevTrans = prev.filter((r) => !r.is_return).length
	const prevAvg = prevTrans > 0 ? prevNet / prevTrans : 0

	return [
		{
			id: "net-sales",
			label: "Net Sales",
			value: netSales,
			previousValue: prevNet,
			changePercent: changePercent(netSales, prevNet),
			trend: trendOf(netSales, prevNet),
			status:
				netSales > prevNet ? "good" : netSales < prevNet ? "danger" : "neutral",
		},
		{
			id: "transactions",
			label: "Transactions",
			value: transactions,
			previousValue: prevTrans,
			changePercent: changePercent(transactions, prevTrans),
			trend: trendOf(transactions, prevTrans),
			status: transactions > prevTrans ? "good" : "neutral",
		},
		{
			id: "average-ticket",
			label: "Avg Ticket",
			value: avgTicket,
			previousValue: prevAvg,
			changePercent: changePercent(avgTicket, prevAvg),
			trend: trendOf(avgTicket, prevAvg),
			status: avgTicket > prevAvg ? "good" : "neutral",
		},
		{
			id: "returns",
			label: "Returns",
			value: returns,
			status: returns > 0 ? "warning" : "good",
		},
		{
			id: "collection-rate",
			label: "Collection Rate",
			value: safePercent(collected, grossSales) ?? 0,
			status: "neutral",
		},
		{
			id: "gross-sales",
			label: "Gross Sales",
			value: grossSales,
			previousValue: sumBy(prev, "base_grand_total"),
			changePercent: changePercent(grossSales, sumBy(prev, "base_grand_total")),
			trend: trendOf(grossSales, sumBy(prev, "base_grand_total")),
			status: "neutral",
		},
		{
			id: "discounts",
			label: "Discounts",
			value: sumBy(invoices, "base_discount_amount"),
			status: "neutral",
		},
		{
			id: "revenue",
			label: "Revenue",
			value: netSales,
			previousValue: prevNet,
			changePercent: changePercent(netSales, prevNet),
			trend: trendOf(netSales, prevNet),
			status: netSales >= prevNet ? "good" : "danger",
		},
	]
}

function buildDailyTrend(invoices, prev) {
	const rows = invoices.map((r) => ({
		...r,
		sales: Math.abs(Number(r.base_net_total) || 0),
		transactions: r.is_return ? 0 : 1,
		returns: r.is_return ? 1 : 0,
		net: Number(r.base_net_total) || 0,
	}))
	const prevRows = prev.map((r) => ({
		...r,
		sales: Math.abs(Number(r.base_net_total) || 0),
		transactions: r.is_return ? 0 : 1,
		returns: r.is_return ? 1 : 0,
		net: Number(r.base_net_total) || 0,
	}))
	const trend = _buildDailyTrend(rows, prevRows, "posting_date")
	return {
		current: trend.current.map((d) => ({
			date: d.date,
			sales: d.sales,
			transactions: d.transactions,
			returns: d.returns,
			net: d.net,
		})),
		previous: trend.previous.map((d) => ({
			date: d.date,
			sales: d.sales,
			transactions: d.transactions,
			returns: d.returns,
			net: d.net,
		})),
	}
}

function buildCategoryBreakdown(items) {
	const byCategory = new Map()
	for (const item of items) {
		const cat = item.item_code?.split("-")[0] || "Other"
		let b = byCategory.get(cat)
		if (!b) {
			b = { category: cat, quantity: 0, revenue: 0 }
			byCategory.set(cat, b)
		}
		b.quantity += Number(item.qty) || 0
		b.revenue += Number(item.base_net_amount) || 0
	}
	return [...byCategory.values()]
		.sort((a, b) => b.revenue - a.revenue)
		.slice(0, 8)
}

function buildTopProducts(items) {
	const byItem = new Map()
	for (const item of items) {
		const key = item.item_code || "Unknown"
		let b = byItem.get(key)
		if (!b) {
			b = {
				itemCode: key,
				itemName: item.item_name || key,
				quantity: 0,
				revenue: 0,
			}
			byItem.set(key, b)
		}
		b.quantity += Number(item.qty) || 0
		b.revenue += Number(item.base_net_amount) || 0
	}
	return [...byItem.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10)
}

function buildPaymentMethods(invoices) {
	const byMethod = new Map()
	for (const row of invoices) {
		const method = row.status || "Unknown"
		let b = byMethod.get(method)
		if (!b) {
			b = { method, count: 0, amount: 0 }
			byMethod.set(method, b)
		}
		b.count += 1
		b.amount += Math.abs(Number(row.base_paid_amount) || 0)
	}
	return [...byMethod.values()].sort((a, b) => b.amount - a.amount)
}

function buildHourlyPattern(invoices) {
	const hours = Array.from({ length: 24 }, (_, i) => ({
		hour: `${String(i).padStart(2, "0")}:00`,
		transactions: 0,
		sales: 0,
	}))
	for (const row of invoices) {
		const h = new Date(row.posting_date).getHours()
		if (h >= 0 && h < 24) {
			hours[h].transactions += 1
			hours[h].sales += Math.abs(Number(row.base_net_total) || 0)
		}
	}
	return hours
}
