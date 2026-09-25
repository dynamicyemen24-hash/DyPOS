/**
 * DyPOS Inventory Repository — availability math over Dexie `stock`.
 *
 * Scope (Phase 1): READ + VALIDATE only.
 * - stock rows: { itemId, qty, location, batchNo, ... }
 * - reservations with status "active" reduce availability (see
 *   services/stock-reservations.js, which owns reservation WRITES).
 * - movement logging (`inventory_movements`) lands in schema v5;
 *   until then, stock mutations stay in their current services and this
 *   module is the single place that answers "can we sell this?".
 */
import { createRepository, getDb } from "./base.js"

const stock = createRepository("stock")
const reservations = createRepository("reservations")

export const ACTIVE_RESERVATION = "active"

export async function getBatches(itemId) {
	return stock.findBy("itemId", itemId)
}

export async function onHandQty(itemId, location = null) {
	const batches = await getBatches(itemId)
	return batches
		.filter((b) => location == null || b.location === location)
		.reduce((sum, b) => sum + Number(b.qty || 0), 0)
}

export async function reservedQty(itemId) {
	const rows = await reservations.findBy("itemId", itemId)
	return rows
		.filter((r) => r.status === ACTIVE_RESERVATION)
		.reduce((sum, r) => sum + Number(r.qty || 0), 0)
}

export async function availableQty(itemId, location = null) {
	const [onHand, reserved] = await Promise.all([
		onHandQty(itemId, location),
		reservedQty(itemId),
	])
	return Math.max(0, onHand - reserved)
}

/**
 * Validate a checkout cart against availability.
 * @param {Array<{itemId: *, qty: number}>} lines
 * @returns {Promise<{ok: boolean, insufficiencies: Array}>}
 */
export async function checkAvailability(lines = []) {
	const insufficiencies = []
	for (const line of lines || []) {
		const qty = Number(line?.qty ?? 0)
		if (!line?.itemId || !(qty > 0)) continue
		const available = await availableQty(line.itemId, line.location ?? null)
		if (available < qty) {
			insufficiencies.push({
				itemId: line.itemId,
				requested: qty,
				available,
			})
		}
	}
	return { ok: insufficiencies.length === 0, insufficiencies }
}

export const inventoryRepository = {
	...stock,
	ACTIVE_RESERVATION,
	getBatches,
	onHandQty,
	reservedQty,
	availableQty,
	checkAvailability,
	getDb,
}

export default inventoryRepository
