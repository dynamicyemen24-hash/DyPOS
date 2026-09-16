/**
 * Finance dashboard data layer.
 *
 * Builds cash flow, profit/loss, and financial health models from
 * standard ERPNext data fetched via financialData.js.
 */
import { loadFinancialData } from "../../core/data/financialData"
import {
	changePercent,
	safePercent,
	trendOf,
} from "../../core/formatters/reportFormatters"
import { toISODate, previousPeriodFilter, sumBy } from "../core/dashboardUtils"

export async function loadFinanceData(filter) {
	const prevFilter = previousPeriodFilter(filter)
	const [current, previous] = await Promise.all([
		loadFinancialData(filter),
		prevFilter ? loadFinancialData(prevFilter) : Promise.resolve({ facts: {} }),
	])
	return {
		...current.facts,
		prevInvoices: previous.facts?.invoices || [],
		prevPayments: previous.facts?.payments || [],
		prevReceivables: previous.facts?.receivables || [],
		prevPayables: previous.facts?.payables || [],
	}
}

export function buildFinanceModels(facts) {
	const {
		invoices = [],
		payments = [],
		receivables = [],
		payables = [],
		prevInvoices = [],
		prevPayments = [],
		prevReceivables = [],
		prevPayables = [],
	} = facts || {}

	const kpis = buildKPIs(
		invoices,
		payments,
		receivables,
		payables,
		prevInvoices,
		prevPayments,
		prevReceivables,
		prevPayables,
	)
	const cashflowTrend = buildCashflowTrend(invoices, payments)
	const receivablesAging = buildAging(receivables)
	const payablesAging = buildAging(payables)
	const paymentDistribution = buildPaymentDistribution(payments)
	const profitTrend = buildProfitTrend(invoices)

	return {
		kpis,
		cashflowTrend,
		receivablesAging,
		payablesAging,
		paymentDistribution,
		profitTrend,
	}
}

function buildKPIs(
	invoices,
	payments,
	receivables,
	payables,
	prevInv,
	prevPay,
	prevRec,
	prevPay_,
) {
	const totalRevenue = sumBy(invoices, "base_net_total")
	const totalCollected = sumBy(invoices, "base_paid_amount")
	const totalReceivable = sumBy(receivables, "outstanding_amount")
	const totalPayable = sumBy(payables, "outstanding_amount")
	const totalPaid = sumBy(payments, "paid_amount")
	const totalReceived = sumBy(payments, "received_amount")
	const netCashflow = totalReceived - totalPaid

	const prevRev = sumBy(prevInv, "base_net_total")
	const prevRecVal = sumBy(prevRec, "outstanding_amount")
	const prevPayVal = sumBy(prevPay_, "outstanding_amount")

	return [
		{
			id: "revenue",
			label: "Total Revenue",
			value: totalRevenue,
			previousValue: prevRev,
			changePercent: changePercent(totalRevenue, prevRev),
			trend: trendOf(totalRevenue, prevRev),
			status: totalRevenue >= prevRev ? "good" : "danger",
		},
		{
			id: "inflow",
			label: "Cash Received",
			value: totalReceived,
			status: "good",
		},
		{
			id: "outflow",
			label: "Cash Paid",
			value: totalPaid,
			status: "warning",
		},
		{
			id: "net",
			label: "Net Cashflow",
			value: netCashflow,
			status: netCashflow >= 0 ? "good" : "danger",
		},
		{
			id: "receivable",
			label: "Receivables",
			value: totalReceivable,
			previousValue: prevRecVal,
			changePercent: changePercent(totalReceivable, prevRecVal),
			trend: trendOf(totalReceivable, prevRecVal),
			status: totalReceivable > 0 ? "warning" : "good",
		},
		{
			id: "payable",
			label: "Payables",
			value: totalPayable,
			previousValue: prevPayVal,
			changePercent: changePercent(totalPayable, prevPayVal),
			trend: trendOf(totalPayable, prevPayVal),
			status: totalPayable > 0 ? "warning" : "good",
		},
		{
			id: "collection-rate",
			label: "Collection Rate",
			value:
				safePercent(totalCollected, sumBy(invoices, "base_grand_total")) ?? 0,
			status: "neutral",
		},
		{
			id: "profit",
			label: "Profit Margin",
			value:
				totalRevenue > 0
					? ((totalRevenue - totalPayable) / totalRevenue) * 100
					: 0,
			status: "neutral",
		},
	]
}

function buildCashflowTrend(invoices, payments) {
	const byDate = new Map()
	for (const row of invoices) {
		const date = String(row.posting_date || "").slice(0, 10)
		if (!date) continue
		let b = byDate.get(date)
		if (!b) {
			b = { date, inflow: 0, outflow: 0, net: 0 }
			byDate.set(date, b)
		}
		b.inflow += Number(row.base_paid_amount) || 0
	}
	for (const row of payments) {
		const date = String(row.posting_date || "").slice(0, 10)
		if (!date) continue
		let b = byDate.get(date)
		if (!b) {
			b = { date, inflow: 0, outflow: 0, net: 0 }
			byDate.set(date, b)
		}
		if (row.payment_type === "Pay") {
			b.outflow += Number(row.paid_amount) || 0
		}
	}
	const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
	let running = 0
	for (const row of rows) {
		running += row.inflow - row.outflow
		row.net = row.inflow - row.outflow
		row.balance = running
	}
	return rows
}

function buildAging(items) {
	const now = Date.now()
	const buckets = [
		{ label: "Current", minDays: 0, maxDays: 30, count: 0, amount: 0 },
		{ label: "31-60 Days", minDays: 31, maxDays: 60, count: 0, amount: 0 },
		{ label: "61-90 Days", minDays: 61, maxDays: 90, count: 0, amount: 0 },
		{ label: "90+ Days", minDays: 91, maxDays: null, count: 0, amount: 0 },
	]
	for (const item of items) {
		const due = item.due_date ? new Date(item.due_date).getTime() : now
		const days = Math.max(0, Math.floor((now - due) / 86400000))
		const amt = Math.abs(Number(item.outstanding_amount) || 0)
		const bucket = buckets.find(
			(b) => days >= b.minDays && (b.maxDays === null || days <= b.maxDays),
		)
		if (bucket) {
			bucket.count += 1
			bucket.amount += amt
		}
	}
	return buckets
}

function buildPaymentDistribution(payments) {
	const byMode = new Map()
	for (const row of payments) {
		const mode = row.mode_of_payment || "Other"
		let b = byMode.get(mode)
		if (!b) {
			b = { mode, count: 0, amount: 0 }
			byMode.set(mode, b)
		}
		b.count += 1
		b.amount += Number(row.paid_amount) || Number(row.received_amount) || 0
	}
	return [...byMode.values()].sort((a, b) => b.amount - a.amount)
}

function buildProfitTrend(invoices) {
	const byDate = new Map()
	for (const row of invoices) {
		const date = String(row.posting_date || "").slice(0, 10)
		if (!date) continue
		let b = byDate.get(date)
		if (!b) {
			b = { date, revenue: 0, cost: 0, profit: 0 }
			byDate.set(date, b)
		}
		b.revenue += Number(row.base_net_total) || 0
	}
	const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
	for (const row of rows) {
		row.profit = row.revenue - row.cost
	}
	return rows
}
