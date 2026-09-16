/**
 * Executive dashboard data layer.
 *
 * Aggregates data from all domains into a single business overview.
 */
import { loadFinancialData } from "../../core/data/financialData"
import {
	changePercent,
	safePercent,
	trendOf,
} from "../../core/formatters/reportFormatters"
import {
	toISODate,
	previousPeriodFilter,
	sumBy,
	buildDailyTrend as _buildDailyTrend,
} from "../core/dashboardUtils"

export async function loadExecutiveData(filter) {
	const prevFilter = previousPeriodFilter(filter)
	const [current, previous] = await Promise.all([
		loadFinancialData(filter),
		prevFilter ? loadFinancialData(prevFilter) : Promise.resolve({ facts: {} }),
	])
	return {
		...current.facts,
		prevInvoices: previous.facts?.invoices || [],
		prevPayments: previous.facts?.payments || [],
		warnings: current.warnings,
	}
}

export function buildExecutiveModels(facts) {
	const {
		invoices = [],
		payments = [],
		receivables = [],
		payables = [],
		items = [],
		prevInvoices = [],
		prevPayments = [],
	} = facts || {}

	const totalRevenue = sumBy(invoices, "base_net_total")
	const prevRevenue = sumBy(prevInvoices, "base_net_total")
	const totalCost = sumBy(payables, "base_grand_total")
	const profit = totalRevenue - totalCost
	const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0
	const transactions = invoices.filter((r) => !r.is_return).length
	const prevTransactions = prevInvoices.filter((r) => !r.is_return).length
	const avgTicket = transactions > 0 ? totalRevenue / transactions : 0
	const prevAvg = prevTransactions > 0 ? prevRevenue / prevTransactions : 0
	const totalReceivable = sumBy(receivables, "outstanding_amount")
	const totalPayable = sumBy(payables, "outstanding_amount")

	const kpis = [
		{
			id: "revenue",
			label: "Total Revenue",
			value: totalRevenue,
			previousValue: prevRevenue,
			changePercent: changePercent(totalRevenue, prevRevenue),
			trend: trendOf(totalRevenue, prevRevenue),
			status: totalRevenue >= prevRevenue ? "good" : "danger",
		},
		{
			id: "profit",
			label: "Net Profit",
			value: profit,
			status: profit >= 0 ? "good" : "danger",
		},
		{
			id: "margin",
			label: "Profit Margin",
			value: margin,
			status: margin >= 20 ? "good" : margin >= 10 ? "warning" : "danger",
		},
		{
			id: "transactions",
			label: "Transactions",
			value: transactions,
			previousValue: prevTransactions,
			changePercent: changePercent(transactions, prevTransactions),
			trend: trendOf(transactions, prevTransactions),
			status: transactions >= prevTransactions ? "good" : "warning",
		},
		{
			id: "average",
			label: "Avg Ticket",
			value: avgTicket,
			previousValue: prevAvg,
			changePercent: changePercent(avgTicket, prevAvg),
			trend: trendOf(avgTicket, prevAvg),
			status: "neutral",
		},
		{
			id: "receivable",
			label: "Receivables",
			value: totalReceivable,
			status: totalReceivable > 0 ? "warning" : "good",
		},
		{
			id: "payable",
			label: "Payables",
			value: totalPayable,
			status: totalPayable > 0 ? "warning" : "good",
		},
		{
			id: "customers",
			label: "Customers",
			value: new Set(
				invoices.filter((r) => !r.is_return).map((r) => r.customer),
			).size,
			status: "neutral",
		},
	]

	const alerts = []
	if (totalReceivable > totalRevenue * 0.3) {
		alerts.push({
			id: "high-receivables",
			label: "High Receivables",
			value: totalReceivable,
			status: "danger",
			detail: "Receivables exceed 30% of revenue",
		})
	}
	if (margin < 10) {
		alerts.push({
			id: "low-margin",
			label: "Low Margin",
			value: margin,
			status: "danger",
			detail: "Profit margin below 10%",
		})
	}
	const stockoutRisk = items.filter(
		(i) => (Number(i.actual_qty) || 0) <= 0,
	).length
	if (stockoutRisk > 0) {
		alerts.push({
			id: "stockout",
			label: "Stockout Risk",
			value: stockoutRisk,
			status: "warning",
			detail: `${stockoutRisk} items out of stock`,
		})
	}

	const dailyTrend = buildDailyTrend(invoices, prevInvoices)
	const categoryPerformance = buildCategoryPerformance(items)

	return { kpis, alerts, dailyTrend, categoryPerformance }
}

function buildDailyTrend(invoices, prev) {
	const rows = invoices.map((r) => ({
		...r,
		revenue: Number(r.base_net_total) || 0,
		transactions: r.is_return ? 0 : 1,
	}))
	const prevRows = prev.map((r) => ({
		...r,
		revenue: Number(r.base_net_total) || 0,
	}))
	const trend = _buildDailyTrend(rows, prevRows, "posting_date")
	return {
		current: trend.current.map((d) => ({
			date: d.date,
			revenue: d.revenue,
			transactions: d.transactions,
		})),
		previous: trend.previous.map((d) => ({
			date: d.date,
			revenue: d.revenue,
			transactions: 0,
		})),
	}
}

function buildCategoryPerformance(items) {
	const byItem = new Map()
	for (const item of items) {
		const key = item.item_code?.split("-")[0] || "Other"
		let b = byItem.get(key)
		if (!b) {
			b = { category: key, revenue: 0, quantity: 0 }
			byItem.set(key, b)
		}
		b.revenue += Number(item.base_net_amount) || 0
		b.quantity += Number(item.qty) || 0
	}
	return [...byItem.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8)
}
