/**
 * Inventory dashboard data layer.
 *
 * Fetches inventory/stock data and builds chart models for the
 * inventory dashboard. Uses standard ERPNext Stock doctypes.
 */
import {
	changePercent,
	safePercent,
	trendOf,
} from "../../core/formatters/reportFormatters"
import { toISODate } from "../core/dashboardUtils"

function frappeClient() {
	if (
		typeof window === "undefined" ||
		!window.frappe ||
		typeof window.frappe.call !== "function"
	) {
		throw new Error("Frappe API not available")
	}
	return window.frappe
}

async function getList(
	doctype,
	{ fields, filters = [], orderBy = null, limit = 0 } = {},
) {
	const frappe = frappeClient()
	const response = await frappe.call({
		method: "frappe.client.get_list",
		args: {
			doctype,
			fields,
			filters,
			order_by: orderBy,
			limit_page_length: limit,
			limit_start: 0,
		},
	})
	return response?.message || response || []
}

function buildPeriodFilters(filter, dateField) {
	const filters = []
	if (filter?.from) filters.push([dateField, ">=", toISODate(filter.from)])
	if (filter?.to) filters.push([dateField, "<=", toISODate(filter.to)])
	return filters
}

export async function loadInventoryData(filter) {
	const [stockEntries, items] = await Promise.all([
		getList("Stock Ledger Entry", {
			fields: [
				"name",
				"posting_date",
				"item_code",
				"item_name",
				"qty_after_transaction",
				"actual_qty",
				"valuation_rate",
				"warehouse",
				"stock_uom",
			],
			filters: buildPeriodFilters(filter, "posting_date"),
			orderBy: "posting_date asc",
			limit: 0,
		}).catch(() => []),
		getList("Item", {
			fields: [
				"name",
				"item_name",
				"item_code",
				"stock_uom",
				"valuation_rate",
				"is_stock_item",
				"disabled",
			],
			filters: [["is_stock_item", "=", 1]],
			limit: 0,
		}).catch(() => []),
	])

	const binData = await getList("Bin", {
		fields: ["item_code", "warehouse", "actual_qty", "valuation_rate"],
		limit: 0,
	}).catch(() => [])

	return { stockEntries, items, binData }
}

export function buildInventoryModels(facts) {
	const { stockEntries = [], items = [], binData = [] } = facts || {}

	const kpis = buildKPIs(items, binData)
	const stockLevels = buildStockLevels(binData)
	const movementTrend = buildMovementTrend(stockEntries)
	const abcAnalysis = buildABCAnalysis(binData)
	const lowStockItems = buildLowStockAlerts(binData, items)
	const warehouseDistribution = buildWarehouseDistribution(binData)

	return {
		kpis,
		stockLevels,
		movementTrend,
		abcAnalysis,
		lowStockItems,
		warehouseDistribution,
	}
}

function buildKPIs(items, bins) {
	const totalItems = items.filter((i) => !i.disabled).length
	const totalStockValue = bins.reduce(
		(s, b) => s + (Number(b.actual_qty) || 0) * (Number(b.valuation_rate) || 0),
		0,
	)
	const totalQuantity = bins.reduce(
		(s, b) => s + (Number(b.actual_qty) || 0),
		0,
	)
	const lowStockCount = bins.filter(
		(b) => (Number(b.actual_qty) || 0) < 5,
	).length
	const outOfStockCount = bins.filter(
		(b) => (Number(b.actual_qty) || 0) <= 0,
	).length
	const warehouses = new Set(bins.map((b) => b.warehouse)).size

	return [
		{
			id: "stock",
			label: "Total Items",
			value: totalItems,
			status: "neutral",
		},
		{
			id: "stock-value",
			label: "Stock Value",
			value: totalStockValue,
			status: "neutral",
		},
		{
			id: "total-qty",
			label: "Total Quantity",
			value: totalQuantity,
			status: "neutral",
		},
		{
			id: "low-stock",
			label: "Low Stock",
			value: lowStockCount,
			status: lowStockCount > 0 ? "warning" : "good",
		},
		{
			id: "out-of-stock",
			label: "Out of Stock",
			value: outOfStockCount,
			status: outOfStockCount > 0 ? "danger" : "good",
		},
		{
			id: "warehouses",
			label: "Warehouses",
			value: warehouses,
			status: "neutral",
		},
	]
}

function buildStockLevels(bins) {
	const byItem = new Map()
	for (const b of bins) {
		const key = b.item_code || "Unknown"
		let entry = byItem.get(key)
		if (!entry) {
			entry = { itemCode: key, quantity: 0, value: 0 }
			byItem.set(key, entry)
		}
		entry.quantity += Number(b.actual_qty) || 0
		entry.value += (Number(b.actual_qty) || 0) * (Number(b.valuation_rate) || 0)
	}
	return [...byItem.values()].sort((a, b) => b.value - a.value).slice(0, 20)
}

function buildMovementTrend(entries) {
	const byDate = new Map()
	for (const e of entries) {
		const date = String(e.posting_date || "").slice(0, 10)
		if (!date) continue
		let b = byDate.get(date)
		if (!b) {
			b = { date, inward: 0, outward: 0, net: 0 }
			byDate.set(date, b)
		}
		const qty = Number(e.actual_qty) || 0
		if (qty > 0) b.inward += qty
		else b.outward += Math.abs(qty)
		b.net += qty
	}
	return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function buildABCAnalysis(bins) {
	const items = bins
		.map((b) => ({
			itemCode: b.item_code,
			value: (Number(b.actual_qty) || 0) * (Number(b.valuation_rate) || 0),
		}))
		.sort((a, b) => b.value - a.value)

	const total = items.reduce((s, i) => s + i.value, 0)
	let cumulative = 0
	const result = { A: 0, B: 0, C: 0 }

	for (const item of items) {
		cumulative += item.value
		const pct = safePercent(cumulative, total) ?? 0
		if (pct <= 80) result.A += 1
		else if (pct <= 95) result.B += 1
		else result.C += 1
	}

	return [
		{ category: "A (80%)", count: result.A, color: "#10b981" },
		{ category: "B (15%)", count: result.B, color: "#f59e0b" },
		{ category: "C (5%)", count: result.C, color: "#ef4444" },
	]
}

function buildLowStockAlerts(bins, items) {
	const itemMap = new Map(items.map((i) => [i.item_code, i]))
	return bins
		.filter(
			(b) =>
				(Number(b.actual_qty) || 0) <= 5 && (Number(b.actual_qty) || 0) > 0,
		)
		.map((b) => ({
			itemCode: b.item_code,
			itemName: itemMap.get(b.item_code)?.item_name || b.item_code,
			quantity: Number(b.actual_qty) || 0,
			warehouse: b.warehouse,
			status: (Number(b.actual_qty) || 0) <= 0 ? "danger" : "warning",
		}))
		.sort((a, b) => a.quantity - b.quantity)
		.slice(0, 15)
}

function buildWarehouseDistribution(bins) {
	const byWarehouse = new Map()
	for (const b of bins) {
		const wh = b.warehouse || "Unknown"
		let entry = byWarehouse.get(wh)
		if (!entry) {
			entry = { warehouse: wh, quantity: 0, value: 0, itemCount: 0 }
			byWarehouse.set(wh, entry)
		}
		entry.quantity += Number(b.actual_qty) || 0
		entry.value += (Number(b.actual_qty) || 0) * (Number(b.valuation_rate) || 0)
		entry.itemCount += 1
	}
	return [...byWarehouse.values()].sort((a, b) => b.value - a.value)
}
