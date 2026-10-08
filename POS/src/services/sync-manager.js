/**
 * قائد المزامنة — يدير دورات المزامنة، حالة الاتصال، والإشعارات
 * وهو الواجهة الرئيسية التي يستهلكها الـ composables والواجهات.
 */

import {
	runSyncCycle,
	runInitialSync,
	getLastSyncCheckpoint,
} from "./sync-core.js"
import { upsertQueueRow } from "./offline-store.js"
import { getEffectiveToken, authState } from "./sync-auth.js"
import db from "./db.js"
import {
	isRetryable,
	SYNC_POLL_INTERVAL,
	CONNECTIVITY_CHECK_INTERVAL,
} from "./sync-error.js"
import { logger } from "@/utils/logger"
import {
	AUTO_TRIGGERS,
	getPollIntervalMs,
	isAutoAllowed,
	isLinkEnabled,
	subscribeLinkConsent,
} from "@/services/link-consent"

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
let consentWired = false

export function initSyncManager() {
	if (managerInitialized) return
	managerInitialized = true

	syncState.isOnline =
		typeof navigator !== "undefined" ? navigator.onLine : true

	if (typeof window === "undefined") return

	window.addEventListener("online", () => {
		syncState.isOnline = true
		// عودة الشبكة وحدها ليست طلبًا: الدفع الفوري فقط عندما يضبط
		// المستخدم المحرك على `auto` في المتغيرات العامة (ومعه الربط).
		if (!isAutoAllowed(AUTO_TRIGGERS.ON_RECONNECT)) return
		runSyncCycleSilently().catch(() => {})
		// إن لم تكتمل المزامنة الأولية من قبل — أكملها الآن
		ensureInitialSync().catch(() => {})
	})

	window.addEventListener("offline", () => {
		syncState.isOnline = false
	})

	// بدء حلقة الاستطلاع الدورية — فقط بموافقة ربط
	if (isLinkEnabled()) startPolling()

	// ربط الموافقة بالمحرك (مرة واحدة): منحها يشغّل، سحبها يوقف.
	if (!consentWired) {
		consentWired = true
		subscribeLinkConsent((mode) => {
			if (mode === "linked") {
				managerInitialized = true
				startPolling()
			} else {
				stopSyncManager()
				managerInitialized = false
			}
		})
	}
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
		// المؤقّت وحده ليس طلبًا: لا دورة إلا بوضع `auto` من المستخدم.
		if (!isAutoAllowed(AUTO_TRIGGERS.POLL)) return
		if (!syncState.isOnline || syncState.isSyncing || !getEffectiveToken())
			return
		runSyncCycleSilently().catch(() => {})
	}, getPollIntervalMs(SYNC_POLL_INTERVAL))

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
	// السحب الأولي التلقائي حركة شبكية: `force` طلب صريح (زر/إعداد)،
	// وغيره يحتاج وضع `auto` من المستخدم مع الربط.
	if (!force && !isAutoAllowed(AUTO_TRIGGERS.INITIAL_PULL)) return null

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

		const queue = authState.tenantId
			? await db.syncQueue
					.where("[tenantId+status]")
					.equals([String(authState.tenantId), "pending"])
					.count()
			: 0
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
 *
 * CANONICAL WRITE PATH (v1.28+): every local mutation on the sale path
 * (`session.submitSale`, delivery orders, drivers) funnels through here into
 * `syncQueue` (Dexie "DyPOS-Offline-v1"). The legacy `invoice_queue`
 * (`utils/offline/*`) takes no new sale writes; its drain
 * (`syncOfflineInvoices`, via the Sync Center destinations flow) stays live
 * for branch/cloud pushes. Do not introduce a third queue.
 */
export async function pushLocalChange(
	entityType,
	entityId,
	operation,
	payload,
) {
	const tenantId = authState.tenantId || payload?._tenantId || payload?.tenantId || null
	if (!tenantId) {
		throw new Error("لا يمكن إضافة عملية للمزامنة قبل تثبيت هوية المشترك")
	}
	const scopedPayload = {
		...payload,
		_tenantId: String(tenantId),
	}
	// منع التكرار من المصدر عبر القاعدة الوحيدة في offline-store.js:
	// الضغطة المزدوجة أو إعادة المحاولة بعد نجاح الحفظ المحلي تُحدِّث
	// الصف المعلق بدل إنشاء فاتورة ثانية.
	const { id, updated } = await upsertQueueRow(db, {
		entityType,
		entityId: String(entityId),
		operation,
		tenantId: String(tenantId),
		payload: scopedPayload,
	})
	if (!updated) {
		// زيادة عد التغييرات منذ الأخير
		syncState.sinceLastOnlineChanges++
	}

	maybeImmediatePush()

	return { ok: true, queued: true }
}

/**
 * الدفع الفوري عند الطلب الضمني (بيع مكتمل للتو): يعمل فقط بوضع `auto`
 * من المستخدم (مع الربط) — وإلا تبقى العملية في الطابور المحلي حتى
 * «مزامنة الآن». مستخرج كدالة لأن الكتابة الذرية للبيع
 * (OfflineStore.enqueueInvoiceSale) تكتب صف الطابور بنفسها عبر
 * القاعدة المشتركة بدل المرور عبر pushLocalChange.
 */
export function maybeImmediatePush() {
	if (
		isAutoAllowed(AUTO_TRIGGERS.PUSH_IMMEDIATE) &&
		syncState.isOnline &&
		getEffectiveToken()
	) {
		runSyncCycleSilently().catch(() => {})
	}
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
	maybeImmediatePush,
	getSyncStatus,
	resetPendingChangesCount,
}
