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
import { ActionButton } from "dypos-ui"
import SkeletonLoader from "@/components/ui/SkeletonLoader.vue"
import { endpoints } from "@/utils/apiEndpoints"
import { COMPANY_WEBSITE, COMPANY_WEBSITE_LABEL } from "@/utils/brand"
import { translationVersion } from "@/utils/translation"
import DyPOSLogo from "@/assets/DyPOSLogo.png"
import ShiftOpeningDialog from "@/components/ShiftOpeningDialog.vue"
import CompanyFooter from "@/components/common/CompanyFooter.vue"
import LoginPasskeyActions from "@/components/common/LoginPasskeyActions.vue"
import LoginAppearanceBar from "@/components/common/LoginAppearanceBar.vue"
import LoginContextChips from "@/components/common/LoginContextChips.vue"
import LoginPinForm from "@/components/common/LoginPinForm.vue"
import InstallCredentialsCard from "@/components/common/InstallCredentialsCard.vue"
import DyPanel from "@/components/common/DyPanel.vue"
import ShiftOpsPanel from "@/components/common/ShiftOpsPanel.vue"
import LoginSessionLockDialog from "@/components/common/LoginSessionLockDialog.vue"
import LoginSessionTimeoutDialog from "@/components/common/LoginSessionTimeoutDialog.vue"
import TouchKeyboard from "@/components/common/TouchKeyboard.vue"
import NotificationBar from "@/components/NotificationBar.vue"
import LoginBackendUnavailableBanner from "@/components/common/LoginBackendUnavailableBanner.vue"
import LoginErrorBanner from "@/components/common/LoginErrorBanner.vue"
import LoginRateLimitWarning from "@/components/common/LoginRateLimitWarning.vue"
import PasswordStrengthBar from "@/components/reports/dashboards/core/PasswordStrengthBar.vue"
import TechnicalModeToggle from "@/components/common/TechnicalModeToggle.vue"
import HardwareDiagnosticsPanel from "@/components/common/HardwareDiagnosticsPanel.vue"
import NetworkDiagnosticsPanel from "@/components/common/NetworkDiagnosticsPanel.vue"
import VersionInfo from "@/components/common/VersionInfo.vue"
import LoginWorkspacePanel from "@/components/common/LoginWorkspacePanel.vue"
import LoginShortcutsDialog from "@/components/common/LoginShortcutsDialog.vue"
import LoginEmailSuggestions from "@/components/common/LoginEmailSuggestions.vue"
import LoginPinQuickActions from "@/components/common/LoginPinQuickActions.vue"

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
import { useLoginShiftDialog } from "@/composables/useLoginShiftDialog"
import { useLoginPinAuth } from "@/composables/useLoginPinAuth"
import { useLoginBackendUnavailable } from "@/composables/useLoginBackendUnavailable"
import { useLoginForm } from "@/composables/useLoginForm"
import { useLoginErrorHandling } from "@/composables/useLoginErrorHandling"
import { useLoginEmail } from "@/composables/useLoginEmail"
import { useLoginEmailBlur } from "@/composables/useLoginEmailBlur"
import { useTechnicalMode } from "@/composables/useTechnicalMode"
import { useHardwareDiagnostics } from "@/composables/useHardwareDiagnostics"
import { useNetworkDiagnostics } from "@/composables/useNetworkDiagnostics"
import { methodGetList } from "@/utils/methodClient"
import { cleanupUserSession, normalizeAuthError } from "@/utils/auth"
import { useCompleteAuthentication } from "@/composables/useCompleteAuthentication"
import { useLoginMethods } from "@/composables/useLoginMethods"
import { __ } from "@/utils/translation"
import {
	handleAuthFailure,
	handleAuthSuccess,
	handleSessionExpiry,
} from "@/utils/securityHardening"
import { createSessionSecurityMonitor } from "@/composables/useLoginSecurityMonitor"

/* ============================================================================
 * Constants
 * ========================================================================== */

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

/** Loading state for skeleton screens during initial load */
const isInitialLoading = ref(true)

/** Keyboard shortcuts help dialog — the table lives in the component. */
const showShortcutsHelp = ref(false)

const showEmailSuggestions = ref(false)

const { deferHideEmailSuggestions, cleanup: cleanupEmailSuggestionTimer } = useLoginEmailBlur({ showEmailSuggestions })

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

const { isBackendUnavailable } = useLoginBackendUnavailable({
	runtimeState,
	isRateLimited,
	isOnline,
	isOfflineMode,
	loginError,
})

const {
	shiftDialogOpen,
	shiftOpening,
	openShiftDialog,
	onShiftOpened,
	onShiftDialogClosed,
} = useLoginShiftDialog({ emit, isRuntimeReady })

const authenticationCompleted = ref(false)

/* ============================================================================
 * Extracted Composables
 * ========================================================================== */

const { bootstrapAuthenticatedSession, cleanup } = useLoginSessionBootstrap({
	sessionReady,
	isRuntimeReady,
	emit,
	onShiftRequired: openShiftDialog,
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

const { completeEmail } = useLoginEmail({
	email,
	emailInput,
	showEmailSuggestions,
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

// Security hardening: session activity monitoring + expiry/idle/absolute
// timeout policies live in `composables/useLoginSecurityMonitor.js` — keeping
// the timer and its stop handle in one closure is what makes the leak
// impossible (see that file for the timer that used to outlive the page).
const securityMonitor = createSessionSecurityMonitor()
const installSessionSecurityMonitor = securityMonitor.start
const stopSessionSecurityMonitor = securityMonitor.stop

/* ============================================================================
 * Computed
 * ========================================================================== */

/*
 * The status row for the whole page: one table lookup keyed by `runtimeState`,
 * never an inline chain in the template.
 */
const runtimeStatus = useRuntimeStatus(runtimeState)

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

/* Technical Mode — Odoo-like debug mode toggle */
const { technicalModeEnabled } = useTechnicalMode()

/* ============================================================================
 * Error
 * ========================================================================== */

const { handleOfflineLogin, focusEmailField, focusPasswordField } =
	useLoginErrorHandling({
		loginError,
		emailInput,
		passwordInput,
		clearLoginError,
	})

/** خطأ واحد واضح، ومسار واحد لعرضه وإخفائه. */
function clearLoginError() {
	loginError.value = ""
}

/** إعادة محاولة الخلفية: تنظف الخطأ ثم تعيد تهيئة التشغيل. */
async function retryBackend() {
	clearLoginError()
	await prepareRuntime()
}

/* ============================================================================
 * Authentication
 * ========================================================================== */

const { completeAuthentication } = useCompleteAuthentication({
	loginRateLimiter,
	sessionReady,
	authenticationCompleted,
	sessionTimeout,
	installSessionSecurityMonitor,
	handleAuthSuccess,
	emit,
})

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
	completeAuthentication(how === "pin_setup" ? "pin_setup" : "pin_login")
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

async function handleFillCredentials(event) {
	if (event?.detail?.email) email.value = event.detail.email
	if (event?.detail?.password) password.value = event.detail.password
	await nextTick()
	await submitLogin()
}

onMounted(async () => {
	restoreRememberedEmail()

	window.addEventListener("online", handleOnline)

	window.addEventListener("offline", handleOffline)

	window.addEventListener("keydown", handleGlobalKeydown)

	window.addEventListener("dypos:fill-credentials", handleFillCredentials)

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
	 * تركيز حقل كلمة المرور إذا كان البريد موجوداً مسبقاً.
	 */
	if (email.value) {
		passwordInput.value?.focus?.()
	} else {
		emailInput.value?.focus?.()
	}

	await prepareRuntime()

	// Mark initial loading complete for skeleton screens
	isInitialLoading.value = false
})

onBeforeUnmount(async () => {
	cleanupEmailSuggestionTimer()

	window.removeEventListener("online", handleOnline)

	window.removeEventListener("offline", handleOffline)

	window.removeEventListener("keydown", handleGlobalKeydown)

	window.removeEventListener("dypos:fill-credentials", handleFillCredentials)

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
            <TechnicalModeToggle class="dy-login__technical-toggle" />
        </section>

        <!-- Simplified status indicator — only shows offline/online -->
        <div
            v-if="isOfflineMode || isOnline"
            class="dy-login__status-indicator"
            role="status"
            aria-live="polite"
        >
            <span
                v-if="isOfflineMode"
                class="dy-login__status-item dy-login__status-item--offline"
            >
                <FeatherIcon name="wifi-off" :size="14" aria-hidden="true" />
                {{ __('غير متصل') }}
            </span>
            <span
                v-else
                class="dy-login__status-item dy-login__status-item--online"
            >
                <FeatherIcon name="wifi" :size="14" aria-hidden="true" />
                {{ __('متصل') }}
            </span>
        </div>

        <!-- Initial Loading Skeleton -->
        <section v-if="isInitialLoading" class="dy-login__panel" aria-busy="true" :aria-label="__('جاري التحميل')">
            <div class="dy-login__panel-inner">
                <SkeletonLoader :count="3" variant="card" />
                <SkeletonLoader :count="2" variant="text" :lines="3" />
                <SkeletonLoader :count="2" variant="input" />
                <SkeletonLoader variant="button" size="lg" />
            </div>
        </section>

        <!-- =================================================================
             Authentication Panel
             =============================================================== -->

        <section v-else class="dy-login__panel">
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
                    <ActionButton
                        variant="ghost"
                        size="sm"
                        class="dy-login__shortcuts-trigger"
                        @click="showShortcutsHelp = true"
                        :aria-label="__('عرض اختصارات لوحة المفاتيح')"
                    >
                        <FeatherIcon name="help-circle" :size="18" aria-hidden="true" />
                        <span class="dy-login__shortcuts-hint">{{ __('اختصارات') }}</span>
                    </ActionButton>
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

                    <ActionButton
                        v-if="
                            runtimeState === 'failed' ||
                            runtimeState === 'degraded'
                        "
                        type="button"
                        variant="ghost"
                        theme="brand"
                        size="sm"
                        @click="prepareRuntime"
                        :aria-label="__('إعادة محاولة الاتصال بالخادم')"
                    >
                        {{ __('إعادة المحاولة') }}
                    </ActionButton>
                </section>

                <!-- Backend Unavailable Banner (503) — Offline mode still works -->
                <LoginBackendUnavailableBanner
                    v-if="isBackendUnavailable"
                    @retry="retryBackend"
                />

                <!-- Rate Limit Warning -->
                <LoginRateLimitWarning
                    v-if="isRateLimited"
                    :retry-after-ms="rateLimitState.retryAfterMs"
                />

                <!-- Error with contextual recovery actions -->
                <LoginErrorBanner
                    v-if="loginError"
                    :error="loginError"
                    :is-offline-mode="isOfflineMode"
                    :is-backend-unavailable="isBackendUnavailable"
                    @clear="clearLoginError"
                    @register="goToRegister"
                    @forgot-password="goToForgotPassword"
                    @retry-backend="retryBackend"
                    @offline-login="handleOfflineLogin"
                    @focus-email="focusEmailField"
                    @focus-password="focusPasswordField"
                />

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
                                autocomplete="email"
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
                                @focus="showEmailSuggestions = true"
                                @blur="deferHideEmailSuggestions"
                            />
                            <!-- Email Domain Suggestions -->
                            <LoginEmailSuggestions
                                :visible="showEmailSuggestions && !email.includes('@') && !isSubmitting"
                                :email="email"
                                @select="completeEmail"
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
                            <ActionButton
                                v-if="biometricAvailable"
                                type="button"
                                variant="ghost"
                                theme="brand"
                                size="sm"
                                class="dy-login__method-btn"
                                :class="{ 'dy-login__method-btn--active': selectedMethod === 'biometric' }"
                                @click="selectMethod('biometric')"
                                :disabled="isSubmitting"
                                :aria-pressed="selectedMethod === 'biometric'"
                            >
                                <FeatherIcon name="fingerprint" :size="18" aria-hidden="true" />
                                <span>{{ __('البصمة') }}</span>
                            </ActionButton>
                            <ActionButton
                                type="button"
                                variant="ghost"
                                theme="brand"
                                size="sm"
                                class="dy-login__method-btn"
                                :class="{ 'dy-login__method-btn--active': selectedMethod === 'keyboard' }"
                                @click="selectMethod('keyboard')"
                                :disabled="isSubmitting"
                                :aria-pressed="selectedMethod === 'keyboard'"
                            >
                                <FeatherIcon name="smartphone" :size="18" aria-hidden="true" />
                                <span>{{ __('لوحة مفاتيح') }}</span>
                            </ActionButton>
                            <ActionButton
                                type="button"
                                variant="ghost"
                                theme="brand"
                                size="sm"
                                class="dy-login__method-btn"
                                :class="{ 'dy-login__method-btn--active': selectedMethod === 'passkey' }"
                                @click="selectMethod('passkey')"
                                :disabled="isSubmitting"
                                :aria-pressed="selectedMethod === 'passkey'"
                            >
                                <FeatherIcon name="key" :size="18" aria-hidden="true" />
                                <span>{{ __('مفتاح مرور') }}</span>
                            </ActionButton>

                            <ActionButton
                                type="button"
                                variant="ghost"
                                theme="brand"
                                size="sm"
                                class="dy-login__method-btn"
                                :class="{ 'dy-login__method-btn--active': pinModeActive }"
                                @click="enterPinMode"
                                :disabled="isSubmitting"
                                :aria-pressed="pinModeActive"
                            >
                                <FeatherIcon name="lock" :size="18" aria-hidden="true" />
                                <span>{{ __('رمز PIN') }}</span>
                            </ActionButton>
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

                <LoginPinQuickActions
                    :pin-available="pinAvailable"
                    :pin-mode-active="pinModeActive"
                    :email="email"
                    :busy="isSubmitting"
                    :device-hint="pinDeviceHint"
                    :email-too-short="PIN_EMAIL_TOO_SHORT"
                    :email-required="PIN_EMAIL_REQUIRED"
                    @enter-pin="enterPinMode"
                    @setup-pin="showPinSetup = true"
                    @clear-pin="handleClearPin"
                />

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

                <!-- Keyboard Shortcuts Help Dialog -->
                <LoginShortcutsDialog
                    :show="showShortcutsHelp"
                    @close="showShortcutsHelp = false"
                />

<!-- Session Timeout Warning -->

                <LoginSessionTimeoutDialog
                    :show="showSessionWarning"
                    :seconds="sessionSecondsLeft"
                    :extending="isExtendingSession"
                    @extend="extendSession"
                    @dismiss="dismissWarning"
                />

                <!-- Technical Mode Panels (Odoo-like debug/tools) -->
                <HardwareDiagnosticsPanel v-if="technicalModeEnabled" />
                <NetworkDiagnosticsPanel v-if="technicalModeEnabled" />

                <!-- Version Info -->
                <VersionInfo />

                <!-- Register -->
                <p class="dy-login__register">
                    {{ __('ليس لديك حساب؟') }}
                    <a href="/account/register" @click.prevent="goToRegister">
                        {{ __('سجّل الآن') }}
                    </a>
                </p>

            </div>
        </section>

        <!-- Workspace panel (desktop ≥1101px) — company identity + link.
             Hidden when technical mode is enabled (technical panels take the workspace area). -->
        <LoginWorkspacePanel v-if="!technicalModeEnabled" />

        <!-- Technical mode panels rendered outside the form for full width -->
        <HardwareDiagnosticsPanel v-if="technicalModeEnabled" class="dy-login__technical-panel" />
        <NetworkDiagnosticsPanel v-if="technicalModeEnabled" class="dy-login__technical-panel" />

        <ShiftOpeningDialog
            v-if="shiftDialogOpen"
            v-model="shiftDialogOpen"
            @shift-opened="onShiftOpened"
            @dialog-closed="onShiftDialogClosed"
        />

        <!-- =================================================================
         Session Lock — القالب وحالته في مكوّنه (نفس سبب حوار انتهاء
         الجلسة: ملف الأنماط بنطاقه لا يصل إلى عنصر في ملف آخر).
         =============================================================== -->

        <LoginSessionLockDialog />

        <!-- بيانات التثبيت — تُعرض مرة واحدة. التفصيل في المكوّن. -->
        <InstallCredentialsCard />

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
