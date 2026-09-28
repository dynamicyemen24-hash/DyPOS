import type { KPI } from "../../types/report.types"
import {
	changePercent,
	safePercent,
	trendOf,
} from "../../core/formatters/reportFormatters"
import type {
	RevenueCustomerRow,
	RevenueDailyRow,
	RevenueReportModel,
	SalesInvoiceFact,
} from "../financial.types"

/**
 * Revenue report calculator — pure functions only.
 *
 * ERPNext return invoices carry negative amounts, so all totals are
 * computed over the full invoice set (returns net themselves out).
 */

/**
 * Sum one numeric field across rows. Generic over the row type so `pick` is
 * checked against the real keys — a typo like "base_net_totals" is a compile
 * error rather than a silent zero.
 */
export function sumBy<T, K extends keyof T>(rows: T[], pick: K): number {
	return rows.reduce<number>(
		(total, row) => total + (Number(row?.[pick]) || 0),
		0,
	)
}

export function buildRevenueModel(
	invoices: SalesInvoiceFact[] = [],
	previousInvoices: SalesInvoiceFact[] = [],
): RevenueReportModel {
	const rows = invoices || []
	const previous = previousInvoices || []

	const netSales = sumBy(rows, "base_net_total")
	const grossSales = sumBy(rows, "base_grand_total")
	const taxes = sumBy(rows, "base_total_taxes_and_charges")
	const discount = sumBy(rows, "base_discount_amount")
	const collected = sumBy(rows, "base_paid_amount")
	const transactions = rows.filter((row) => !row.is_return).length
	const averageTicket = transactions > 0 ? netSales / transactions : 0

	const previousNetSales = sumBy(previous, "base_net_total")

	const daily = buildDailyRows(rows)
	const topCustomers = buildTopCustomers(rows, netSales)

	const kpis: KPI[] = [
		buildKpi(
			"gross-sales",
			"Gross Sales",
			grossSales,
			sumBy(previous, "base_grand_total"),
		),
		buildKpi("net-sales", "Net Sales", netSales, previousNetSales),
		buildKpi(
			"taxes-collected",
			"Taxes Collected",
			taxes,
			sumBy(previous, "base_total_taxes_and_charges"),
		),
		buildKpi(
			"discounts",
			"Discounts Given",
			discount,
			sumBy(previous, "base_discount_amount"),
		),
		buildKpi(
			"transactions",
			"Transactions",
			transactions,
			previous.filter((r) => !r.is_return).length,
		),
		buildKpi("average-ticket", "Average Ticket", averageTicket),
		buildKpi(
			"collection-rate",
			"Collection Rate",
			safePercent(collected, grossSales) ?? 0,
		),
	]

	return { kpis, daily, topCustomers }
}

/**
 * `previousValue` is intentionally optional: KPIs built for the current period
 * only (average ticket, collection rate) are passed three arguments and simply
 * carry no comparison baseline.
 */
function buildKpi(
	id: string,
	label: string,
	value: number,
	previousValue?: number,
): KPI {
	const kpi: KPI = { id, label, value }
	if (previousValue !== undefined) {
		kpi.previousValue = previousValue
		kpi.changePercent = changePercent(value, previousValue)
		kpi.trend = trendOf(value, previousValue)
	}
	return kpi
}

function buildDailyRows(rows: SalesInvoiceFact[]): RevenueDailyRow[] {
	const byDate = new Map<string, RevenueDailyRow>()
	for (const row of rows) {
		const date = String(row.posting_date || "").slice(0, 10)
		if (!date) continue
		let bucket = byDate.get(date)
		if (!bucket) {
			bucket = {
				date,
				grossSales: 0,
				netSales: 0,
				taxes: 0,
				discount: 0,
				transactions: 0,
				returns: 0,
			}
			byDate.set(date, bucket)
		}
		bucket.grossSales += Number(row.base_grand_total) || 0
		bucket.netSales += Number(row.base_net_total) || 0
		bucket.taxes += Number(row.base_total_taxes_and_charges) || 0
		bucket.discount += Number(row.base_discount_amount) || 0
		if (row.is_return) {
			bucket.returns += 1
		} else {
			bucket.transactions += 1
		}
	}
	return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

interface CustomerBucket {
	customer: string
	customerName: string
	invoices: number
	netSales: number
}

function buildTopCustomers(
	rows: SalesInvoiceFact[],
	netSales: number,
): RevenueCustomerRow[] {
	const byCustomer = new Map<string, CustomerBucket>()
	for (const row of rows) {
		if (row.is_return) continue
		const key = String(row.customer || "-")
		let bucket = byCustomer.get(key)
		if (!bucket) {
			bucket = {
				customer: key,
				customerName: row.customer_name || key,
				invoices: 0,
				netSales: 0,
			}
			byCustomer.set(key, bucket)
		}
		bucket.invoices += 1
		bucket.netSales += Number(row.base_net_total) || 0
	}
	return [...byCustomer.values()]
		.map((bucket) => ({
			...bucket,
			sharePercent: safePercent(bucket.netSales, netSales) ?? 0,
		}))
		.sort((a, b) => b.netSales - a.netSales)
		.slice(0, 10)
}
