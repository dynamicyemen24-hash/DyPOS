/**
 * OfflineStore — the local data repository the sync cycle operates against.
 *
 * Wraps the Dexie-backed services/db.js with the domain operations the
 * session/sync layers need: checkpoint management, pending-queue access,
 * remote change application (with validation + conflict guards) and audit.
 *
 * The constructor accepts an injectable source so tests can substitute the
 * IndexedDB layer with an in-memory fake.
 */

import db from "./db.js"
import { validateBeforeSync, validateRemoteResponse } from "./sync-validator.js"
import { RESERVATION_STATUS } from "./stock-reservations.js"
import { logger } from "@/utils/logger"

const log = logger.create("OfflineStore")

export const CHECKPOINT_KEY = "lastSyncCheckpoint"
export const LAST_SYNC_KEY = "lastSyncTimestamp"

const ENTITY_TABLES = {
	customer: "customers",
	customers: "customers",
	item: "items",
	items: "items",
	stock: "stock",
	invoice: "invoices",
	invoices: "invoices",
	payment: "payments",
	payments: "payments",
	session: "sessions",
	sessions: "sessions",
	settings: "settings",
	dailyReport: "dailyReports",
	dailyReports: "dailyReports",
	openingBalance: "openingBalances",
	openingBalances: "openingBalances",
}

const ENTITY_VALIDATION_KEYS = {
	customers: "customer",
	items: "item",
	invoices: "invoice",
	payments: "payment",
	sessions: "session",
	dailyReports: "dailyReport",
	openingBalances: "openingBalance",
}

function tableFor(entityType) {
	return ENTITY_TABLES[entityType] || entityType
}

function validationKeyFor(entityType) {
	return ENTITY_VALIDATION_KEYS[entityType] || entityType
}

/**
 * منع التكرار من المصدر: نفس المستند المعلق (entityType/entityId/operation
 * وحالته pending) يُحدَّث بدل تكرار الصف — الضغطة المزدوجة أو إعادة
 * المحاولة بعد نجاح الحفظ المحلي لا تُنشئ فاتورة ثانية أبدًا.
 *
 * التنفيذ الوحيد لهذه القاعدة (S3): يستخدمه `pushLocalChange` في
 * sync-manager.js و`enqueueInvoiceSale` أدناه. يعمل داخل معاملة Dexie
 * (يُستدعى من داخل tx) وخارجها على حد سواء.
 *
 * @param {Object} dbLike - Dexie instance (or compatible store).
 * @param {Object} op - { entityType, entityId, operation, payload }.
 * @returns {Promise<{id: number, updated: boolean}>}
 */
export async function upsertQueueRow(
	dbLike,
	{ entityType, entityId, operation, payload, tenantId = null },
) {
	const resolvedTenantId =
		tenantId ?? payload?._tenantId ?? payload?.tenantId ?? null
	const freshPayload = {

		...payload,
		_localRev: Date.now().toString(),
		_localUpdatedAt: new Date().toISOString(),
		...(resolvedTenantId ? { _tenantId: String(resolvedTenantId) } : {}),
	}
	const existing = await dbLike.syncQueue
		.where("entityId")
		.equals(String(entityId))
		.toArray()
	const dup = (existing || []).find(
		(row) =>
			row &&
			row.status === "pending" &&
			String(row.entityType) === String(entityType) &&
			String(row.operation) === String(operation),
	)
	if (dup?.id != null) {
		await dbLike.syncQueue.update(dup.id, {
			payload: freshPayload,
			attemptCount: 0,
			nextRetryAt: null,
			lastError: null,
			status: "pending",
		})
		return { id: dup.id, updated: true }
	}
	const id = await dbLike.syncQueue.add({
		tenantId: resolvedTenantId ? String(resolvedTenantId) : null,
		entityType,
		entityId: String(entityId),
		operation,
		payload: freshPayload,
		createdAt: new Date(),
		attemptCount: 0,
		status: "pending",
	})
	return { id, updated: false }
}

/**
 * Exponential backoff for queue retries: 5s × 2^(n-1), capped at 5min.
 * Keeps a dead backend from becoming a retry storm while preserving order.
 * @param {number} attemptCount 1-based
 */
export function backoffMs(attemptCount) {
	const n = Math.max(1, Number(attemptCount) || 1)
	return Math.min(5000 * 2 ** (n - 1), 5 * 60 * 1000)
}

export class OfflineStore {
	constructor(source = db) {
		this.db = source
	}

	// --------------------------------------------------------------------
	// Checkpoints
	// --------------------------------------------------------------------

	/**
	 * @returns {Promise<number>} Server tick (epoch ms) of the last successful
	 *          pull, or 0 when nothing was synced yet.
	 */
	async getCheckpoint() {
		try {
			const row = await this.db.settings.get(CHECKPOINT_KEY)
			if (row?.value) {
				const ts = new Date(row.value).getTime()
				if (!Number.isNaN(ts)) return ts
			}
		} catch (error) {
			log.warn("Could not read sync checkpoint", error)
		}
		return 0
	}

	/**
	 * @param {number|string|Date} ts
	 * @returns {Promise<number>}
	 */
	async setCheckpoint(ts) {
		const millis = new Date(ts).getTime()
		await this.db.settings.put({
			key: CHECKPOINT_KEY,
			value: new Date(millis).toISOString(),
		})
		return millis
	}

	/**
	 * @param {number} [ts] - Defaults to now.
	 * @returns {Promise<number>}
	 */
	async markLastSync(ts = Date.now()) {
		await this.db.settings.put({
			key: LAST_SYNC_KEY,
			value: new Date(ts).toISOString(),
		})
		return ts
	}

	async getLastSync() {
		try {
			const row = await this.db.settings.get(LAST_SYNC_KEY)
			return row?.value || null
		} catch (error) {
			return null
		}
	}

	// --------------------------------------------------------------------
	// Sync queue
	// --------------------------------------------------------------------

	/**
	 * @param {string} entityType
	 * @param {string|number} entityId
	 * @param {"create"|"update"|"delete"} operation
	 * @param {Object} payload
	 * @returns {Promise<number>} The queue row id.
	 */
	async enqueue(entityType, entityId, operation, payload) {
		return this.db.syncQueue.add({
			entityType,
			entityId,
			operation,
			payload,
			createdAt: new Date(),
			attemptCount: 0,
			status: "pending",
		})
	}

	/**
	 * كتابة البيع الذرية — قلب "يعمل دون شبكة" (durable local write).
	 *
	 * معاملة Dexie واحدة فوق [invoices, payments, syncQueue, reservations,
	 * stock] تكتب: سجل الفاتورة + سطور الدفع + صف الطابور (بمنع التكرار)
	 * + تثبيت حجوزات الأصناف المعلومة + خصم مخزونها. انقطاع الكهرباء في
	 * أي لحظة يترك إما البيعَ كاملًا أو لا شيء — لا فاتورة بلا طابور
	 * (ضياع صامت عند المزامنة) ولا طابور بلا فاتورة (بيع شبح).
	 *
	 * الإعادة بنفس رقم الفاتورة (double-tap) تُعيد السجل الأصلي بدل
	 * التكرار: الفاتورة "الفوز الأول"، وصف الطابور يُحدَّث بأحدث حمولة.
	 *
	 * المخزون: تُثبَّت حجوزات الأصناف ذات المخزون المعلوم فقط ويُخصم
	 * مخزونها؛ الأصناف بلا صفوف مخزون (غير محدودة) تبقى حجوزاتها ACTIVE
	 * حتى انتهاء الصلاحية — الحارس الوحيد المتاح لها.
	 *
	 * @param {Object} doc
	 * @param {string} doc.entityType - نوع كيان الطابور ("invoice" | ...).
	 * @param {string} doc.entityId - رقم الفاتورة المحلي (مفتاح عدم التكرار).
	 * @param {string} [doc.operation="create"]
	 * @param {Object} doc.queuePayload - حمولة صف الطابور (تُرسل للمنصة).
	 * @param {Object} doc.invoice - سجل الدفتر المحلي { invoiceNo,
	 *   customerId, items:[{productId,code,name,qty,rate,discount,taxRate}],
	 *   total, paid, balance, date, terminalId, shiftId }.
	 * @param {Array} [doc.payments] - [{ method, amount, reference, date }].
	 * @param {Array} [doc.commitItems] - [{ itemId, qty }] أصناف معلومة
	 *   المخزون: تُثبَّت حجوزاتها ويُخصم مخزونها.
	 * @returns {Promise<{invoiceId: number, invoiceNo: string, queuedId: number, replayed: boolean}>}
	 */
	async enqueueInvoiceSale({
		entityType,
		entityId,
		operation = "create",
		queuePayload,
		invoice,
		payments = [],
		commitItems = [],
	}) {
		const invoiceNo = String(invoice?.invoiceNo || entityId || "").trim()
		if (!invoiceNo) throw new Error("رقم الفاتورة مطلوب للحفظ المحلي")
		const lines = Array.isArray(invoice?.items) ? invoice.items : []
		if (lines.length === 0) throw new Error("لا يمكن حفظ بيع بلا أصناف")
		const total = Number(invoice?.total)
		if (!Number.isFinite(total) || total < 0) {
			throw new Error("إجمالي الفاتورة غير صالح")
		}

		const database = this.db
		const runAtomic =
			typeof database.transaction === "function"
				? (fn) =>
						database.transaction(
							"rw",
							database.invoices,
							database.payments,
							database.syncQueue,
							database.reservations,
							database.stock,
							fn,
						)
				: // Test fakes without transactions (see repositories/base.js):
					// direct invocation, documented — never silent partial writes
					// in production, where Dexie always transacts.
					(fn) => fn()
		return runAtomic(async () => {
			// الفوز الأول: فاتورة بهذا الرقم تعني إعادة تشغيل مكررة.
			const existing = await database.invoices
				.where("invoiceNo")
				.equals(invoiceNo)
				.first()
			if (existing) {
				const queued = await upsertQueueRow(database, {
					entityType,
					entityId: invoiceNo,
					operation,
					payload: queuePayload,
				})
				return {
					invoiceId: existing.id,
					invoiceNo,
					queuedId: queued.id,
					replayed: true,
				}
			}

			const now = new Date()
			const nowIso = now.toISOString()
			const paid = Number(invoice.paid ?? 0)
			const balance = Number(invoice.balance ?? Math.max(0, total - paid))
			const invoiceId = await database.invoices.add({
				invoiceNo,
				customerId: invoice.customerId ?? null,
				status: balance <= 0 ? "COMPLETED" : "OPEN",
				items: lines.map((line) => ({
					productId: line.productId ?? line.item ?? line.id ?? null,
					code: line.code ?? null,
					name: line.name ?? "",
					qty: Number(line.qty ?? line.quantity ?? 0),
					rate: Number(line.rate ?? line.unitPrice ?? line.price ?? 0),
					discount: Number(line.discount ?? 0),
					taxRate: Number(line.taxRate ?? line.tax_rate ?? 0),
				})),
				total,
				paid,
				balance: Math.max(0, balance),
				date: invoice.date || nowIso,
				dueDate: invoice.dueDate || null,
				terminalId: invoice.terminalId || null,
				shiftId: invoice.shiftId || null,
				updatedAt: nowIso,
				syncedAt: null,
				syncStatus: "pending",
			})

			for (const [index, payment] of (payments || []).entries()) {
				const amount = Number(payment?.amount)
				if (!Number.isFinite(amount) || amount <= 0) continue
				const reference = String(
					payment?.reference ||
						`local:${invoiceNo}:${payment?.method || "cash"}:${index}`,
				).slice(0, 128)
				const prior = await database.payments
					.where("[invoiceId+reference]")
					.equals([invoiceId, reference])
					.first()
				if (prior) continue
				await database.payments.add({
					invoiceId,
					method: String(payment?.method || "cash").slice(0, 20),
					amount,
					date: payment?.date || nowIso,
					reference,
					updatedAt: nowIso,
					syncedAt: null,
					syncStatus: "pending",
				})
			}

			const queued = await upsertQueueRow(database, {
				entityType,
				entityId: invoiceNo,
				operation,
				tenantId,
				payload: queuePayload,
			})

			// تثبيت الحجوزات + خصم المخزون للأصناف المعلومة فقط.
			const wanted = new Map()
			for (const item of commitItems || []) {
				const id = String(item?.itemId ?? "")
				const qty = Number(item?.qty ?? 0)
				if (id && qty > 0) wanted.set(id, (wanted.get(id) || 0) + qty)
			}
			for (const [itemId, qty] of wanted) {
				const held = await database.reservations
					.where("[invoiceId+status]")
					.equals([invoiceNo, RESERVATION_STATUS.ACTIVE])
					.toArray()
				const mine = held.filter((row) => String(row.itemId) === itemId)
				if (mine.length > 0) {
					await database.reservations.bulkPut(
						mine.map((row) => ({
							...row,
							status: RESERVATION_STATUS.COMMITTED,
							committedAt: nowIso,
						})),
					)
				}
				let remaining = qty
				const batches = await database.stock
					.where("itemId")
					.equals(itemId)
					.toArray()
				batches.sort((a, b) => {
					const ea = a.expiryDate
						? new Date(a.expiryDate).getTime()
						: Number.POSITIVE_INFINITY
					const eb = b.expiryDate
						? new Date(b.expiryDate).getTime()
						: Number.POSITIVE_INFINITY
					if (ea !== eb) return ea - eb
					const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0
					const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0
					return ca - cb
				})
				const touched = []
				for (const batch of batches) {
					if (remaining <= 0) break
					const have = Number(batch.qty || 0)
					if (have <= 0) continue
					const take = Math.min(have, remaining)
					remaining -= take
					touched.push({ ...batch, qty: have - take })
				}
				if (touched.length > 0) {
					await database.stock.bulkPut(touched)
				}
				if (remaining > 0) {
					log.warn("Stock shortfall on local commit (race bounded)", {
						itemId,
						shortBy: remaining,
						invoiceNo,
					})
				}
			}

			return { invoiceId, invoiceNo, queuedId: queued.id, replayed: false }
		})
	}

	/**
	 * @param {string|null} [entityType] - Filter by entity type when provided.
	 * @returns {Promise<Array<Object>>} Pending operations, insertion order.
	 */
	async pendingOperations(entityType = null, tenantId = null) {
		const rows = entityType
			? await this.db.syncQueue.where("entityType").equals(entityType).toArray()
			: await this.db.syncQueue.where("status").equals("pending").toArray()
		const activeTenant = tenantId == null ? null : String(tenantId)
		return rows.filter(
			(row) =>
				row.status === "pending" &&
				activeTenant !== null &&
				row.tenantId != null &&
				String(row.tenantId) === activeTenant,
		)
	}

	/**
	 * @param {string|null} [entityType]
	 * @returns {Promise<number>}
	 */
	async getQueueCount(entityType = null, tenantId = null) {
		const rows = await this.pendingOperations(entityType, tenantId)
		return rows.length
	}

	/**
	 * كل الصفوف المفتوحة (pending/syncing/failed) — للعرض الصادق في
	 * مركز المزامنة: صف ميت (dead-letter) لا يظهر في pending لكنه لم
	 * يُزامَن بعد ويحتاج تدخلًا يدويًا، فإخفاؤه فقدانٌ صامت.
	 * @returns {Promise<Array<Object>>} مرتبة زمنيًا (FIFO).
	 */
	async openOperations() {
		const rows = await this.db.syncQueue
			.where("status")
			.anyOf(["pending", "syncing", "failed"])
			.toArray()
		return rows.sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		)
	}

	/**
	 * Queue lifecycle: pending → syncing → synced | failed | conflict(audit).
	 * `syncing` is set per-attempt so the UI never shows a stuck "pending"
	 * as in-flight, and a crash recovery resets it to pending on next push.
	 * @param {number} id - syncQueue row id.
	 */
	async markSyncing(id) {
		return this.db.syncQueue.update(id, {
			status: "syncing",
			lastAttempt: new Date(),
		})
	}

	/**
	 * @param {number} id - syncQueue row id.
	 * @param {string|null} [remoteRef] - Server-side reference on success.
	 */
	async markSynced(id, remoteRef = null) {
		return this.db.syncQueue.update(id, {
			status: "synced",
			syncedAt: new Date(),
			...(remoteRef ? { remoteRef } : {}),
		})
	}

	/**
	 * Permanent failure → dead-letter (failed). Validation rejections and
	 * exhausted retries land here; manual retry resets via pushLocalChange.
	 * Kept backward-compatible: markFailed(id, message) always fails.
	 * @param {number} id
	 * @param {string} message
	 */
	async markFailed(id, message) {
		const row = await this.db.syncQueue.get(id)
		return this.db.syncQueue.update(id, {
			status: "failed",
			lastError: message,
			lastAttempt: new Date(),
			nextRetryAt: null,
			attemptCount: (row?.attemptCount || 0) + 1,
		})
	}

	/**
	 * Transport/server failure → back to pending with exponential backoff.
	 * After 10 attempts the row dead-letters to failed AND writes an audit
	 * entry (a dead row must be visible in oversight, not just a status).
	 * Error recovery is manual via retryFailed(); sync failures never block
	 * the till.
	 * @param {number} id
	 * @param {string} message
	 */
	async markRetry(id, message) {
		const row = await this.db.syncQueue.get(id)
		const attemptCount = (row?.attemptCount || 0) + 1
		if (attemptCount >= 10) {
			await this.db.syncQueue.update(id, {
				status: "failed",
				dead: true,
				lastError: message,
				lastAttempt: new Date(),
				nextRetryAt: null,
				attemptCount,
			})
			await this.db.syncAudit.add({
				entityType: row?.entityType || "unknown",
				entityId: row?.entityId ?? null,
				localRev: row?.payload?._localRev ?? null,
				remoteRev: null,
				conflictType: "transport",
				resolution: "dead-letter",
				details: { message, attemptCount },
				createdDate: new Date(),
			})
			return
		}
		return this.db.syncQueue.update(id, {
			status: "pending",
			lastError: message,
			lastAttempt: new Date(),
			nextRetryAt: new Date(Date.now() + backoffMs(attemptCount)),
			attemptCount,
		})
	}

	/**
	 * Manual error recovery for a dead-lettered row: back to pending with a
	 * clean slate (attempts reset). The row's history stays in syncAudit.
	 * Non-destructive — any signed-in role may retry its own terminal queue.
	 * @param {number} id - syncQueue row id.
	 * @returns {Promise<boolean>} True when a failed row was reopened.
	 */
	async retryFailed(id) {
		const row = await this.db.syncQueue.get(id)
		if (!row || row.status !== "failed") return false
		await this.db.syncQueue.update(id, {
			status: "pending",
			dead: null,
			attemptCount: 0,
			nextRetryAt: null,
			lastError: null,
		})
		return true
	}

	/**
	 * Crash recovery: rows stuck in syncing return to pending (retryable).
	 *
	 * @returns {Promise<number>} how many rows were returned to `pending`.
	 * @throws if the queue cannot be read. A swallowed read error used to
	 *   answer `0` — indistinguishable from "nothing was stuck", so boot
	 *   recovery could report a clean queue over an unreadable one. Every
	 *   caller already runs this best-effort inside a try/catch
	 *   (`main.js`, `sync-core.js`), so the failure is reported, not hidden.
	 */
	async resetStuckSyncing() {
		const stuck = await this.db.syncQueue
			.where("status")
			.equals("syncing")
			.toArray()
		for (const row of stuck) {
			await this.db.syncQueue.update(row.id, { status: "pending" })
		}
		return stuck.length
	}

	// --------------------------------------------------------------------
	// Remote change application
	// --------------------------------------------------------------------

	/**
	 * Apply a remote change set for one entity type.
	 *
	 * Rules:
	 *  - Invalid rows (schema/validation) are dropped and audited, not fatal.
	 *  - A remote row older than the local copy is kept-local (audited as a
	 *    REMOTE_OLD conflict) — the local push wins in the next cycle.
	 *  - `change.deleted === true` removes the local row.
	 *
	 * @param {string} entityType
	 * @param {Array<Object>} changes - `{ id, data, updatedAt, deleted? }`
	 * @returns {Promise<{applied: Array, conflicts: Array}>}
	 */
	async applyRemoteChanges(entityType, changes = []) {
		const applied = []
		const conflicts = []

		for (const change of changes) {
			const data = change.data ?? change
			const id = change.id ?? change.entityId ?? data.id ?? data.entityId
			const entityKey = validationKeyFor(entityType)
			const tableName = tableFor(entityType)

			if (change.deleted === true) {
				if (id != null) {
					await this.db.table(tableName).delete(id)
				}
				applied.push({ id, deleted: true })
				continue
			}

			try {
				validateRemoteResponse(entityKey, data)
			} catch (error) {
				await this.audit({
					entityType,
					entityId: id ?? null,
					localRev: null,
					remoteRev: change.updatedAt ?? null,
					conflictType: "validation",
					resolution: "dropped",
					details: error.message,
				})
				log.warn(`Dropped invalid remote ${entityType} row`, error.message)
				continue
			}

			if (id != null) {
				const local = await this.getLocal(tableName, id)
				const localUpdatedAt = local?.updatedAt
					? new Date(local.updatedAt).getTime()
					: 0
				const remoteUpdatedAt = change.updatedAt
					? new Date(change.updatedAt).getTime()
					: 0

				if (local && localUpdatedAt > remoteUpdatedAt && remoteUpdatedAt > 0) {
					await this.recordConflict({
						entityType,
						entityId: id,
						localRev: local.updatedAt,
						remoteRev: change.updatedAt,
						conflictType: "REMOTE_OLD",
						resolution: "keep_local",
					})
					conflicts.push({ id, conflictType: "REMOTE_OLD" })
					continue
				}
			}

			await this.db.table(tableName).put({
				...data,
				id,
				syncedAt: change.updatedAt || new Date().toISOString(),
				syncStatus: "synced",
			})
			applied.push({ id, synced: true })
		}

		return { applied, conflicts }
	}

	/**
	 * @param {string} entityType
	 * @param {string|number} id
	 * @returns {Promise<Object|undefined>}
	 */
	async getLocal(entityType, id) {
		return this.db.table(entityType).get(id)
	}

	/**
	 * Delete a local record (used on remote tombstones / purges).
	 * @param {string} entityType
	 * @param {string|number} id
	 */
	async deleteLocal(entityType, id) {
		return this.db.table(entityType).delete(id)
	}

	// --------------------------------------------------------------------
	// Audit
	// --------------------------------------------------------------------

	/**
	 * Append an immutable audit entry (conflicts, drops, resolutions).
	 * @param {Object} entry
	 */
	async audit(entry) {
		return this.db.syncAudit.add({
			...entry,
			createdDate: new Date(),
		})
	}

	/**
	 * Record a conflict and its resolution strategy.
	 * @param {Object} opts
	 */
	async recordConflict({
		entityType,
		entityId,
		localRev,
		remoteRev,
		conflictType,
		resolution,
	}) {
		return this.audit({
			entityType,
			entityId,
			localRev,
			remoteRev,
			conflictType,
			resolution,
		})
	}

	/**
	 * Validate a payload before it goes onto the wire.
	 * @param {string} entityType
	 * @param {Object} payload
	 */
	validateForSync(entityType, payload) {
		validateBeforeSync(entityType, payload)
	}
}

const instance = new OfflineStore()

export default instance
