/**
 * DyPOS Offline Store — Dexie IndexedDB
 * المستودع المحلي الكامل: يدعم تشغيلdatumúl كامل دون اتصال
 * ويُحفظ جميع العمليات لاحقًا عند العودة للاتصال.
 */

import Dexie from "dexie"

const DB_NAME = "DyPOS-Offline-v1"

/**
 * نموذج البيانات المحلي — نحذف كل الجداول التي يحتاجها النظام
 * لتشغيل كامل دون اتصال: العملاء، المنتجات، المخزون، الفواتير، الإعدادات.
 */
class DyPOSDb extends Dexie {
	constructor() {
		super(DB_NAME)

		this.version(1).stores({
			// العملاء والحسابات
			customers:
				"++id, code, name, phone, [phone+name], updatedAt, syncedAt, syncStatus",

			// المنتجات والكatalog
			items:
				"++id, code, name, barcode, [barcode+code], category, price, cost, stock, stockWarn, updatedAt, syncedAt, syncStatus",

			// المخزون بالقطع والتتبع
			stock:
				"++id, batchNo, itemId, serialNo, qty, location, expiryDate, [itemId+location], [batchNo+serialNo], updatedAt, syncedAt, syncStatus",

			// الفواتير والمبيعات
			invoices:
				"++id, invoiceNo, customerId, status, total, paid, balance, date, dueDate, [customerId+invoiceNo], [invoiceNo+status], updatedAt, syncedAt, syncStatus",

			// دفعات الفواتير
			payments:
				"++id, invoiceId, method, amount, date, reference, [invoiceId+reference], updatedAt, syncedAt, syncStatus",

			// الإعدادات المحلية (UI preferences, theme, density, accent, lastPosLogin)
			settings: "key, value",

			// قائمة انتظار المزامنة (أولوية حسب التوقيت)
			syncQueue:
				"++id, entityType, entityId, operation, payload, createdAt, attemptCount, lastAttempt, status",

			// سجل المراجعة للنزاعات (audit trail) — لا حذف
			syncAudit:
				"++id, entityType, entityId, localRev, remoteRev, conflictType, resolution, resolvedAt, createdDate",

			// بيانات الجلسة الخاصة بالـ POS (shift, cashier, register)
			sessions:
				"++id, shiftNo, cashierId, registerId, openedAt, closedAt, status, [shiftNo+status]",

			// السجلات المالية اليومية (EOF shifts, summaries)
			dailyReports:
				"++id, date, shiftNo, totalSales, totalPayments, totalReturns, [date+shiftNo]",
		})
	}
}

const db = new DyPOSDb()

/**
 * مساعدات التفاعل مع المستودع
 */
export function upsertLocal(entityType, id, data, meta = {}) {
	const table = db.table(entityType)
	return table.put({ id, ...data, ...meta })
}

export async function getLocal(entityType, id) {
	return db.table(entityType).get(id)
}

export async function getAllLocal(entityType, query = {}) {
	const table = db.table(entityType)
	// دعم find بسيط by indexed fields
	if (query.where) {
		return table.where(query.where).equals(query.value).toArray()
	}
	return table.toArray()
}

export async function deleteLocal(entityType, id) {
	return db.table(entityType).delete(id)
}

export async function getSyncQueue() {
	return db.syncQueue.orderBy("createdAt").toArray()
}

export async function markSyncQueueItemStatus(id, status, errorMsg) {
	return db.syncQueue.update(id, {
		status,
		lastAttempt: new Date(),
		...(errorMsg && { lastError: errorMsg }),
	})
}

export async function enqueueSync(entityType, entityId, operation, payload) {
	return db.syncQueue.add({
		entityType,
		entityId,
		operation, // 'create' | 'update' | 'delete'
		payload,
		createdAt: new Date(),
		attemptCount: 0,
		status: "pending",
	})
}

export async function logSyncAudit(entry) {
	return db.syncAudit.add({
		...entry,
		createdDate: new Date(),
	})
}

// جلب آخر بيانات synced من كل جدول (لـ full refresh when needed)
export async function getLastSyncedAges() {
	const tables = [
		"customers",
		"items",
		"stock",
		"invoices",
		"payments",
		"sessions",
	]
	const ages = {}
	for (const t of tables) {
		const latest = await db[t].orderBy("syncedAt").reverse().limit(1).toArray()
		ages[t] = latest.length ? latest[0].syncedAt : null
	}
	return ages
}

export async function clearAllLocalData() {
	await db.transaction("rw", db.tables, async () => {
		for (const t of db.tables) {
			await t.clear()
		}
	})
}

export default db
