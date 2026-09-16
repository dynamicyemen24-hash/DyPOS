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
}

const ENTITY_VALIDATION_KEYS = {
	customers: "customer",
	items: "item",
	invoices: "invoice",
	payments: "payment",
	sessions: "session",
	dailyReports: "dailyReport",
}

function tableFor(entityType) {
	return ENTITY_TABLES[entityType] || entityType
}

function validationKeyFor(entityType) {
	return ENTITY_VALIDATION_KEYS[entityType] || entityType
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
	 * @param {string|null} [entityType] - Filter by entity type when provided.
	 * @returns {Promise<Array<Object>>} Pending operations, insertion order.
	 */
	async pendingOperations(entityType = null) {
		if (entityType) {
			const rows = await this.db.syncQueue
				.where("entityType")
				.equals(entityType)
				.toArray()
			return rows.filter((row) => row.status === "pending")
		}
		return this.db.syncQueue.where("status").equals("pending").toArray()
	}

	/**
	 * @param {string|null} [entityType]
	 * @returns {Promise<number>}
	 */
	async getQueueCount(entityType = null) {
		const rows = await this.pendingOperations(entityType)
		return rows.length
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
	 * @param {number} id
	 * @param {string} message
	 */
	async markFailed(id, message) {
		const row = await this.db.syncQueue.get(id)
		return this.db.syncQueue.update(id, {
			status: "failed",
			lastError: message,
			lastAttempt: new Date(),
			attemptCount: (row?.attemptCount || 0) + 1,
		})
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
