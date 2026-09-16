import type { KPI } from "../../types/report.types"
import { safePercent } from "../../core/formatters/reportFormatters"
import type {
	CashflowDailyRow,
	CashflowModeRow,
	CashflowReportModel,
	PaymentEntryFact,
} from "../financial.types"

/**
 * Cash flow report calculator — pure functions only.
 *
 * Inflow  = Payment Entry of type "Receive"  (received_amount)
 * Outflow = Payment Entry of type "Pay"      (paid_amount)
 * Internal transfers are excluded from both sides.
 */

export function buildCashflowModel(payments): CashflowReportModel {
	const rows = payments || []
	const inflowRows = rows.filter((row) => row.payment_type === "Receive")
	const outflowRows = rows.filter((row) => row.payment_type === "Pay")

	const inflow = inflowRows.reduce(
		(total, row) => total + (Number(row.received_amount) || 0),
		0,
	)
	const outflow = outflowRows.reduce(
		(total, row) => total + (Number(row.paid_amount) || 0),
		0,
	)
	const net = inflow - outflow

	const kpis: KPI[] = [
		{ id: "cash-in", label: "Cash In", value: inflow, status: "good" },
		{
			id: "cash-out",
			label: "Cash Out",
			value: outflow,
			status: outflow > inflow ? "warning" : "neutral",
		},
		{
			id: "net-cash",
			label: "Net Cash Flow",
			value: net,
			status: net >= 0 ? "good" : "danger",
		},
		{ id: "payments", label: "Payment Entries", value: rows.length },
	]

	return {
		kpis,
		daily: buildDailyRows(inflowRows, outflowRows),
		byMode: buildModeRows(inflowRows, outflowRows, inflow),
	}
}

function buildDailyRows(inflowRows, outflowRows): CashflowDailyRow[] {
	const byDate = new Map()
	const touch = (date) => {
		const key = String(date || "").slice(0, 10)
		if (!key) return null
		let bucket = byDate.get(key)
		if (!bucket) {
			bucket = { date: key, inflow: 0, outflow: 0, net: 0, balance: 0 }
			byDate.set(key, bucket)
		}
		return bucket
	}
	for (const row of inflowRows) {
		const bucket = touch(row.posting_date)
		if (bucket) bucket.inflow += Number(row.received_amount) || 0
	}
	for (const row of outflowRows) {
		const bucket = touch(row.posting_date)
		if (bucket) bucket.outflow += Number(row.paid_amount) || 0
	}
	const daily = [...byDate.values()].sort((a, b) =>
		a.date.localeCompare(b.date),
	)
	let running = 0
	for (const bucket of daily) {
		bucket.net = bucket.inflow - bucket.outflow
		running += bucket.net
		bucket.balance = running
	}
	return daily
}

function buildModeRows(inflowRows, outflowRows, inflow): CashflowModeRow[] {
	const byMode = new Map()
	const touch = (mode) => {
		const key = String(mode || "-")
		let bucket = byMode.get(key)
		if (!bucket) {
			bucket = { mode: key, inflow: 0, outflow: 0, net: 0 }
			byMode.set(key, bucket)
		}
		return bucket
	}
	for (const row of inflowRows) {
		touch(row.mode_of_payment).inflow += Number(row.received_amount) || 0
	}
	for (const row of outflowRows) {
		touch(row.mode_of_payment).outflow += Number(row.paid_amount) || 0
	}
	return [...byMode.values()]
		.map((bucket) => ({
			...bucket,
			net: bucket.inflow - bucket.outflow,
			sharePercent: safePercent(bucket.inflow, inflow) ?? 0,
		}))
		.sort((a, b) => b.net - a.net)
}
