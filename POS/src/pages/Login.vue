<!--
  =============================================================================
  DyPOS — Enterprise SaaS Authentication Surface
  Production Grade / End-to-End SaaS
  =============================================================================

  المسؤوليات:
  - Authentication UI
  - Session bootstrap
  - CSRF readiness
  - Offline runtime readiness
  - Shift readiness
  - Tenant / branch / POS context presentation
  - Accessible operational feedback
  - Responsive POS-first experience

  المبدأ:
  Login → Session → Runtime → Shift → POS

  لا يتم وضع منطق ERP داخل هذه الصفحة.
  =============================================================================
-->

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

import { FeatherIcon } from "frappe-ui"

import DyPOSLogo from "@/assets/DyPOSLogo.png"
import smartPortsBg from "@/assets/smart-ports-og.jpg"

import ShiftOpeningDialog from "@/components/ShiftOpeningDialog.vue"
import DyButton from "@/components/ui/DyButton.vue"
import PasswordStrengthBar from "@/components/reports/dashboards/core/PasswordStrengthBar.vue"

import { session } from "@/stores/session"
import { goToForgotPassword } from "@/router"
import { useSessionLock } from "@/composables/useSessionLock"
import { useSessionTimeout } from "@/composables/useSessionTimeout"
import { useReducedMotion } from "@/composables/useReducedMotion"
import { useMediaQuery } from "@/composables/useMediaQuery"
import {
	usePinAuth,
	isPinValid,
	pinLogin,
	savePin,
	clearPin,
	getLockRemainingSeconds,
} from "@/composables/usePinAuth"

import { cleanupUserSession, normalizeAuthError } from "@/utils/auth"
import { ensureCSRFToken } from "@/utils/csrf"
import { offlineWorker } from "@/utils/offline/workerClient"
import { logger } from "@/utils/logger"
import { enhancedLoginRateLimiter } from "@/utils/rateLimiterEnhanced"
import {
	handleAuthFailure,
	handleAuthSuccess,
	handleCSRFRefresh,
	handleSessionExpiry,
	handleSessionIdleTimeout,
	handleSessionAbsoluteTimeout,
	installSecurityMonitor,
	checkSessionSecurity,
} from "@/utils/securityHardening"
import { offlineState } from "@/utils/offline/offlineState"
import { offlineWorker as offlineWorkerClient } from "@/utils/offline/workerClient"

/* ============================================================================
 * Props / Emits
 * ========================================================================== */

const props = defineProps({
	tenantName: {
		type: String,
		default: "",
	},

	branchName: {
		type: String,
		default: "",
	},

	posName: {
		type: String,
		default: "",
	},

	backgroundImage: {
		type: String,
		default: "",
	},

	showTenantContext: {
		type: Boolean,
		default: true,
	},

	showOfflineReadiness: {
		type: Boolean,
		default: true,
	},

	rememberEmail: {
		type: Boolean,
		default: true,
	},
})

const emit = defineEmits(["authenticated", "ready", "error"])

/* ============================================================================
 * Session Lock
 * ========================================================================== */

const { isLocked: sessionLocked, unlock: unlockSession } = useSessionLock()

/* ============================================================================
 * Form State
 * ========================================================================== */

const email = ref("")
const password = ref("")

const rememberMe = ref(true)

const isSubmitting = ref(false)
const loginError = ref("")

const emailInput = ref(null)
const passwordInput = ref(null)

const loginForm = ref(null)

/* ============================================================================
 * Runtime State
 * ============================================================================ */

const runtimeState = ref("idle")

/*
 * idle
 * preparing
 * ready
 * degraded
 * failed
 */

const runtimeError = ref("")
const runtimeMessage = ref("")

const csrfReady = ref(false)
const offlineReady = ref(false)
const sessionReady = ref(false)

const shiftDialogOpen = ref(false)
const shiftOpening = ref(false)

const authenticationCompleted = ref(false)

/* ============================================================================
 * Rate Limiter & Session Timeout
 * ============================================================================ */

const rateLimitState = computed(() => enhancedLoginRateLimiter.getState())
const isRateLimited = computed(() => !rateLimitState.value.allowed)

const sessionTimeout = useSessionTimeout({
	warningBeforeMs: 5 * 60 * 1000,
	sessionDurationMs: 30 * 60 * 1000,
	onLogout: () => {
		cleanupUserSession()
		handleSessionExpiry()
		loginError.value = "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى."
	},
})

// Security hardening: install session activity monitoring and enforce
// session expiry, idle timeout, and absolute timeout policies.
let stopSecurityMonitor = null

function installSessionSecurityMonitor() {
	if (stopSecurityMonitor) return

	stopSecurityMonitor = installSecurityMonitor()

	// Periodic session security check (independent of user activity).
	const interval = setInterval(() => {
		const status = checkSessionSecurity()
		if (status !== "valid") {
			if (status === "idle_timeout") handleSessionIdleTimeout()
			if (status === "absolute_timeout") handleSessionAbsoluteTimeout()
		}
	}, 60 * 1000)
}

/* ============================================================================
 * Offline Detection & Offline Login Support
 * ============================================================================ */

const OFFLINE_DETECTION_TIMEOUT_MS = 3000
const isOfflineMode = ref(false)
const offlineDetected = ref(false)

async function detectOfflineMode() {
	if (!isBrowser) return false

	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(
			() => controller.abort(),
			OFFLINE_DETECTION_TIMEOUT_MS,
		)

		const response = await fetch("/api/method/DyPOS.api.ping", {
			method: "GET",
			cache: "no-store",
			credentials: "same-origin",
			signal: controller.signal,
		})

		clearTimeout(timeoutId)

		if (response.ok) {
			log.info("Backend reachable — online mode")
			return false
		}

		if (response.status === 503) {
			log.info("Backend unavailable (503) — offline mode")
			return true
		}

		log.warn(`Backend responded with ${response.status} — treating as offline`)
		return true
	} catch (error) {
		if (error.name === "AbortError" || error.name === "TimeoutError") {
			log.info("Backend ping timeout — offline mode")
		} else {
			log.info("Backend unreachable — offline mode", error?.message || error)
		}
		return true
	}
}

async function detectAndSetOfflineMode() {
	isOfflineMode.value = await detectOfflineMode()
	offlineDetected.value = true

	if (isOfflineMode.value) {
		log.info("OFFLINE MODE: Enabling offline login")
		// Initialize offline systems
		await initializeOfflineSystems()
		window.__DYPOS_OFFLINE__ = true
	} else {
		log.info("ONLINE MODE: Backend reachable")
	}
	return isOfflineMode.value
}

async function initializeOfflineSystems() {
	if (!isBrowser) return

	try {
		log.info("Initializing offline systems...")

		// Initialize offline DB (Dexie) - this happens automatically on import
		const db = await import("@/services/db").then((m) => m.default)
		// Open the database connection
		await db.open().catch((error) => {
			log.warn("Offline DB open failed", error)
		})

		// Initialize offline numbering (for invoice numbers)
		await import("@/services/offline-numbering").catch((error) => {
			log.warn("Offline numbering init failed", error)
		})

		// Initialize stock reservations (local only)
		await import("@/services/stock-reservations").catch((error) => {
			log.warn("Local stock reservations init failed", error)
		})

		// Initialize offline store and sync queue
		await import("@/services/offline-store").catch((error) => {
			log.warn("Offline store init failed", error)
		})

		log.info("Offline systems initialized")
	} catch (error) {
		log.error("Offline systems initialization failed", error)
	}
}

/**
 * Attempt local authentication using IndexedDB when offline
 * Falls back to online authentication if online
 */
async function attemptLocalLogin(email, password) {
	if (!isOfflineMode.value) {
		return { success: false, reason: "Online mode - use server authentication" }
	}

	try {
		// Import the offline database
		const db = await import("@/services/db").then((m) => m.default)

		// Find user by email in local database
		const users = await db.users
			.where("email")
			.equals(email.value.trim().toLowerCase())
			.toArray()

		if (users.length === 0) {
			return { success: false, error: "المستخدم غير موجود محليًا" }
		}

		const user = users[0]

		// Verify password - in production, compare hashed passwords
		// For now, we'll check against a stored hash or use a simple comparison
		// In production, you'd use bcrypt or similar
		const storedHash = user.password_hash
		if (!storedHash) {
			return { success: false, error: "كلمة المرور غير محددة محليًا" }
		}

		// For demo purposes, we'll do a simple check
		// In production, use bcrypt.compare(password, storedHash)
		const encoder = new TextEncoder()
		const data = encoder.encode(password.value)
		const hashBuffer = await crypto.subtle.digest("SHA-256", data)
		const hashArray = Array.from(new Uint8Array(hashBuffer))
		const hashHex = hashBuffer
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")

		// Simple comparison - in production use bcrypt
		if (storedHash === hashHex || storedHash === password.value) {
			// Login successful - create local session
			session.user = user.email
			session.isLoggedIn = true

			// Store session in localStorage for persistence
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

			log.info("Offline login successful for:", user.email)
			return { success: true, user }
		}

		return { success: false, error: "كلمة المرور غير صحيحة" }
	} catch (error) {
		log.error("Offline login failed:", error)
		return { success: false, error: error.message || "فشل تسجيل الدخول المحلي" }
	}
}

/* ============================================================================
 * UI State
 * ========================================================================== */

const showPassword = ref(false)
const showRuntimeDetails = ref(false)
const showPinSetup = ref(false)
const pinCode = ref("")
const pinConfirm = ref("")

// PIN Login state
const pinLoginEnabled = ref(false)
const pinLoginInProgress = ref(false)
const pinError = ref("")
const pinSetupError = ref("")
const lockRemaining = ref(0)

const isOnline = ref(typeof navigator === "undefined" ? true : navigator.onLine)

/* ============================================================================
 * Computed
 * ========================================================================== */

const brandBackground = computed(() => {
	const image = props.backgroundImage || smartPortsBg

	if (!image) {
		return {}
	}

	return {
		backgroundImage: `linear-gradient(
            135deg,
            rgb(var(--dy-brand-c-950) / 0.96),
            rgb(var(--dy-brand-c-900) / 0.86),
            rgb(var(--dy-brand-c-800) / 0.62)
        ), url("${image}")`,
	}
})

const loginErrorMessage = computed(() => {
	if (!loginError.value) {
		return ""
	}

	return loginError.value
})

const canSubmit = computed(() => {
	return (
		email.value.trim().length > 0 &&
		password.value.length > 0 &&
		!isSubmitting.value
	)
})

const runtimeStatus = computed(() => {
	if (runtimeState.value === "failed") {
		return {
			type: "error",
			icon: "alert-circle",
			label: "تعذر تجهيز بيئة التشغيل",
		}
	}

	if (runtimeState.value === "degraded") {
		return {
			type: "warning",
			icon: "wifi-off",
			label: "سيتم المتابعة بوضع اتصال محدود",
		}
	}

	if (runtimeState.value === "ready") {
		return {
			type: "success",
			icon: "check-circle",
			label: "بيئة التشغيل جاهزة",
		}
	}

	if (runtimeState.value === "preparing") {
		return {
			type: "info",
			icon: "loader",
			label: "جاري تجهيز بيئة التشغيل",
		}
	}

	return {
		type: "neutral",
		icon: "shield",
		label: "بيئة التشغيل",
	}
})

const isRuntimeReady = computed(() => {
	return (
		csrfReady.value &&
		sessionReady.value &&
		(offlineReady.value || !props.showOfflineReadiness)
	)
})

const submitLabel = computed(() => {
	if (isSubmitting.value) {
		return "جاري تسجيل الدخول..."
	}

	if (authenticationCompleted.value) {
		return "تم تسجيل الدخول"
	}

	return "تسجيل الدخول"
})

const contextTenantName = computed(
	() => props.tenantName || session?.tenantName || "",
)

const contextBranchName = computed(
	() => props.branchName || session?.branchName || "",
)

const contextPosName = computed(
	() => props.posName || session?.posProfile || "",
)

const contextItems = computed(() => {
	const items = []

	if (contextTenantName.value) {
		items.push({
			icon: "briefcase",
			label: contextTenantName.value,
		})
	}

	if (contextBranchName.value) {
		items.push({
			icon: "map-pin",
			label: contextBranchName.value,
		})
	}

	if (contextPosName.value) {
		items.push({
			icon: "monitor",
			label: contextPosName.value,
		})
	}

	return items
})

/* ============================================================================
 * Accessibility & Responsive
 * ============================================================================ */

const reducedMotion = useReducedMotion()
const prefersDark = useMediaQuery("(prefers-color-scheme: dark)")
const isMobile = useMediaQuery("(max-width: 768px)")

/* ============================================================================
 * Password Strength
 * ============================================================================ */

const passwordStrength = computed(() => {
	const pwd = password.value
	if (!pwd) return { level: 0, label: "", color: "" }
	let score = 0
	if (pwd.length >= 6) score++
	if (pwd.length >= 10) score++
	if (/[A-Z]/.test(pwd)) score++
	if (/[0-9]/.test(pwd)) score++
	if (/[^A-Za-z0-9]/.test(pwd)) score++

	if (score <= 2)
		return { level: score, label: "ضعيف", color: "var(--dy-crimson-600)" }
	if (score <= 3)
		return { level: score, label: "متوسط", color: "var(--dy-amber-600)" }
	return { level: score, label: "قوي", color: "var(--dy-mint-600)" }
})

/* ============================================================================
 * Runtime Helpers
 * ============================================================================ */

function setRuntimeState(state, message = "") {
	runtimeState.value = state
	runtimeMessage.value = message
}

function clearLoginError() {
	loginError.value = ""
}

/* ============================================================================
 * Network State
 * ========================================================================== */

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

/* ============================================================================
 * Runtime Preparation
 * ========================================================================== */

async function prepareRuntime() {
	if (runtimeState.value === "preparing") {
		return
	}

	setRuntimeState("preparing")

	try {
		/*
		 * CSRF
		 * ------------------------------------------------------------------
		 * لا يتم تخزين token في component state.
		 * مسؤولية التخزين والإدارة تقع على طبقة csrf المركزية.
		 */
		try {
			await ensureCSRFToken()

			csrfReady.value = true
		} catch (error) {
			csrfReady.value = false

			logger?.warn?.("DyPOS runtime: CSRF preparation failed", error)

			if (!isOnline.value) {
				setRuntimeState("degraded", "سيتم استكمال التجهيز عند عودة الاتصال.")

				return
			}

			throw error
		}

		/*
		 * Offline Runtime
		 * ------------------------------------------------------------------
		 * لا نفترض شكل API محدد.
		 * ندعم worker الحالي سواء كان:
		 * - function
		 * - object
		 * - promise-based initializer
		 */
		if (props.showOfflineReadiness) {
			try {
				await initializeOfflineRuntime()

				offlineReady.value = true
			} catch (error) {
				offlineReady.value = false

				logger?.warn?.(
					"DyPOS runtime: offline worker initialization failed",
					error,
				)

				/*
				 * لا نمنع تسجيل الدخول بسبب طبقة offline
				 * إذا كان الاتصال الشبكي متاحًا.
				 */
				if (isOnline.value) {
					setRuntimeState(
						"degraded",
						"الاتصال متاح، لكن التشغيل دون اتصال لم يكتمل.",
					)

					return
				}

				setRuntimeState("degraded", "الاتصال غير متاح حاليًا.")

				return
			}
		} else {
			offlineReady.value = true
		}

		setRuntimeState("ready", "بيئة التشغيل جاهزة.")
	} catch (error) {
		setRuntimeState("failed", "تعذر تجهيز البيئة الآمنة لتسجيل الدخول.")

		runtimeError.value = error

		logger?.error?.("DyPOS runtime preparation failed", error)
	}
}

async function initializeOfflineRuntime() {
	if (!offlineWorker) {
		return
	}

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
		return
	}

	/*
	 * Worker موجود لكنه لا يملك initializer معروف.
	 * لا نعتبر ذلك failure قاتلًا.
	 */
}

/* ============================================================================
 * Authentication
 * ========================================================================== */

async function submitLogin() {
	if (!canSubmit.value) {
		return
	}

	if (isRateLimited.value) {
		loginError.value = `محاولات كثيرة جدًا. انتظر ${Math.ceil(rateLimitState.value.retryAfterMs / 1000)} ثانية ثم حاول مرة أخرى.`
		handleAuthFailure({
			stage: "rate_limit",
			retryAfterMs: rateLimitState.value.retryAfterMs,
		})
		return
	}

	clearLoginError()

	isSubmitting.value = true
	authenticationCompleted.value = false

	try {
		if (!csrfReady.value && isOnline.value) {
			await prepareRuntime()
		}

		// Detect offline mode before attempting login
		if (!offlineDetected.value) {
			await detectAndSetOfflineMode()
		}

		const loginResult = null

		if (isOfflineMode.value) {
			// Attempt offline login
			log.info("Attempting offline login...")
			const offlineResult = await attemptLocalLogin(email, password)

			if (offlineResult.success) {
				loginRateLimiter.recordSuccess()
				sessionReady.value = true
				authenticationCompleted.value = true

				sessionTimeout.start(30 * 60 * 1000)
				installSessionSecurityMonitor()

				logger?.info?.("DyPOS offline authentication completed")

				handleAuthSuccess({ stage: "offline_login" })

				emit("authenticated")

				await bootstrapAuthenticatedSession()
				return
			} else {
				loginError.value = offlineResult.error || "فشل تسجيل الدخول المحلي"
				throw new Error(offlineResult.error || "فشل تسجيل الدخول المحلي")
			}
		} else {
			// Online mode - use server authentication
			if (!csrfReady.value && isOnline.value) {
				await prepareRuntime()
			}

			await session.login({
				usr: sanitizeForInput(email.value.trim()),
				pwd: sanitizeForInput(password.value),
			})

			loginRateLimiter.recordSuccess()
			sessionReady.value = true
			authenticationCompleted.value = true

			sessionTimeout.start(30 * 60 * 1000)
			installSessionSecurityMonitor()

			logger?.info?.("DyPOS authentication completed")

			handleAuthSuccess({ stage: "login" })

			emit("authenticated")

			await bootstrapAuthenticatedSession()
		}
	} catch (error) {
		authenticationCompleted.value = false

		const limitResult = loginRateLimiter.recordFailure()
		if (!limitResult.allowed) {
			loginError.value = `محاولات كثيرة جدًا. انتظر ${Math.ceil(limitResult.retryAfterMs / 1000)} ثانية ثم حاول مرة أخرى.`
			handleAuthFailure({
				stage: "rate_limit",
				retryAfterMs: limitResult.retryAfterMs,
			})
		} else {
			loginError.value = normalizeAuthError(error, { online: isOnline.value })
			handleAuthFailure({
				stage: "login",
				status: error?.status || error?.response?.status || undefined,
				message: error?.message || "",
			})
		}

		logger?.warn?.("DyPOS authentication failed", {
			status: error?.status || error?.response?.status || undefined,
		})

		emit("error", error)
	} finally {
		isSubmitting.value = false
	}
}

/* ============================================================================
 * Authenticated Session Bootstrap
 * ========================================================================== */

async function bootstrapAuthenticatedSession() {
	try {
		/*
		 * بعض implementations قد تكون sync بالفعل.
		 * لذلك نتحقق قبل الاستدعاء.
		 */
		if (typeof session.bootstrap === "function") {
			await session.bootstrap()
		}

		if (typeof session.refresh === "function") {
			/*
			 * لا نفرض refresh إذا كان session store يعتبر نفسه جاهزًا.
			 */
			if (!sessionReady.value) {
				await session.refresh()
			}
		}

		sessionReady.value = true

		await nextTick()

		/*
		 * تحديد حالة الوردية:
		 *
		 * - إذا كان هناك shift مفتوح → متابعة
		 * - إذا كان مطلوبًا فتح وردية → الحوار
		 * - وإلا → ready
		 */
		const shiftState = resolveShiftState()

		if (shiftState === "open") {
			emitReady()
			return
		}

		if (shiftState === "requires-opening") {
			shiftDialogOpen.value = true
			return
		}

		emitReady()
	} catch (error) {
		logger?.error?.("DyPOS session bootstrap failed", error)

		loginError.value = "تم تسجيل الدخول، لكن تعذر تجهيز جلسة نقطة البيع."

		emit("error", error)
	}
}

function resolveShiftState() {
	/*
	 * نقرأ عدة احتمالات لتجنب ربط Login بعقد واحد جامد.
	 */
	const shift = session?.shift || session?.currentShift || session?.activeShift

	if (
		shift?.isOpen === true ||
		shift?.status === "open" ||
		shift?.status === "OPEN"
	) {
		return "open"
	}

	if (
		shift?.requiresOpening === true ||
		shift?.status === "closed" ||
		shift?.status === "none"
	) {
		return "requires-opening"
	}

	/*
	 * إذا لم تكن طبقة session توفر shift state:
	 * لا نمنع الدخول.
	 */
	return "ready"
}

function emitReady() {
	emit("ready", {
		authenticated: true,
		runtimeReady: isRuntimeReady.value,
	})
}

/* ============================================================================
 * Shift
 * ========================================================================== */

async function handleShiftConfirm(payload) {
	if (shiftOpening.value) {
		return
	}

	shiftOpening.value = true

	try {
		if (typeof session.openShift === "function") {
			await session.openShift(payload)
		}

		shiftDialogOpen.value = false

		emitReady()
	} catch (error) {
		logger?.error?.("DyPOS shift opening failed", error)

		/*
		 * ShiftOpeningDialog مسؤول عن عرض خطأ العملية
		 * إذا كان ذلك مدعومًا من API الحالي.
		 */
		throw error
	} finally {
		shiftOpening.value = false
	}
}

function handleShiftCancel() {
	if (shiftOpening.value) {
		return
	}

	shiftDialogOpen.value = false
}

/* ============================================================================
 * Session Recovery
 * ========================================================================== */

async function handleSessionLock() {
	try {
		await unlockSession?.()
	} catch (error) {
		logger?.warn?.("DyPOS session unlock failed", error)
	}
}

async function cleanup() {
	try {
		await cleanupUserSession?.()
	} catch (error) {
		logger?.warn?.("DyPOS session cleanup failed", error)
	}
}

/* ============================================================================
 * PIN Authentication
 * ============================================================================ */

const {
	isPinValid: pinAvailable,
	pinLogin: attemptPinLogin,
	savePin: storePin,
	clearPin: wipePin,
} = usePinAuth()

async function handlePinLogin() {
	if (!pinAvailable.value) {
		pinError.value =
			"لم يتم إعداد كود PIN بعد. يرجى تسجيل الدخول بكلمة المرور أولاً."
		return
	}

	pinLoginInProgress.value = true
	pinError.value = ""

	try {
		await attemptPinLogin(pinCode.value)
		pinCode.value = ""
		authenticationCompleted.value = true
		sessionReady.value = true
		sessionTimeout.start(30 * 60 * 1000)
		installSessionSecurityMonitor()
		logger?.info?.("DyPOS PIN authentication completed")
		handleAuthSuccess({ stage: "pin_login" })
		emit("authenticated")
		await bootstrapAuthenticatedSession()
	} catch (error) {
		authenticationCompleted.value = false
		pinError.value = error?.message || "كود PIN غير صحيح"
		logger?.warn?.("DyPOS PIN authentication failed", error)
		emit("error", error)
	} finally {
		pinLoginInProgress.value = false
	}
}

/**
 * إعداد PIN جديد بعد أول تسجيل دخول أو عند الطلب.
 */
async function handlePinSetup() {
	if (pinCode.value.length < 4) {
		pinSetupError.value = "كود PIN يجب أن يكون 4 خانات على الأقل"
		return
	}

	if (pinCode.value !== pinConfirm.value) {
		pinSetupError.value = "كودا PIN غير متطابقين"
		return
	}

	try {
		await storePin(email.value.trim(), pinCode.value, 60 * 60 * 1000)
		pinSetupError.value = ""
		showPinSetup.value = false
		pinCode.value = ""
		pinConfirm.value = ""
		logger?.info?.("DyPOS PIN setup completed")
	} catch (error) {
		pinSetupError.value = error?.message || "فشل إعداد كود PIN"
		logger?.error?.("DyPOS PIN setup failed", error)
	}
}

function cancelPinSetup() {
	showPinSetup.value = false
	pinSetupError.value = ""
	pinCode.value = ""
	pinConfirm.value = ""
}

/**
 * مسح PIN (للخروج الآمن).
 */
function handleClearPin() {
	try {
		wipePin()
		pinError.value = ""
		logger?.info?.("DyPOS PIN cleared")
	} catch (error) {
		logger?.warn?.("DyPOS PIN clear failed", error)
	}
}

/* ============================================================================
 * Remembered Email
 * ========================================================================== */

const REMEMBERED_EMAIL_KEY = "dypos.auth.email"

function restoreRememberedEmail() {
	if (!props.rememberEmail) {
		return
	}

	try {
		const remembered = window.localStorage.getItem(REMEMBERED_EMAIL_KEY)

		if (remembered) {
			email.value = remembered
		}
	} catch (error) {
		logger?.debug?.("DyPOS remembered email unavailable", error)
	}
}

function persistRememberedEmail() {
	if (!props.rememberEmail) {
		return
	}

	try {
		if (rememberMe.value && email.value.trim()) {
			window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.value.trim())
		} else {
			window.localStorage.removeItem(REMEMBERED_EMAIL_KEY)
		}
	} catch (error) {
		logger?.debug?.("DyPOS remembered email persistence unavailable", error)
	}
}

/* ============================================================================
 * Keyboard
 * ========================================================================== */

function handleGlobalKeydown(event) {
	// Enter submits from anywhere except multiline inputs (native form
	// behavior already covers single-line inputs + the submit button).
	if (
		event.key === "Enter" &&
		!event.shiftKey &&
		!event.ctrlKey &&
		!event.metaKey &&
		!(event.target instanceof HTMLTextAreaElement) &&
		!isSubmitting.value
	) {
		const form = document.querySelector(".dy-login__form")
		if (form && !form.contains(event.target)) {
			event.preventDefault()
			handleLogin()
			return
		}
	}

	if (event.key === "Escape") {
		clearLoginError()
	}
}

/* ============================================================================
 * Lifecycle
 * ========================================================================== */

onMounted(async () => {
	restoreRememberedEmail()

	window.addEventListener("online", handleOnline)

	window.addEventListener("offline", handleOffline)

	window.addEventListener("keydown", handleGlobalKeydown)

	await nextTick()

	/*
	 * لا نركز على password إذا كان البريد محفوظًا.
	 */
	if (email.value) {
		passwordInput.value?.focus?.()
	} else {
		emailInput.value?.focus?.()
	}

	await prepareRuntime()
})

onBeforeUnmount(async () => {
	window.removeEventListener("online", handleOnline)

	window.removeEventListener("offline", handleOffline)

	window.removeEventListener("keydown", handleGlobalKeydown)

	if (stopSecurityMonitor) {
		stopSecurityMonitor()
		stopSecurityMonitor = null
	}

	await cleanup()
})

/* ============================================================================
 * Watchers
 * ========================================================================== */

watch(
	() => session.isLoggedIn,
	async (loggedIn) => {
		if (!loggedIn) {
			return
		}

		if (!sessionReady.value) {
			await bootstrapAuthenticatedSession()
		}
	},
)

watch(
	() => shiftDialogOpen.value,
	async (open) => {
		if (!open) {
			return
		}

		await nextTick()
	},
)

function goToRegister() {
	window.location.href = "/account/register"
}
</script>

<template>
	<main
		class="dy-login"
		:class="{
			'dy-login--busy': isSubmitting,
			'dy-login--locked': sessionLocked,
			'dy-login--offline': isOfflineMode,
			'dy-login--mobile': isMobile,
			'dy-login--reduced-motion': reducedMotion,
			'dy-login--dark': prefersDark,
		}"
		dir="rtl"
	>
		<!-- Offline Indicator -->
		<div
			v-if="isOfflineMode && offlineDetected"
			class="dy-login__offline-banner"
			role="status"
			aria-live="polite"
		>
			<FeatherIcon name="wifi-off" :size="16" aria-hidden="true" />
			<span>وضع عدم الاتصال — سيتم تسجيل الدخول محليًا</span>
		</div>
        <!-- =================================================================
             Brand / Context Panel
             =============================================================== -->

        <section
            class="dy-login__brand"
            :style="brandBackground"
            aria-label="هوية DyPOS"
        >
            <div class="dy-login__brand-overlay" />

            <div class="dy-login__brand-content">
                <div class="dy-login__logo-shell">
                    <img
                        :src="DyPOSLogo"
                        alt="DyPOS"
                        class="dy-login__logo"
                        width="176"
                        height="64"
                        decoding="async"
                    />
                </div>

                <div class="dy-login__brand-copy">
                    <span class="dy-login__eyebrow">
                        نقطة البيع الذكية
                    </span>

                    <h1 class="dy-login__brand-title">
                        بيع أسرع.
                        <br />
                        تشغيل أذكى.
                    </h1>

                    <p class="dy-login__brand-description">
                        تجربة نقطة بيع احترافية مصممة
                        للتشغيل اليومي السريع والموثوق.
                    </p>
                </div>

                <!-- Tenant / Branch / POS context -->

                <div
                    v-if="
                        showTenantContext &&
                        contextItems.length
                    "
                    class="dy-login__context"
                    aria-label="سياق التشغيل"
                >
                    <div
                        v-for="item in contextItems"
                        :key="`${item.icon}-${item.label}`"
                        class="dy-login__context-item"
                    >
                        <span
                            class="dy-login__context-icon"
                            aria-hidden="true"
                        >
                            <FeatherIcon
                                :name="item.icon"
                                :size="16"
                            />
                        </span>

                        <span
                            class="dy-login__context-label"
                        >
                            {{ item.label }}
                        </span>
                    </div>
                </div>

                <div class="dy-login__brand-footer">
                    <span>
                        تشغيل مؤسسي
                    </span>

                    <span
                        class="dy-login__brand-dot"
                        aria-hidden="true"
                    />

                    <span>
                        جاهز للتوسع
                    </span>

                    <span
                        class="dy-login__brand-dot"
                        aria-hidden="true"
                    />

                    <span>
                        عربي أولاً
                    </span>
                </div>
            </div>
        </section>

        <!-- =================================================================
             Authentication Panel
             =============================================================== -->

        <section class="dy-login__panel">
            <div class="dy-login__panel-inner">
                <!-- Header -->

                <header class="dy-login__header">
                    <div class="dy-login__mobile-logo">
                        <img
                            :src="DyPOSLogo"
                            alt="DyPOS"
                            width="148"
                            height="54"
                            decoding="async"
                        />
                    </div>

                    <div>
                        <span class="dy-login__section-label">
                            تسجيل الدخول
                        </span>

                        <h2 class="dy-login__title">
                            مرحبًا بك
                        </h2>

                        <p class="dy-login__subtitle">
                            سجّل الدخول للمتابعة إلى نقطة البيع.
                        </p>
                    </div>
                </header>

                <!-- Runtime readiness -->

                <section
                    v-if="showOfflineReadiness"
                    class="dy-login__runtime"
                    :class="[
                        `dy-login__runtime--${runtimeStatus.type}`,
                    ]"
                    :aria-busy="
                        runtimeState === 'preparing'
                    "
                    aria-live="polite"
                >
                    <span
                        class="dy-login__runtime-icon"
                        aria-hidden="true"
                    >
                        <FeatherIcon
                            :name="runtimeStatus.icon"
                            :size="17"
                        />
                    </span>

                    <div class="dy-login__runtime-content">
                        <strong>
                            {{ runtimeStatus.label }}
                        </strong>

                        <span
                            v-if="runtimeMessage"
                        >
                            {{ runtimeMessage }}
                        </span>
                    </div>

                    <button
                        v-if="
                            runtimeState === 'failed' ||
                            runtimeState === 'degraded'
                        "
                        type="button"
                        class="dy-login__runtime-action"
                        @click="prepareRuntime"
                    >
                        إعادة المحاولة
                    </button>
                </section>

                <!-- Rate Limit Warning -->

                <div
                    v-if="isRateLimited"
                    class="dy-login__rate-limit"
                    role="alert"
                    aria-live="assertive"
                >
                    <span
                        class="dy-login__rate-limit-icon"
                        aria-hidden="true"
                    >
                        <FeatherIcon
                            name="clock"
                            :size="18"
                        />
                    </span>

                    <div class="dy-login__rate-limit-content">
                        <strong>
                            تم قفل المؤقت
                        </strong>

                        <span>
                            المحاولة بعد
                            {{ Math.ceil(rateLimitState.retryAfterMs / 1000) }}
                            ثانية
                        </span>
                    </div>
                </div>

                <!-- Error -->

                <div
                    v-if="loginErrorMessage"
                    id="dypos-login-error"
                    class="dy-login__error"
                    role="alert"
                    aria-live="assertive"
                >
                    <span
                        class="dy-login__error-icon"
                        aria-hidden="true"
                    >
                        <FeatherIcon
                            name="alert-circle"
                            :size="18"
                        />
                    </span>

                    <div class="dy-login__error-content">
                        <strong>
                            تعذر تسجيل الدخول
                        </strong>

                        <span>
                            {{ loginErrorMessage }}
                        </span>
                    </div>

                    <button
                        type="button"
                        class="dy-login__error-close"
                        aria-label="إغلاق رسالة الخطأ"
                        title="إغلاق"
                        @click="clearLoginError"
                    >
                        <FeatherIcon
                            name="x"
                            :size="16"
                        />
                    </button>
                </div>

                <!-- Form -->

                <form
                    ref="loginForm"
                    class="dy-login__form"
                    novalidate
                    @submit.prevent="submitLogin"
                >
                    <!-- Email -->

                    <div class="dy-login__field">
                        <label
                            for="dypos-login-email"
                            class="dy-login__label"
                        >
                            البريد الإلكتروني
                        </label>

                        <div
                            class="dy-login__input-wrap"
                        >
                            <FeatherIcon
                                name="mail"
                                :size="18"
                                class="dy-login__input-icon"
                                aria-hidden="true"
                            />

                            <input
                                id="dypos-login-email"
                                ref="emailInput"
                                v-model="email"
                                class="dy-login__input"
                                type="email"
                                inputmode="email"
                                autocomplete="username"
                                dir="ltr"
                                placeholder="name@company.com"
                                :disabled="isSubmitting"
                                required
                                spellcheck="false"
                                aria-describedby="dypos-login-email-error"
                                @input="clearLoginError"
                            />
                        </div>

                        <span
                            v-if="!email.value && isSubmitting"
                            id="dypos-login-email-error"
                            class="dy-login__field-error"
                            role="alert"
                            aria-live="polite"
                        >
                            <FeatherIcon name="alert-circle" :size="14" aria-hidden="true" />
                            البريد الإلكتروني مطلوب
                        </span>
                    </div>

                    <!-- Password -->

                    <div class="dy-login__field">
                        <div
                            class="dy-login__label-row"
                        >
                            <label
                                for="dypos-login-password"
                                class="dy-login__label"
                            >
                                كلمة المرور
                            </label>

                            <span
                                v-if="password.value"
                                class="dy-login__strength"
                                :style="{ color: passwordStrength.color }"
                                aria-live="polite"
                            >
                                {{ passwordStrength.label }}
                            </span>
                        </div>

                        <PasswordStrengthBar
                            v-if="password.value"
                            :password="password"
                            :show-label="false"
                            aria-label="قوة كلمة المرور"
                        />

                        <div
                            class="dy-login__input-wrap"
                        >
                            <FeatherIcon
                                name="lock"
                                :size="18"
                                class="dy-login__input-icon"
                                aria-hidden="true"
                            />

                            <input
                                id="dypos-login-password"
                                ref="passwordInput"
                                v-model="password"
                                class="dy-login__input dy-login__input--password"
                                :class="{ 'dy-login__input--error': !password.value && isSubmitting }"
                                :type="
                                    showPassword
                                        ? 'text'
                                        : 'password'
                                "
                                autocomplete="current-password"
                                dir="ltr"
                                placeholder="أدخل كلمة المرور"
                                :disabled="isSubmitting"
                                required
                                aria-invalid="!!(!password.value && isSubmitting)"
                                aria-describedby="dypos-login-password-error"
                                @input="clearLoginError"
                            />

                            <button
                                type="button"
                                class="dy-login__password-toggle"
                                :aria-label="
                                    showPassword
                                        ? 'إخفاء كلمة المرور'
                                        : 'إظهار كلمة المرور'
                                "
                                :aria-pressed="showPassword"
                                :disabled="isSubmitting"
                                @click="
                                    showPassword =
                                        !showPassword
                                "
                            >
                                <FeatherIcon
                                    :name="
                                        showPassword
                                            ? 'eye-off'
                                            : 'eye'
                                    "
                                    :size="18"
                                />
                            </button>
                        </div>

                        <span
                            v-if="!password.value && isSubmitting"
                            id="dypos-login-password-error"
                            class="dy-login__field-error"
                            role="alert"
                            aria-live="polite"
                        >
                            <FeatherIcon name="alert-circle" :size="14" aria-hidden="true" />
                            كلمة المرور مطلوبة
                        </span>
                    </div>

                    <!-- Form options -->

                    <div class="dy-login__options">
                        <label
                            class="dy-login__remember"
                        >
                            <input
                                v-model="rememberMe"
                                type="checkbox"
                                :disabled="isSubmitting"
                                @change="
                                    persistRememberedEmail
                                "
                            />

                            <span
                                class="dy-login__checkbox"
                                aria-hidden="true"
                            />

                            <span>
                                تذكر البريد الإلكتروني
                            </span>
                        </label>

                        <a
                            href="/forgot-password"
                            class="dy-login__forgot"
                            @click.prevent="goToForgotPassword"
                        >
                            نسيت كلمة المرور؟
                        </a>
                    </div>

                    <!-- Submit -->

                    <DyButton
                        type="submit"
                        variant="primary"
                        size="lg"
                        class="dy-login__submit"
                        :loading="isSubmitting"
                        :disabled="!canSubmit"
                        :aria-busy="isSubmitting"
                    >
                        <FeatherIcon
                            v-if="
                                !isSubmitting &&
                                !authenticationCompleted
                            "
                            name="log-in"
                            :size="18"
                            aria-hidden="true"
                        />

                        <FeatherIcon
                            v-if="
                                authenticationCompleted
                            "
                            name="check"
                            :size="18"
                            aria-hidden="true"
                        />

                        {{ submitLabel }}
                    </DyButton>
                </form>

                <!-- Security / Runtime information -->

                <aside
                    class="dy-login__security"
                    aria-label="معلومات الأمان والتشغيل"
                >
                    <div class="dy-login__security-main">
                        <span
                            class="dy-login__security-icon"
                            aria-hidden="true"
                        >
                            <FeatherIcon
                                name="shield-check"
                                :size="18"
                            />
                        </span>

                        <div>
                            <strong>
                                جلسة تشغيل آمنة
                            </strong>

                            <span>
                                تتم حماية الاتصال وتهيئة الجلسة قبل بدء التشغيل.
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        class="dy-login__details-toggle"
                        :aria-expanded="
                            showRuntimeDetails
                        "
                        @click="
                            showRuntimeDetails =
                                !showRuntimeDetails
                        "
                    >
                        التفاصيل
                    </button>

                    <div
                        v-if="showRuntimeDetails"
                        class="dy-login__details"
                    >
                        <div>
                            <span>الاتصال</span>

                            <strong>
                                {{
                                    isOnline
                                        ? "متصل"
                                        : "غير متصل"
                                }}
                            </strong>
                        </div>

                        <div>
                            <span>الحماية</span>

                            <strong>
                                {{
                                    csrfReady
                                        ? "جاهزة"
                                        : "قيد التجهيز"
                                }}
                            </strong>
                        </div>

                        <div>
                            <span>الجلسة</span>

                            <strong>
                                {{
                                    sessionReady
                                        ? "جاهزة"
                                        : "غير مهيأة"
                                }}
                            </strong>
                        </div>

                        <div>
                            <span>التشغيل دون اتصال</span>

                            <strong>
                                {{
                                    offlineReady
                                        ? "جاهز"
                                        : "غير جاهز"
                                }}
                            </strong>
                        </div>
                    </div>
                </aside>

                <!-- Session Timeout Warning -->

                <Transition name="dy-fade">
                    <div
                        v-if="sessionTimeout.showWarning"
                        class="dy-login__timeout"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="dy-timeout-title"
                    >
                        <div class="dy-login__timeout-card">
                            <h3 id="dy-timeout-title">
                                <FeatherIcon
                                    name="clock"
                                    :size="20"
                                    aria-hidden="true"
                                />
                                ستنتهي الجلسة قريباً
                            </h3>

                            <p>
                                يتبقى
                                {{ Math.ceil(sessionTimeout.timeRemaining / 1000) }}
                                ثانية. هل تريد تمديد الجلسة؟
                            </p>

                            <div class="dy-login__timeout-actions">
                                <DyButton
                                    variant="primary"
                                    size="sm"
                                    :loading="sessionTimeout.isExtending"
                                    @click="sessionTimeout.extendSession()"
                                >
                                    تمديد الجلسة
                                </DyButton>

                                <button
                                    type="button"
                                    class="dy-login__timeout-logout"
                                    @click="sessionTimeout.dismissWarning"
                                >
                                    تسجيل الخروج
                                </button>
                            </div>
                        </div>
                    </div>
                </Transition>

                <!-- Footer -->

                <footer class="dy-login__footer">
                    <span>
                        DyPOS
                    </span>

                    <span>
                        © {{ new Date().getFullYear() }}
                    </span>

                    <span>
                        جميع الحقوق محفوظة
                    </span>
                </footer>
            </div>
        </section>

        <!-- Register Link -->

        <div class="dy-login__register-link">
            <a href="/account/register" @click.prevent="goToRegister">
                ليس لديك حساب؟ سجّل الآن
            </a>
        </div>

        <!-- =================================================================
             Shift Opening
             =============================================================== -->

        <ShiftOpeningDialog
            v-if="shiftDialogOpen"
            :show="shiftDialogOpen"
            :loading="shiftOpening"
            @confirm="handleShiftConfirm"
            @cancel="handleShiftCancel"
            @close="handleShiftCancel"
        />

        <!-- =================================================================
             Session Lock
             =============================================================== -->

        <div
            v-if="sessionLocked"
            class="dy-login__lock"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dypos-lock-title"
        >
            <div class="dy-login__lock-card">
                <div
                    class="dy-login__lock-icon"
                    aria-hidden="true"
                >
                    <FeatherIcon
                        name="lock"
                        :size="22"
                    />
                </div>

                <h2 id="dypos-lock-title">
                    الجلسة مقفلة
                </h2>

                <p>
                    تم قفل جلسة التشغيل لحماية بيانات نقطة البيع.
                </p>

                <DyButton
                    variant="primary"
                    size="lg"
                    @click="handleSessionLock"
                >
                    فتح الجلسة
                </DyButton>
            </div>
        </div>
    </main>
</template>

<style scoped>
/* =============================================================================
   DyPOS — Enterprise SaaS Login Surface
   RTL-first / Arabic-first / Production Grade
   ============================================================================= */

.dy-login {
    --login-panel-width: min(100%, 620px);
    --login-content-width: 480px;

    position: relative;
    display: grid;
    grid-template-columns: minmax(360px, 0.9fr) minmax(520px, 1.1fr);

    min-height: 100vh;
    min-height: 100dvh;

    overflow: hidden;

    background: var(--dy-bg);
    color: var(--dy-text);

    font-family: var(--dy-font-arabic);

    isolation: isolate;
}

/* =============================================================================
   Brand
   ============================================================================= */

.dy-login__brand {
    position: relative;
    display: flex;
    min-height: 100%;
    overflow: hidden;

    background:
        linear-gradient(
            135deg,
            rgb(var(--dy-brand-c-950) / 0.98),
            rgb(var(--dy-brand-c-900) / 0.9)
        );

    background-position: center;
    background-size: cover;

    color: white;
}

.dy-login__brand-overlay {
    position: absolute;
    inset: 0;

    background:
        radial-gradient(
            circle at 20% 20%,
            rgb(var(--dy-brand-c-500) / 0.20),
            transparent 34%
        ),
        radial-gradient(
            circle at 80% 80%,
            rgb(var(--dy-mint-c-500) / 0.15),
            transparent 34%
        );
}

.dy-login__brand-content {
    position: relative;
    z-index: 1;

    display: flex;
    flex: 1;
    flex-direction: column;

    justify-content: space-between;

    min-height: 100%;

    padding:
        max(48px, env(safe-area-inset-top))
        clamp(40px, 6vw, 88px)
        max(40px, env(safe-area-inset-bottom));
}

.dy-login__logo-shell {
    display: inline-flex;
    width: fit-content;

    padding: 14px 18px;

    border:
        1px solid
        rgb(255 255 255 / 0.16);

    border-radius: var(--dy-radius-xl);

    background:
        rgb(255 255 255 / 0.07);

    backdrop-filter:
        blur(16px)
        saturate(1.3);

    -webkit-backdrop-filter:
        blur(16px)
        saturate(1.3);
}

.dy-login__logo {
    display: block;
    width: 176px;
    height: auto;
    object-fit: contain;
}

.dy-login__brand-copy {
    max-width: 540px;
    margin-block: auto;
    padding-block: 72px 48px;
}

.dy-login__eyebrow {
    display: inline-flex;
    align-items: center;

    margin-bottom: var(--dy-space-5);

    color:
        rgb(
            255 255 255 /
            0.72
        );

    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.02em;
}

.dy-login__brand-title {
    margin: 0;

    color: white;

    font-size:
        clamp(
            2.5rem,
            5vw,
            4.8rem
        );

    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -0.035em;
}

.dy-login__brand-description {
    max-width: 480px;

    margin:
        var(--dy-space-6)
        0
        0;

    color:
        rgb(
            255 255 255 /
            0.72
        );

    font-size:
        clamp(
            1rem,
            1.5vw,
            1.15rem
        );

    line-height: 1.9;
}

.dy-login__context {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    margin-top: auto;
}

.dy-login__context-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    min-height: 38px;

    padding-inline: 11px;

    border:
        1px solid
        rgb(255 255 255 / 0.12);

    border-radius: var(--dy-radius-lg);

    background:
        rgb(255 255 255 / 0.055);

    color:
        rgb(255 255 255 / 0.82);

    font-size: 0.82rem;
}

.dy-login__context-icon {
    display: inline-flex;
    color:
        rgb(
            255 255 255 /
            0.62
        );
}

.dy-login__context-label {
    max-width: 180px;

    overflow: hidden;

    text-overflow: ellipsis;
    white-space: nowrap;
}

.dy-login__brand-footer {
    display: flex;
    align-items: center;
    gap: 10px;

    margin-top: var(--dy-space-8);

    color:
        rgb(
            255 255 255 /
            0.45
        );

    font-size: 0.75rem;
}

.dy-login__brand-dot {
    width: 3px;
    height: 3px;

    border-radius: 50%;

    background:
        rgb(
            255 255 255 /
            0.32
        );
}

/* =============================================================================
   Authentication Panel
   ============================================================================= */

.dy-login__panel {
    display: flex;
    align-items: center;
    justify-content: center;

    min-width: 0;
    min-height: 100%;

    overflow: auto;

    background:
        var(--dy-bg);
}

.dy-login__panel-inner {
    width: min(
        100%,
        var(--login-content-width)
    );

    padding:
        max(48px, env(safe-area-inset-top))
        40px
        max(40px, env(safe-area-inset-bottom));
}

.dy-login__header {
    margin-bottom: var(--dy-space-8);
}

.dy-login__mobile-logo {
    display: none;
}

.dy-login__section-label {
    display: block;

    margin-bottom: 8px;

    color: var(--dy-accent);

    font-size: 0.82rem;
    font-weight: 800;
}

.dy-login__title {
    margin: 0;

    color: var(--dy-text-strong);

    font-size:
        clamp(
            2rem,
            4vw,
            2.7rem
        );

    font-weight: 800;
    letter-spacing: -0.035em;
    line-height: 1.15;
}

.dy-login__subtitle {
    margin:
        var(--dy-space-3)
        0
        0;

    color: var(--dy-text-secondary);

    font-size: 0.98rem;
    line-height: 1.8;
}

/* =============================================================================
   Runtime
   ============================================================================= */

.dy-login__runtime {
    display: flex;
    align-items: center;
    gap: 11px;

    min-height: 52px;

    margin-bottom: var(--dy-space-5);
    padding: 10px 12px;

    border:
        1px solid
        var(--dy-border);

    border-radius: var(--dy-radius-lg);

    background:
        var(--dy-surface);

    color: var(--dy-text-secondary);
}

.dy-login__runtime-icon {
    display: inline-flex;
    flex: 0 0 auto;

    color: var(--dy-accent);
}

.dy-login__runtime-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    gap: 1px;

    font-size: 0.78rem;
}

.dy-login__runtime-content strong {
    color: var(--dy-text-strong);
    font-size: 0.8rem;
}

.dy-login__runtime--success {
    border-color:
        rgb(
            var(--dy-mint-c-500) /
            0.24
        );

    background:
        rgb(
            var(--dy-mint-c-500) /
            0.06
        );
}

.dy-login__runtime--success
    .dy-login__runtime-icon {
    color: var(--dy-mint-600);
}

.dy-login__runtime--warning {
    border-color:
        rgb(
            var(--dy-amber-c-500) /
            0.28
        );

    background:
        rgb(
            var(--dy-amber-c-500) /
            0.07
        );
}

.dy-login__runtime--warning
    .dy-login__runtime-icon {
    color: var(--dy-amber-600);
}

.dy-login__runtime--error {
    border-color:
        rgb(
            var(--dy-crimson-c-500) /
            0.28
        );

    background:
        rgb(
            var(--dy-crimson-c-500) /
            0.07
        );
}

.dy-login__runtime--error
    .dy-login__runtime-icon {
    color: var(--dy-crimson-600);
}

.dy-login__runtime-action {
    flex: 0 0 auto;

    min-height: 34px;

    padding-inline: 10px;

    border: 0;
    border-radius: var(--dy-radius-md);

    background:
        var(--dy-surface-strong);

    color: var(--dy-text-strong);

    font: inherit;
    font-size: 0.75rem;
    font-weight: 700;

    cursor: pointer;
}

.dy-login__runtime-action:focus-visible {
    outline:
        var(--dy-focus-width)
        solid
        var(--dy-focus-color);

    outline-offset: 2px;
}

/* =============================================================================
   Error
   ============================================================================= */

.dy-login__error {
    display: flex;
    align-items: flex-start;
    gap: 10px;

    margin-bottom: var(--dy-space-5);
    padding: 13px 14px;

    border:
        1px solid
        rgb(
            var(--dy-crimson-c-500) /
            0.24
        );

    border-radius: var(--dy-radius-lg);

    background:
        rgb(
            var(--dy-crimson-c-500) /
            0.07
        );

    color: var(--dy-crimson-700);
}

.dy-login__error-icon {
    display: inline-flex;
    flex: 0 0 auto;

    margin-top: 1px;
}

.dy-login__error-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;

    min-width: 0;

    font-size: 0.82rem;
    line-height: 1.6;
}

.dy-login__error-content strong {
    font-weight: 800;
}

.dy-login__error-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: 32px;
    height: 32px;

    flex: 0 0 auto;

    border: 0;
    border-radius: var(--dy-radius-md);

    background: transparent;

    color: inherit;

    cursor: pointer;
}

.dy-login__error-close:hover {
    background:
        rgb(
            var(--dy-crimson-c-500) /
            0.08
        );
}

/* =============================================================================
   Form
   ============================================================================= */

.dy-login__form {
    display: flex;
    flex-direction: column;
    gap: var(--dy-space-5);
}

.dy-login__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.dy-login__label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.dy-login__label {
    color: var(--dy-text-strong);

    font-size: 0.84rem;
    font-weight: 750;
}

.dy-login__input-wrap {
    position: relative;

    display: flex;
    align-items: center;

    min-height: var(--dy-control-h-xl);

    border:
        1px solid
        var(--dy-input-border);

    border-radius: var(--dy-radius-lg);

    background:
        var(--dy-input-bg);

    transition:
        border-color
            var(--dy-dur-fast)
            var(--dy-ease-standard),
        box-shadow
            var(--dy-dur-fast)
            var(--dy-ease-standard),
        background-color
            var(--dy-dur-fast)
            var(--dy-ease-standard);
}

.dy-login__input-wrap:focus-within {
    border-color: var(--dy-accent);

    box-shadow:
        0 0 0
            3px
            rgb(
                var(--dy-brand-c-500) /
                0.12
            );
}

.dy-login__input-icon {
    position: absolute;
    inset-inline-start: 16px;

    color: var(--dy-text-muted);

    pointer-events: none;
}

.dy-login__input {
    width: 100%;
    min-width: 0;
    min-height: var(--dy-control-h-xl);

    padding:
        0
        48px
        0
        48px;

    border: 0;
    outline: 0;

    background: transparent;

    color: var(--dy-text);

    font-family:
        var(--dy-font-english),
        var(--dy-font-arabic);

    font-size: 0.95rem;
}

.dy-login__input::placeholder {
    color: var(--dy-text-muted);
    opacity: 1;
}

.dy-login__input:disabled {
    cursor: not-allowed;
    opacity: var(--dy-disabled-opacity);
}

.dy-login__password-toggle {
    position: absolute;
    inset-inline-end: 8px;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: 40px;
    height: 40px;

    border: 0;
    border-radius: var(--dy-radius-md);

    background: transparent;

    color: var(--dy-text-muted);

    cursor: pointer;
}

.dy-login__password-toggle:hover {
    background:
        var(--dy-surface-soft);

    color: var(--dy-text-strong);
}

.dy-login__password-toggle:disabled {
    cursor: not-allowed;
    opacity: var(--dy-disabled-opacity);
}

.dy-login__password-toggle:focus-visible,
.dy-login__error-close:focus-visible {
    outline:
        var(--dy-focus-width)
        solid
        var(--dy-focus-color);

    outline-offset: 2px;
}

.dy-login__options {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--dy-space-4);

    margin-top: -2px;
}

.dy-login__remember {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    color: var(--dy-text-secondary);

    font-size: 0.8rem;

    cursor: pointer;
}

.dy-login__remember input {
    position: absolute;

    width: 1px;
    height: 1px;

    opacity: 0;
}

.dy-login__checkbox {
    position: relative;

    display: inline-flex;

    width: 18px;
    height: 18px;

    flex: 0 0 auto;

    border:
        1px solid
        var(--dy-border-strong);

    border-radius: 5px;

    background: var(--dy-surface);

    transition:
        background-color
            var(--dy-dur-fast)
            var(--dy-ease-standard),
        border-color
            var(--dy-dur-fast)
            var(--dy-ease-standard);
}

.dy-login__remember input:checked
    + .dy-login__checkbox {
    border-color: var(--dy-accent);
    background: var(--dy-accent);
}

.dy-login__remember input:checked
    + .dy-login__checkbox::after {
    content: "";

    position: absolute;

    inset-inline-start: 5px;
    top: 2px;

    width: 5px;
    height: 9px;

    border:
        solid
        var(--dy-accent-foreground);

    border-width:
        0
        2px
        2px
        0;

    transform: rotate(45deg);
}

.dy-login__remember input:focus-visible
    + .dy-login__checkbox {
    outline:
        var(--dy-focus-width)
        solid
        var(--dy-focus-color);

    outline-offset: 2px;
}

.dy-login__forgot {
    color: var(--dy-accent);

    font-size: 0.8rem;
    font-weight: 750;

    text-decoration: none;
}

.dy-login__forgot:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
}

.dy-login__submit {
    width: 100%;
    margin-top: var(--dy-space-2);
}

/* =============================================================================
   Security
   ============================================================================= */

.dy-login__security {
    margin-top: var(--dy-space-7);

    border:
        1px solid
        var(--dy-border);

    border-radius: var(--dy-radius-xl);

    background:
        var(--dy-surface-soft);
}

.dy-login__security-main {
    display: flex;
    align-items: flex-start;
    gap: 11px;

    padding: 13px 14px;
}

.dy-login__security-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: 34px;
    height: 34px;

    flex: 0 0 auto;

    border-radius: var(--dy-radius-md);

    background:
        rgb(
            var(--dy-mint-c-500) /
            0.10
        );

    color: var(--dy-mint-600);
}

.dy-login__security-main div {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;

    min-width: 0;
}

.dy-login__security-main strong {
    color: var(--dy-text-strong);

    font-size: 0.8rem;
}

.dy-login__security-main span {
    color: var(--dy-text-muted);

    font-size: 0.73rem;
    line-height: 1.6;
}

.dy-login__details-toggle {
    width: 100%;

    padding:
        8px
        14px;

    border: 0;
    border-top:
        1px solid
        var(--dy-border);

    background: transparent;

    color: var(--dy-text-muted);

    font: inherit;
    font-size: 0.72rem;
    font-weight: 700;

    cursor: pointer;
}

.dy-login__details-toggle:hover {
    color: var(--dy-text-strong);
    background: var(--dy-surface);
}

.dy-login__details {
    display: grid;
    grid-template-columns: repeat(2, 1fr);

    gap: 1px;

    border-top:
        1px solid
        var(--dy-border);

    background: var(--dy-border);
}

.dy-login__details > div {
    display: flex;
    justify-content: space-between;
    gap: 10px;

    padding: 9px 12px;

    background: var(--dy-surface);

    font-size: 0.7rem;
}

.dy-login__details span {
    color: var(--dy-text-muted);
}

.dy-login__details strong {
    color: var(--dy-text-strong);
}

/* =============================================================================
   Footer
   ============================================================================= */

.dy-login__footer {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;

    margin-top: var(--dy-space-8);

    color: var(--dy-text-muted);

    font-size: 0.68rem;
}

/* =============================================================================
   Session Lock
   ============================================================================= */

.dy-login__lock {
    position: fixed;
    z-index: var(--dy-z-modal);

    inset: 0;

    display: grid;
    place-items: center;

    padding: var(--dy-space-6);

    background:
        rgb(
            var(--dy-brand-c-950) /
            0.72
        );

    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}

.dy-login__lock-card {
    width: min(
        100%,
        420px
    );

    padding: 28px;

    border:
        1px solid
        var(--dy-border);

    border-radius: var(--dy-radius-2xl);

    background: var(--dy-surface);

    box-shadow: var(--dy-elevation-5);

    text-align: center;
}

.dy-login__lock-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: 48px;
    height: 48px;

    margin-bottom: var(--dy-space-4);

    border-radius: 14px;

    background:
        rgb(
            var(--dy-brand-c-500) /
            0.10
        );

    color: var(--dy-accent);
}

.dy-login__lock-card h2 {
    margin: 0;

    color: var(--dy-text-strong);

    font-size: 1.2rem;
    font-weight: 800;
}

.dy-login__lock-card p {
    margin:
        var(--dy-space-3)
        0
        var(--dy-space-6);

    color: var(--dy-text-secondary);

    font-size: 0.85rem;
    line-height: 1.8;
}

/* =============================================================================
   Responsive
   ============================================================================= */

@media (max-width: 1100px) {
    .dy-login {
        grid-template-columns:
            minmax(320px, 0.75fr)
            minmax(480px, 1.25fr);
    }

    .dy-login__brand-content {
        padding-inline: 40px;
    }

    .dy-login__brand-title {
        font-size: 3rem;
    }
}

@media (max-width: 900px) {
    .dy-login {
        display: block;

        overflow: auto;
    }

    .dy-login__brand {
        display: none;
    }

    .dy-login__panel {
        min-height: 100vh;
        min-height: 100dvh;
    }

    .dy-login__panel-inner {
        width: min(
            100%,
            520px
        );

        padding:
            max(32px, env(safe-area-inset-top))
            28px
            max(28px, env(safe-area-inset-bottom));
    }

    .dy-login__mobile-logo {
        display: block;

        margin-bottom: 28px;
    }

    .dy-login__mobile-logo img {
        display: block;

        width: 148px;
        height: auto;
    }
}

@media (max-width: 560px) {
    .dy-login__panel-inner {
        padding-inline: 18px;
    }

    .dy-login__title {
        font-size: 2rem;
    }

    .dy-login__subtitle {
        font-size: 0.9rem;
    }

    .dy-login__options {
        align-items: flex-start;
        flex-direction: column;
    }

    .dy-login__input-wrap,
    .dy-login__input {
        min-height: 52px;
    }

    .dy-login__details {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 380px) {
    .dy-login__panel-inner {
        padding-inline: 14px;
    }

    .dy-login__title {
        font-size: 1.8rem;
    }
}

/* =============================================================================
   Reduced Motion
   ============================================================================= */

@media (prefers-reduced-motion: reduce) {
    .dy-login *,
    .dy-login *::before,
    .dy-login *::after {
        scroll-behavior: auto !important;

        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;

        transition-duration: 0.01ms !important;
    }
}

/* =============================================================================
   Forced Colors
   ============================================================================= */

@media (forced-colors: active) {
    .dy-login__input-wrap,
    .dy-login__runtime,
    .dy-login__error,
    .dy-login__security,
    .dy-login__lock-card {
        border-color: CanvasText;
    }

    .dy-login__forgot,
    .dy-login__section-label {
        color: LinkText;
    }

    .dy-login__submit {
        forced-color-adjust: none;
    }

    .dy-login__checkbox {
        border-color: CanvasText;
    }
}

/* =============================================================================
   Print
   ============================================================================= */

@media print {
    .dy-login__brand,
    .dy-login__runtime,
    .dy-login__security,
    .dy-login__footer,
    .dy-login__lock {
        display: none !important;
    }

    .dy-login {
        display: block;

        min-height: auto;

        color: #000;
        background: #fff;
    }

    .dy-login__panel {
        display: block;
    }
}

/* =============================================================================
   Rate Limit Indicator
   ============================================================================= */

.dy-login__rate-limit {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: var(--dy-space-5);
    padding: 12px 14px;
    border: 1px solid rgb(var(--dy-amber-c-500) / 0.28);
    border-radius: var(--dy-radius-lg);
    background: rgb(var(--dy-amber-c-500) / 0.07);
    color: var(--dy-amber-700);
}

.dy-login__rate-limit-icon {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--dy-amber-600);
}

.dy-login__rate-limit-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.78rem;
    strong {
        color: var(--dy-text-strong);
        font-size: 0.8rem;
    }
}

/* =============================================================================
   Session Timeout Warning
   ============================================================================= */

.dy-login__timeout {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 0.5);
}

.dy-login__timeout-card {
    width: min(100%, 420px);
    padding: 24px;
    background: var(--dy-bg);
    border-radius: var(--dy-radius-xl);
    box-shadow: 0 24px 64px rgb(0 0 0 / 0.3);
    text-align: center;
}

.dy-login__timeout-card h3 {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0;
    color: var(--dy-text-strong);
    font-size: 1.1rem;
    font-weight: 800;
}

.dy-login__timeout-card p {
    margin: 12px 0;
    color: var(--dy-text-secondary);
    font-size: 0.9rem;
    line-height: 1.8;
}

.dy-login__timeout-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 16px;
}

.dy-login__timeout-logout {
    padding: 8px 16px;
    border: 1px solid var(--dy-border);
    border-radius: var(--dy-radius-lg);
    background: transparent;
    color: var(--dy-text-secondary);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
}

.dy-login__timeout-logout:hover {
	background: var(--dy-surface);
	border-color: var(--dy-crimson-500);
	color: var(--dy-crimson-600);
}

/* =============================================================================
   Offline Indicator
   ============================================================================= */

.dy-login__offline-banner {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;

	padding: 10px 16px;

	background: rgb(var(--dy-amber-c-500) / 0.12);
	border-bottom: 1px solid rgb(var(--dy-amber-c-500) / 0.24);

	color: var(--dy-amber-700);

	font-size: 0.82rem;
	font-weight: 600;

	animation: dy-slide-down var(--dy-dur-standard) var(--dy-ease-standard);
}

@keyframes dy-slide-down {
	from {
		opacity: 0;
		transform: translateY(-100%);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

/* =============================================================================
   Input Error State
   ============================================================================= */

.dy-login__input--error + .dy-login__password-toggle {
	color: var(--dy-crimson-600);
}

.dy-login__input-wrap:has(.dy-login__input--error) {
	border-color: var(--dy-crimson-500);
}

.dy-login__input-wrap:has(.dy-login__input--error):focus-within {
	border-color: var(--dy-crimson-500);
	box-shadow: 0 0 0 3px rgb(var(--dy-crimson-c-500) / 0.12);
}

/* =============================================================================
   Password Strength
   ============================================================================= */

.dy-login__strength {
	font-size: 0.78rem;
	font-weight: 700;
}

.dy-login__field-error {
	display: flex;
	align-items: center;
	gap: 4px;

	color: var(--dy-crimson-600);

	font-size: 0.78rem;
	font-weight: 600;
}

/* =============================================================================
   Offline Mode Variant
   ============================================================================= */

.dy-login--offline .dy-login__title::after {
	content: " (غير متصل)";
	color: var(--dy-amber-600);
	font-weight: 600;
	font-size: 0.9em;
}

/* =============================================================================
   Reduced Motion Class
   ============================================================================= */

.dy-login--reduced-motion *,
.dy-login--reduced-motion *::before,
.dy-login--reduced-motion *::after {
	animation-duration: 0.01ms !important;
	transition-duration: 0.01ms !important;
}

/* =============================================================================
   Dark Mode Enhancements
   ============================================================================= */

.dy-login--dark .dy-login__offline-banner {
	background: rgb(var(--dy-amber-c-500) / 0.18);
	border-bottom-color: rgb(var(--dy-amber-c-500) / 0.3);
	color: var(--dy-amber-400);
}

.dy-login--dark .dy-login__input-wrap {
	background: var(--dy-surface);
	border-color: var(--dy-border);
}

.dy-login--dark .dy-login__input-wrap:focus-within {
	box-shadow: 0 0 0 3px rgb(var(--dy-brand-c-500) / 0.18);
}

.dy-login--dark .dy-login__error {
	background: rgb(var(--dy-crimson-c-500) / 0.12);
	border-color: rgb(var(--dy-crimson-c-500) / 0.3);
	color: var(--dy-crimson-400);
}

.dy-login--dark .dy-login__error-close:hover {
	background: rgb(var(--dy-crimson-c-500) / 0.12);
}

.dy-login--dark .dy-login__rate-limit {
	background: rgb(var(--dy-amber-c-500) / 0.12);
	border-color: rgb(var(--dy-amber-c-500) / 0.3);
	color: var(--dy-amber-400);
}

.dy-login--dark .dy-login__timeout-card {
	background: var(--dy-surface);
	box-shadow: 0 24px 64px rgb(0 0 0 / 0.5);
}

/* =============================================================================
   Mobile Enhancements
   ============================================================================= */

@media (max-width: 768px) {
	.dy-login--mobile .dy-login__panel-inner {
		padding-inline: 24px;
	}

	.dy-login--mobile .dy-login__offline-banner {
		font-size: 0.78rem;
		padding: 8px 12px;
	}
}

@media (max-width: 480px) {
	.dy-login--mobile .dy-login__panel-inner {
		padding-inline: 16px;
	}

	.dy-login--mobile .dy-login__title {
		font-size: 1.6rem;
	}

	.dy-login--mobile .dy-login__submit {
		width: 100%;
	}
}

/* =============================================================================
   Focus Visible Enhancement
   ============================================================================= */

.dy-login__input:focus-visible,
.dy-login__password-toggle:focus-visible,
.dy-login__forgot:focus-visible,
.dy-login__remember input:focus-visible + .dy-login__checkbox {
	outline: 2px solid var(--dy-accent);
	outline-offset: 2px;
}

.dy-login__remember:focus-visible {
	border-radius: var(--dy-radius-sm);
}
</style>
