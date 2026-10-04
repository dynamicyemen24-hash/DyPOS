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

import ShiftOpeningDialog from "@/components/ShiftOpeningDialog.vue"
import CompanyFooter from "@/components/common/CompanyFooter.vue"
import LoginPasskeyActions from "@/components/common/LoginPasskeyActions.vue"
import LoginWorkspacePanel from "@/components/common/LoginWorkspacePanel.vue"
import LoginAppearanceBar from "@/components/common/LoginAppearanceBar.vue"
import LoginContextChips from "@/components/common/LoginContextChips.vue"
import LoginPinForm from "@/components/common/LoginPinForm.vue"
import LoginSecurityPanel from "@/components/common/LoginSecurityPanel.vue"
import DyPanel from "@/components/common/DyPanel.vue"
import ShiftOpsPanel from "@/components/common/ShiftOpsPanel.vue"
import LoginSessionLockDialog from "@/components/common/LoginSessionLockDialog.vue"
import LoginSessionTimeoutDialog from "@/components/common/LoginSessionTimeoutDialog.vue"
import TouchKeyboard from "@/components/common/TouchKeyboard.vue"
import NotificationBar from "@/components/NotificationBar.vue"
import { ActionButton } from "dypos-ui"
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
import { goToForgotPassword, goToRegister } from "@/router"
import { useBiometric } from "@/composables/useBiometric"
import { useSessionLock } from "@/composables/useSessionLock"
import { useSessionTimeout } from "@/composables/useSessionTimeout"
import { useSecondsRemaining } from "@/composables/useSecondsRemaining"
import { useRememberedEmail } from "@/composables/useRememberedEmail"
import { useReducedMotion } from "@/composables/useReducedMotion"
import { useMediaQuery } from "@/composables/useMediaQuery"
import { useAppTheme } from "@/composables/useAppTheme"
import { useLoginPreferences } from "@/composables/useLoginPreferences"
import { useCapsLock } from "@/composables/useCapsLock"
import {
	buildRuntimeDetails,
	hasRuntimeStatus as hasRuntimeStatusSignals,
	useRuntimeStatus,
} from "@/composables/useLoginRuntimeStatus"
import { rateLimitMessage } from "@/composables/useRateLimitMessage"
import { LOGIN_EMITS, LOGIN_PROPS } from "@/composables/loginContract"
import { useLoginContextItems } from "@/composables/useLoginContextItems"
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
import { useLoginSessionBootstrap } from "@/composables/useLoginSessionBootstrap"
import { useLoginPinAuth } from "@/composables/useLoginPinAuth"
import { useLoginForm } from "@/composables/useLoginForm"
import { useLoginMethods } from "@/composables/useLoginMethods"

import { methodGetList } from "@/utils/methodClient"
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

/* ============================================================================
 * Props / Emits
 * ========================================================================== */

/* Prop list and events live in `@/composables/loginContract` — the page is
 * at its file-size cap, and a contract that lives inside a 1700-line SFC is
 * a contract no test can read. */
const props = defineProps(LOGIN_PROPS)

const emit = defineEmits(LOGIN_EMITS)

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

const selectedMethod = ref("email")

const touchKeyboardRef = ref(null)

const biometricResult = ref(
	/** @type {{ success: boolean; error?: string } | null} */ (null),
)

const biometricAvailable = ref(false)

const branches = ref([])
const selectedBranchId = ref("")
const subscriberCode = ref("")

const emailInput = ref(null)
const passwordInput = ref(null)
/**
 * Whether the on-screen PIN keyboard is up.
 *
 * Read by `selectMethod("keyboard")` and cleared on every method switch. It
 * was removed once on the assumption that a dead-binding gate had found it —
 * the gate was actually reporting a DIFFERENT pair of names — and the page
 * then broke on the first tap of the PIN method. The variable is live.
 */
const showKeyboard = ref(false)

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
 * Extracted Composables
 * ========================================================================== */

const {
	bootstrapAuthenticatedSession,
	resolveShiftState,
	emitReady,
	handleShiftConfirm,
	handleShiftCancel,
	cleanup,
} = useLoginSessionBootstrap({
	sessionReady,
	isRuntimeReady,
	emit,
})

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
	passwordStrength,
	attemptBiometricLogin,
	handleSubmitLogin,
	initializeLoginData,
	handleGlobalKeydown,
	onMethodSelect,
	selectBranch,
} = useLoginForm({
	email,
	password,
	showPassword,
	isSubmitting,
	loginError,
	selectedMethod,
	biometricResult,
	biometricAvailable,
	touchKeyboardRef,
	showKeyboard,
	branches,
	selectedBranchId,
	subscriberCode,
	loginForm,
})

const {
	selectMethod,
	loadBranches,
	checkBiometricAvailability,
	onBranchChange,
	loadSubscriberCode,
	initializeLoginData: initializeMethodsData,
} = useLoginMethods({
	selectedMethod,
	showKeyboard,
	biometricResult,
	biometricAvailable,
	branches,
	selectedBranchId,
	subscriberCode,
	touchKeyboardRef,
})

const {
	pinCode,
	pinConfirm,
	pinLoginInProgress,
	pinError,
	pinSetupError,
	pinAvailable,
	pinModeActive,
	pinSetupDisabled,
	pinLoginDisabled,
	pinDeviceHint,
	PIN_EMAIL_TOO_SHORT,
	PIN_EMAIL_REQUIRED,
	showPinSetup,
	sanitizePinInput,
	onPinSetupInput,
	clearPinSetup,
	handlePinLogin,
	handlePinSetup,
	enterPinMode,
	exitPinMode,
	cancelPinSetup,
	loadPinState,
	wipePin,
	attemptPinLogin,
	storePin,
} = useLoginPinAuth({ email })

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
 * The status row for the whole page: one table lookup keyed by `runtimeState`,
 * never an inline chain in the template.
 */
const runtimeStatus = useRuntimeStatus(runtimeState)

/** تفاصيل التشغيل: صفّ واحد لكل إشارة، والقالب يرسمها بـ`v-for`. */
const runtimeDetails = computed(() =>
	buildRuntimeDetails({
		isOnline: isOnline.value,
		csrfReady: csrfReady.value,
		sessionReady: sessionReady.value,
		offlineReady: offlineReady.value,
	}),
)

const submitLabel = computed(() => {
	if (isSubmitting.value) {
		return "جاري تسجيل الدخول..."
	}

	if (authenticationCompleted.value) {
		return "تم تسجيل الدخول"
	}

	return "تسجيل الدخول"
})

/**
 * The three runtime chips above the form. Extracted to
 * `useLoginContextItems` so this page stays under its file-size cap — see
 * that module for why a table beats three `if` blocks here.
 */
const contextItems = useLoginContextItems({ props, session })

/* ============================================================================
 * Accessibility & Responsive
 * ============================================================================ */

const reducedMotion = useReducedMotion()
const isMobile = useMediaQuery("(max-width: 768px)")

/**
 * Add a thin status bar at the bottom of the login when runtime details are
 * available (offline/online, csrf, session).
 *
 * The previous version read `useLoginRuntime.getState?.()[key]`, but
 * `useLoginRuntime` is a destructured set of composables — there is no
 * `getState` on it. The optional call was therefore always `undefined` and
 * this computed was permanently `false`, so the status row could never
 * render. The signals are already in scope here as plain refs, so
 * `hasRuntimeStatus` now states the rule and is testable without mounting
 * the page.
 */
const hasRuntimeStatus = computed(() =>
	hasRuntimeStatusSignals({
		isOfflineMode: isOfflineMode.value,
		isOnline: isOnline.value,
		csrfReady: csrfReady.value,
		sessionReady: sessionReady.value,
	}),
)

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
 * بعد نجاح البصمة على السيرفر.
 *
 * يمرّ بنفس `completeAuthentication` الذي يمرّ به الدخول بكلمة
 * المرور — لا مسار ثانٍ يفتح جلسة، ولا عدّاد يُصعَّد مرتين، ولا
 * تنقّل مكرّر. البصمة **طريقة تحقق**، لا نظام دخول موازٍ.
 */
function onPasskeyAuthenticated() {
	completeAuthentication("passkey")
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

/**
 * Confirm on the on-screen numeric keypad.
 *
 * The keypad's `✓` key emits `confirm` and the page bound it to a handler that
 * did not exist, so the button rendered and did nothing — a dead contract in the
 * exact shape AGENTS.md warns about: a control a cashier taps on the shop floor
 * that silently does nothing. It routes through the SAME `submitLogin` the
 * on-screen button uses, so there is still one login path, one rate-limit
 * check, and one session bootstrap.
 */
async function handleKeyboardSubmit() {
	await submitLogin()
}

/**
 * PIN sign-in and PIN setup both land here once `LoginPinForm` reports success.
 *
 * The form owns the fields and the messages; the page owns the session, so the
 * two are joined at exactly one point — the same split as every other
 * credential path on this screen.
 *
 * @param {"pin_login"|"pin_setup"} how
 */
async function onPinAuthenticated(how) {
	pinModeActive.value = false
	showPinSetup.value = false
	authenticationCompleted.value = true
	log.info("DyPOS PIN authentication completed", how)
	await bootstrapAuthenticatedSession()
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

const {
	emailMissing,
	passwordMissing,
	validate: validateRequiredFields,
} = useLoginRequiredFields({ email, password, emailInput, passwordInput })

/* ============================================================================
 * Keyboard
 * ========================================================================== */

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

	/* Initialize login page data (branches, biometric, subscriber code) */
	await initializeLoginData()

	/*
	 * ?? ???? ??? password ??? ??? ?????? ???????.
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
			'dy-login--has-status': hasRuntimeStatus.value,
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
        <section class="dy-login__brand" :aria-label="__('هوية DyPOS')">
            <a
                class="dy-login__brand-logo"
                :href="COMPANY_WEBSITE"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="COMPANY_WEBSITE_LABEL"
            >
                <span class="dy-login__logo-shell">
                    <img :src="DyPOSLogo" alt="DyPOS" class="dy-login__logo" width="48" height="48" decoding="async" />
                </span>
            </a>
            <CompanyFooter class="dy-login__brand-company" />
            <LoginAppearanceBar :compact="true" class="dy-login__preferences" />
        </section>

        <!-- Bottom status bar — shows runtime readiness information -->
        <div
            v-if="hasRuntimeStatus.value"
            class="dy-login__status-bar"
            role="status"
            aria-live="polite"
        >
            <span class="dy-login__status-text">{{ runtimeStatus.label }}</span>

            <div class="dy-login__status-details">
                <span
                    v-if="isOfflineMode"
                    class="dy-login__status-item"
                >
                    {{ __('وضع عدم الاتصال') }}
                </span>
                <span
                    v-if="isOnline"
                    class="dy-login__status-item"
                >
                    {{ __('متصل بالخادم') }}
                </span>
                <span
                    v-if="csrfReady"
                    class="dy-login__status-item"
                >
                    {{ __('حماية الطلبات') }}
                </span>
                <span
                    v-if="sessionReady"
                    class="dy-login__status-item"
                >
                    {{ __('جلسة مُهيأة') }}
                </span>
            </div>
        </div>

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

				<!-- Runtime chips: tenant / branch / POS profile. -->

                <LoginContextChips
                    :items="contextItems"
                    :show="showTenantContext"
                />

                <!-- Header -->

                <header class="dy-login__header">
                    <div>
                        <span class="dy-login__section-label">
                            {{ __('تسجيل الدخول') }}
                        </span>

                        <!-- The page's one top-level heading: it was an <h2> with
                             no <h1> anywhere, so the outline started at level 2. -->
                        <h1 class="dy-login__title">
                            {{ __('مرحبًا بك') }}
                        </h1>

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
                                {{ __('تذكرني') }}
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

                    <details class="dy-login__alternatives">
                        <summary class="dy-login__alternatives-summary">
                            <FeatherIcon name="key" :size="16" aria-hidden="true" />
                            <span>{{ __('طرق دخول أخرى') }}</span>
                        </summary>
                        <div class="dy-login__methods-buttons">
                            <button
                                v-if="biometricAvailable"
                                type="button"
                                class="dy-login__method-btn"
                                :class="{ 'dy-login__method-btn--active': selectedMethod === 'biometric' }"
                                @click="selectMethod('biometric')"
                                :disabled="isSubmitting"
                                :aria-pressed="selectedMethod === 'biometric'"
                            >
                                <FeatherIcon name="fingerprint" :size="18" aria-hidden="true" />
                                <span>{{ __('البصمة') }}</span>
                            </button>
                            <button
                                type="button"
                                class="dy-login__method-btn"
                                :class="{ 'dy-login__method-btn--active': selectedMethod === 'keyboard' }"
                                @click="selectMethod('keyboard')"
                                :disabled="isSubmitting"
                                :aria-pressed="selectedMethod === 'keyboard'"
                            >
                                <FeatherIcon name="smartphone" :size="18" aria-hidden="true" />
                                <span>{{ __('لوحة مفاتيح') }}</span>
                            </button>
                            <button
                                type="button"
                                class="dy-login__method-btn"
                                :class="{ 'dy-login__method-btn--active': selectedMethod === 'passkey' }"
                                @click="selectMethod('passkey')"
                                :disabled="isSubmitting"
                                :aria-pressed="selectedMethod === 'passkey'"
                            >
                                <FeatherIcon name="key" :size="18" aria-hidden="true" />
                                <span>{{ __('مفتاح مرور') }}</span>
                            </button>

                            <button
                                type="button"
                                class="dy-login__method-btn"
                                :class="{ 'dy-login__method-btn--active': selectedMethod === 'pin' }"
                                @click="enterPinMode"
                                :disabled="isSubmitting"
                                :aria-pressed="pinModeActive"
                            >
                                <FeatherIcon name="lock" :size="18" aria-hidden="true" />
                                <span>{{ __('رمز PIN') }}</span>
                            </button>
                        </div>
                        <LoginPasskeyActions
                            mode="login"
                            :email="email"
                            @authenticated="onPasskeyAuthenticated"
                        />
                    </details>

                    <!-- Branch Selector -->

                    <div class="dy-login__branch-selector" v-if="branches.length > 1">
                        <label for="dypos-login-branch" class="dy-login__label">
                            {{ __('الفرع') }}
                        </label>
                        <div class="dy-login__select-wrap">
                            <FeatherIcon name="map-pin" :size="18" class="dy-login__select-icon" aria-hidden="true" />
                            <select
                                id="dypos-login-branch"
                                v-model="selectedBranchId"
                                class="dy-login__select"
                                :disabled="isSubmitting"
                                @change="onBranchChange"
                            >
                                <option value="">{{ __('اختر الفرع') }}</option>
                                <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                                    {{ branch.name }}
                                </option>
                            </select>
                        </div>
                    </div>

                    <!-- Subscriber Code Display -->

                    <div class="dy-login__subscriber-code" v-if="subscriberCode">
                        <FeatherIcon name="barcode" :size="16" aria-hidden="true" />
                        <span class="dy-login__subscriber-label">{{ __('رمز المشترك') }}</span>
                        <span class="dy-login__subscriber-value">{{ subscriberCode }}</span>
                    </div>

                    <!-- Submit -->

                    <ActionButton
                        type="submit"
                        variant="solid"
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
                    </ActionButton>
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

                <!-- PIN sign-in / setup — extracted to `LoginPinForm.vue` -->

                <LoginPinForm
                    v-if="pinModeActive || showPinSetup"
                    :pin-login="attemptPinLogin"
                    :save-pin="storePin"
                    :email="email"
                    :setup="showPinSetup"
                    :no-pin-stored="!pinAvailable"
                    @authenticated="onPinAuthenticated"
                    @cancel-setup="cancelPinSetup"
                    @exit="exitPinMode"
                    @error="(e) => emit('error', e)"
                />

                <!-- Security / Runtime information -->

                <LoginSecurityPanel
                    :open="showRuntimeDetails"
                    :details="runtimeDetails"
                    @toggle="showRuntimeDetails = !showRuntimeDetails"
                />

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

        <!-- =================================================================
             Workspace column — the panels beside the form.

             `ShiftOpsPanel` was imported here and rendered NOWHERE: the whole
             opening-time surface (the shift announcements + the device check
             a manager runs before opening the till) was complete, tested, and
             unreachable. An import with no mount is the same defect class
             AGENTS.md records for `WorkForm.vue` — code that looks finished and
             never executes.

             It rides the shared `DyPanel` grid rather than a new
             `grid-template-areas` name: the panel system exists so adding a
             block costs two attributes, not a stylesheet edit.
             ================================================================= -->

        <LoginWorkspacePanel>
            <DyPanel
                :title="__('لوحة التشغيل')"
                :subtitle="__('تعليمات الوردية وحالة الأجهزة')"
                aria-label=""
                span="full"
                :order="2"
                class="dy-login__ops-panel"
            >
                <ShiftOpsPanel />
            </DyPanel>
        </LoginWorkspacePanel>

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
<TouchKeyboard
            v-model:is-open="showKeyboard"
            :model-value="password"
            @update:model-value="password = $event"
            @confirm="handleKeyboardSubmit"
            :title="__('لوحة مفاتيح رقمية')"
            :placeholder="__('أدخل رمز المرور')"
            mask
            :max-length="8"
        />
        <NotificationBar />
    </main>
</template>

<style scoped src="@/styles/pages/login.css"></style>
