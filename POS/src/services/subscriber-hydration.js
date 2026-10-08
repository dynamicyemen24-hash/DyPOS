/**
 * Subscriber hydration — explicit server-login -> local operational mirror.
 *
 * This is intentionally background work. A successful authenticated login is
 * the user's explicit request to link this terminal, so we may pull the real
 * subscriber master data and opening balances. None of the rows are fabricated.
 */
import { methodCall } from "@/utils/methodClient"
import { db, setSetting } from "@/utils/offline/db"
import { logger } from "@/utils/logger"

const log = logger.create("SubscriberHydration")

const ITEM_PAGE = 500
const CUSTOMER_PAGE = 500
const MAX_PAGES = 200

function unwrap(response) {
	return response?.message ?? response ?? []
}

async function pullItems({ warehouseId = "W-01" } = {}) {
	let applied = 0
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const rows = unwrap(
			await methodCall("DyPOS.api.items.get_items", {
				start: page * ITEM_PAGE,
				limit: ITEM_PAGE,
				warehouse: warehouseId || "W-01",
			}),
		)
		if (!Array.isArray(rows) || rows.length === 0) break
		const items = []
		const stock = []
		for (const row of rows) {
			const code = String(row?.item_code || row?.code || "").trim()
			if (!code) continue
			items.push({
				...row,
				item_code: code,
				item_name: row.item_name || row.name || code,
				price: Number(row.price ?? row.standard_rate ?? row.unit_price ?? 0),
				stock: Number(row.stock_qty ?? row.stock ?? 0),
			})
			if (Number.isFinite(Number(row.stock_qty))) {
				stock.push({
					item_code: code,
					warehouse: warehouseId || "W-01",
					actual_qty: Number(row.stock_qty) || 0,
				})
			}
		}
		if (items.length) await db.items.bulkPut(items)
		if (stock.length) await db.stock.bulkPut(stock)
		applied += items.length
		if (rows.length < ITEM_PAGE) break
	}
	return applied
}

async function pullCustomers() {
	let applied = 0
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const rows = unwrap(
			await methodCall("DyPOS.api.customers.get_customers", {
				start: page * CUSTOMER_PAGE,
				limit: CUSTOMER_PAGE,
			}),
		)
		if (!Array.isArray(rows) || rows.length === 0) break
		const clean = rows.filter((row) => row?.name)
		if (clean.length) await db.customers.bulkPut(clean)
		applied += clean.length
		if (rows.length < CUSTOMER_PAGE) break
	}
	return applied
}

async function pullOpeningBalances(tenantId) {
	const response = await methodCall(
		"DyPOS.api.opening_balances.get_opening_balances",
		{},
	)
	const payload = response?.rows ? response : unwrap(response)
	const rows = Array.isArray(payload?.rows) ? payload.rows : []
	const clean = rows
		.filter((row) => row?.id || row?.account_id)
		.map((row) => ({
			...row,
			key: [
				tenantId || row.tenant_id || "",
				row.fiscal_year || "",
				row.account_type || "",
				row.account_id || "",
			].join(":"),
			tenant_id: tenantId || row.tenant_id || "",
			amount_minor: Number(row.amount_minor || 0),
			quantity: Number(row.quantity || 0),
			updated_at: row.updated_at || new Date().toISOString(),
		}))
	if (clean.length) await db.opening_balances.bulkPut(clean)
	return { rows: clean, summary: payload?.summary || null }
}

export async function hydrateSubscriberLocalData({
	tenantId = null,
	warehouseId = "W-01",
	bootstrapData = null,
} = {}) {
	if (typeof navigator !== "undefined" && navigator.onLine === false) return null

	try {
		await db.open()
	} catch (error) {
		log.warn("Offline cache open deferred", error)
		return null
	}

	const result = {
		items: 0,
		customers: 0,
		openingBalances: 0,
		paymentMethods: 0,
		error: null,
	}

	try {
		const paymentMethods = Array.isArray(bootstrapData?.payment_methods)
			? bootstrapData.payment_methods
			: []
		if (paymentMethods.length) {
			await db.payment_methods.bulkPut(
				paymentMethods.map((row) => ({
					...row,
					pos_profile: row.pos_profile || bootstrapData?.pos_profile?.name || "POS",
				})),
			)
			result.paymentMethods = paymentMethods.length
		}

		let warehouse =
			warehouseId ||
			bootstrapData?.pos_profile?.warehouse ||
			bootstrapData?.warehouses?.[0]?.id ||
			null
		if (!warehouse) {
			try {
				const warehouses = unwrap(await methodCall("DyPOS.api.pos_profile.get_warehouses", {}))
				warehouse = warehouses?.[0]?.id || warehouses?.[0]?.name || null
			} catch {
				/* warehouse discovery is best effort; item master still hydrates */
			}
		}
		warehouse = warehouse || "W-01"

		const [items, customers, balances, paymentMethods] = await Promise.all([
			pullItems({ warehouseId: warehouse }),
			pullCustomers(),
			pullOpeningBalances(tenantId),
			(async () => {
				try {
					const rows = unwrap(await methodCall("DyPOS.api.pos_profile.get_payment_methods", {
						pos_profile: bootstrapData?.pos_profile?.name || bootstrapData?.pos_profile || "default",
					}))
					if (!Array.isArray(rows)) return []
					const normalized = rows.map((row) => ({ ...row, pos_profile: row.pos_profile || bootstrapData?.pos_profile?.name || "default" }))
					if (normalized.length) await db.payment_methods.bulkPut(normalized)
					return normalized
				} catch (error) {
					log.warn("Payment method hydration deferred", error)
					return []
				}
			})(),
		])
		result.items = items
		result.customers = customers
		result.openingBalances = balances.rows.length
		result.paymentMethods = Math.max(result.paymentMethods, paymentMethods.length)

		await setSetting("subscriber_hydration_at", Date.now())
		await setSetting("subscriber_hydration_tenant", tenantId || "")
		await setSetting("subscriber_hydration_summary", {
			items: result.items,
			customers: result.customers,
			openingBalances: result.openingBalances,
			paymentMethods: result.paymentMethods,
		})
		return result
	} catch (error) {
		result.error = error
		log.warn("Subscriber hydration partially deferred", error)
		return result
	}
}

export default hydrateSubscriberLocalData
