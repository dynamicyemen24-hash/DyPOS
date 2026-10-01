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
import { COMPANY_WEBSITE, COMPANY_WEBSITE_LABEL } from "@/utils/brand"
import { translationVersion } from "@/utils/translation"

import DyPOSLogo from "@/assets/DyPOSLogo.png"
import smartPortsBg from "@/assets/smart-ports-og.jpg"

import ShiftOpeningDialog from "@/components/ShiftOpeningDialog.vue"
import CompanyFooter from "@/components/common/CompanyFooter.vue"
import LoginAppearanceBar from "@/components/common/LoginAppearanceBar.vue"
import LoginSessionLockDialog from "@/components/common/LoginSessionLockDialog.vue"
import LoginSessionTimeoutDialog from "@/components/common/LoginSessionTimeoutDialog.vue"
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
import { useAppTheme } from "@/composables/useAppTheme"
import { useLoginPreferences } from "@/composables/useLoginPreferences"
import { useCapsLock } from "@/composables/useCapsLock"
import { useLoginRequiredFields } from "@/composables/useLoginRequiredFields"
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
import { __ } from "@/utils/translation"
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

/**
 * رسالة القفل بصيغة واحدة، ومكان واحد للعدّ التنازلي.
 *
 * `{0}` بدل `${…}`: النص المصدري العربي هو مفتاح القاموس، وحين تُترجَم
 * الرسالة ينتقل الرقم معها (`Waiting 30 seconds` لا `30 Waiting seconds`).
 */
function rateLimitMessage(retryAfterMs) {
	const seconds = String(Math.ceil(Number(retryAfterMs || 0) / 1000))

	return __("محاولات كثيرة جدًا. انتظر {0} ثانية ثم حاول مرة أخرى.", {
		0: seconds,
	})
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

/*
 * القفل نفسه (الحقل، الخطأ، زر الفتح) في `LoginSessionLockDialog` — وهي
 * حالة شاشة مستقلة تستهلك `useSessionLock` نفسه. هنا نحتاج القفل فقط
 * لتعتيم اللوحة خلفه.
 */
const { isLocked: sessionLocked } = useSessionLock()

/* ============================================================================
 * Form State
 * ========================================================================== */

const password = ref("")
const showPassword = ref(false)
const showRuntimeDetails = ref(false)

const isSubmitting = ref(false)
const loginError = ref("")

const emailInput = ref(null)
const passwordInput = ref(null)

const loginForm = ref(null)

/** تلميح Caps Lock: يُحدَّث من الحدث نفسه، لا بمراقب دائم للمستند. */
const { capsLockOn, trackCapsLock } = useCapsLock()

/* ============================================================================
 * Runtime Readiness
 * تهيئة CSRF وعدم الاتصال والشبكة في useLoginRuntime.js ومختبرة في
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
	prepareRuntime,
	prepareServerDemand,
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
		loginError.value = __("انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.")
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

/*
 * حالة بيئة التشغيل: جدول لا سلسلة `if`.
 *
 * كان كل حالة تُعيد كائنًا جديدًا من 39 سطرًا، وأربع تفاصيل اتصال في
 * القالب كانت أربع نسخ من نفس البنية. الحالتان الآن صفّان في جدول واحد،
 * والتسميات مفاتيح القاموس العربي: يتغيّر النص مع اللغة، ويبقى المنطق
 * كما هو، ولا يمكن لصفّ أن يخرج عن شكل البنية الذي يرسمه القالب.
 */
const RUNTIME_STATUS_BY_STATE = {
	failed: {
		type: "error",
		icon: "alert-circle",
		label: "تعذر تجهيز بيئة التشغيل",
	},
	degraded: {
		type: "warning",
		icon: "wifi-off",
		label: "سيتم المتابعة بوضع اتصال محدود",
	},
	ready: { type: "success", icon: "check-circle", label: "بيئة التشغيل جاهزة" },
	preparing: { type: "info", icon: "loader", label: "جاري تجهيز بيئة التشغيل" },
	unknown: { type: "neutral", icon: "shield", label: "بيئة التشغيل" },
}

const runtimeStatus = computed(() => {
	const row =
		RUNTIME_STATUS_BY_STATE[runtimeState.value] ??
		RUNTIME_STATUS_BY_STATE.unknown

	return row
})

/** تفاصيل التشغيل: صفّ واحد لكل إشارة، والقالب يرسمها بـ`v-for`. */
const runtimeDetails = computed(() => [
	{ label: "الاتصال", value: isOnline.value ? "متصل" : "غير متصل" },
	{
		label: "الحماية",
		value: csrfReady.value ? "جاهزة" : "قيد التجهيز",
	},
	{
		label: "الجلسة",
		value: sessionReady.value ? "جاهزة" : "غير مهيأة",
	},
	{
		label: "التشغيل دون اتصال",
		value: offlineReady.value ? "جاهز" : "غير جاهز",
	},
])

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
const isMobile = useMediaQuery("(max-width: 768px)")

/*
 * السمة تتبع اختيار المستخدم، لا تفضيل نظام التشغيل وحده.
 *
 * كان `prefersDark` (استعلام وسائط) يقود صنف `dy-login--dark`، فكان جهازٌ
 * اختار سمة فاتحة على نظام داكن يعرض لوحة الدخول داكنةً بينما تبقى بقية
 * التطبيق فاتحة. `isDark` هو السمة المحسومة التي يطبّقها `useAppTheme` على
 * `<html data-theme>`، فنطابقها بدل تخمينها من نظام التشغيل.
 */
const { isDark } = useAppTheme()

/*
 * `locale`/`dir` مربوطان على جذر الصفحة، وإصدار القاموس يفرض إعادة الرسم
 * بعد اكتمال تحميل الترجمة لأن `window.translatedMessages` غير تفاعلي.
 */
const { locale: preferencesLocale, dir: preferencesDir } = useLoginPreferences()

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
	if (isSubmitting.value || !validateRequiredFields()) return

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
		// Standalone-first: the submit button IS the demand — no probe
		// before it. Local login first (zero network); the server is
		// attempted only when the local store misses these credentials.
		// A server success grants linkage consent inside session.login.
		const offlineResult = await attemptLocalLogin(
			email.value.trim(),
			password.value,
		)

		if (offlineResult.success) {
			if (!offlineDetected.value) {
				await detectAndSetOfflineMode()
			}

			completeAuthentication("offline_login")
		} else {
			// Explicit server demand: handshake first, then login.
			await prepareServerDemand()
			await session.login({
				usr: sanitizeForInput(email.value.trim()),
				pwd: sanitizeForInput(password.value),
			})

			if (!offlineDetected.value) {
				await detectAndSetOfflineMode()
			}

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

		loginError.value = __("تم تسجيل الدخول، لكن تعذر تجهيز جلسة نقطة البيع.")

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
		pinError.value = __(
			"لم يتم إعداد كود PIN بعد. يرجى تسجيل الدخول بكلمة المرور أولاً.",
		)
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
			pinError.value = result?.error || __("كود PIN غير صحيح")
			return
		}

		pinCode.value = ""
		completeAuthentication("pin_login")
		await bootstrapAuthenticatedSession()
	} catch (error) {
		authenticationCompleted.value = false
		pinError.value = error?.message || __("كود PIN غير صحيح")
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
		pinSetupError.value = __("فشل إعداد كود PIN")
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

const {
	emailMissing,
	passwordMissing,
	validate: validateRequiredFields,
} = useLoginRequiredFields({ email, password, emailInput, passwordInput })

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
			'dy-login--dark': isDark,
		}"
		:dir="preferencesDir"
		:lang="preferencesLocale"
		:data-translation-version="translationVersion"
	>
		<!-- Offline Indicator -->
		<div
			v-if="isOfflineMode && offlineDetected"
			class="dy-login__offline-banner"
			role="status"
			aria-live="polite"
		>
			<FeatherIcon name="wifi-off" :size="16" aria-hidden="true" />
			<span>{{ __('وضع عدم الاتصال — سيتم تسجيل الدخول محليًا') }}</span>
		</div>
        <!-- =================================================================
             Brand / Context Panel
             =============================================================== -->

		<section class="dy-login__brand" :aria-label="__('هوية DyPOS')">
			<div class="dy-login__brand-content">
				<a
					class="dy-login__brand-logo"
					:href="COMPANY_WEBSITE"
					target="_blank"
					rel="noopener noreferrer"
					:aria-label="COMPANY_WEBSITE_LABEL"
				>
					<span class="dy-login__logo-shell">
						<img
							:src="DyPOSLogo"
							alt="DyPOS"
							class="dy-login__logo"
							width="112"
							height="112"
							decoding="async"
						/>
					</span>
				</a>

				<CompanyFooter
					class="dy-login__brand-company"
				/>
				<LoginAppearanceBar
					compact
					class="dy-login__preferences"
				/>
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

				<div
					v-if="showTenantContext && contextItems.length"
					class="dy-login__context"
					:aria-label="__('سياق التشغيل')"
				>
					<div
						v-for="item in contextItems"
						:key="`${item.icon}-${item.label}`"
						class="dy-login__context-item"
					>
						<FeatherIcon :name="item.icon" :size="15" aria-hidden="true" />
						<span class="dy-login__context-label">{{ item.label }}</span>
					</div>
				</div>

                <!-- Header -->

                <header class="dy-login__header">
                    <div>
                        <span class="dy-login__section-label">
                            {{ __('تسجيل الدخول') }}
                        </span>

                        <h2 class="dy-login__title">
                            {{ __('مرحبًا بك') }}
                        </h2>

                        <p class="dy-login__subtitle">
                            {{ __('سجّل الدخول للمتابعة إلى نقطة البيع.') }}
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
                            {{ __(runtimeStatus.label) }}
                        </strong>

                        <span
                            v-if="runtimeMessage"
                        >
                            {{ __(runtimeMessage) }}
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
                        :aria-label="__('إعادة محاولة الاتصال بالخادم')"
                    >
                        {{ __('إعادة المحاولة') }}
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
                            {{ __('تم قفل المؤقت') }}
                        </strong>

                        <span>
                            {{ __("المحاولة بعد") }}
                            {{ retryAfterSeconds }}
                            {{ __("ثانية") }}
                        </span>
                    </div>
                </div>

                <!-- Error -->

                <div
                    v-if="loginError"
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
                            {{ __('تعذر تسجيل الدخول') }}
                        </strong>

                        <span>
                            {{ loginError }}
                        </span>
                    </div>

                    <button
                        type="button"
                        class="dy-login__error-close"
                        :aria-label="__('إغلاق رسالة الخطأ')"
                        :title="__('إغلاق')"
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
                    class="dy-login__form"
                    novalidate
                    @submit.prevent="handlePinLogin"
                >
                    <div class="dy-login__field">
                        <label
                            for="dypos-pin-code"
                            class="dy-login__label"
                        >
                            {{ pinAvailable ? __("كود الدخول السريع") : __("لا يوجد رمز محفوظ") }}
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
                            {{
                                __("أدخل رمز الدخول السريع (من {0} إلى {1} خانات)", {
                                    0: String(PIN_MIN_LENGTH),
                                    1: String(PIN_MAX_LENGTH),
                                })
                            }}
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
                        {{ __('دخول سريع') }}
                    </DyButton>

                    <button
                        type="button"
                        class="dy-login__link-button"
                        @click="exitPinMode"
                        :aria-label="__('العودة لتسجيل الدخول بكلمة المرور')"
                    >
                        {{ __('الدخول بكلمة المرور') }}
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
                            {{ __('البريد الإلكتروني') }}
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
                                :class="{ 'dy-login__input--error': emailMissing }"
                                type="email"
                                inputmode="email"
                                name="username"
                                autocomplete="username"
                                dir="ltr"
                                placeholder="name@company.com"
                                :disabled="isSubmitting"
                                autocapitalize="none"
                                autocorrect="off"
                                required
                                spellcheck="false"
                                :aria-invalid="emailMissing"
                                :aria-describedby="emailMissing ? 'dypos-login-email-error' : undefined"
                                @input="clearLoginError"
                            />
                        </div>

                        <span
                            v-if="emailMissing"
                            id="dypos-login-email-error"
                            class="dy-login__field-error"
                            role="alert"
                            aria-live="polite"
                        >
                            <FeatherIcon name="alert-circle" :size="14" aria-hidden="true" />
                            {{ __('البريد الإلكتروني مطلوب') }}
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
                                {{ __('كلمة المرور') }}
                            </label>

                            <span
                                v-if="password"
                                class="dy-login__strength"
                                :style="{ color: passwordStrength.color }"
                                aria-live="polite"
                            >
                                {{ __(passwordStrength.label) }}
                            </span>
                        </div>

                        <PasswordStrengthBar
                            v-if="password"
                            :password="password"
                            :show-label="false"
                            :aria-label="__('قوة كلمة المرور')"
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
                                :class="{ 'dy-login__input--error': passwordMissing }"
                                :type="
                                    showPassword
                                        ? 'text'
                                        : 'password'
                                "
                                name="password"
                                autocomplete="current-password"
                                dir="ltr"
                                :placeholder="__('أدخل كلمة المرور')"
                                :disabled="isSubmitting"
                                required
                                :aria-invalid="passwordMissing"
                                :aria-describedby="passwordMissing ? 'dypos-login-password-error' : undefined"
                                @input="clearLoginError"
                                @keydown="trackCapsLock"
                                @keyup="trackCapsLock"
                            />

                            <button
                                type="button"
                                class="dy-login__password-toggle"
                                :aria-label="
                                    showPassword
                                        ? __('إخفاء كلمة المرور')
                                        : __('إظهار كلمة المرور')
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
                            v-if="passwordMissing"
                            id="dypos-login-password-error"
                            class="dy-login__field-error"
                            role="alert"
                            aria-live="polite"
                        >
                            <FeatherIcon name="alert-circle" :size="14" aria-hidden="true" />
                            {{ __('كلمة المرور مطلوبة') }}
                        </span>

                        <!-- Caps Lock: يُقرأ من الحدث لا من مؤقّت، ويختفي فور
                             إطفائه. وسم `aria-live="polite"` كي يسمعه قارئ
                             الشاشة أثناء الكتابة دون مقاطعة التركيز. -->

                        <span
                            v-if="capsLockOn"
                            class="dy-login__caps-hint"
                            role="status"
                            aria-live="polite"
                        >
                            <FeatherIcon
                                name="alert-circle"
                                :size="14"
                                aria-hidden="true"
                            />

                            {{ __("Caps Lock مُفعّل") }}
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
                                {{ __('تذكر البريد الإلكتروني') }}
                            </span>
                        </label>

                        <a
                            href="/forgot-password"
                            class="dy-login__forgot"
                            @click.prevent="goToForgotPassword"
                        >
                            {{ __('نسيت كلمة المرور؟') }}
                        </a>
                    </div>

                    <!-- Submit -->

                    <DyButton
                        type="submit"
                        variant="primary"
                        size="lg"
                        class="dy-login__submit"
                        :loading="isSubmitting"
                        :disabled="isSubmitting"
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

                        {{ __(submitLabel) }}
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
                        :aria-label="__('التبديل لتسجيل الدخول السريع برمز PIN')"
                    >
                        <FeatherIcon
                            name="zap"
                            :size="15"
                            aria-hidden="true"
                        />
                        {{ __('دخول سريع برمز PIN') }}
                    </button>

                    <button
                        v-else
                        type="button"
                        class="dy-login__link-button"
                        :disabled="!email"
                        :title="__(email ? PIN_DEVICE_HINT : PIN_EMAIL_TOO_SHORT)"
                        :aria-label="__(email ? PIN_DEVICE_HINT : PIN_EMAIL_REQUIRED)"
                        @click="showPinSetup = true"
                    >
                        <FeatherIcon
                            name="key"
                            :size="15"
                            aria-hidden="true"
                        />
                        {{ __('إنشاء رمز دخول سريع') }}
                    </button>

                    <button
                        v-if="pinAvailable"
                        type="button"
                        class="dy-login__link-button dy-login__link-button--quiet"
                        @click="handleClearPin"
                        :aria-label="__('إلغاء رمز الدخول السريع المحفوظ')"
                    >
                        {{ __('إلغاء الرمز') }}
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
                        {{ __('إنشاء رمز دخول سريع') }}
                    </h3>

                    <p class="dy-login__hint">
                        {{
                            __("يُحفظ الرمز مشفّرًا على هذا الجهاز فقط، ويصالح {0} دقيقة. لا يمكن استعادته إن فُقد.", {
                                0: String(PIN_EXPIRY_MS / 60000),
                            })
                        }}
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
                                {{ __('الرمز الجديد') }}
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
                                {{ __('تأكيد الرمز') }}
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
                                {{ __('حفظ الرمز') }}
                            </DyButton>

                            <button
                                type="button"
                                class="dy-login__link-button"
                                @click="cancelPinSetup"
                        :aria-label="__('إلغاء إعداد رمز PIN')"
                    >
                                {{ __('إلغاء') }}
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Security / Runtime information -->

                <aside
                    class="dy-login__security"
                    :aria-label="__('معلومات الأمان والتشغيل')"
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
                                {{ __('جلسة تشغيل آمنة') }}
                            </strong>

                            <span>
                                {{ __('تتم حماية الاتصال وتهيئة الجلسة قبل بدء التشغيل.') }}
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
                                ? __('إخفاء تفاصيل الاتصال')
                                : __('عرض تفاصيل الاتصال')
                        "
                    >
                        {{ __('التفاصيل') }}
                    </button>

                    <div
                        v-if="showRuntimeDetails"
                        class="dy-login__details"
                    >
                        <div
                            v-for="detail in runtimeDetails"
                            :key="detail.label"
                        >
                            <span>{{ __(detail.label) }}</span>

                            <strong>
                                {{ __(detail.value) }}
                            </strong>
                        </div>
                    </div>
                </aside>

                <!-- Session Timeout Warning -->

                <LoginSessionTimeoutDialog
                    :show="showSessionWarning"
                    :seconds="sessionSecondsLeft"
                    :extending="isExtendingSession"
                    @extend="extendSession"
                    @dismiss="dismissWarning"
                />

                <!-- Register — كان ابنًا مباشرًا للشبكة بلا تنسيق، فيقع في
                     الصف الثاني تحت لوحة الهوية الداكنة. -->

                <p class="dy-login__register">
                    {{ __('ليس لديك حساب؟') }}
                    <a href="/account/register" @click.prevent="goToRegister">
                        {{ __('سجّل الآن') }}
                    </a>
                </p>

            </div>
        </section>

        <section
        	class="dy-login__showcase"
        	:aria-label="__('شركة المنافذ الذكية للبرمجيات — Smart Ports Software')"
        >
        	<figure class="dy-login__brand-card">
        		<a
        			class="dy-login__brand-card-link"
        			:href="COMPANY_WEBSITE"
        			target="_blank"
        			rel="noopener noreferrer"
        			:aria-label="COMPANY_WEBSITE_LABEL"
        		>
        			<img
        				:src="smartPortsBg"
        				:alt="__('شركة المنافذ الذكية للبرمجيات — Smart Ports Software')"
        				width="1200"
        				height="630"
        				decoding="async"
        			/>
        		</a>
        	</figure>
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
         Session Lock — القالب وحالته في مكوّنه (نفس سبب حوار انتهاء
         الجلسة: ملف الأنماط بنطاقه لا يصل إلى عنصر في ملف آخر).
         =============================================================== -->

        <LoginSessionLockDialog />
    </main>
</template>

<style scoped src="@/styles/pages/login.css"></style>
