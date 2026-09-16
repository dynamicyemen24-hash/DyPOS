import type { KPI } from "../../types/report.types"
import { safePercent } from "../../core/formatters/reportFormatters"
import type {
	AgingBucket,
	ReceivableRow,
	ReceivablesReportModel,
	SalesInvoiceFact,
} from "../financial.types"
import { sumBy } from "../revenue/revenueCalc"

/**
 * Receivables report calculator — pure functions only.
 *
 * Works on Sales Invoice rows where outstanding_amount > 0.
 * Aging is computed per invoice from `due_date`; buckets are exported
 * so the payables calculator reuses the exact same aging rules.
 */

export const AGING_BUCKETS = [
	{ label: "Not Due", minDays: null, maxDays: 0 },
	{ label: "1-30 Days", minDays: 1, maxDays: 30 },
	{ label: "31-60 Days", minDays: 31, maxDays: 60 },
	{ label: "61-90 Days", minDays: 61, maxDays: 90 },
	{ label: "Over 90 Days", minDays: 91, maxDays: null },
]

export function daysOverdue(dueDate, now = new Date()) {
	if (!dueDate) return 0
	const due = new Date(dueDate)
	if (Number.isNaN(due.getTime())) return 0
	const diffMs = now.getTime() - due.getTime()
	return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export function buildAgingBuckets(invoices, now = new Date()): AgingBucket[] {
	const buckets = AGING_BUCKETS.map((bucket) => ({
		...bucket,
		count: 0,
		amount: 0,
	}))
	for (const invoice of invoices) {
		const overdue = daysOverdue(invoice.due_date, now)
		const bucket = buckets.find(
			(b) =>
				(b.minDays == null || overdue >= b.minDays) &&
				(b.maxDays == null || overdue <= b.maxDays),
		)
		if (bucket) {
			bucket.count += 1
			bucket.amount += Number(invoice.outstanding_amount) || 0
		}
	}
	return buckets
}

export function buildPartyLedgerModel(
	rows,
	partyField,
	partyNameField,
	now = new Date(),
) {
	const invoices = rows || []
	const total = sumBy(invoices, "outstanding_amount")

	const byParty = new Map()
	for (const invoice of invoices) {
		const key = String(invoice[partyField] || "-")
		let bucket = byParty.get(key)
		if (!bucket) {
			bucket = {
				party: key,
				partyName: invoice[partyNameField] || key,
				invoices: [],
			}
			byParty.set(key, bucket)
		}
		bucket.invoices.push(invoice)
	}

	const parties: ReceivableRow[] = [...byParty.values()]
		.map((bucket) => {
			const outstanding = sumBy(bucket.invoices, "outstanding_amount")
			const dueDates = bucket.invoices
				.map((invoice) => invoice.due_date)
				.filter(Boolean)
				.sort()
			const oldestDueDate = dueDates.length ? dueDates[0] : null
			const overdueDays = daysOverdue(oldestDueDate, now)
			return {
				party: bucket.party,
				partyName: bucket.partyName,
				invoiceCount: bucket.invoices.length,
				outstanding,
				oldestDueDate,
				overdueDays,
				status: overdueDays > 0 ? "overdue" : "current",
			}
		})
		.sort((a, b) => b.outstanding - a.outstanding)

	const overdueInvoices = invoices.filter(
		(invoice) => daysOverdue(invoice.due_date, now) > 0,
	)
	const overdueAmount = sumBy(overdueInvoices, "outstanding_amount")

	const kpis: KPI[] = [
		{ id: "total-outstanding", label: "Total Outstanding", value: total },
		{
			id: "overdue-amount",
			label: "Overdue Amount",
			value: overdueAmount,
			status: overdueAmount > 0 ? "warning" : "good",
		},
		{
			id: "overdue-invoices",
			label: "Overdue Invoices",
			value: overdueInvoices.length,
		},
		{ id: "parties", label: "Parties", value: byParty.size },
		{
			id: "overdue-share",
			label: "Overdue Share",
			value: safePercent(overdueAmount, total) ?? 0,
		},
	]

	return { kpis, parties, aging: buildAgingBuckets(invoices, now) }
}

export function buildReceivablesModel(
	rows,
	now = new Date(),
): ReceivablesReportModel {
	return buildPartyLedgerModel(rows, "customer", "customer_name", now)
}
