/**
 * DyPOS Product Repository — catalog reads over Dexie `items`.
 *
 * Table shape (services/db v1): id, code, name, barcode, category,
 * price, cost, stock, stockWarn, updatedAt, syncedAt, syncStatus.
 *
 * Scope (Phase 1): READ + catalog upsert for sync application.
 * Pricing/tax math stays in PricingService (next phase); this module
 * never computes money — it only returns catalog rows.
 */
import { createRepository } from "./base.js"

const items = createRepository("items")

function normalizeText(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
}

export function findByBarcode(barcode) {
	const code = String(barcode || "").trim()
	if (!code) return Promise.resolve(null)
	return items.findOneBy("barcode", code)
}

export function findByCode(code) {
	const clean = String(code || "").trim()
	if (!clean) return Promise.resolve(null)
	return items.findOneBy("code", clean)
}

export async function search(query, limit = 50) {
	const q = normalizeText(query)
	const all = await items.all()
	const matches = q
		? all.filter((row) =>
				[
					normalizeText(row.name),
					normalizeText(row.code),
					normalizeText(row.barcode),
				].some((field) => field.includes(q)),
			)
		: all
	return matches.slice(0, Math.max(1, Math.min(Number(limit) || 50, 500)))
}

export async function listByCategory(category, limit = 200) {
	if (!category) return []
	const rows = await items.findBy("category", category)
	return rows.slice(0, Math.max(1, Math.min(Number(limit) || 200, 1000)))
}

/**
 * Items at or below their warning level (missing stockWarn counts as 0,
 * i.e. only truly out-of-stock rows match when no warning is configured).
 */
export async function lowStock(limit = 100) {
	const all = await items.all()
	return all
		.filter((row) => Number(row.stock ?? 0) <= Number(row.stockWarn ?? 0))
		.slice(0, Math.max(1, Math.min(Number(limit) || 100, 1000)))
}

/**
 * Apply synced catalog rows (put-loop, not bulkPut, so the repository
 * works on the minimal table surface used across the codebase).
 */
export async function upsertCatalog(rows = []) {
	const now = new Date().toISOString()
	let applied = 0
	for (const row of rows || []) {
		if (!row?.id || !row?.code || !row?.name) continue
		await items.put({
			syncedAt: now,
			syncStatus: "synced",
			...row,
			id: row.id,
			updatedAt: now,
		})
		applied += 1
	}
	return applied
}

export const productRepository = {
	...items,
	findByBarcode,
	findByCode,
	search,
	listByCategory,
	lowStock,
	upsertCatalog,
}

export default productRepository
