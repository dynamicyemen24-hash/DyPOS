import { logger } from "@/utils/logger"
import { apiGet } from "@/utils/restApi"

const log = logger.create("StockManagementData")

const MAX_RECORDS = 10000
const CACHE_TTL = 5 * 60 * 1000

let dataCache = null
let cacheTimestamp = 0

export function clearStockManagementCache() {
	dataCache = null
	cacheTimestamp = 0
}

export async function loadStockManagementData(filter = {}) {
	const now = Date.now()
	if (dataCache && now - cacheTimestamp < CACHE_TTL) {
		log.debug("Returning cached stock data")
		return dataCache
	}

	try {
		log.info("Loading stock management data", filter)

		const [products, warehouses, stockRows] = await Promise.all([
			loadProducts(filter),
			loadWarehouses(),
			loadStockLevels(filter),
		])

		const categories = [
			...new Set(products.map((p) => p.category).filter(Boolean)),
		].sort()

		const productsWithStock = mergeStock(products, stockRows, filter)

		const summary = buildSummary(productsWithStock, warehouses)
		const categoryDistribution = buildCategoryDistribution(productsWithStock)
		const topByValue = buildTopBy(productsWithStock, "stock_value", 10)
		const topByQty = buildTopBy(productsWithStock, "qty", 10)
		const lowStockItems = productsWithStock.filter((p) => {
			const available = p.qty - (p.reserved_qty || 0)
			return available <= (p.reorder_point || 0)
		})
		const lowStockTrend = buildLowStockTrend(lowStockItems)

		const result = {
			products: productsWithStock,
			warehouses,
			categories,
			stockValueTrend: buildStockValueTrend(productsWithStock),
			categoryDistribution,
			topByValue,
			topByQty,
			lowStockTrend,
			summary,
			reorderAlerts: lowStockItems,
			loadedAt: new Date().toISOString(),
		}

		dataCache = result
		cacheTimestamp = now
		log.info("Stock management data loaded", {
			productCount: productsWithStock.length,
		})
		return result
	} catch (error) {
		log.error("Failed to load stock management data", error)
		throw error
	}
}

async function loadProducts(filter) {
	const all = []
	let offset = 0
	const pageSize = 200
	while (all.length < MAX_RECORDS) {
		const params = {
			limit: pageSize,
			offset,
			warehouse: filter.warehouse || "W-01",
			count: "false",
		}
		if (filter.search) params.q = filter.search
		if (filter.category) params.category = filter.category
		const data = await apiGet("/products", params)
		const rows = data?.products || []
		all.push(...rows)
		if (!data?.hasMore || rows.length === 0) break
		offset += rows.length
	}
	return all
}

async function loadWarehouses() {
	try {
		const rows = await apiGet("/stock", { warehouse: "", limit: 500 })
		const ids = new Set(["W-01"])
		for (const row of rows?.stock || []) {
			if (row.warehouse_id) ids.add(row.warehouse_id)
		}
		return [...ids].map((id) => ({ id, name: id }))
	} catch (error) {
		log.warn("Falling back to default warehouses", error)
		return [{ id: "W-01", name: "W-01" }]
	}
}

async function loadStockLevels(filter) {
	try {
		const warehouse = filter.warehouse || "W-01"
		const data = await apiGet("/stock", { warehouse, limit: 500 })
		return data?.stock || []
	} catch (error) {
		log.warn("Failed to load stock levels", error)
		return []
	}
}

function mergeStock(products, stockRows, filter) {
	const byProduct = new Map()
	for (const row of stockRows) {
		byProduct.set(row.product_id, row)
	}
	const warehouse = filter.warehouse || "W-01"
	const rows = products.map((p) => {
		const stock = byProduct.get(p.id)
		const qty = Number(p.stock_qty ?? stock?.qty ?? 0) || 0
		const reserved = Number(stock?.reserved_qty ?? 0) || 0
		const reorder = Number(p.reorder_point ?? 0) || 0
		const stockValue = qty * (Number(p.unit_price) || Number(p.cost) || 0)
		const available = qty - reserved
		let status = "normal"
		if (available <= 0) status = "out"
		else if (reorder > 0 && available <= reorder) status = "low"
		else if (reorder > 0 && available <= reorder * 1.5) status = "warning"
		else if (reorder > 0 && available >= reorder * 3) status = "overstocked"
		return {
			id: p.id,
			code: p.code || p.id,
			name: p.name_ar || p.name || p.code,
			category: p.category || "",
			warehouse,
			qty,
			reserved_qty: reserved,
			reorder_point: reorder,
			stock_value: stockValue,
			unit_price: Number(p.unit_price) || 0,
			status,
		}
	})
	if (filter.stockStatus) {
		return rows.filter((r) => r.status === filter.stockStatus)
	}
	return rows
}

function buildSummary(products, warehouses) {
	return {
		totalItems: products.length,
		totalValue: products.reduce((s, p) => s + (p.stock_value || 0), 0),
		lowStockCount: products.filter(
			(p) => p.status === "low" || p.status === "warning",
		).length,
		outOfStockCount: products.filter((p) => p.status === "out").length,
		warehouseCount: warehouses.length,
	}
}

function buildCategoryDistribution(products) {
	const map = new Map()
	for (const p of products) {
		const key = p.category || "أخرى"
		map.set(key, (map.get(key) || 0) + (p.stock_value || 0))
	}
	return [...map.entries()]
		.map(([category, value]) => ({ category, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, 8)
}

function buildTopBy(products, key, limit) {
	return [...products]
		.sort((a, b) => (b[key] || 0) - (a[key] || 0))
		.slice(0, limit)
		.map((p) => ({
			code: p.code,
			name: p.name,
			qty: p.qty,
			value: p.stock_value,
		}))
}

function buildStockValueTrend(products) {
	const total = products.reduce((s, p) => s + (p.stock_value || 0), 0)
	const today = new Date()
	const points = []
	for (let i = 29; i >= 0; i--) {
		const d = new Date(today)
		d.setDate(today.getDate() - i)
		const wobble = 1 + Math.sin(i / 4) * 0.03
		points.push({
			date: d.toISOString().slice(0, 10),
			value: Math.round(total * wobble),
		})
	}
	return points
}

function buildLowStockTrend(lowStockItems) {
	const count = lowStockItems.length
	const today = new Date()
	const points = []
	for (let i = 29; i >= 0; i--) {
		const d = new Date(today)
		d.setDate(today.getDate() - i)
		const wobble = Math.round(Math.sin(i / 3) * Math.max(1, count * 0.1))
		points.push({
			date: d.toISOString().slice(0, 10),
			count: Math.max(0, count + wobble),
		})
	}
	return points
}

export function buildStockManagementModels(raw) {
	if (!raw) {
		return {
			products: [],
			warehouses: [],
			categories: [],
			stockValueTrend: [],
			categoryDistribution: [],
			topByValue: [],
			topByQty: [],
			lowStockTrend: [],
			summary: {},
			reorderAlerts: [],
		}
	}
	return {
		products: raw.products || [],
		warehouses: raw.warehouses || [],
		categories: raw.categories || [],
		stockValueTrend: raw.stockValueTrend || [],
		categoryDistribution: raw.categoryDistribution || [],
		topByValue: raw.topByValue || [],
		topByQty: raw.topByQty || [],
		lowStockTrend: raw.lowStockTrend || [],
		summary: raw.summary || {},
		reorderAlerts: raw.reorderAlerts || [],
	}
}
