import type { KPI } from "../../types/report.types"
import { safePercent } from "../../core/formatters/reportFormatters"
import type {
	SalesInvoiceFact,
	TaxAccountRow,
	TaxDailyRow,
	TaxLineFact,
	TaxReportModel,
} from "../financial.types"
import { sumBy } from "../revenue/revenueCalc"

/**
 * Tax report calculator — pure functions only.
 *
 * Invoice-level totals (base_total_taxes_and_charges) are always
 * available; the per-account breakdown depends on the child-table
 * query succeeding and is flagged via `breakdownAvailable`.
 */

export function buildTaxModel(invoices, taxLines = []): TaxReportModel {
	const rows = invoices || []

	const taxableAmount = sumBy(rows, "base_net_total")
	const taxAmount = sumBy(rows, "base_total_taxes_and_charges")
	const transactions = rows.filter((row) => !row.is_return).length
	const effectiveRate = safePercent(taxAmount, taxableAmount)

	const breakdownAvailable = (taxLines || []).length > 0

	const kpis: KPI[] = [
		{ id: "taxable-amount", label: "Taxable Amount", value: taxableAmount },
		{ id: "total-tax", label: "Total Tax", value: taxAmount },
		{
			id: "effective-rate",
			label: "Effective Tax Rate",
			value: effectiveRate ?? 0,
			status: effectiveRate == null ? "neutral" : "good",
		},
		{ id: "taxable-invoices", label: "Taxable Invoices", value: transactions },
	]

	return {
		kpis,
		byAccount: breakdownAvailable ? buildAccountRows(taxLines, taxAmount) : [],
		daily: buildDailyRows(rows),
		breakdownAvailable,
	}
}

function buildAccountRows(taxLines, totalTax): TaxAccountRow[] {
	const byAccount = new Map()
	for (const line of taxLines) {
		const key = String(line.account_head || "-")
		let bucket = byAccount.get(key)
		if (!bucket) {
			bucket = {
				accountHead: key,
				description: line.description || key,
				rate: line.rate ?? null,
				amount: 0,
			}
			byAccount.set(key, bucket)
		}
		bucket.amount += Number(line.base_tax_amount) || 0
	}
	return [...byAccount.values()]
		.map((bucket) => ({
			...bucket,
			sharePercent: safePercent(bucket.amount, totalTax) ?? 0,
		}))
		.sort((a, b) => b.amount - a.amount)
}

function buildDailyRows(rows): TaxDailyRow[] {
	const byDate = new Map()
	for (const row of rows) {
		const date = String(row.posting_date || "").slice(0, 10)
		if (!date) continue
		let bucket = byDate.get(date)
		if (!bucket) {
			bucket = { date, taxableAmount: 0, taxAmount: 0, transactions: 0 }
			byDate.set(date, bucket)
		}
		bucket.taxableAmount += Number(row.base_net_total) || 0
		bucket.taxAmount += Number(row.base_total_taxes_and_charges) || 0
		if (!row.is_return) bucket.transactions += 1
	}
	return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
