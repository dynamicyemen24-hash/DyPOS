/**
 * StockReservations — حجوزات المخزون في الوضع الأوفلاين.
 *
 * يحل مشكلة البيع الزائد (overselling): عندما تعمل عدة نقاط بيع على نفس
 * المخزون وانقطعت الشبكة، قد يبيع كل طرفية الوحدات نفسها. الحجز المحلي
 * يخفض الكمية المتاحة فعليًا لكل طرفية، وتُثبّت الحجوزات عند نجاح المزامنة
 * أو تُحرَّر تلقائيًا عند انتهاء صلاحيتها أو إلغاء العملية.
 */

import db from "./db.js"

export const RESERVATION_TTL_MS = 30 * 60 * 1000 // 30 دقيقة

export const RESERVATION_STATUS = Object.freeze({
	ACTIVE: "active",
	COMMITTED: "committed",
	RELEASED: "released",
	EXPIRED: "expired",
})

/** خطأ حجز مع تفاصيل الصنف (للواجهة والاختبارات). */
export class StockReservationError extends Error {
	constructor(message, details = {}) {
		super(message)
		this.name = "StockReservationError"
		this.details = details
	}
}

function toIso(ts) {
	return new Date(ts).toISOString()
}

/**
 * الكمية المحجوزة فعليًا لصنف ما (الحجوزات النشطة فقط).
 * @param {Object} store - Dexie-like store with a `reservations` table.
 * @param {string|number} itemId
 * @param {number} [now] - epoch ms لاستبعاد المنتهية.
 * @returns {Promise<number>}
 */
export async function getReservedQty(itemId, store = db, now = Date.now()) {
	const rows = await store.reservations
		.where("[itemId+status]")
		.equals([String(itemId), RESERVATION_STATUS.ACTIVE])
		.toArray()
	return rows
		.filter((row) => !row.expiresAt || new Date(row.expiresAt).getTime() > now)
		.reduce((sum, row) => sum + Number(row.qty || 0), 0)
}

/**
 * الكمية المتاحة = المخزون الفعلي − المحجوز.
 * @param {Object} store
 * @param {string|number} itemId
 * @param {number} physicalQty - المخزون المعروض محليًا.
 * @param {number} [now]
 * @returns {Promise<number>} قد تكون سالبة إذا كان المخزون المُبلَّغ قديمًا.
 */
export async function getAvailableStock(
	itemId,
	physicalQty,
	store = db,
	now = Date.now(),
) {
	const reserved = await getReservedQty(itemId, store, now)
	return Number(physicalQty || 0) - reserved
}

/**
 * إنشاء حجز لعملية بيع (أو تعليق سلة) داخل معاملة واحدة ذرّية.
 * @param {Object} opts
 * @param {string|number} opts.invoiceId - معرّف العملية المحلية (offline_id).
 * @param {Array<{itemId, qty}>} opts.items
 * @param {Object<string, number>} opts.physicalStock - خريطة المخزون الفعلي {itemId: qty}.
 * @param {number} [opts.ttlMs] - مدة الصلاحية (افتراضي 30 دقيقة).
 * @param {Object} [opts.store]
 * @param {number} [opts.now]
 * @returns {Promise<{reserved: Array, expiresAt: string}>}
 */
export async function reserveStock({
	invoiceId,
	items,
	physicalStock = {},
	ttlMs = RESERVATION_TTL_MS,
	store = db,
	now = Date.now(),
}) {
	if (!invoiceId) {
		throw new StockReservationError("معرّف العملية مطلوب للحجز")
	}
	if (!Array.isArray(items) || items.length === 0) {
		throw new StockReservationError("لا توجد أصناف للحجز")
	}

	// تجميع الكميات المكررة لنفس الصنف
	const wanted = new Map()
	for (const item of items) {
		const id = String(item.itemId)
		wanted.set(id, (wanted.get(id) || 0) + Number(item.qty || 0))
	}

	const expiresAt = toIso(now + ttlMs)

	const created = await store.transaction(
		"rw",
		store.reservations,
		async () => {
			await releaseExpiredReservations({ store, now })

			// التحقق من التوفر لكل صنف قبل أي إدراج
			for (const [itemId, qty] of wanted) {
				const physical = Number(physicalStock[itemId] ?? 0)
				const reserved = await getReservedQty(itemId, store, now)
				const available = physical - reserved
				if (qty > available) {
					throw new StockReservationError(
						`الكمية غير متوفرة للصنف ${itemId} — المطلوب ${qty} والمتاح ${available}`,
						{ itemId, requested: qty, available },
					)
				}
			}

			const rows = []
			for (const [itemId, qty] of wanted) {
				rows.push({
					invoiceId: String(invoiceId),
					itemId,
					qty,
					status: RESERVATION_STATUS.ACTIVE,
					createdAt: toIso(now),
					expiresAt,
				})
			}
			const ids = await store.reservations.bulkAdd(rows, {
				allKeys: true,
			})
			return rows.map((row, index) => ({ ...row, id: ids[index] }))
		},
	)

	return { reserved: created, expiresAt }
}

/**
 * خريطة المخزون الفعلي من الكاش المحلي (جدول stock) لمجموعة أصناف.
 * الأصناف الغائبة من الكاش تُعامل كغير محدودة (لا نحظر بيعًا بسبب كاش قديم).
 * @param {Object} [store]
 * @param {Array<string|number>} itemIds
 * @returns {Promise<Object<string, number>>}
 */
export async function getPhysicalStockMap(store = db, itemIds = []) {
	const map = {}
	for (const rawId of itemIds) {
		const id = String(rawId)
		const rows = await store.stock.where("itemId").equals(id).toArray()
		map[id] = rows.length
			? rows.reduce((sum, row) => sum + Number(row.qty || 0), 0)
			: Number.POSITIVE_INFINITY
	}
	return map
}

/**
 * تثبيت الحجز بعد نجاح البيع (من نشط إلى مُثبَّت).
 * @param {string|number} invoiceId
 * @param {Object} [store]
 * @returns {Promise<number>} عدد الصفوف المثبتة.
 */
export async function commitReservation(invoiceId, store = db) {
	const rows = await store.reservations
		.where("[invoiceId+status]")
		.equals([String(invoiceId), RESERVATION_STATUS.ACTIVE])
		.toArray()
	if (rows.length === 0) return 0
	await store.reservations.bulkPut(
		rows.map((row) => ({ ...row, status: RESERVATION_STATUS.COMMITTED })),
	)
	return rows.length
}

/**
 * تحرير الحجز عند إلغاء العملية أو فشل البيع.
 * @param {string|number} invoiceId
 * @param {Object} [store]
 * @returns {Promise<number>} عدد الصفوف المحررة.
 */
export async function releaseReservation(invoiceId, store = db) {
	const rows = await store.reservations
		.where("[invoiceId+status]")
		.equals([String(invoiceId), RESERVATION_STATUS.ACTIVE])
		.toArray()
	if (rows.length === 0) return 0
	await store.reservations.bulkPut(
		rows.map((row) => ({ ...row, status: RESERVATION_STATUS.RELEASED })),
	)
	return rows.length
}

/**
 * تحرير كل الحجوزات المنتهية صلاحيتها.
 * @param {Object} [opts]
 * @param {number} [opts.now]
 * @param {Object} [opts.store]
 * @returns {Promise<number>} عدد الصفوف المفرَّغة.
 */
export async function releaseExpiredReservations({
	now = Date.now(),
	store = db,
} = {}) {
	const rows = await store.reservations
		.where("status")
		.equals(RESERVATION_STATUS.ACTIVE)
		.toArray()
	const expired = rows.filter(
		(row) => row.expiresAt && new Date(row.expiresAt).getTime() <= now,
	)
	if (expired.length === 0) return 0
	await store.reservations.bulkPut(
		expired.map((row) => ({ ...row, status: RESERVATION_STATUS.EXPIRED })),
	)
	return expired.length
}

/**
 * كل الحجوزات النشطة (للواجهة والتقارير).
 * @param {Object} [store]
 * @returns {Promise<Array>}
 */
export async function getActiveReservations(store = db) {
	return store.reservations
		.where("status")
		.equals(RESERVATION_STATUS.ACTIVE)
		.toArray()
}

/**
 * تنظيف كامل (للاختبارات وتسجيل الخروج).
 * @param {Object} [store]
 */
export async function clearReservations(store = db) {
	return store.reservations.clear()
}

export default {
	RESERVATION_TTL_MS,
	RESERVATION_STATUS,
	StockReservationError,
	getReservedQty,
	getAvailableStock,
	reserveStock,
	commitReservation,
	releaseReservation,
	releaseExpiredReservations,
	getActiveReservations,
	clearReservations,
}
