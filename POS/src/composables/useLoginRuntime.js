/**
 * =============================================================================
 * useLoginRuntime.js — بيئة تشغيل شاشة الدخول
 * =============================================================================
 * كل ما تحتاجه شاشة الدخول عن بيئة التشغيل قبل أن يستطيع المستخدم
 * تسجيل الدخول: اكتشاف الاتصال، تهيئة CSRF، تشغيل محرّك عدم الاتصال،
 * وتحديد الجاهزية النهائية.
 *
 * لماذا composable منفصل؟
 * -----------------------------------------------------------------------------
 * كان هذا المنطق (نحو 250 سطرًا) مكدّسًا داخل pages/Login.vue بلا فائدة تُذكر:
 * الصفحة كانت تملك كل شيء، ولا شيء منها قابل للاختبار وحده. الفصل هنا يجعله
 * قابلًا للاختبار مباشرة (انظر tests/loginRuntime.test.js).
 *
 * المفصل الذي ألزم هذا الفصل: الملف كان يستدعي log.info() وisBrowser
 * وloginRateLimiter — ولا شيء منها معرَّف في Login.vue. أي مسار يقترب
 * من اكتشاف وضع عدم الاتصال كان يرمي ReferenceError عند أول استخدام.
 * الأسماء الثلاثة معرَّفة هنا، مرة واحدة، في مكانها الصحيح.
 * =============================================================================
 */
import { computed, ref } from "vue"

import { logger } from "@/utils/logger"
import { ensureCSRFToken } from "@/utils/csrf"
import { offlineWorker } from "@/utils/offline/workerClient"
import { sanitizeForInput } from "@/utils/securityHardening"
import { enhancedLoginRateLimiter } from "@/utils/rateLimiterEnhanced"
import { userRepository } from "@/repositories/userRepository"
import { session } from "@/stores/session"
import { isLinkEnabled } from "@/services/link-consent"

const log = logger.create("LoginRuntime")

/** حارس SSR/الاختبارات — نفس العقد المستعمل في `main.js` و`Register.vue`. */
const isBrowser =
	typeof window !== "undefined" && typeof document !== "undefined"

/** الاسم الوحيد لمستأجر limiter المستعمل في كل مسار تسجيل الدخول. */
export const loginRateLimiter = enhancedLoginRateLimiter

/**
 * يهيّئ محرّكات العمل دون اتصال (Dexie، ترقيم الفواتير، حجز المخزون،
 * طابور المزامنة). كل استيراد ديناميكي ومُحاط بـ catch: فشل طبقة عدم الاتصال
 * **لا يمنع** تسجيل الدخول ما دام الشبكة متاحة.
 */
async function initializeOfflineSystems() {
	if (!isBrowser) return

	try {
		log.info("Initializing offline systems...")

		const db = await import("@/services/db").then((m) => m.default)
		await db.open().catch((error) => {
			log.warn("Offline DB open failed", error)
		})

		await import("@/services/offline-numbering").catch((error) => {
			log.warn("Offline numbering init failed", error)
		})

		await import("@/services/stock-reservations").catch((error) => {
			log.warn("Local stock reservations init failed", error)
		})

		await import("@/services/offline-store").catch((error) => {
			log.warn("Offline store init failed", error)
		})

		log.info("Offline systems initialized")
	} catch (error) {
		log.error("Offline systems initialization failed", error)
	}
}

/**
 * يشغّل الـ worker إن توفّر له initializer بأي من الأشكال الثلاثة المعروفة
 * (دالة / `initialize()` / `init()`). غياب initializer معروف ليس فشلًا.
 */
async function initializeOfflineWorker() {
	if (!offlineWorker) return

	if (typeof offlineWorker === "function") {
		await offlineWorker()
		return
	}

	if (typeof offlineWorker.initialize === "function") {
		await offlineWorker.initialize()
		return
	}

	if (typeof offlineWorker.init === "function") {
		await offlineWorker.init()
	}
}

/**
 * يحدّد وضع عدم الاتصال من الحالة المحلية فقط — بلا أي فحص شبكي.
 *
 * القرار القديم كان يـping الخادم في كل مرة: اتصال بسيرفر آخر دون أن
 * يطلبه المستخدم. العقد الجديد (standalone-first): مستقل دائمًا حتى
 * يطلب المستخدم الربط (دخول سيرفر، مزامنة الآن، مفتاح الربط)، فتُمنح
 * الموافقة عبر services/link-consent. قابلية وصول السيرفر تُتعلم من
 * الطلب نفسه — الفشل يعني الوضع المحلي، لا عائق أبدًا.
 *
 * @returns {Promise<boolean>} true = وضع عدم الاتصال (مستقل)
 */
export async function detectOfflineMode() {
	if (!isBrowser) return false

	return !isLinkEnabled()
}

/**
 * تسجيل دخول محلي عبر مستودع المستخدمين (Dexie) — بلا شبكة إطلاقًا.
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function attemptLocalLogin(email, password) {
	const result = await userRepository.authenticate(email, password)
	if (!result.success) return result

	const user = result.user
	session.user = user.email

	try {
		localStorage.setItem(
			"dypos_user_session",
			JSON.stringify({
				email: user.email,
				full_name: user.full_name,
				user_id: user.id,
				role: user.role,
				loginTime: Date.now(),
			}),
		)
	} catch (error) {
		// التخزين ممتلئ أو غير متاح: الجلسة تعمل في الذاكرة فقط.
		log.warn("Offline session persistence failed", error)
	}

	log.info("Offline login successful for:", user.email)
	return { success: true, user }
}

/**
 * @param {{ showOfflineReadiness?: boolean }} [options]
 */
export function useLoginRuntime(options = {}) {
	const { showOfflineReadiness = true } = options

	/** idle | preparing | ready | degraded | failed */
	const runtimeState = ref("idle")
	const runtimeError = ref(null)
	const runtimeMessage = ref("")

	const csrfReady = ref(false)
	const offlineReady = ref(false)
	const sessionReady = ref(false)

	const isOfflineMode = ref(false)
	const offlineDetected = ref(false)
	const isOnline = ref(isBrowser ? navigator.onLine : true)

	/** يمنع تكرار التهيئة: استدعاءان متزامنان يتشاركان وعدًا واحدًا. */
	let runtimePromise = null

	const rateLimitState = computed(() => loginRateLimiter.getState())
	const isRateLimited = computed(() => !rateLimitState.value.allowed)

	const isRuntimeReady = computed(
		() =>
			// Standalone-first: الدخول المحلي لا يحتاج CSRF (مصافحة سيرفر).
			// اشتراطه كان سيحجب الكاشير المستقل خلف طلب لم يطلبه.
			(csrfReady.value || !isLinkEnabled()) &&
			sessionReady.value &&
			(offlineReady.value || !showOfflineReadiness),
	)

	const setRuntimeState = (state, message = "") => {
		runtimeState.value = state
		runtimeMessage.value = message
	}

	/**
	 * يهيّئ ما يمكن تهيئته. لا يرمي أبدًا — الفشل حالة معروضة لا استثناء
	 * عابر، لأن المستخدم يرى الرسالة ويستطيع إعادة المحاولة.
	 * @returns {Promise<void>}
	 */
	async function prepareRuntime() {
		if (runtimePromise) return runtimePromise

		runtimePromise = (async () => {
			setRuntimeState("preparing")

			try {
				// Standalone-first: مصافحة CSRF اتصال سيرفر — تُطلب فقط
				// بموافقة ربط. الدخول المحلي يكتمل بدونها.
				if (!isLinkEnabled()) {
					csrfReady.value = false
					log.debug("Standalone — CSRF handshake deferred to demand")
				} else {
					try {
						await ensureCSRFToken()
						csrfReady.value = true
					} catch (error) {
						csrfReady.value = false
						log.warn("DyPOS runtime: CSRF preparation failed", error)

						if (!isOnline.value) {
							setRuntimeState(
								"degraded",
								"سيتم استكمال التجهيز عند عودة الاتصال.",
							)
							return
						}
						throw error
					}
				}

				if (showOfflineReadiness) {
					try {
						await initializeOfflineWorker()
						offlineReady.value = true
					} catch (error) {
						offlineReady.value = false
						log.warn(
							"DyPOS runtime: offline worker initialization failed",
							error,
						)

						setRuntimeState(
							"degraded",
							isOnline.value
								? "الاتصال متاح، لكن التشغيل دون اتصال لم يكتمل."
								: "الاتصال غير متاح حاليًا.",
						)
						return
					}
				} else {
					offlineReady.value = true
				}

				setRuntimeState("ready", "بيئة التشغيل جاهزة.")
			} catch (error) {
				setRuntimeState("failed", "تعذر تجهيز البيئة الآمنة لتسجيل الدخول.")
				runtimeError.value = error
				log.error("DyPOS runtime preparation failed", error)
			}
		})()

		try {
			await runtimePromise
		} finally {
			runtimePromise = null
		}
	}

	/**
	 * مصافحة السيرفر لطلب صريح (ضغطة دخول سيرفر): تُستدعى فقط عندما
	 * يطلب المستخدم السيرفر فعلًا، لا عند عرض الشاشة. الفشل يرمي
	 * ليحوّله مسار الدخول إلى رسالة عربية.
	 * @returns {Promise<void>}
	 */
	async function prepareServerDemand() {
		await ensureCSRFToken()
		csrfReady.value = true
	}

	/**
	 * يحدّد وضع الاتصال ويهيّئ محرّكات عدم الاتصال عند الحاجة.
	 * @returns {Promise<boolean>} true = وضع عدم الاتصال
	 */
	async function detectAndSetOfflineMode() {
		isOfflineMode.value = await detectOfflineMode()
		offlineDetected.value = true

		if (isOfflineMode.value) {
			log.info("OFFLINE MODE: Enabling offline login")
			await initializeOfflineSystems()
		} else {
			log.info("ONLINE MODE: Backend reachable")
		}

		return isOfflineMode.value
	}

	/** يُستدعى من مستمعي `online`/`offline` على `window`. */
	function handleOnline() {
		isOnline.value = true
		if (runtimeState.value === "degraded") {
			void prepareRuntime()
		}
	}

	function handleOffline() {
		isOnline.value = false
		if (!session.isLoggedIn) {
			setRuntimeState(
				"degraded",
				"لا يوجد اتصال حاليًا. سيتم التحقق من الجاهزية عند عودة الاتصال.",
			)
		}
	}

	return {
		// state
		runtimeState,
		runtimeError,
		runtimeMessage,
		csrfReady,
		offlineReady,
		sessionReady,
		isOfflineMode,
		offlineDetected,
		isOnline,
		// derived
		isRuntimeReady,
		rateLimitState,
		isRateLimited,
		// actions
		setRuntimeState,
		prepareRuntime,
		prepareServerDemand,
		detectAndSetOfflineMode,
		handleOnline,
		handleOffline,
	}
}

export { isBrowser, sanitizeForInput, log }
