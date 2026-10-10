<!--
  =============================================================================
  DyPOS — Subscriber Registration Page
  Production Grade / End-to-End POS
  =============================================================================

  المسؤوليات:
  - Subscriber registration UI
  - Form validation (Arabic)
  - API registration via the method router
  - Success/error feedback
  - Navigation back to login

  المبدأ:
  Register → Verify → Login
  -->

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue"

import { FeatherIcon } from "dypos-ui"
import { ActionButton } from "dypos-ui"

// The retired four-family button import was left behind after the 1.44.5
// unification, so this page failed to resolve — and nothing caught it:
// vite build` reports one missing module at a time, and no test mounted the
// register screen until the mount-every-SFC block landed.
import CompanyFooter from "@/components/common/CompanyFooter.vue"
import PasswordStrengthBar from "@/components/reports/dashboards/core/PasswordStrengthBar.vue"

import router, { goToLogin } from "@/router"
import { APP_NAME } from "@/utils/brand"
import { session } from "@/stores/session"
import { normalizeArabic } from "@/utils/arabic"
import { logger } from "@/utils/logger"
import { userRepository } from "@/repositories/userRepository"
import { isLinkEnabled } from "@/services/link-consent"
import { useReducedMotion } from "@/composables/useReducedMotion"
import { useMediaQuery } from "@/composables/useMediaQuery"
import {
	confirmPasswordError as getConfirmPasswordError,
	emailValidationError,
	fullNameValidationError,
} from "@/utils/registrationValidation"
import {
	getPasswordStrength,
	isPasswordAcceptable,
	validatePassword,
} from "@/utils/passwordPolicy"

/* ============================================================================
 * Props
 * ============================================================================ */

const emit = defineEmits(["registered", "error"])

/* ============================================================================
 * Form State
 * ============================================================================ */

const fullName = ref("")
const email = ref("")
const password = ref("")
const confirmPassword = ref("")
const phoneNumber = ref("")
const companyName = ref("")
const branchName = ref("المركز الرئيسي")
const branchCode = ref("MAIN")
const currency = ref("YER")
const countryCode = ref("YE")
const timezone = ref("Asia/Aden")
const establishmentType = ref("retail")
const agreeToTerms = ref(false)

// قوائم التسجيل تقرأ من الخادم (مرجع v53: countries + business_sectors) — لا نسخة
// مكتوبة هنا. النسخة الثابتة السابقة اختلفت عن قائمة المعالج التي يعيد الخادم،
// فيُقبل رمز عند التسجيل ثم يُرفض عند حفظ الملف التعريفي، وقائمة الدول توقّفت عند
// ثماني دول بينما الجدول يضم ثمانية عشر. الفشل في التحميل يُظهر رسالة استعادة
// (فحص الاتصال + إعادة محاولة) — لا قائمة افتراضية مُختلقة.
const establishmentTypes = ref([])
const countries = ref([])
const metaLoading = ref(false)
const metaError = ref("")

const isSubmitting = ref(false)
const registerError = ref("")
const registerSuccess = ref(false)
const subscriberCode = ref("")
const isEnteringSystem = ref(false)
const entryError = ref("")

const fullNameInput = ref(null)
const emailInput = ref(null)

const showPassword = ref(false)
const showConfirmPassword = ref(false)

// Guest page: no session timer. The session-expiry popup must never appear
// before login.

/* ============================================================================
 * Computed
 * ============================================================================ */

/*
 * The password rules are the POLICY's, not this page's.
 *
 * This screen used to hardcode a 6-character minimum and keep a private
 * copy of the strength scoring, while `utils/passwordPolicy.js` — the
 * module `usePasswordReset` judges with — said 8. Two screens then gave
 * two different answers to "is this password valid": an account could be
 * registered with six characters and be refused the same value later.
 * One module, one answer, both screens.
 */
function onCountryChange() {
	const country = countries.value.find(
		(item) => item.code === countryCode.value,
	)
	if (country) {
		timezone.value = country.timezone
		currency.value = country.currency
	}
}

const registerStep = ref(1)
const registerStepCount = 3
const registerStepMeta = computed(() => [
	{ number: 1, title: "بيانات الحساب", hint: "الهوية وبيانات الدخول" },
	{ number: 2, title: "المنشأة والفرع", hint: "البيانات التشغيلية الأساسية" },
	{ number: 3, title: "التهيئة", hint: "الدولة والعملة والنشاط" },
])
function stepOneValid() {
	return (
		fullName.value.trim().length >= 2 &&
		email.value.trim().length > 0 &&
		isPasswordAcceptable(password.value) &&
		password.value === confirmPassword.value
	)
}
function stepTwoValid() {
	return companyName.value.trim().length >= 2
}
function nextRegisterStep() {
	clearErrors()
	if (registerStep.value === 1 && !stepOneValid()) {
		registerError.value =
			"أكمل بيانات الحساب وتحقق من كلمة المرور قبل المتابعة."
		return
	}
	if (registerStep.value === 2 && !stepTwoValid()) {
		registerError.value = "أدخل اسم المنشأة قبل المتابعة."
		return
	}
	registerStep.value = Math.min(registerStepCount, registerStep.value + 1)
}
function previousRegisterStep() {
	clearErrors()
	registerStep.value = Math.max(1, registerStep.value - 1)
}

const canSubmit = computed(() => {
	return (
		fullName.value.trim().length >= 2 &&
		email.value.trim().length > 0 &&
		companyName.value.trim().length >= 2 &&
		isPasswordAcceptable(password.value) &&
		password.value === confirmPassword.value &&
		agreeToTerms.value &&
		!isSubmitting.value
	)
})

const passwordStrength = computed(() => getPasswordStrength(password.value))

/*
 * The field error is the policy's FIRST complaint. Re-checking the rules
 * here is exactly what let the two copies drift apart.
 */
const passwordError = computed(() => {
	if (!password.value) return ""
	return validatePassword(password.value)[0] ?? ""
})

const emailError = computed(() => emailValidationError(email.value))
const confirmPasswordError = computed(() =>
	getConfirmPasswordError(password.value, confirmPassword.value),
)
const fullNameError = computed(() => fullNameValidationError(fullName.value))
const companyError = computed(() =>
	companyName.value.trim().length >= 2 ? "" : "اسم الشركة أو المؤسسة مطلوب",
)

const hasErrors = computed(() => {
	return (
		emailError.value ||
		passwordError.value ||
		confirmPasswordError.value ||
		fullNameError.value ||
		companyError.value
	)
})

/* ============================================================================
 * Offline Detection & Registration
 * ============================================================================ */

const isBrowser = typeof window !== "undefined"

const isOfflineMode = ref(false)
const offlineDetected = ref(false)
const showOfflineIndicator = ref(false)

const log = logger.create("Register")

async function loadRegistrationMeta() {
	metaLoading.value = true
	metaError.value = ""
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), 6000)
	try {
		const res = await fetch("/api/method/DyPOS.api.auth.registration_meta", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "same-origin",
			cache: "no-store",
			signal: controller.signal,
			body: JSON.stringify({}),
		})
		const payload = await res.json().catch(() => ({}))
		if (!res.ok)
			throw new Error(
				payload?.message || payload?.error || "تعذر تحميل بيانات التسجيل",
			)
		const message = payload?.message || payload
		const nextCountries = Array.isArray(message?.countries)
			? message.countries
			: []
		const nextTypes = Array.isArray(message?.establishmentTypes)
			? message.establishmentTypes
			: []
		if (!nextCountries.length || !nextTypes.length)
			throw new Error("قوائم الخادم فارغة")
		countries.value = nextCountries
		establishmentTypes.value = nextTypes
	} catch (error) {
		metaError.value =
			"تعذر تحميل بيانات التسجيل (الدولة ونوع المنشأة). تحقق من الاتصال ثم أعد المحاولة."
		log.warn("Registration meta load failed", error)
	} finally {
		clearTimeout(timeoutId)
		metaLoading.value = false
	}
}

function detectOfflineMode() {
	if (!isBrowser) return false
	return !navigator.onLine
}

function detectAndSetOfflineMode() {
	isOfflineMode.value = detectOfflineMode()
	offlineDetected.value = true
	showOfflineIndicator.value = isOfflineMode.value
	return isOfflineMode.value
}

/* ============================================================================
 * Helpers
 * ============================================================================ */

function clearErrors() {
	registerError.value = ""
}

function normalizeValue(value) {
	return normalizeArabic(value.trim())
}

/* ============================================================================
 * Registration
 * ============================================================================ */

async function submitRegistration() {
	if (!canSubmit.value) return
	clearErrors()
	isSubmitting.value = true
	registerSuccess.value = false
	subscriberCode.value = ""
	try {
		const name = normalizeValue(fullName.value)
		const emailValue = normalizeValue(email.value)
		const phoneValue = phoneNumber.value
			? phoneNumber.value.replace(/\D/g, "")
			: ""
		const companyValue = normalizeValue(companyName.value)
		const branchNameValue = normalizeValue(branchName.value) || "المركز الرئيسي"
		const branchCodeValue = branchCode.value.trim().toUpperCase() || "MAIN"
		// Standalone-first registration: without explicit linkage, create a
		// real local PBKDF2 credential immediately. This is a real account,
		// not demo/mock data, and it can enter the POS without a server.
		if (!isLinkEnabled() || navigator.onLine === false) {
			await userRepository.create({
				fullName: name,
				email: emailValue,
				password: password.value,
				phone: phoneValue,
				company: companyValue,
				role: "ADMIN",
			})
			subscriberCode.value = `LOCAL-${emailValue.split("@")[0].slice(0, 8).toUpperCase()}`
			await session.login({ usr: emailValue, pwd: password.value })
			registerSuccess.value = true
			emit("registered")
			isEnteringSystem.value = true
			entryError.value = ""
			await session.bootstrap().catch(() => {})
			await router.replace({ name: "Reports" })
			return
		}

		// Server registration only: the meta lists (countries + business
		// sectors) come from the server, so a server registration cannot
		// proceed without them. This check is deliberately AFTER the local
		// branch above — an earlier copy put it at the top of the function,
		// so a dead server blocked the LOCAL account too, and no customer
		// could register at all while the till was meant to work offline.
		if (!countries.value.length || !establishmentTypes.value) {
			throw new Error(
				metaError.value ||
					"قوائم التسجيل غير محمّلة بعد. تحقق من الاتصال ثم أعد المحاولة.",
			)
		}

		const response = await fetch("/api/method/DyPOS.api.auth.register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "same-origin",
			cache: "no-store",
			body: JSON.stringify({
				username: emailValue,
				email: emailValue,
				full_name: name,
				password: password.value,
				phone: phoneValue,
				company: companyValue,
				branchName: branchNameValue,
				branchCode: branchCodeValue,
				currency: currency.value.trim().toUpperCase() || "YER",
				countryCode: countryCode.value,
				timezone: timezone.value,
				establishmentType: establishmentType.value,
			}),
		})
		const payload = await response.json().catch(() => ({}))
		if (!response.ok)
			throw new Error(
				payload?.message || payload?.error || "تعذر إنشاء الاشتراك",
			)
		const result = payload?.message || payload
		subscriberCode.value = String(result?.subscriberCode || "").trim()
		registerSuccess.value = true
		emit("registered")
		// التسجيل الناجح لا يترك المشترك عند شاشة نجاح ميتة:
		// نتحقق فورًا من الحساب الذي أُنشئ، ثم نفتح جلسة التشغيل وننقل
		// المستخدم إلى نقطة البيع. لا نحفظ كلمة المرور؛ تبقى في الذاكرة
		// حتى انتهاء هذا الطلب فقط.
		isEnteringSystem.value = true
		entryError.value = ""
		try {
			await session.login({
				usr: emailValue,
				pwd: password.value,
				subscriberCode: subscriberCode.value,
			})
			// Persist the operational profile, but never make a successful
			// authentication wait indefinitely for a secondary onboarding write.
			// Registration already sent these fields to the authoritative register
			// endpoint; this call is a reconciliation step for the profile API.
			try {
				const controller = new AbortController()
				const timeoutId = setTimeout(() => controller.abort(), 2500)
				try {
					const profileResponse = await fetch(
						"/api/method/DyPOS.api.onboarding.save_profile",
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							credentials: "same-origin",
							cache: "no-store",
							signal: controller.signal,
							body: JSON.stringify({
								countryCode: countryCode.value,
								timezone: timezone.value,
								currency: currency.value.trim().toUpperCase(),
								establishmentType: establishmentType.value,
							}),
						},
					)
					if (!profileResponse.ok) {
						log.warn(
							"Operational profile reconciliation deferred",
							profileResponse.status,
						)
					}
				} finally {
					clearTimeout(timeoutId)
				}
			} catch (profileError) {
				log.warn("Operational profile reconciliation deferred", profileError)
			}
			if (typeof session.bootstrap === "function") {
				await session.bootstrap()
			}
			await router.replace({ name: "POSSale" })
			return
		} catch (entryErrorValue) {
			entryError.value =
				entryErrorValue?.message ||
				"تم إنشاء المشترك، لكن تعذر فتح جلسة التشغيل تلقائيًا. يمكنك الدخول يدويًا."
			log.warn(
				"Registration succeeded but automatic sign-in failed",
				entryErrorValue,
			)
		} finally {
			isEnteringSystem.value = false
		}
	} catch (error) {
		registerSuccess.value = false
		registerError.value =
			error?.message || "تعذر إنشاء الاشتراك. تحقق من الاتصال وحاول مرة أخرى."
		emit("error", error)
	} finally {
		isSubmitting.value = false
	}
}

/* ============================================================================
 * Accessibility & Responsive
 * ============================================================================ */

const reducedMotion = useReducedMotion()
const prefersDark = useMediaQuery("(prefers-color-scheme: dark)")
const isMobile = useMediaQuery("(max-width: 768px)")

/* ============================================================================
 * Keyboard
 * ============================================================================ */

function handleGlobalKeydown(event) {
	if (event.key === "Escape") {
		clearErrors()
	}
}

/* ============================================================================
 * Lifecycle
 * ============================================================================ */

function handleOnline() {
	isOfflineMode.value = false
	showOfflineIndicator.value = false
}

function handleOffline() {
	isOfflineMode.value = true
	showOfflineIndicator.value = true
}

onMounted(() => {
	window.addEventListener("keydown", handleGlobalKeydown)
	window.addEventListener("online", handleOnline)
	window.addEventListener("offline", handleOffline)
	emailInput.value?.focus?.()
	detectAndSetOfflineMode()
	loadRegistrationMeta()
})

onUnmounted(() => {
	window.removeEventListener("keydown", handleGlobalKeydown)
	window.removeEventListener("online", handleOnline)
	window.removeEventListener("offline", handleOffline)
})
</script>

<template>
	<main
		class="dy-register"
		:class="{
			'dy-register--busy': isSubmitting,
			'dy-register--offline': isOfflineMode,
			'dy-register--mobile': isMobile,
			'dy-register--reduced-motion': reducedMotion,
			'dy-register--dark': prefersDark,
		}"
		dir="rtl"
	>
		<nav class="dy-register__command-strip" aria-label="قائمة الوصول السريع">
            <strong>{{ APP_NAME }}</strong>
            <RouterLink :to="{ name: 'Login' }">{{ __('الدخول') }}</RouterLink>
            <RouterLink :to="{ name: 'Register' }" class="is-current">{{ __('تسجيل المشترك') }}</RouterLink>
            <RouterLink :to="{ name: 'Terms' }">{{ __('الشروط') }}</RouterLink>
            <RouterLink :to="{ name: 'Privacy' }">{{ __('الخصوصية') }}</RouterLink>
            <RouterLink :to="{ name: 'Agreement' }">{{ __('الاتفاقية') }}</RouterLink>
        </nav>

        <!-- Offline Indicator -->
		<div
			v-if="showOfflineIndicator && offlineDetected"
			class="dy-register__offline-banner"
			role="status"
			aria-live="polite"
		>
			<FeatherIcon name="wifi-off" :size="16" aria-hidden="true" />
			<span>لا يمكن إنشاء اشتراك جديد دون اتصال. اتصل بالإنترنت لإكمال التسجيل.</span>
		</div>

		<!--
			لا لوحة هوية ولا صور هنا.

			كانت عمودًا كاملًا بصورة 1200×630 وشعار وتذييل، فبقي بعد
			حذف الصور فراغًا ميتًا يشدّ العين بلا معلومة: المستخدم هنا
			لم signingStyle يحتاج نموذجًا لا إعلانًا. الاعتماد_
			يتأتى من `CompanyFooter` نصًّا في أسفل الصفحة.
		-->

		<!-- =================================================================
             Registration Panel
             =========================================================== -->

		<section class="dy-register__panel">
			<div class="dy-register__panel-inner">
				<!-- Guided registration progress -->
				<nav class="dy-register__progress" aria-label="مراحل التسجيل">
					<div v-for="item in registerStepMeta" :key="item.number" class="dy-register__progress-item" :class="{ 'is-active': registerStep === item.number, 'is-done': registerStep > item.number }">
						<span>{{ item.number }}</span><strong>{{ item.title }}</strong><small>{{ item.hint }}</small>
					</div>
				</nav>

				<!-- Header -->

				<header class="dy-register__header">

					<div>
						<span class="dy-register__section-label">
							تسجيل حساب جديد
						</span>

						<h2 class="dy-register__title">
							إنشاء حساب المشترك
						</h2>

						<p class="dy-register__subtitle">
							أنشئ المشترك والمؤسسة والفرع الرئيسي في خطوة واحدة، ثم استورد بياناتك الأساسية وأرصدة البداية من القوالب.
						</p>
					</div>

					<!-- Back to login -->

					<RouterLink
						:to="{ name: 'Login' }"
						class="dy-register__back"
					>
						<FeatherIcon
							name="arrow-left"
							:size="18"
							aria-hidden="true"
						/>
						العودة إلى تسجيل الدخول
					</RouterLink>
				</header>

				<!-- Success -->

				<div
					v-if="registerSuccess"
					class="dy-register__success"
					role="alert"
					aria-live="assertive"
				>
					<div class="dy-register__success-icon" aria-hidden="true">
						<FeatherIcon
							name="check-circle"
							:size="48"
						/>
					</div>

					<h3 class="dy-register__success-title">
						تم إنشاء الحساب بنجاح!
					</h3>

					<p class="dy-register__success-message">
						مرحبًا بك في DyPOS. تم إنشاء المشترك والمؤسسة والفرع والمستودع الأساسي، ويتم الآن تجهيز جلسة التشغيل.
					</p>
					<div v-if="isEnteringSystem" class="dy-register__success-progress" role="status" aria-live="polite">
						<FeatherIcon name="loader" :size="18" aria-hidden="true" />
						<span>جاري فتح النظام وتجهيز بيانات المشترك...</span>
					</div>
					<div v-else-if="entryError" class="dy-register__success-recovery" role="alert" aria-live="assertive">
						<strong>تم إنشاء المشترك بنجاح.</strong>
						<span>{{ entryError }}</span>
					</div>

					<div v-if="subscriberCode" class="dy-register__subscriber-code">
						<strong>رمز المشترك</strong>
						<code>{{ subscriberCode }}</code>
						<small>احتفظ به لربط أجهزة ومستخدمي المشترك بالنطاق الصحيح.</small>
					</div>
					<ActionButton
						v-if="entryError"
						variant="solid"
						size="lg"
						@click="goToLogin"
					>
						تسجيل الدخول والمتابعة
					</ActionButton>
				</div>

				<!-- Error -->

				<div
					v-else-if="registerError"
					class="dy-register__error"
					role="alert"
					aria-live="assertive"
				>
					<span class="dy-register__error-icon" aria-hidden="true">
						<FeatherIcon
							name="alert-circle"
							:size="18"
						/>
					</span>

					<div class="dy-register__error-content">
						<strong>
							تعذر إنشاء الحساب
						</strong>

						<span>
							{{ registerError }}
						</span>
					</div>

					<button
						type="button"
						class="dy-register__error-close"
						aria-label="إغلاق رسالة الخطأ"
						@click="registerError = ''"
					>
						<FeatherIcon
							name="x"
							:size="16"
						/>
					</button>
				</div>

				<!-- Form -->

				<form
					v-else
					ref="registerForm"
					class="dy-register__form"
					:class="`dy-register__form--step-${registerStep}`"
					novalidate
					@submit.prevent="submitRegistration"
				>
					<!-- Full Name -->

					<div v-if="registerStep === 1" class="dy-register__field">
						<label
							for="dypos-register-name"
							class="dy-register__label"
						>
							الاسم الكامل <span class="dy-register__required" aria-hidden="true">*</span>
						</label>

						<div class="dy-register__input-wrap">
							<FeatherIcon
								name="user"
								:size="18"
								class="dy-register__input-icon"
								aria-hidden="true"
							/>

							<input
								id="dypos-register-name"
								ref="fullNameInput"
								v-model="fullName"
								class="dy-register__input"
								:class="{ 'dy-register__input--error': fullNameError }"
								type="text"
								dir="rtl"
								placeholder="أدخل اسمك الكامل"
								:disabled="isSubmitting"
								required
								spellcheck="false"
								@input="clearErrors"
								aria-invalid="!!fullNameError"
								aria-describedby="dypos-register-name-error"
								autocomplete="name"
							/>
						</div>

						<span
							v-if="fullNameError"
							id="dypos-register-name-error"
							class="dy-register__field-error"
							role="alert"
							aria-live="polite"
						>
							<FeatherIcon name="alert-circle" :size="14" aria-hidden="true" />
							{{ fullNameError }}
						</span>
					</div>

					<!-- Email -->

					<div v-if="registerStep === 1" class="dy-register__field">
						<label
							for="dypos-register-email"
							class="dy-register__label"
						>
							البريد الإلكتروني <span class="dy-register__required" aria-hidden="true">*</span>
						</label>

						<div class="dy-register__input-wrap">
							<FeatherIcon
								name="mail"
								:size="18"
								class="dy-register__input-icon"
								aria-hidden="true"
							/>

							<input
								id="dypos-register-email"
								ref="emailInput"
								v-model="email"
								class="dy-register__input"
								:class="{ 'dy-register__input--error': emailError }"
								type="email"
								inputmode="email"
								dir="ltr"
								placeholder="name@company.com"
								:disabled="isSubmitting"
								required
								spellcheck="false"
								@input="clearErrors"
								aria-invalid="!!emailError"
								aria-describedby="dypos-register-email-error"
								autocomplete="email"
							/>
						</div>

						<span
							v-if="emailError"
							id="dypos-register-email-error"
							class="dy-register__field-error"
							role="alert"
							aria-live="polite"
						>
							<FeatherIcon name="alert-circle" :size="14" aria-hidden="true" />
							{{ emailError }}
						</span>
					</div>

					<!-- Password -->

					<div v-if="registerStep === 1" class="dy-register__field">
						<div class="dy-register__label-row">
							<label
								for="dypos-register-password"
								class="dy-register__label"
							>
								كلمة المرور <span class="dy-register__required" aria-hidden="true">*</span>
							</label>

							<span
								v-if="password.value"
								class="dy-register__strength"
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

						<div class="dy-register__input-wrap">
							<FeatherIcon
								name="lock"
								:size="18"
								class="dy-register__input-icon"
								aria-hidden="true"
							/>

							<input
								id="dypos-register-password"
								v-model="password"
								class="dy-register__input"
								:class="{ 'dy-register__input--error': passwordError }"
								:type="showPassword ? 'text' : 'password'"
								dir="ltr"
								placeholder="8 أحرف على الأقل (حرف ورقم)"
								:disabled="isSubmitting"
								required
								spellcheck="false"
								@input="clearErrors"
								aria-invalid="!!passwordError"
								aria-describedby="dypos-register-password-error"
								autocomplete="new-password"
							/>

							<button
								type="button"
								class="dy-register__password-toggle"
								:aria-label="
									showPassword
										? 'إخفاء كلمة المرور'
										: 'إظهار كلمة المرور'
								"
								:aria-pressed="showPassword"
								:disabled="isSubmitting"
								@click="showPassword = !showPassword"
							>
								<FeatherIcon
									:name="showPassword ? 'eye-off' : 'eye'"
									:size="18"
								/>
							</button>
						</div>

						<span
							v-if="passwordError"
							id="dypos-register-password-error"
							class="dy-register__field-error"
							role="alert"
							aria-live="polite"
						>
							<FeatherIcon name="alert-circle" :size="14" aria-hidden="true" />
							{{ passwordError }}
						</span>
					</div>

					<!-- Confirm Password -->

					<div v-if="registerStep === 1" class="dy-register__field">
						<label
							for="dypos-register-confirm"
							class="dy-register__label"
						>
							تأكيد كلمة المرور <span class="dy-register__required" aria-hidden="true">*</span>
						</label>

						<div class="dy-register__input-wrap">
							<FeatherIcon
								name="lock"
								:size="18"
								class="dy-register__input-icon"
								aria-hidden="true"
							/>

							<input
								id="dypos-register-confirm"
								v-model="confirmPassword"
								class="dy-register__input"
								:class="{ 'dy-register__input--error': confirmPasswordError }"
								:type="showConfirmPassword ? 'text' : 'password'"
								dir="ltr"
								placeholder="أعد كتابة كلمة المرور"
								:disabled="isSubmitting"
								required
								spellcheck="false"
								@input="clearErrors"
								aria-invalid="!!confirmPasswordError"
								aria-describedby="dypos-register-confirm-error"
								autocomplete="new-password"
							/>

							<button
								type="button"
								class="dy-register__password-toggle"
								:aria-label="
									showConfirmPassword
										? 'إخفاء كلمة المرور'
										: 'إظهار كلمة المرور'
								"
								:disabled="isSubmitting"
								@click="showConfirmPassword = !showConfirmPassword"
							>
								<FeatherIcon
									:name="showConfirmPassword ? 'eye-off' : 'eye'"
									:size="18"
								/>
							</button>
						</div>

						<span
							v-if="confirmPasswordError"
							id="dypos-register-confirm-error"
							class="dy-register__field-error"
							role="alert"
							aria-live="polite"
						>
							<FeatherIcon name="alert-circle" :size="14" aria-hidden="true" />
							{{ confirmPasswordError }}
						</span>
					</div>

					<!-- Phone (Optional) -->

					<div v-if="registerStep === 1" class="dy-register__field">
						<label
							for="dypos-register-phone"
							class="dy-register__label"
						>
							رقم الهاتف
						</label>

						<div class="dy-register__input-wrap">
							<FeatherIcon
								name="phone"
								:size="18"
								class="dy-register__input-icon"
								aria-hidden="true"
							/>

							<input
								id="dypos-register-phone"
								v-model="phoneNumber"
								class="dy-register__input"
								type="tel"
								inputmode="tel"
								dir="ltr"
								placeholder="0501234567"
								:disabled="isSubmitting"
								spellcheck="false"
								@input="clearErrors"
								autocomplete="tel"
							/>
						</div>
					</div>

					<!-- Company (Required for a new subscriber tenant) -->

					<div v-if="registerStep === 2" class="dy-register__field">
						<label
							for="dypos-register-company"
							class="dy-register__label"
						>
							اسم الشركة / المؤسسة <span class="dy-register__required" aria-hidden="true">*</span>
						</label>

						<div class="dy-register__input-wrap">
							<FeatherIcon
								name="briefcase"
								:size="18"
								class="dy-register__input-icon"
								aria-hidden="true"
							/>

							<input
								id="dypos-register-company"
								v-model="companyName"
								class="dy-register__input"
								type="text"
								dir="rtl"
								placeholder="أدخل اسم الشركة أو المؤسسة"
								:disabled="isSubmitting"
								spellcheck="false"
								@input="clearErrors"
								autocomplete="organization"
							/>
						</div>
					<span
						v-if="companyError"
						id="dypos-register-company-error"
						class="dy-register__field-error"
						role="alert"
						aria-live="polite"
					>
						<FeatherIcon name="alert-circle" :size="14" aria-hidden="true" />
						{{ companyError }}
					</span>
					</div>

					<!-- Initial Branch / Operating Defaults -->
					<div v-if="registerStep === 2" class="dy-register__field">
						<label for="dypos-register-branch" class="dy-register__label">الفرع الرئيسي <span class="dy-register__required" aria-hidden="true">*</span></label>
						<div class="dy-register__input-wrap">
							<FeatherIcon name="map-pin" :size="18" class="dy-register__input-icon" aria-hidden="true" />
							<input id="dypos-register-branch" v-model="branchName" class="dy-register__input" type="text" dir="rtl" placeholder="المركز الرئيسي" :disabled="isSubmitting" required autocomplete="organization" />
						</div>
					</div>

					<div v-if="registerStep === 2" class="dy-register__field">
						<label for="dypos-register-branch-code" class="dy-register__label">رمز الفرع</label>
						<div class="dy-register__input-wrap">
							<FeatherIcon name="hash" :size="18" class="dy-register__input-icon" aria-hidden="true" />
							<input id="dypos-register-branch-code" v-model="branchCode" class="dy-register__input" type="text" dir="ltr" maxlength="32" placeholder="MAIN" :disabled="isSubmitting" autocomplete="off" />
						</div>
					</div>

					<div v-if="registerStep === 3" class="dy-register__field">
						<label for="dypos-register-country" class="dy-register__label">الدولة</label>
						<div class="dy-register__input-wrap">
							<FeatherIcon name="globe" :size="18" class="dy-register__input-icon" aria-hidden="true" />
							<select id="dypos-register-country" v-model="countryCode" class="dy-register__input" :disabled="isSubmitting || metaLoading" @change="onCountryChange">
								<option v-for="item in countries" :key="item.code" :value="item.code">{{ item.name }}</option>
							</select>
						</div>
					</div>

					<div v-if="registerStep === 3" class="dy-register__field">
						<label for="dypos-register-establishment-type" class="dy-register__label">نوع المنشأة</label>
						<div class="dy-register__input-wrap">
							<FeatherIcon name="briefcase" :size="18" class="dy-register__input-icon" aria-hidden="true" />
							<select id="dypos-register-establishment-type" v-model="establishmentType" class="dy-register__input" :disabled="isSubmitting || metaLoading">
								<option v-for="item in establishmentTypes" :key="item.value" :value="item.value">{{ item.label }}</option>
							</select>
						</div>
						<p v-if="metaError" class="dy-register__error" role="alert">{{ metaError }}</p>
					</div>

					<div v-if="registerStep === 3" class="dy-register__field">
						<label for="dypos-register-currency" class="dy-register__label">العملة الأساسية</label>
						<div class="dy-register__input-wrap">
							<FeatherIcon name="dollar-sign" :size="18" class="dy-register__input-icon" aria-hidden="true" />
							<input id="dypos-register-currency" v-model="currency" class="dy-register__input" type="text" dir="ltr" maxlength="3" placeholder="SAR" :disabled="isSubmitting" autocomplete="off" />
						</div>
					</div>

					<!-- Terms -->

					<div v-if="registerStep === 3" class="dy-register__terms">
						<label class="dy-register__checkbox-label">
							<input
								v-model="agreeToTerms"
								type="checkbox"
								:disabled="isSubmitting"
								@change="clearErrors"
								id="dypos-register-terms"
								aria-describedby="dypos-register-terms-desc"
							/>

							<span
								class="dy-register__checkbox"
								aria-hidden="true"
							/>

							<span id="dypos-register-terms-desc">
								أوافق على
								<RouterLink :to="{ name: 'Terms' }" class="dy-register__link">شروط الاستخدام</RouterLink>
								و
								<RouterLink :to="{ name: 'Privacy' }" class="dy-register__link">سياسة الخصوصية</RouterLink>
								و
								<RouterLink :to="{ name: 'Agreement' }" class="dy-register__link">اتفاقية المشترك</RouterLink>
							</span>
						</label>
					</div>

					<!-- Guided registration navigation -->
					<div class="dy-register__wizard-actions">
						<ActionButton v-if="registerStep > 1" type="button" variant="subtle" size="lg" :disabled="isSubmitting" @click="previousRegisterStep">السابق</ActionButton>
						<ActionButton v-if="registerStep < registerStepCount" type="button" variant="solid" size="lg" :disabled="isSubmitting" @click="nextRegisterStep">التالي <FeatherIcon name="arrow-left" :size="17" /></ActionButton>
					</div>

					<!-- Submit -->

					<ActionButton
						v-if="registerStep === registerStepCount"
						type="submit"
						variant="solid"
						size="lg"
						class="dy-register__submit"
						:loading="isSubmitting"
						:disabled="!canSubmit"
						:aria-busy="isSubmitting"
					>
						<FeatherIcon
							v-if="!isSubmitting"
							name="user-plus"
							:size="18"
							aria-hidden="true"
						/>

						<FeatherIcon
							v-if="isSubmitting"
							name="loader"
							:size="18"
							aria-hidden="true"
						/>

						{{ isSubmitting ? 'جاري التسجيل...' : 'إنشاء الحساب' }}
					</ActionButton>

					<ActionButton
						variant="subtle"
						size="lg"
						class="dy-register__return-login"
						@click="goToLogin"
						:title="__('عودة إلى تسجيل الدخول')"
						:aria-label="__('عودة إلى تسجيل الدخول')"
					>
						<FeatherIcon name="arrow-left" class="h-[16px] w-[16px]" />
						<span>عودة إلى تسجيل الدخول</span>
					</ActionButton>
				</form>

				<!-- Footer — اسم الشركة + رابط موقعها الرسمي -->

				<CompanyFooter class="dy-register__footer" />
			</div>
		</section>
	</main>
</template>

<style scoped src="@/styles/pages/register.css"></style>
