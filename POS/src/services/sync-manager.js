/**
 * قائد المزامنة — يدير دورات المزامنة، حالة الاتصال، والإشعارات
 * وهو الواجهة الرئيسية التي يستهلكها الـ composables والواجهات.
 */

import {
	runSyncCycle,
	runInitialSync,
	getLastSyncCheckpoint,
} from "./sync-core.js"
import { getEffectiveToken } from "./sync-auth.js"
import db from "./db.js"
import {
	isRetryable,
	SYNC_POLL_INTERVAL,
	CONNECTIVITY_CHECK_INTERVAL,
} from "./sync-error.js"
import { logger } from "@/utils/logger"

const log = logger.create("SyncManager")

/**
 * حالة المزامنة المعروضة للواجهة
 */
export const syncState = {
	isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
	isSyncing: false,
	lastSyncAt: null,
	pendingCount: 0,
	error: null,
	errorKind: null,
	sinceLastOnlineChanges: 0,
	/** تقدم المزامنة الأولية المجزأة (كتالوجات ضخمة). */
	initialSync: { active: false, applied: 0, pages: 0, error: null },
}

/**
 * البدء — تهيئة الحالة والمستمعات (idempotent: استدعاءات متعددة آمنة)
 */
let managerInitialized = false

export function initSyncManager() {
	if (managerInitialized) return
	managerInitialized = true

	syncState.isOnline =
		typeof navigator !== "undefined" ? navigator.onLine : true

	if (typeof window === "undefined") return

	window.addEventListener("online", () => {
		syncState.isOnline = true
		// محاولة مزامنة فورية عند العودة للشبكة
		runSyncCycleSilently().catch(() => {})
		// إن لم تكتمل المزامنة الأولية من قبل — أكملها الآن
		ensureInitialSync().catch(() => {})
	})

	window.addEventListener("offline", () => {
		syncState.isOnline = false
	})

	// بدء حلقة الاستطلاع الدورية
	startPolling()
}

/**
 * الحلقة الدورية — كل 15 ثانية تتحقق مما إذا كان يتعين مزامنة
 */
let pollingInterval = null
let connectivityCheckInterval = null

function startPolling() {
	if (pollingInterval) clearInterval(pollingInterval)
	if (connectivityCheckInterval) clearInterval(connectivityCheckInterval)

	connectivityCheckInterval = setInterval(() => {
		syncState.isOnline =
			typeof navigator !== "undefined" ? navigator.onLine : true
	}, CONNECTIVITY_CHECK_INTERVAL)

	pollingInterval = setInterval(() => {
		if (!syncState.isOnline || syncState.isSyncing || !getEffectiveToken())
			return
		runSyncCycleSilently().catch(() => {})
	}, SYNC_POLL_INTERVAL)

	// المزامنة الأولية المجزأة عند أول تشغيل (نقطة تفتيش = 0)
	ensureInitialSync().catch(() => {})
}

/**
 * المزامنة الأولية المجزأة — تعمل مرة واحدة عند أول إعداد للطرفية
 * (نقطة التفتيش = 0) أو قسرًا عبر force=true. تجلب الكتالوج صفحة صفحة
 * مع تحديث التقدم في syncState.initialSync للواجهة.
 * @param {boolean} [force=false]
 * @returns {Promise<Object|null>} نتيجة المزامنة أو null إذا لم تكن مطلوبة.
 */
let initialSyncRunning = false

export async function ensureInitialSync(force = false) {
	if (initialSyncRunning) return null
	if (!syncState.isOnline || !getEffectiveToken()) return null

	const checkpoint = await getLastSyncCheckpoint()
	if (checkpoint > 0 && !force) return null

	initialSyncRunning = true
	syncState.initialSync = { active: true, applied: 0, pages: 0, error: null }

	try {
		const result = await runInitialSync({
			onProgress: (progress) => {
				syncState.initialSync.applied = progress.applied
				syncState.initialSync.pages = progress.pages
			},
		})
		syncState.initialSync.active = false
		return result
	} catch (error) {
		syncState.initialSync.active = false
		syncState.initialSync.error = error.message || String(error)
		throw error
	} finally {
		initialSyncRunning = false
	}
}

/**
 * إيقاف الحلقة (عند logout أو unregister)
 */
export function stopSyncManager() {
	managerInitialized = false
	if (pollingInterval) clearInterval(pollingInterval)
	if (connectivityCheckInterval) clearInterval(connectivityCheckInterval)
	pollingInterval = null
	connectivityCheckInterval = null
}

/**
  تشغيل دورة مزامنة مع إ_update syncState
 */
export async function runSyncCycleSilently() {
	syncState.isSyncing = true
	syncState.error = null
	syncState.errorKind = null

	try {
		const result = await runSyncCycle()
		syncState.isSyncing = false
		syncState.lastSyncAt = new Date()

		const queue = await db.syncQueue.where("status").equals("pending").count()
		syncState.pendingCount = queue

		return result
	} catch (e) {
		syncState.isSyncing = false
		syncState.error = e.message || String(e)
		syncState.errorKind = e.kind || null

		if (!isRetryable(e.kind)) {
			// أخطاء غير قابلة لإعادة المحاولة (AUTH_REVOKED) — نوقف الحلقة مؤقتًا
			// حتى يعيد المستخدم تسجيل الدخول
		}

		throw e
	}
}

/**
 * دفع عملية للمزامنة فورًا (يتم إضافتها للـ queue ثم تُعالج بالدورة)
 */
export async function pushLocalChange(
	entityType,
	entityId,
	operation,
	payload,
) {
	// إضافة للـ queue
	await db.syncQueue.add({
		entityType,
		entityId,
		operation,
		payload: {
			...payload,
			_localRev: Date.now().toString(),
			_localUpdatedAt: new Date().toISOString(),
		},
		createdAt: new Date(),
		attemptCount: 0,
		status: "pending",
	})

	// زيادة عد التغييرات منذ الأخير
	syncState.sinceLastOnlineChanges++

	// إذا كنت متصلًا، حاول تشغيل الدورة فورًا بدل الانتظار
	if (syncState.isOnline && getEffectiveToken()) {
		runSyncCycleSilently().catch(() => {})
	}

	return { ok: true, queued: true }
}

/**
 * حالة مزامنة بسيطة للواجهة
 */
export async function getSyncStatus() {
	const [queueCount, lastSync] = await Promise.all([
		db.syncQueue.where("status").equals("pending").count(),
		db.settings.get("lastSyncTimestamp"),
	])

	return {
		isOnline: syncState.isOnline,
		isSyncing: syncState.isSyncing,
		pendingCount: queueCount,
		lastSyncAt: lastSync ? new Date(lastSync.value) : null,
		error: syncState.error,
		errorKind: syncState.errorKind,
		sinceLastOnlineChanges: syncState.sinceLastOnlineChanges,
		initialSync: { ...syncState.initialSync },
	}
}

/**
 * إعادة ضبط العداد بعد نجاح المزامنة
 */
export function resetPendingChangesCount() {
	syncState.sinceLastOnlineChanges = 0
}

export default {
	syncState,
	initSyncManager,
	stopSyncManager,
	runSyncCycleSilently,
	ensureInitialSync,
	pushLocalChange,
	getSyncStatus,
	resetPendingChangesCount,
}
