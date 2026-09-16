/**
 * SyncCore — the sync cycle engine.
 *
 * One cycle:  authenticate → pull changes since the last checkpoint →
 *              push pending local changes → advance the checkpoint.
 *
 * Pull and push are independent (allSettled): a failed push must not block a
 * new checkpoint, and a failed pull must not abandon pending writes. Non-
 * retryable failures surface as SyncError to the sync manager, which drives
 * retry/backoff and the UI state.
 */

import SyncProtocol from "./sync-protocol.js"
import { getValidToken, authState } from "./sync-auth.js"
import { SyncError, SyncErrorKind } from "./sync-error.js"
import { validateBeforeSync } from "./sync-validator.js"
import OfflineStore from "./offline-store.js"
import { logger } from "@/utils/logger"

const log = logger.create("SyncCore")

/** حجم الصفحة الافتراضي للمزامنة الأولية المجزأة (صف لكل طلب). */
export const INITIAL_SYNC_PAGE_SIZE = 500
/** حد أمان أقصى لعدد صفحات المزامنة الأولية لتفادي الحلقات اللانهائية. */
export const INITIAL_SYNC_MAX_PAGES = 200

/**
 * أولوية دفع العمليات إلى الخادم — الأقل رقمًا يُدفع أولًا.
 * الفواتير والدفعات قبل العملاء والأصناف والإعدادات، لضمان وصول
 * الإيراد الحقيقي أولًا (مبدأ SAP: أولوية المستندات المالية).
 */
const PUSH_PRIORITY = {
	invoice: 0,
	invoices: 0,
	payment: 1,
	payments: 1,
	stock: 2,
	customer: 3,
	customers: 3,
	item: 4,
	items: 4,
	session: 5,
	sessions: 5,
	settings: 6,
}

/**
 * @param {string} entityType
 * @returns {number}
 */
export function pushPriorityFor(entityType) {
	return PUSH_PRIORITY[entityType] ?? 9
}

let protocolOverride = null

/**
 * Injection point for tests / alternate transports.
 * @param {SyncProtocol|null} protocol
 */
export function setProtocolOverride(protocol) {
	protocolOverride = protocol
}

function getProtocol() {
	if (protocolOverride) return protocolOverride
	return new SyncProtocol({ tokenProvider: getValidToken })
}

let defaultStore = OfflineStore

/**
 * Injection point for tests (in-memory store).
 * @param {Object|null} store
 */
export function setStoreOverride(store) {
	defaultStore = store || OfflineStore
}

/**
 * @returns {Promise<number>} Epoch-ms checkpoint of the last successful pull.
 */
export async function getLastSyncCheckpoint() {
	const store = defaultStore
	return store.getCheckpoint()
}

/**
 * @returns {Promise<string|null>} ISO timestamp of the last successful cycle.
 */
export async function getLastSyncTimestamp() {
	const store = defaultStore
	return store.getLastSync()
}

/**
 * Pull remote changes since the checkpoint and apply them locally.
 * @param {SyncProtocol} protocol
 * @param {Object} store
 * @param {number} checkpoint
 * @param {Object} [opts]
 * @param {boolean} [opts.full=false] - Ignore the checkpoint (initial sync).
 * @returns {Promise<{count: number, conflicts: Array, serverTime: number}>}
 */
export async function pullChanges(protocol, store, checkpoint, opts = {}) {
	const result = await protocol.get("/api/sync/pull", {
		since: opts.full ? 0 : checkpoint || 0,
		system_id: authState.tenantId || "DYPOS",
		device_id: authState.employeeId || "",
	})

	const changes = result?.changes ?? result?.entities ?? result?.data ?? []
	const byEntity = {}
	for (const change of changes) {
		const entityType = change.entityType || change.entity_type
		if (!entityType) continue
		if (!byEntity[entityType]) byEntity[entityType] = []
		byEntity[entityType].push(change)
	}

	let count = 0
	const conflicts = []
	for (const [entityType, rows] of Object.entries(byEntity)) {
		const outcome = await store.applyRemoteChanges(entityType, rows)
		count += outcome.applied.length
		conflicts.push(...outcome.conflicts)
	}

	// Server-supplied tick for the next pull; local fallback otherwise.
	const serverTime = result?.server_time || result?.checkpoint || Date.now()

	return { count, conflicts, serverTime }
}

/**
 * Push pending local operations, validating and resolving conflicts per row.
 * @param {SyncProtocol} protocol
 * @param {Object} store
 * @param {Object} [opts]
 * @param {string|null} [opts.entityType] - Restrict to one entity type.
 * @returns {Promise<{pushed: number, conflicts: number}>}
 */
export async function pushPendingChanges(protocol, store, opts = {}) {
	const pending = await store.pendingOperations(opts.entityType || null)

	// ترتيب الأولوية: الفواتير أولًا ثم الدفعات ... ثم الإعدادات —
	// وداخل نفس الأولوية حسب وقت الإنشاء (FIFO).
	pending.sort((a, b) => {
		const byPriority =
			pushPriorityFor(a.entityType) - pushPriorityFor(b.entityType)
		if (byPriority !== 0) return byPriority
		return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
	})

	let pushed = 0
	let conflicts = 0

	for (const op of pending) {
		const payload = op.payload || {}

		try {
			validateBeforeSync(op.entityType, payload)
		} catch (error) {
			// Permanently broken local data — never retry. Keep auditing.
			log.warn(
				`Rejected ${op.operation} for ${op.entityType}:${op.entityId}`,
				error.message,
			)
			await store.audit({
				entityType: op.entityType,
				entityId: op.entityId,
				localRev: payload._localRev ?? null,
				remoteRev: null,
				conflictType: "validation",
				resolution: "failed",
				details: error.message,
			})
			await store.markFailed(op.id, error.message)
			continue
		}

		try {
			const result = await protocol.post("/api/sync/push", {
				system_id: authState.tenantId || "DYPOS",
				entity_type: op.entityType,
				entity_id: op.entityId,
				operation: op.operation,
				payload,
				local_rev: payload._localRev ?? null,
				idempotency_key: op.idempotencyKey || `op:${op.id}:${op.createdAt}`,
			})
			await store.markSynced(
				op.id,
				result?.remote_id || result?.id || op.entityId,
			)
			pushed += 1
		} catch (error) {
			if (error?.kind === SyncErrorKind.REMOTE_CONFLICT) {
				// Server has a divergent copy — record it, auto-prefer the
				// newer revision, and stop retrying this row.
				await store.recordConflict({
					entityType: op.entityType,
					entityId: op.entityId,
					localRev: payload._localRev ?? null,
					remoteRev: error.details?.remote_rev ?? null,
					conflictType: error.details?.conflictType || "REMOTE_CONFLICT",
					resolution: "auto_prefer_newer",
				})
				await store.markSynced(op.id, op.entityId)
				conflicts += 1
				continue
			}

			// Local validation is handled above; everything else here is a
			// transport / server issue → abort the push, retry later.
			throw error
		}
	}

	return { pushed, conflicts }
}

/**
 * المزامنة الأولية المجزأة (Chunked Initial Sync).
 *
 * الكتالوجات الضخمة (عشرات آلاف الأصناف) لا تُجلب بطلب واحد — نطلب صفحة
 * صفحة (since=0 + cursor/limit)، نطبّق كل صفحة محليًا فور وصولها، ونبلّغ
 * الواجهة بالتقدم عبر onProgress. لا تجميد، ولا استهلاك ذاكرة متفجر،
 * وإمكانية الاستئناف من نقطة التفتيش عند الانقطاع.
 *
 * عقد الخادم: `GET /api/sync/pull` يقبل `{ since, limit, cursor, page }`
 * ويعيد `{ changes, has_more?, next_cursor?, server_time? }`.
 *
 * @param {Object} [opts]
 * @param {SyncProtocol} [opts.protocol]
 * @param {Object} [opts.store]
 * @param {number} [opts.pageSize]
 * @param {number} [opts.maxPages]
 * @param {Function} [opts.onProgress] - ({ applied, pages, pageApplied, conflicts })
 * @returns {Promise<{applied: number, conflicts: number, pages: number, serverTime: number|null}>}
 */
export async function runInitialSync({
	protocol = getProtocol(),
	store = defaultStore,
	pageSize = INITIAL_SYNC_PAGE_SIZE,
	maxPages = INITIAL_SYNC_MAX_PAGES,
	onProgress,
} = {}) {
	let cursor = 0
	let applied = 0
	let conflicts = 0
	let pages = 0
	let serverTime = null

	for (let page = 0; page < maxPages; page++) {
		const result = await protocol.get("/api/sync/pull", {
			since: 0,
			limit: pageSize,
			page,
			...(cursor ? { cursor } : {}),
			system_id: authState.tenantId || "DYPOS",
			device_id: authState.employeeId || "",
		})

		const changes = result?.changes ?? result?.entities ?? result?.data ?? []
		const byEntity = {}
		for (const change of changes) {
			const entityType = change.entityType || change.entity_type
			if (!entityType) continue
			if (!byEntity[entityType]) byEntity[entityType] = []
			byEntity[entityType].push(change)
		}

		let pageApplied = 0
		for (const [entityType, rows] of Object.entries(byEntity)) {
			const outcome = await store.applyRemoteChanges(entityType, rows)
			pageApplied += outcome.applied.length
			conflicts += outcome.conflicts.length
		}
		applied += pageApplied
		pages += 1

		// نقطة التفتيش من الخادم فقط — لا نستخدم توقيت الجهاز المحلي
		// كمرجع للمزامنة (ساعات الأجهزة غير موثوقة).
		const explicitServerTime = result?.server_time ?? result?.checkpoint ?? null
		if (explicitServerTime != null) serverTime = explicitServerTime

		if (typeof onProgress === "function") {
			onProgress({ applied, pages, pageApplied, conflicts })
		}

		const hasMore = result?.has_more ?? changes.length >= pageSize
		cursor = result?.next_cursor ?? result?.cursor ?? serverTime ?? cursor
		if (!hasMore || changes.length === 0) break
	}

	// لا نُقدّم نقطة التفتيش إلا بتقدّم حقيقي وبتوقيت خادم موثوق.
	if (pages > 0 && serverTime != null) {
		await store.setCheckpoint(serverTime)
		await store.markLastSync()
	}

	log.debug("Initial (chunked) sync completed", { applied, conflicts, pages })

	return { applied, conflicts, pages, serverTime }
}

/**
 * Run a full sync cycle.
 * @param {Object} [opts]
 * @param {SyncProtocol} [opts.protocol]
 * @param {Object} [opts.store]
 * @param {boolean} [opts.full=false]
 * @returns {Promise<{pulled: number, pushed: number, conflicts: number, checkpoint: number, pullError: *, pushError: *}>}
 */
export async function runSyncCycle({
	protocol = getProtocol(),
	store = defaultStore,
	full = false,
} = {}) {
	const token = await getValidToken()
	if (!token) {
		throw new SyncError(
			SyncErrorKind.AUTH_REQUIRED,
			"لا توجد مصادقة منصة صالحة لتشغيل دورة المزامنة.",
		)
	}

	const checkpoint = full ? 0 : await store.getCheckpoint()

	const [pullResult, pushResult] = await Promise.allSettled([
		pullChanges(protocol, store, checkpoint, { full }),
		pushPendingChanges(protocol, store),
	])

	const pullError = pullResult.status === "rejected" ? pullResult.reason : null
	const pushError = pushResult.status === "rejected" ? pushResult.reason : null

	// Auth-layer failures abort the cycle entirely.
	const authKinds = new Set([
		SyncErrorKind.AUTH_REQUIRED,
		SyncErrorKind.AUTH_REVOKED,
		SyncErrorKind.AUTH_EXPIRED,
	])
	for (const error of [pullError, pushError]) {
		if (error?.kind && authKinds.has(error.kind)) {
			throw error
		}
	}

	// Nothing made progress at all and both sides failed → surface the error.
	if (pullResult.status === "rejected" && pushResult.status === "rejected") {
		throw pullError?.kind ? pullError : pullError || pushError
	}

	// Advance the checkpoint using the freshest known server tick.
	const serverTime =
		pullResult.status === "fulfilled" ? pullResult.value.serverTime : Date.now()
	await store.setCheckpoint(serverTime)
	await store.markLastSync()

	const pulled = pullResult.status === "fulfilled" ? pullResult.value.count : 0
	const conflicts =
		(pullResult.status === "fulfilled"
			? pullResult.value.conflicts.length
			: 0) +
		(pushResult.status === "fulfilled" ? pushResult.value.conflicts : 0)

	log.debug("Sync cycle completed", {
		pulled,
		pushed: pushResult.status === "fulfilled" ? pushResult.value.pushed : 0,
		conflicts,
		checkpoint: serverTime,
	})

	return {
		pulled,
		pushed: pushResult.status === "fulfilled" ? pushResult.value.pushed : 0,
		conflicts,
		checkpoint: serverTime,
		pullError,
		pushError,
	}
}

export default {
	runSyncCycle,
	runInitialSync,
	getLastSyncCheckpoint,
	getLastSyncTimestamp,
	pullChanges,
	pushPendingChanges,
	pushPriorityFor,
	setProtocolOverride,
	setStoreOverride,
}
