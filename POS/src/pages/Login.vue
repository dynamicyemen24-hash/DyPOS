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

import { FeatherIcon } from "dypos-ui"

import { endpoints } from "@/utils/apiEndpoints"

import DyPOSLogo from "@/assets/DyPOSLogo.png"
import smartPortsBg from "@/assets/smart-ports-og.jpg"

import ShiftOpeningDialog from "@/components/ShiftOpeningDialog.vue"
import CompanyFooter from "@/components/common/CompanyFooter.vue"
import DyButton from "@/components/ui/DyButton.vue"
import PasswordStrengthBar from "@/components/reports/dashboards/core/PasswordStrengthBar.vue"

/*
 * تنسيقات شاشة الدخول في ملف مستقل: `styles/pages/login.css`.
 *
 * السبب: الملف كان 2598 سطرًا، منها 1531 سطرًا `<style scoped>` — أي أن أكثر
 * من نصف الملف تنسيقات. الاستخراج إلى ملف جانبي يُبقي SFC تحت رافعة الحجم
 * (`tests/fileSize.test.js`) ويفصل العرض عن منطق الصفحة.
 *
 * يُحمَّل عبر `<style scoped src="…">` في أسفل الملف، فيبقى النطاق خاصًا
 * بهذه الصفحة وحدها — ولا استيراد مزدوج هنا.
 */

import { session } from "@/stores/session"
import { goToForgotPassword } from "@/router"
import { useSessionLock } from "@/composables/useSessionLock"
import { useSessionTimeout } from "@/composables/useSessionTimeout"
import { useSecondsRemaining } from "@/composables/useSecondsRemaining"
import { useRememberedEmail } from "@/composables/useRememberedEmail"
import { useReducedMotion } from "@/composables/useReducedMotion"
import { useMediaQuery } from "@/composables/useMediaQuery"
import {
	useLoginRuntime,
	attemptLocalLogin,
	loginRateLimiter,
	sanitizeForInput,
	log,
} from "@/composables/useLoginRuntime"
import { usePinAuth } from "@/composables/usePinAuth"
import {
	PIN_EXPIRY_MS,
	PIN_MAX_LENGTH,
	PIN_MIN_LENGTH,
	sanitizePin,
	validatePinPair,
} from "@/composables/usePinAuthRules"

import { cleanupUserSession, normalizeAuthError } from "@/utils/auth"
import {
	handleAuthFailure,
	handleAuthSuccess,
	handleSessionExpiry,
	handleSessionIdleTimeout,
	handleSessionAbsoluteTimeout,
	installSecurityMonitor,
	checkSessionSecurity,
} from "@/utils/securityHardening"

/* ============================================================================
 * Constants
 * ========================================================================== */

/** مدة الجلسة قبل التحذير — نفس القيمة التي يمررها useSessionTimeout. */
const SESSION_DURATION_MS = 30 * 60 * 1000

/** رسالة القفل بصيغة واحدة، ومكان واحد للعدّ التنازلي. */
function rateLimitMessage(retryAfterMs) {
	return `محاولات كثيرة جدًا. انتظر ${Math.ceil(Number(retryAfterMs || 0) / 1000)} ثانية ثم حاول مرة أخرى.`
}

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

const password = ref("")

const isSubmitting = ref(false)
const loginError = ref("")

const emailInput = ref(null)
const passwordInput = ref(null)

const loginForm = ref(null)

/* ============================================================================
 * Runtime State
 * ============================================================================ */

/* ============================================================================
 * Runtime Readiness
 * ---------------------------------------------------------------------------
 * منطق التهيئة (CSRF، محرّك عدم الاتصال، اكتشاف الشبكة، تحديد الجاهزية)
 * Lives in composables/useLoginRuntime.js — قابل للاختبار وحده، ومختبر في
 * tests/loginRuntime.test.js.
 * ========================================================================== */

const {
	runtimeState,
	runtimeMessage,
	csrfReady,
	offlineReady,
	sessionReady,
	isOfflineMode,
	offlineDetected,
	isOnline,
	isRuntimeReady,
	rateLimitState,
	isRateLimited,
	setRuntimeState,
	prepareRuntime,
	detectAndSetOfflineMode,
	handleOnline,
	handleOffline,
} = useLoginRuntime({ showOfflineReadiness: props.showOfflineReadiness })

const shiftDialogOpen = ref(false)
const shiftOpening = ref(false)

const authenticationCompleted = ref(false)

/* ============================================================================
 * Session Timeout
 * ========================================================================== */

const sessionTimeout = useSessionTimeout({
	warningBeforeMs: 5 * 60 * 1000,
	sessionDurationMs: 30 * 60 * 1000,
	onLogout: () => {
		cleanupUserSession()
		handleSessionExpiry()
		loginError.value = "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى."
	},
})

/*
 * Destructure to top level: `<script setup>` unwraps only top-level bindings,
 * so a template reading `sessionTimeout.showWarning` gets a ref object — always
 * truthy, and `NaN` under arithmetic. See useSecondsRemaining.
 */
const {
	showWarning: showSessionWarning,
	timeRemaining: sessionTimeRemaining,
	isExtending: isExtendingSession,
	extendSession,
	dismissWarning,
} = sessionTimeout

const sessionSecondsLeft = useSecondsRemaining(sessionTimeRemaining)

/** Lockout countdown, same derivation — see useSecondsRemaining. */
const retryAfterSeconds = useSecondsRemaining(
	computed(() => rateLimitState.value?.retryAfterMs),
)

// Security hardening: install session activity monitoring and enforce
// session expiry, idle timeout, and absolute timeout policies.
let stopSecurityMonitor = null

/**
 * The periodic policy check.
 *
 * It used to be assigned to a local `const interval` that was never stored
 * and never cleared — the timer outlived the component and kept calling
 * `checkSessionSecurity()` on a page that was no longer mounted. A login
 * screen is entered and left repeatedly (every session expiry, every
 * back-navigation), so those timers accumulate.
 */
let securityCheckTimer = null

function installSessionSecurityMonitor() {
	if (stopSecurityMonitor) return

	stopSecurityMonitor = installSecurityMonitor()

	// Periodic session security check (independent of user activity).
	securityCheckTimer = setInterval(() => {
		const status = checkSessionSecurity()
		if (status !== "valid") {
			if (status === "idle_timeout") handleSessionIdleTimeout()
			if (status === "absolute_timeout") handleSessionAbsoluteTimeout()
		}
	}, 60 * 1000)
}

/** Idempotent teardown — safe to call even if the monitor was never installed. */
function stopSessionSecurityMonitor() {
	if (stopSecurityMonitor) {
		stopSecurityMonitor()
		stopSecurityMonitor = null
	}
	if (securityCheckTimer) {
		clearInterval(securityCheckTimer)
		securityCheckTimer = null
	}
}

/* ============================================================================
 * Computed
 * ========================================================================== */

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
 * Error
 * ========================================================================== */

/** خطأ واحد واضح، ومسار واحد لعرضه وإخفائه. */
function clearLoginError() {
	loginError.value = ""
}

/* ============================================================================
 * Authentication
 * ========================================================================== */

/** الإجراء الذي ينجح بعده كلٌّ من المسارين — مسار واحد للحساب بدل مسارين. */
function completeAuthentication(stage) {
	loginRateLimiter.recordSuccess()
	sessionReady.value = true
	authenticationCompleted.value = true

	sessionTimeout.start(SESSION_DURATION_MS)
	installSessionSecurityMonitor()

	log.info(`DyPOS authentication completed (${stage})`)
	handleAuthSuccess({ stage })

	emit("authenticated")
}

/**
 * تسجيل الدخول. يختار المسار حسب وضع الاتصال المُكتشف فعلياً (probe
 * للخادم) لا حسب `navigator.onLine` — انظر useLoginRuntime.
 */
async function submitLogin() {
	if (!canSubmit.value) return

	if (isRateLimited.value) {
		loginError.value = rateLimitMessage(rateLimitState.value.retryAfterMs)
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

		if (!offlineDetected.value) {
			await detectAndSetOfflineMode()
		}

		if (isOfflineMode.value) {
			const offlineResult = await attemptLocalLogin(
				email.value.trim(),
				password.value,
			)

			if (!offlineResult.success) {
				// No throwing: the offline result is already user-shaped, and
				// the catch block would overwrite it with a generic message.
				loginError.value = offlineResult.error || "فشل تسجيل الدخول المحلي"
				return
			}

			completeAuthentication("offline_login")
		} else {
			await session.login({
				usr: sanitizeForInput(email.value.trim()),
				pwd: sanitizeForInput(password.value),
			})

			completeAuthentication("login")
		}

		await bootstrapAuthenticatedSession()
	} catch (error) {
		authenticationCompleted.value = false

		const limitResult = loginRateLimiter.recordFailure()
		if (!limitResult.allowed) {
			loginError.value = rateLimitMessage(limitResult.retryAfterMs)
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

		log.warn("DyPOS authentication failed", {
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
		log.error("DyPOS session bootstrap failed", error)

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
		log.error("DyPOS shift opening failed", error)

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

const unlockPassword = ref("")
const unlockError = ref("")
const unlocking = ref(false)

/**
 * فتح الجلسة المقفلة.
 *
 * `unlock()` تتحقق من كلمة المرور على الخادم (أو من الكاش المخزّن محلياً)،
 * فالزر القديم كان يناديها بلا وسيط — أي زر يرسم ولا يفعل شيئاً. الآن صار
 * خلفه حقل كلمة مرور حقيقي ورسالة خطأ من الـ composable نفسه.
 */
async function handleSessionLock() {
	if (unlocking.value) return

	if (!unlockPassword.value) {
		unlockError.value = "أدخل كلمة المرور لفتح الجلسة."
		return
	}

	unlocking.value = true
	unlockError.value = ""

	try {
		const result = await unlockSession(unlockPassword.value)

		if (result?.success) {
			unlockPassword.value = ""
			return
		}

		unlockError.value = result?.error || "تعذر فتح الجلسة. حاول مرة أخرى."
	} catch (error) {
		log.warn("DyPOS session unlock failed", error)
		unlockError.value = "تعذر فتح الجلسة. حاول مرة أخرى."
	} finally {
		unlocking.value = false
	}
}

async function cleanup() {
	try {
		await cleanupUserSession?.()
	} catch (error) {
		log.warn("DyPOS session cleanup failed", error)
	}
}

/* ============================================================================
 * PIN Authentication
 * ============================================================================ */

const showPinSetup = ref(false)
const pinCode = ref("")
const pinConfirm = ref("")
const pinLoginInProgress = ref(false)
const pinError = ref("")
const pinSetupError = ref("")

/** نصوص زر «إنشاء رمز دخول سريع» المعطّل: تلميح الفأرة قصير، والاسم الميسّر (aria-label) يشرح سبب التعطيل. */
const PIN_DEVICE_HINT = "اضبط رمز دخول سريع لهذا الجهاز"
const PIN_EMAIL_TOO_SHORT = "أدخل بريدك أولًا"
const PIN_EMAIL_REQUIRED = "أدخل بريدك الإلكتروني أولًا لتمكين إنشاء رمز PIN"

/** هل واجهة PIN معروضة بدل نموذج كلمة المرور؟ */
const pinModeActive = ref(false)

const {
	isPinValid: pinAvailable,
	pinLogin: attemptPinLogin,
	savePin: storePin,
	clearPin: wipePin,
	loadPinState,
} = usePinAuth()

/** يقبل الحقل أرقامًا فقط — يمنع الحروف قبل أن تصل إلى PBKDF2. */
function sanitizePinInput(event) {
	pinCode.value = sanitizePin(event.target.value)
	pinError.value = ""
}

/**
 * كاتب واحد لحقلي الإعداد.
 * الحقلان يفعلان الشيء نفسه بالضبط؛ تكرار التعبير في القالب يعني أن إصلاح
 * أحدهما لاحقًا يترك الآخر على السلوك القديم بلا تحذير.
 */
function onPinSetupInput(field, event) {
	const digits = sanitizePin(event.target.value)

	if (field === "code") pinCode.value = digits
	else pinConfirm.value = digits

	pinSetupError.value = ""
}

/** ينتقل من كلمة المرور إلى PIN فقط إن كان هناك PIN فعلي. */
function enterPinMode() {
	pinModeActive.value = true
	loginError.value = ""
	pinError.value = ""
	nextTick(() => pinCodeInput.value?.focus?.())
}

/** العودة لنموذج كلمة المرور. */
function exitPinMode() {
	pinModeActive.value = false
	pinCode.value = ""
	pinError.value = ""
	nextTick(() => emailInput.value?.focus?.())
}

const pinCodeInput = ref(null)
const pinConfirmInput = ref(null)

async function handlePinLogin() {
	if (!pinAvailable.value) {
		pinError.value =
			"لم يتم إعداد كود PIN بعد. يرجى تسجيل الدخول بكلمة المرور أولاً."
		return
	}

	pinLoginInProgress.value = true
	pinError.value = ""

	try {
		// `pinLogin` يُرجع { success, error } ولا يرمي أبداً — فالاعتماد على
		// catch كان يجعل أي PIN خاطئ يبدو "ناجحاً" ويمرّر المستخدم إلى ما
		// بعده. العقد يُفحص هنا صراحةً.
		const result = await attemptPinLogin(pinCode.value)
		if (!result?.success) {
			pinError.value = result?.error || "كود PIN غير صحيح"
			return
		}

		pinCode.value = ""
		completeAuthentication("pin_login")
		await bootstrapAuthenticatedSession()
	} catch (error) {
		authenticationCompleted.value = false
		pinError.value = error?.message || "كود PIN غير صحيح"
		log.warn("DyPOS PIN authentication failed", error)
		emit("error", error)
	} finally {
		pinLoginInProgress.value = false
	}
}

/**
 * إعداد PIN جديد بعد أول تسجيل دخول أو عند الطلب.
 */
async function handlePinSetup() {
	// The length range, the digits-only rule and the confirmation match are one
	// contract; `validatePinPair` is that contract, so the two setup fields
	// cannot disagree about what a valid PIN is.
	const invalid = validatePinPair(pinCode.value, pinConfirm.value)
	if (invalid) {
		pinSetupError.value = invalid
		return
	}

	// savePin(pinCode, email, expiryMs) — الترتيب (email, pin) كان معكوساً،
	// فكان يُخزَّن البريد في خانة الكود ويُشوَّش أي تحقق لاحق.
	const saved = await storePin(pinCode.value, email.value.trim(), PIN_EXPIRY_MS)

	if (!saved) {
		pinSetupError.value = "فشل إعداد كود PIN"
		log.error("DyPOS PIN setup failed")
		return
	}

	pinSetupError.value = ""
	showPinSetup.value = false
	pinCode.value = ""
	pinConfirm.value = ""
	log.info("DyPOS PIN setup completed")
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
		log.info("DyPOS PIN cleared")
	} catch (error) {
		log.warn("DyPOS PIN clear failed", error)
	}
}

/* ============================================================================
 * Remembered Email
 * ========================================================================== */

const {
	email,
	rememberMe,
	restore: restoreRememberedEmail,
	persist: persistRememberedEmail,
} = useRememberedEmail({
	enabled: props.rememberEmail,
	onError: (message, error) => log.debug(message, error),
})

/* ============================================================================
 * Keyboard
 * ========================================================================== */

function handleGlobalKeydown(event) {
	// Enter submits from anywhere except multiline inputs (native form
	// behavior already covers single-line inputs + the submit button).
	// The form element is read from the template ref, not `document` — a
	// querySelector here used to call a `handleLogin()` that never existed,
	// so pressing Enter outside the fields threw a ReferenceError.
	if (
		event.key === "Enter" &&
		!event.shiftKey &&
		!event.ctrlKey &&
		!event.metaKey &&
		!(event.target instanceof HTMLTextAreaElement) &&
		!isSubmitting.value
	) {
		const form = loginForm.value
		if (form && !form.contains(event.target)) {
			event.preventDefault()
			void submitLogin()
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

	/*
	 * قراءة حالة PIN المحفوظة قبل رسم النموذج.
	 *
	 * `isPinValid` كان `false` دائمًا لأن `loadPinState()` — وهي الدالة
	 * الوحيدة التي تقرأ localStorage — لم تكن تُستدعى أبدًا. فكان زر «دخول
	 * سريع بالرمز» لو وُجد سيظهر ولا يفعل شيئًا: عقد ميت.
	 */
	loadPinState()

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

	stopSessionSecurityMonitor()

	sessionTimeout.destroy?.()

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

        <section class="dy-login__brand" aria-label="هوية DyPOS">
            <div class="dy-login__brand-overlay" />

            <div class="dy-login__brand-content">
                <div class="dy-login__logo-shell">
                    <img
                        :src="DyPOSLogo"
                        alt="DyPOS"
                        class="dy-login__logo"
                        width="112"
                        height="112"
                        decoding="async"
                    />
                </div>

                <div class="dy-login__brand-copy">
                    <span class="dy-login__eyebrow">
                        <span class="dy-login__eyebrow-dot" aria-hidden="true" />

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

                <!-- بطاقة الهوية: الصورة مؤطّرة داخل اللوحة، لا ممدودة خلفها.
                     الصورة بطاقة نشر 1200×630 تحمل نصوصًا مطبوعة داخلها، وجدول
                     `cover` كان يقصّها إلى شظايا كلمات غير مقروءة («الذكية
                     للبرمجيا…» / «Smart Ports Softw…») متضاربة مع العنوان الحي
                     فوقها. هنا تظهر كاملة داخل إطار زجاجي: رشيقة ومقروءة. -->
                <figure class="dy-login__brand-card">
                    <img
                        :src="smartPortsBg"
                        alt="شركة المنافذ الذكية للبرمجيات — Smart Ports Software"
                        width="1200"
                        height="630"
                        decoding="async"
                    />
                </figure>

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
                        <span class="dy-login__context-icon" aria-hidden="true">
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

                    <span class="dy-login__brand-dot" aria-hidden="true" />

                    <span>
                        جاهز للتوسع
                    </span>

                    <span class="dy-login__brand-dot" aria-hidden="true" />

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
            <div
                class="dy-login__panel-inner"
                :aria-busy="isSubmitting"
            >
                <!-- شريط التقدّم: العنصر الوحيد الذي يمثّل حالة `dy-login--busy` -->
                <div
                    v-if="isSubmitting"
                    class="dy-login__progress"
                    aria-hidden="true"
                >
                    <span class="dy-login__progress-bar" />
                </div>

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
                    <span class="dy-login__runtime-icon" aria-hidden="true">
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
                        aria-label="إعادة محاولة الاتصال بالخادم"
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
                    <span class="dy-login__rate-limit-icon" aria-hidden="true">
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
                            {{ retryAfterSeconds }}
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
                    <span class="dy-login__error-icon" aria-hidden="true">
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

                <!-- =================================================================
                     PIN Quick Login
                     ==================================================================
                     The whole PIN feature existed and was fully implemented in
                     `usePinAuth` (PBKDF2, expiry, attempt lockout) — but no
                     markup ever read it, so `pinAvailable` was false, the
                     handlers were unreachable, and the whole path was dead
                     weight. The API is the intent; this is the missing UI.
                     ================================================================= -->

                <form
                    v-if="pinModeActive"
                    ref="pinForm"
                    class="dy-login__form"
                    novalidate
                    @submit.prevent="handlePinLogin"
                >
                    <div class="dy-login__field">
                        <label
                            for="dypos-pin-code"
                            class="dy-login__label"
                        >
                            {{ pinAvailable ? "كود الدخول السريع" : "لا يوجد رمز محفوظ" }}
                        </label>

                        <div
                            class="dy-login__input-wrap"
                            :class="{
                                'dy-login__input-wrap--error': pinError,
                            }"
                        >
                            <FeatherIcon
                                name="key"
                                :size="18"
                                class="dy-login__input-icon"
                                aria-hidden="true"
                            />

                            <input
                                id="dypos-pin-code"
                                ref="pinCodeInput"
                                :value="pinCode"
                                class="dy-login__input dy-login__input--pin"
                                type="password"
                                inputmode="numeric"
                                autocomplete="off"
                                maxlength="8"
                                dir="ltr"
                                placeholder="••••"
                                :disabled="pinLoginInProgress || !pinAvailable"
                                :aria-invalid="!!pinError"
                                aria-describedby="dypos-pin-error"
                                @input="sanitizePinInput"
                            />
                        </div>

                        <p
                            v-if="pinError"
                            id="dypos-pin-error"
                            class="dy-login__field-error"
                            role="alert"
                            aria-live="assertive"
                        >
                            <FeatherIcon
                                name="alert-circle"
                                :size="14"
                                aria-hidden="true"
                            />
                            {{ pinError }}
                        </p>
                        <p
                            v-else
                            class="dy-login__hint"
                        >
                            أدخل رمز الدخول السريع (من {{ PIN_MIN_LENGTH }} إلى
                            {{ PIN_MAX_LENGTH }} خانات)
                        </p>
                    </div>

                    <DyButton
                        type="submit"
                        variant="primary"
                        size="lg"
                        class="dy-login__submit"
                        :loading="pinLoginInProgress"
                        :disabled="!pinAvailable || pinCode.length < PIN_MIN_LENGTH"
                        :aria-busy="pinLoginInProgress"
                    >
                        <FeatherIcon
                            v-if="!pinLoginInProgress"
                            name="zap"
                            :size="18"
                            aria-hidden="true"
                        />
                        دخول سريع
                    </DyButton>

                    <button
                        type="button"
                        class="dy-login__link-button"
                        @click="exitPinMode"
                        aria-label="العودة لتسجيل الدخول بكلمة المرور"
                    >
                        الدخول بكلمة المرور
                    </button>
                </form>

                <!-- Form -->

                <form
                    v-else
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
                                class="dy-login__input"
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
                                :aria-invalid="!!(!password.value && isSubmitting)"
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

                <!-- =================================================================
                     Quick-access row: PIN entry + setup
                     ==================================================================
                     `handleClearPin` was the fourth dead handler: it existed, was
                     correct, and nothing could ever call it — so a saved PIN could
                     not be revoked from the screen that owns it. Both actions are
                     gated on the same `pinAvailable` fact, so neither can render a
                     button that does nothing.
                     ================================================================= -->

                <div
                    v-if="!pinModeActive"
                    class="dy-login__quick-actions"
                >
                    <button
                        v-if="pinAvailable"
                        type="button"
                        class="dy-login__link-button"
                        @click="enterPinMode"
                        aria-label="التبديل لتسجيل الدخول السريع برمز PIN"
                    >
                        <FeatherIcon
                            name="zap"
                            :size="15"
                            aria-hidden="true"
                        />
                        دخول سريع برمز PIN
                    </button>

                    <button
                        v-else
                        type="button"
                        class="dy-login__link-button"
                        :disabled="!email"
                        :title="email ? PIN_DEVICE_HINT : PIN_EMAIL_TOO_SHORT"
                        :aria-label="email ? PIN_DEVICE_HINT : PIN_EMAIL_REQUIRED"
                        @click="showPinSetup = true"
                    >
                        <FeatherIcon
                            name="key"
                            :size="15"
                            aria-hidden="true"
                        />
                        إنشاء رمز دخول سريع
                    </button>

                    <button
                        v-if="pinAvailable"
                        type="button"
                        class="dy-login__link-button dy-login__link-button--quiet"
                        @click="handleClearPin"
                        aria-label="إلغاء رمز الدخول السريع المحفوظ"
                    >
                        إلغاء الرمز
                    </button>
                </div>

                <!-- PIN setup -->

                <div
                    v-if="showPinSetup"
                    class="dy-login__pin-setup"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="dypos-pin-setup-title"
                >
                    <h3
                        id="dypos-pin-setup-title"
                        class="dy-login__pin-setup-title"
                    >
                        إنشاء رمز دخول سريع
                    </h3>

                    <p class="dy-login__hint">
                        يُحفظ الرمز مشفّرًا على هذا الجهاز فقط، ويصالح
                        {{ PIN_EXPIRY_MS / 60000 }} دقيقة. لا يمكن استعادته إن فُقد.
                    </p>

                    <form
                        class="dy-login__form"
                        novalidate
                        @submit.prevent="handlePinSetup"
                    >
                        <div class="dy-login__field">
                            <label
                                for="dypos-pin-new"
                                class="dy-login__label"
                            >
                                الرمز الجديد
                            </label>

                            <input
                                id="dypos-pin-new"
                                :value="pinCode"
                                class="dy-login__input"
                                type="password"
                                inputmode="numeric"
                                autocomplete="off"
                                maxlength="8"
                                dir="ltr"
                                :aria-invalid="!!pinSetupError"
                                @input="onPinSetupInput('code', $event)"
                            />
                        </div>

                        <div class="dy-login__field">
                            <label
                                for="dypos-pin-confirm"
                                class="dy-login__label"
                            >
                                تأكيد الرمز
                            </label>

                            <input
                                id="dypos-pin-confirm"
                                ref="pinConfirmInput"
                                :value="pinConfirm"
                                class="dy-login__input"
                                type="password"
                                inputmode="numeric"
                                autocomplete="off"
                                maxlength="8"
                                dir="ltr"
                                :aria-invalid="!!pinSetupError"
                                @input="onPinSetupInput('confirm', $event)"
                            />
                        </div>

                        <p
                            v-if="pinSetupError"
                            class="dy-login__field-error"
                            role="alert"
                            aria-live="assertive"
                        >
                            <FeatherIcon
                                name="alert-circle"
                                :size="14"
                                aria-hidden="true"
                            />
                            {{ pinSetupError }}
                        </p>

                        <div class="dy-login__quick-actions">
                            <DyButton
                                type="submit"
                                variant="primary"
                                size="sm"
                                :disabled="pinCode.length < PIN_MIN_LENGTH"
                            >
                                حفظ الرمز
                            </DyButton>

                            <button
                                type="button"
                                class="dy-login__link-button"
                                @click="cancelPinSetup"
                        aria-label="إلغاء إعداد رمز PIN"
                    >
                                إلغاء
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Security / Runtime information -->

                <aside
                    class="dy-login__security"
                    aria-label="معلومات الأمان والتشغيل"
                >
                    <div class="dy-login__security-main">
                        <span class="dy-login__security-icon" aria-hidden="true">
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
                        :aria-label="
                            showRuntimeDetails
                                ? 'إخفاء تفاصيل الاتصال'
                                : 'عرض تفاصيل الاتصال'
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
                        v-if="showSessionWarning"
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
                                {{ sessionSecondsLeft }}
                                ثانية. هل تريد تمديد الجلسة؟
                            </p>

                            <div class="dy-login__timeout-actions">
                                <DyButton
                                    variant="primary"
                                    size="sm"
                                    :loading="isExtendingSession"
                                    @click="extendSession()"
                                >
                                    تمديد الجلسة
                                </DyButton>

                                <button
                                    type="button"
                                    class="dy-login__timeout-logout"
                                    @click="dismissWarning"
                                    aria-label="تسجيل الخروج وإنهاء الجلسة"
                                >
                                    تسجيل الخروج
                                </button>
                            </div>
                        </div>
                    </div>
                </Transition>

                <!-- Register — كان ابنًا مباشرًا للشبكة بلا تنسيق، فيقع في
                     الصف الثاني تحت لوحة الهوية الداكنة. -->

                <p class="dy-login__register">
                    ليس لديك حساب؟
                    <a href="/account/register" @click.prevent="goToRegister">
                        سجّل الآن
                    </a>
                </p>

                <!-- Footer — اسم الشركة + رابط موقعها الرسمي -->

                <CompanyFooter class="dy-login__footer" />
            </div>
        </section>

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

                <form
                    class="dy-login__lock-form"
                    novalidate
                    @submit.prevent="handleSessionLock"
                >
                    <label
                        for="dypos-unlock-password"
                        class="dy-login__label"
                    >
                        كلمة المرور
                    </label>

                    <div class="dy-login__input-wrap">
                        <FeatherIcon
                            name="lock"
                            :size="18"
                            class="dy-login__input-icon"
                            aria-hidden="true"
                        />

                        <input
                            id="dypos-unlock-password"
                            v-model="unlockPassword"
                            class="dy-login__input"
                            type="password"
                            autocomplete="current-password"
                            dir="ltr"
                            placeholder="أدخل كلمة المرور"
                            :disabled="unlocking"
                            :aria-invalid="!!unlockError"
                            aria-describedby="dypos-unlock-error"
                        />
                    </div>

                    <p
                        v-if="unlockError"
                        id="dypos-unlock-error"
                        class="dy-login__field-error"
                        role="alert"
                        aria-live="assertive"
                    >
                        <FeatherIcon
                            name="alert-circle"
                            :size="14"
                            aria-hidden="true"
                        />
                        {{ unlockError }}
                    </p>

                    <DyButton
                        type="submit"
                        variant="primary"
                        size="lg"
                        :loading="unlocking"
                        :disabled="unlocking"
                        class="dy-login__lock-submit"
                    >
                        فتح الجلسة
                    </DyButton>
                </form>
            </div>
        </div>
    </main>
</template>

<style scoped src="@/styles/pages/login.css"></style>
