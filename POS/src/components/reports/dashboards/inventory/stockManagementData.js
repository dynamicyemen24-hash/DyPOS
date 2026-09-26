import { call } from "frappe-ui"
import { logger } from "@/utils/logger"
import { apiGet } from "@/utils/restApi"

const log = logger.create("StockManagementData")

// Memory safety bound for low-end terminals. It is NOT a product limit: when
// the walk stops here the result carries `truncated: true` + the server total so
// the UI can say "N من M" instead of quietly showing a partial catalog.
const MAX_RECORDS = 10000

export function clearStockManagementCache() {}

export async function loadStockManagementData(filter = {}) {
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

	const result = {
		products: productsWithStock,
		warehouses,
		categories,
		categoryDistribution,
		topByValue,
		topByQty,
		summary,
		reorderAlerts: lowStockItems,
		loadedAt: new Date().toISOString(),
		// Honesty about coverage: the catalog walk can stop at the client
		// safety bound, so the UI must be able to say "N من M" and disable
		// whole-catalog claims (totals, rankings) it cannot back up.
		truncated: !!products.truncated,
		productTotal: products.total ?? null,
		// Stock rows can hit the same client safety bound; totals and rankings
		// above are only as complete as this flag allows.
		stockTruncated: !!stockRows.truncated,
	}

	log.info("Stock management data loaded", {
		productCount: productsWithStock.length,
	})
	return result
}

async function loadProducts(filter) {
	const all = []
	let offset = 0
	let total = null
	const pageSize = 200
	while (all.length < MAX_RECORDS) {
		const params = {
			limit: pageSize,
			offset,
			// No warehouse filter = every warehouse. Never assume a seeded id
			// ("W-01"): that silently reported one warehouse's stock as the total.
			warehouse: filter.warehouse || "",
			count: "false",
		}
		if (filter.search) params.q = filter.search
		if (filter.category) params.category = filter.category
		const data = await apiGet("/products", params)
		const rows = data?.products || []
		all.push(...rows)
		if (typeof data?.total === "number") total = data.total
		if (!data?.hasMore || rows.length === 0) break
		offset += rows.length
	}
	const truncated =
		typeof total === "number" ? all.length < total : all.length >= MAX_RECORDS
	if (truncated) {
		log.warn("Product catalog walk stopped at the safety bound", {
			loaded: all.length,
			total: total ?? "unknown",
			bound: MAX_RECORDS,
		})
	}
	all.truncated = truncated
	all.total = total
	return all
}

async function loadWarehouses() {
	// The warehouse list must come from the warehouses table, not from stock
	// rows: deriving it from /stock only ever surfaced whichever warehouse the
	// caller happened to be reading, hiding empty (but selectable) warehouses.
	const rows = await call("DyPOS.api.pos_profile.get_warehouses")
	const seen = new Set()
	const out = []
	for (const row of rows || []) {
		const id = row?.id || row?.name
		if (!id || seen.has(id)) continue
		seen.add(id)
		out.push({
			id,
			name: row.warehouse_name || row.name || id,
			isActive: row.is_active === undefined ? true : !!row.is_active,
		})
	}
	return out
}

async function loadStockLevels(filter) {
	const warehouse = filter.warehouse || ""
	// An absent ?warehouse= defaults to W-01 server-side, so "all warehouses"
	// must be requested explicitly — otherwise every total silently covered a
	// single warehouse while claiming to be the whole estate.
	const all = []
	let offset = 0
	const pageSize = 500
	let truncated = false
	while (all.length < MAX_RECORDS) {
		const params = { limit: pageSize, offset }
		if (warehouse) params.warehouse = warehouse
		else params.all_warehouses = "1"
		const data = await apiGet("/stock", params)
		const rows = data?.stock || []
		all.push(...rows)
		if (!data?.hasMore || rows.length === 0) break
		offset += rows.length
	}
	if (all.length >= MAX_RECORDS) {
		truncated = true
		log.warn("Stock walk stopped at the safety bound", {
			loaded: all.length,
			bound: MAX_RECORDS,
			warehouse: warehouse || "ALL",
		})
	}
	all.truncated = truncated
	return all
}

function mergeStock(products, stockRows, filter) {
	const warehouse = filter.warehouse || ""
	// With no warehouse selected the /stock response carries one row PER
	// warehouse, so a plain "last row wins" map would report a single
	// warehouse's quantity and understate the real total. Sum per product.
	const byProduct = new Map()
	for (const row of stockRows) {
		const key = row.product_id
		const qty = Number(row.qty) || 0
		const reserved = Number(row.reserved_qty) || 0
		const prev = byProduct.get(key)
		if (warehouse || !prev) {
			byProduct.set(key, { ...row, qty, reserved_qty: reserved })
		} else {
			byProduct.set(key, {
				...prev,
				qty: (Number(prev.qty) || 0) + qty,
				reserved_qty: (Number(prev.reserved_qty) || 0) + reserved,
			})
		}
	}
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

export function buildStockManagementModels(raw) {
	if (!raw) {
		return {
			products: [],
			warehouses: [],
			categories: [],
			categoryDistribution: [],
			topByValue: [],
			topByQty: [],
			summary: {},
			reorderAlerts: [],
		}
	}
	return {
		products: raw.products || [],
		warehouses: raw.warehouses || [],
		categories: raw.categories || [],
		categoryDistribution: raw.categoryDistribution || [],
		topByValue: raw.topByValue || [],
		topByQty: raw.topByQty || [],
		summary: raw.summary || {},
		reorderAlerts: raw.reorderAlerts || [],
	}
}
