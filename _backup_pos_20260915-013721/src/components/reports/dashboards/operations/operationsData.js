/**
 * Operations dashboard data layer.
 *
 * Builds operational metrics from POS shift and invoice data.
 */
import {
	fetchSalesInvoices,
	fetchPaymentEntries,
} from "../../core/data/financialData"
import { changePercent, trendOf } from "../../core/formatters/reportFormatters"
import { toISODate } from "../core/dashboardUtils"

export async function loadOperationsData(filter) {
	const [invoices, payments] = await Promise.all([
		fetchSalesInvoices(filter),
		fetchPaymentEntries(filter),
	])
	return { invoices, payments }
}

export function buildOperationsModels(facts) {
	const { invoices = [], payments = [] } = facts || {}

	const kpis = buildKPIs(invoices, payments)
	const hourlyVolume = buildHourlyVolume(invoices)
	const paymentMethods = buildPaymentMethods(payments)
	const statusDistribution = buildStatusDistribution(invoices)
	const dailyPerformance = buildDailyPerformance(invoices)
	const shiftAnalysis = buildShiftAnalysis(invoices)

	return {
		kpis,
		hourlyVolume,
		paymentMethods,
		statusDistribution,
		dailyPerformance,
		shiftAnalysis,
	}
}

function buildKPIs(invoices, payments) {
	const total = invoices.length
	const completed = invoices.filter(
		(r) => r.status === "Completed" || r.status === "Paid",
	).length
	const returns = invoices.filter((r) => r.is_return).length
	const voided = invoices.filter((r) => r.status === "Cancelled").length
	const totalAmount = invoices.reduce(
		(s, r) => s + Math.abs(Number(r.base_grand_total) || 0),
		0,
	)
	const totalPayments = payments.length
	const avgProcessingTime = 0

	return [
		{
			id: "transactions",
			label: "Total Transactions",
			value: total,
			status: "neutral",
		},
		{
			id: "completed",
			label: "Completed",
			value: completed,
			status: "good",
		},
		{
			id: "returns",
			label: "Returns",
			value: returns,
			status: returns > total * 0.05 ? "warning" : "good",
		},
		{
			id: "voided",
			label: "Voided",
			value: voided,
			status: voided > 0 ? "warning" : "good",
		},
		{
			id: "revenue",
			label: "Total Revenue",
			value: totalAmount,
			status: "neutral",
		},
		{
			id: "payment-count",
			label: "Payment Entries",
			value: totalPayments,
			status: "neutral",
		},
	]
}

function buildHourlyVolume(invoices) {
	const hours = Array.from({ length: 24 }, (_, i) => ({
		hour: `${String(i).padStart(2, "0")}:00`,
		transactions: 0,
		revenue: 0,
	}))
	for (const row of invoices) {
		const d = new Date(row.posting_date)
		const h = d.getHours()
		if (h >= 0 && h < 24) {
			hours[h].transactions += 1
			hours[h].revenue += Math.abs(Number(row.base_grand_total) || 0)
		}
	}
	return hours
}

function buildPaymentMethods(payments) {
	const byMode = new Map()
	for (const row of payments) {
		const mode = row.mode_of_payment || "Other"
		let b = byMode.get(mode)
		if (!b) {
			b = { method: mode, count: 0, amount: 0 }
			byMode.set(mode, b)
		}
		b.count += 1
		b.amount += Number(row.paid_amount) || Number(row.received_amount) || 0
	}
	const total = [...byMode.values()].reduce((s, m) => s + m.amount, 0)
	return [...byMode.values()]
		.map((m) => ({
			...m,
			sharePercent: total > 0 ? (m.amount / total) * 100 : 0,
		}))
		.sort((a, b) => b.amount - a.amount)
}

function buildStatusDistribution(invoices) {
	const byStatus = new Map()
	for (const row of invoices) {
		const status = row.status || "Unknown"
		let b = byStatus.get(status)
		if (!b) {
			b = { status, count: 0, amount: 0 }
			byStatus.set(status, b)
		}
		b.count += 1
		b.amount += Math.abs(Number(row.base_grand_total) || 0)
	}
	return [...byStatus.values()].sort((a, b) => b.count - a.count)
}

function buildDailyPerformance(invoices) {
	const byDate = new Map()
	for (const row of invoices) {
		const date = String(row.posting_date || "").slice(0, 10)
		if (!date) continue
		let b = byDate.get(date)
		if (!b) {
			b = { date, transactions: 0, revenue: 0, returns: 0, avgTicket: 0 }
			byDate.set(date, b)
		}
		b.transactions += 1
		const amt = Number(row.base_grand_total) || 0
		b.revenue += Math.abs(amt)
		if (row.is_return) b.returns += 1
	}
	const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
	for (const row of rows) {
		const normal = row.transactions - row.returns
		row.avgTicket = normal > 0 ? row.revenue / normal : 0
	}
	return rows
}

function buildShiftAnalysis(invoices) {
	const byDate = new Map()
	for (const row of invoices) {
		const date = String(row.posting_date || "").slice(0, 10)
		if (!date) continue
		const hour = new Date(row.posting_date).getHours()
		let shift = "Morning"
		if (hour >= 12 && hour < 17) shift = "Afternoon"
		else if (hour >= 17) shift = "Evening"

		const key = `${date}|${shift}`
		let b = byDate.get(key)
		if (!b) {
			b = { date, shift, transactions: 0, revenue: 0 }
			byDate.set(key, b)
		}
		b.transactions += 1
		b.revenue += Math.abs(Number(row.base_grand_total) || 0)
	}
	return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
