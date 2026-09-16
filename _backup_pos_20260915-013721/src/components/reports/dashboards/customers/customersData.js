/**
 * Customers dashboard data layer.
 *
 * Builds customer analytics models from sales invoice data.
 */
import { fetchSalesInvoices } from "../../core/data/financialData"
import {
	changePercent,
	safePercent,
	trendOf,
} from "../../core/formatters/reportFormatters"
import { toISODate, previousPeriodFilter } from "../core/dashboardUtils"

export async function loadCustomersData(filter) {
	const prevFilter = previousPeriodFilter(filter)
	const [invoices, prevInvoices] = await Promise.all([
		fetchSalesInvoices(filter),
		prevFilter ? fetchSalesInvoices(prevFilter) : Promise.resolve([]),
	])
	return { invoices, prevInvoices }
}

export function buildCustomerModels(facts) {
	const { invoices = [], prevInvoices = [] } = facts || {}

	const kpis = buildKPIs(invoices, prevInvoices)
	const topCustomers = buildTopCustomers(invoices)
	const customerTrend = buildCustomerTrend(invoices)
	const segmentation = buildSegmentation(invoices)
	const retention = buildRetention(invoices)
	const lifetimeValue = buildLifetimeValue(invoices)

	return {
		kpis,
		topCustomers,
		customerTrend,
		segmentation,
		retention,
		lifetimeValue,
	}
}

function buildKPIs(invoices, prev) {
	const customers = new Set(
		invoices.filter((r) => !r.is_return).map((r) => r.customer),
	)
	const prevCustomers = new Set(
		prev.filter((r) => !r.is_return).map((r) => r.customer),
	)
	const newCustomers = [...customers].filter(
		(c) => !prevCustomers.has(c),
	).length
	const totalRevenue = invoices.reduce(
		(s, r) => s + Math.abs(Number(r.base_net_total) || 0),
		0,
	)
	const avgPerCustomer = customers.size > 0 ? totalRevenue / customers.size : 0

	return [
		{
			id: "customer",
			label: "Unique Customers",
			value: customers.size,
			previousValue: prevCustomers.size,
			changePercent: changePercent(customers.size, prevCustomers.size),
			trend: trendOf(customers.size, prevCustomers.size),
			status: customers.size >= prevCustomers.size ? "good" : "warning",
		},
		{
			id: "new-customers",
			label: "New Customers",
			value: newCustomers,
			status: newCustomers > 0 ? "good" : "neutral",
		},
		{
			id: "revenue",
			label: "Customer Revenue",
			value: totalRevenue,
			status: "neutral",
		},
		{
			id: "average",
			label: "Avg per Customer",
			value: avgPerCustomer,
			status: "neutral",
		},
	]
}

function buildTopCustomers(invoices) {
	const byCustomer = new Map()
	for (const row of invoices) {
		if (row.is_return) continue
		const key = row.customer || "Unknown"
		let b = byCustomer.get(key)
		if (!b) {
			b = {
				customer: key,
				name: row.customer_name || key,
				invoices: 0,
				revenue: 0,
				lastDate: null,
			}
			byCustomer.set(key, b)
		}
		b.invoices += 1
		b.revenue += Number(row.base_net_total) || 0
		const d = String(row.posting_date || "")
		if (!b.lastDate || d > b.lastDate) b.lastDate = d
	}
	const total = [...byCustomer.values()].reduce((s, c) => s + c.revenue, 0)
	return [...byCustomer.values()]
		.map((c) => ({ ...c, sharePercent: safePercent(c.revenue, total) ?? 0 }))
		.sort((a, b) => b.revenue - a.revenue)
		.slice(0, 15)
}

function buildCustomerTrend(invoices) {
	const byDate = new Map()
	for (const row of invoices) {
		if (row.is_return) continue
		const date = String(row.posting_date || "").slice(0, 10)
		if (!date) continue
		let b = byDate.get(date)
		if (!b) {
			b = { date, customers: 0, revenue: 0 }
			byDate.set(date, b)
		}
		b.customers += 1
		b.revenue += Number(row.base_net_total) || 0
	}
	return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function buildSegmentation(invoices) {
	const byCustomer = new Map()
	for (const row of invoices) {
		if (row.is_return) continue
		const key = row.customer || "Unknown"
		let b = byCustomer.get(key)
		if (!b) {
			b = { customer: key, total: 0, count: 0 }
			byCustomer.set(key, b)
		}
		b.total += Number(row.base_net_total) || 0
		b.count += 1
	}
	const customers = [...byCustomer.values()]
	const segments = { VIP: 0, Regular: 0, Occasional: 0, New: 0 }
	for (const c of customers) {
		if (c.count >= 10 && c.total > 50000) segments.VIP += 1
		else if (c.count >= 5) segments.Regular += 1
		else if (c.count >= 2) segments.Occasional += 1
		else segments.New += 1
	}
	return Object.entries(segments).map(([label, count]) => ({ label, count }))
}

function buildRetention(invoices) {
	const byCustomer = new Map()
	for (const row of invoices) {
		if (row.is_return) continue
		const key = row.customer || "Unknown"
		const date = String(row.posting_date || "").slice(0, 7)
		if (!byCustomer.has(key)) byCustomer.set(key, new Set())
		if (date) byCustomer.get(key).add(date)
	}
	const months = new Set()
	for (const [, monthsSet] of byCustomer) {
		for (const m of monthsSet) months.add(m)
	}
	const sortedMonths = [...months].sort()
	if (sortedMonths.length < 2) return []

	const result = sortedMonths.map((month) => {
		const activeInMonth = [...byCustomer.entries()]
			.filter(([, ms]) => ms.has(month))
			.map(([c]) => c)
		const prevMonth = sortedMonths[sortedMonths.indexOf(month) - 1]
		if (!prevMonth)
			return { month, retention: 100, returning: 0, newCustomers: 0 }

		const prevActive = [...byCustomer.entries()]
			.filter(([, ms]) => ms.has(prevMonth))
			.map(([c]) => c)
		const returning = activeInMonth.filter((c) => prevActive.includes(c)).length
		const retention =
			prevActive.length > 0 ? (returning / prevActive.length) * 100 : 0

		return {
			month,
			retention: Math.round(retention * 10) / 10,
			returning,
			newCustomers: activeInMonth.length - returning,
		}
	})
	return result
}

function buildLifetimeValue(invoices) {
	const byCustomer = new Map()
	for (const row of invoices) {
		if (row.is_return) continue
		const key = row.customer || "Unknown"
		let b = byCustomer.get(key)
		if (!b) {
			b = {
				customer: key,
				name: row.customer_name || key,
				total: 0,
				count: 0,
				firstDate: row.posting_date,
				lastDate: row.posting_date,
			}
			byCustomer.set(key, b)
		}
		b.total += Number(row.base_net_total) || 0
		b.count += 1
		if (row.posting_date < b.firstDate) b.firstDate = row.posting_date
		if (row.posting_date > b.lastDate) b.lastDate = row.posting_date
	}
	return [...byCustomer.values()]
		.map((c) => ({
			...c,
			avgOrder: c.count > 0 ? c.total / c.count : 0,
			tenureDays:
				c.firstDate && c.lastDate
					? Math.ceil((new Date(c.lastDate) - new Date(c.firstDate)) / 86400000)
					: 0,
		}))
		.sort((a, b) => b.total - a.total)
		.slice(0, 20)
}
