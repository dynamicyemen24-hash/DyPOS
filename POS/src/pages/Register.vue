<!--
  =============================================================================
  DyPOS — Subscriber Registration Page
  Production Grade / End-to-End SaaS
  =============================================================================

  المسؤوليات:
  - Subscriber registration UI
  - Form validation (Arabic)
  - API registration via Frappe
  - Success/error feedback
  - Navigation back to login

  المبدأ:
  Register → Verify → Login
  -->

<script setup>
import { ref, computed, onMounted } from "vue"

import { FeatherIcon } from "frappe-ui"

import DyPOSLogo from "@/assets/DyPOSLogo.png"
import smartPortsBg from "@/assets/smart-ports-og.jpg"

import DyButton from "@/components/ui/DyButton.vue"
import PasswordStrengthBar from "@/components/reports/dashboards/core/PasswordStrengthBar.vue"

import { goToLogin } from "@/router"
import { session } from "@/stores/session"
import { normalizeArabic } from "@/utils/arabic"
import { logger } from "@/utils/logger"
import { useSessionTimeout } from "@/composables/useSessionTimeout"

/* ============================================================================
 * Props
 * ============================================================================ */

const props = defineProps({
	backgroundImage: {
		type: String,
		default: "",
	},
})

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
const agreeToTerms = ref(false)

const isSubmitting = ref(false)
const registerError = ref("")
const registerSuccess = ref(false)

const fullNameInput = ref(null)
const emailInput = ref(null)

const showPassword = ref(false)
const showConfirmPassword = ref(false)

const sessionTimeout = useSessionTimeout({
	warningBeforeMs: 5 * 60 * 1000,
	sessionDurationMs: 30 * 60 * 1000,
	onLogout: () => {
		logger?.warn?.("Registration session expired")
	},
})

/* ============================================================================
 * Computed
 * ============================================================================ */

const brandBackground = computed(() => {
	const image = props.backgroundImage || smartPortsBg
	if (!image) return {}
	return {
		backgroundImage: `linear-gradient(
            135deg,
            rgb(var(--dy-brand-c-950) / 0.96),
            rgb(var(--dy-brand-c-900) / 0.86),
            rgb(var(--dy-brand-c-800) / 0.62)
        ), url("${image}")`,
	}
})

const canSubmit = computed(() => {
	return (
		fullName.value.trim().length >= 2 &&
		email.value.trim().length > 0 &&
		password.value.length >= 6 &&
		password.value === confirmPassword.value &&
		agreeToTerms.value &&
		!isSubmitting.value
	)
})

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

const emailError = computed(() => {
	if (!email.value) return ""
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	if (!emailRegex.test(email.value)) return "البريد الإلكتروني غير صالح"
	return ""
})

const passwordError = computed(() => {
	if (!password.value) return ""
	if (password.value.length < 6)
		return "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
	return ""
})

const confirmPasswordError = computed(() => {
	if (!confirmPassword.value) return ""
	if (confirmPassword.value !== password.value)
		return "كلمات المرور غير متطابقة"
	return ""
})

const fullNameError = computed(() => {
	if (!fullName.value.trim()) return ""
	if (fullName.value.trim().length < 2)
		return "الاسم يجب أن يكون حرفين على الأقل"
	return ""
})

const hasErrors = computed(() => {
	return (
		emailError.value ||
		passwordError.value ||
		confirmPasswordError.value ||
		fullNameError.value
	)
})

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

	try {
		const name = normalizeValue(fullName.value)
		const emailValue = normalizeValue(email.value)
		const phoneValue = phoneNumber.value
			? phoneNumber.value.replace(/\D/g, "")
			: ""
		const companyValue = normalizeValue(companyName.value)

		if (typeof frappe !== "undefined" && frappe.call) {
			await frappe.call({
				method: "frappe.auth.register",
				args: {
					full_name: name,
					email: emailValue,
					password: password.value,
					phone: phoneValue,
					company: companyValue,
				},
			})
		} else {
			const { session: sessionModule } = await import("@/data/session")
			await sessionModule.session.login.submit({
				usr: emailValue,
				pwd: password.value,
			})
		}

		registerSuccess.value = true
		emit("registered")

		logger?.info?.("DyPOS subscriber registered successfully")
	} catch (error) {
		registerSuccess.value = false

		const errorMessage =
			error?.message ||
			error?.response?.data?.message ||
			"حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى."

		registerError.value = errorMessage

		logger?.warn?.("DyPOS registration failed", error)

		emit("error", error)
	} finally {
		isSubmitting.value = false
	}
}

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

onMounted(() => {
	window.addEventListener("keydown", handleGlobalKeydown)
	emailInput.value?.focus?.()
	sessionTimeout.init()
})

onUnmounted(() => {
	sessionTimeout.destroy()
})
</script>

<template>
	<main
		class="dy-register"
		:class="{ 'dy-register--busy': isSubmitting }"
		dir="rtl"
	>
		<!-- =================================================================
             Brand Panel
             =========================================================== -->

		<section
			class="dy-register__brand"
			:style="brandBackground"
			aria-label="هوية DyPOS"
		>
			<div class="dy-register__brand-overlay" />

			<div class="dy-register__brand-content">
				<div class="dy-register__logo-shell">
					<img
						:src="DyPOSLogo"
						alt="DyPOS"
						class="dy-register__logo"
						width="176"
						height="64"
						decoding="async"
					/>
				</div>

				<div class="dy-register__brand-copy">
					<span class="dy-register__eyebrow">
						نقطة البيع الذكية
					</span>

					<h1 class="dy-register__brand-title">
						أنشئ حسابك
						<br />
						ابدأ الآن.
					</h1>

					<p class="dy-register__brand-description">
						سجّل كمشترك جديد للوصول إلى جميع مميزات
						نقطة البيع الذكية.
					</p>
				</div>

				<div class="dy-register__brand-footer">
					<span>DyPOS</span>
					<span>© {{ new Date().getFullYear() }}</span>
					<span>جميع الحقوق محفوظة</span>
				</div>
			</div>
		</section>

		<!-- =================================================================
             Registration Panel
             =========================================================== -->

		<section class="dy-register__panel">
			<div class="dy-register__panel-inner">
				<!-- Header -->

				<header class="dy-register__header">
					<div class="dy-register__mobile-logo">
						<img
							:src="DyPOSLogo"
							alt="DyPOS"
							width="148"
							height="54"
							decoding="async"
						/>
					</div>

					<div>
						<span class="dy-register__section-label">
							تسجيل حساب جديد
						</span>

						<h2 class="dy-register__title">
							إنشاء حساب المشترك
						</h2>

						<p class="dy-register__subtitle">
							أدخل بياناتك لبدء استخدام نقطة البيع الذكية.
						</p>
					</div>

					<!-- Back to login -->

					<a
						href="/account/login"
						class="dy-register__back"
					>
						<FeatherIcon
							name="arrow-left"
							:size="18"
							aria-hidden="true"
						/>
						العودة إلى تسجيل الدخول
					</a>
				</header>

				<!-- Session Timeout Warning -->

				<Transition name="dy-fade">
					<div
						v-if="sessionTimeout.showWarning"
						class="dy-register__timeout"
						role="alertdialog"
						aria-modal="true"
					>
						<div class="dy-register__timeout-card">
							<h3>ستنتهي الجلسة قريباً</h3>
							<p>
								يتبقى
								{{ Math.ceil(sessionTimeout.timeRemaining / 1000) }}
								ثانية.
							</p>
							<div class="dy-register__timeout-actions">
								<DyButton
									variant="primary"
									size="sm"
									:loading="sessionTimeout.isExtending"
									@click="sessionTimeout.extendSession()"
								>
									تمديد الجلسة
								</DyButton>
							</div>
						</div>
					</div>
				</Transition>

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
						مرحبًا بك في DyPOS. يمكنك الآن تسجيل الدخول
						لبدء استخدام نقطة البيع.
					</p>

					<DyButton
						variant="primary"
						size="lg"
						@click="goToLogin"
					>
						الانتقال إلى تسجيل الدخول
					</DyButton>
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
					novalidate
					@submit.prevent="submitRegistration"
				>
					<!-- Full Name -->

					<div class="dy-register__field">
						<label
							for="dypos-register-name"
							class="dy-register__label"
						>
							الاسم الكامل <span class="dy-register__required">*</span>
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
								type="text"
								dir="rtl"
								placeholder="أدخل اسمك الكامل"
								:disabled="isSubmitting"
								required
								spellcheck="false"
								@input="clearErrors"
							/>
						</div>

						<span
							v-if="fullNameError"
							class="dy-register__field-error"
						>
							{{ fullNameError }}
						</span>
					</div>

					<!-- Email -->

					<div class="dy-register__field">
						<label
							for="dypos-register-email"
							class="dy-register__label"
						>
							البريد الإلكتروني <span class="dy-register__required">*</span>
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
								type="email"
								inputmode="email"
								dir="ltr"
								placeholder="name@company.com"
								:disabled="isSubmitting"
								required
								spellcheck="false"
								@input="clearErrors"
							/>
						</div>

						<span
							v-if="emailError"
							class="dy-register__field-error"
						>
							{{ emailError }}
						</span>
					</div>

					<!-- Password -->

					<div class="dy-register__field">
						<div class="dy-register__label-row">
							<label
								for="dypos-register-password"
								class="dy-register__label"
							>
								كلمة المرور <span class="dy-register__required">*</span>
							</label>

							<span
								v-if="password.value"
								class="dy-register__strength"
								:style="{ color: passwordStrength.color }"
							>
								{{ passwordStrength.label }}
							</span>
						</div>

						<PasswordStrengthBar
							v-if="password.value"
							:password="password"
							:show-label="false"
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
								:type="showPassword ? 'text' : 'password'"
								dir="ltr"
								placeholder="6 أحرف على الأقل"
								:disabled="isSubmitting"
								required
								spellcheck="false"
								@input="clearErrors"
							/>

							<button
								type="button"
								class="dy-register__password-toggle"
								:aria-label="
									showPassword
										? 'إخفاء كلمة المرور'
										: 'إظهار كلمة المرور'
								"
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
							class="dy-register__field-error"
						>
							{{ passwordError }}
						</span>
					</div>

					<!-- Confirm Password -->

					<div class="dy-register__field">
						<label
							for="dypos-register-confirm"
							class="dy-register__label"
						>
							تأكيد كلمة المرور <span class="dy-register__required">*</span>
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
								:type="showConfirmPassword ? 'text' : 'password'"
								dir="ltr"
								placeholder="أعد كتابة كلمة المرور"
								:disabled="isSubmitting"
								required
								spellcheck="false"
								@input="clearErrors"
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
							class="dy-register__field-error"
						>
							{{ confirmPasswordError }}
						</span>
					</div>

					<!-- Phone (Optional) -->

					<div class="dy-register__field">
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
								placeholder="05XXXXXXXX"
								:disabled="isSubmitting"
								spellcheck="false"
								@input="clearErrors"
							/>
						</div>
					</div>

					<!-- Company (Optional) -->

					<div class="dy-register__field">
						<label
							for="dypos-register-company"
							class="dy-register__label"
						>
							اسم الشركة / المؤسسة
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
								placeholder="أدخل اسم شركتك"
								:disabled="isSubmitting"
								spellcheck="false"
								@input="clearErrors"
							/>
						</div>
					</div>

					<!-- Terms -->

					<div class="dy-register__terms">
						<label class="dy-register__checkbox-label">
							<input
								v-model="agreeToTerms"
								type="checkbox"
								:disabled="isSubmitting"
								@change="clearErrors"
							/>

							<span
								class="dy-register__checkbox"
								aria-hidden="true"
							/>

							<span>
								أوافق على
								<a href="/terms" class="dy-register__link">
									شروط الاستخدام
								</a>
								و
								<a href="/privacy" class="dy-register__link">
									سياسة الخصوصية
								</a>
							</span>
						</label>
					</div>

					<!-- Submit -->

					<DyButton
						type="submit"
						variant="primary"
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
					</DyButton>
				</form>

				<!-- Footer -->

				<footer class="dy-register__footer">
					<span>DyPOS</span>

					<span>
						© {{ new Date().getFullYear() }}
					</span>

					<span>
						جميع الحقوق محفوظة
					</span>
				</footer>
			</div>
		</section>
	</main>
</template>

<style scoped>
/* =============================================================================
   DyPOS — Subscriber Registration Page
   RTL-first / Arabic-first / Production Grade
   ============================================================================= */

.dy-register {
	--register-panel-width: min(100%, 620px);
	--register-content-width: 480px;

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

.dy-register__brand {
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

.dy-register__brand-overlay {
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

.dy-register__brand-content {
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

.dy-register__logo-shell {
	display: inline-flex;
	width: fit-content;

	padding: 14px 18px;

	border: 1px solid rgb(255 255 255 / 0.16);

	border-radius: var(--dy-radius-xl);

	background: rgb(255 255 255 / 0.07);

	backdrop-filter: blur(16px) saturate(1.3);

	-webkit-backdrop-filter: blur(16px) saturate(1.3);
}

.dy-register__logo {
	display: block;
	width: 176px;
	height: auto;
	object-fit: contain;
}

.dy-register__brand-copy {
	max-width: 540px;
	margin-block: auto;
	padding-block: 72px 48px;
}

.dy-register__eyebrow {
	display: inline-flex;
	align-items: center;

	margin-bottom: var(--dy-space-5);

	color: rgb(255 255 255 / 0.72);

	font-size: 0.9rem;
	font-weight: 700;
	letter-spacing: 0.02em;
}

.dy-register__brand-title {
	margin: 0;

	color: white;

	font-size: clamp(2.5rem, 5vw, 4.8rem);

	font-weight: 800;
	line-height: 1.08;
	letter-spacing: -0.035em;
}

.dy-register__brand-description {
	max-width: 480px;

	margin: var(--dy-space-6) 0 0;

	color: rgb(255 255 255 / 0.72);

	font-size: clamp(1rem, 1.5vw, 1.15rem);

	line-height: 1.9;
}

.dy-register__brand-footer {
	display: flex;
	align-items: center;
	gap: 10px;

	margin-top: var(--dy-space-8);

	color: rgb(255 255 255 / 0.45);

	font-size: 0.75rem;
}

/* =============================================================================
   Registration Panel
   ============================================================================= */

.dy-register__panel {
	display: flex;
	align-items: center;
	justify-content: center;

	min-width: 0;
	min-height: 100%;

	overflow: auto;

	background: var(--dy-bg);
}

.dy-register__panel-inner {
	width: min(100%, var(--register-content-width));

	padding:
		max(48px, env(safe-area-inset-top))
		40px
		max(40px, env(safe-area-inset-bottom));
}

.dy-register__header {
	margin-bottom: var(--dy-space-8);
}

.dy-register__mobile-logo {
	display: none;
}

.dy-register__section-label {
	display: block;

	margin-bottom: 8px;

	color: var(--dy-accent);

	font-size: 0.82rem;
	font-weight: 800;
}

.dy-register__title {
	margin: 0;

	color: var(--dy-text-strong);

	font-size: clamp(2rem, 4vw, 2.7rem);

	font-weight: 800;
	letter-spacing: -0.035em;
	line-height: 1.15;
}

.dy-register__subtitle {
	margin: var(--dy-space-3) 0 0;

	color: var(--dy-text-secondary);

	font-size: 0.98rem;
	line-height: 1.8;
}

/* Back to login link */

.dy-register__back {
	display: inline-flex;
	align-items: center;
	gap: 6px;

	margin-top: var(--dy-space-4);

	color: var(--dy-accent);

	font-size: 0.84rem;
	font-weight: 600;

	text-decoration: none;

	cursor: pointer;

	transition: opacity var(--dy-dur-fast) var(--dy-ease-standard);
}

.dy-register__back:hover {
	opacity: 0.8;
}

/* =============================================================================
   Success
   ============================================================================= */

.dy-register__success {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--dy-space-4);

	padding: var(--dy-space-6) 0;

	text-align: center;
}

.dy-register__success-icon {
	display: inline-flex;

	color: var(--dy-mint-600);
}

.dy-register__success-title {
	margin: 0;

	color: var(--dy-text-strong);

	font-size: 1.5rem;
	font-weight: 800;
}

.dy-register__success-message {
	margin: 0;

	color: var(--dy-text-secondary);

	font-size: 0.95rem;
	line-height: 1.8;
}

/* =============================================================================
   Error
   ============================================================================= */

.dy-register__error {
	display: flex;
	align-items: flex-start;
	gap: 10px;

	margin-bottom: var(--dy-space-5);
	padding: 13px 14px;

	border: 1px solid rgb(var(--dy-crimson-c-500) / 0.24);

	border-radius: var(--dy-radius-lg);

	background: rgb(var(--dy-crimson-c-500) / 0.07);

	color: var(--dy-crimson-700);
}

.dy-register__error-icon {
	display: inline-flex;
	flex: 0 0 auto;

	margin-top: 1px;
}

.dy-register__error-content {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 2px;

	min-width: 0;

	font-size: 0.82rem;
	line-height: 1.6;
}

.dy-register__error-content strong {
	font-weight: 800;
}

.dy-register__error-close {
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

.dy-register__error-close:hover {
	background: rgb(var(--dy-crimson-c-500) / 0.08);
}

/* =============================================================================
   Form
   ============================================================================= */

.dy-register__form {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-5);
}

.dy-register__field {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.dy-register__label-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.dy-register__label {
	color: var(--dy-text-strong);

	font-size: 0.84rem;
	font-weight: 750;
}

.dy-register__required {
	color: var(--dy-crimson-600);
}

.dy-register__input-wrap {
	position: relative;

	display: flex;
	align-items: center;

	min-height: var(--dy-control-h-xl);

	border: 1px solid var(--dy-input-border);

	border-radius: var(--dy-radius-lg);

	background: var(--dy-input-bg);

	transition:
		border-color var(--dy-dur-fast) var(--dy-ease-standard),
		box-shadow var(--dy-dur-fast) var(--dy-ease-standard),
		background-color var(--dy-dur-fast) var(--dy-ease-standard);
}

.dy-register__input-wrap:focus-within {
	border-color: var(--dy-accent);

	box-shadow:
		0 0 0 3px rgb(var(--dy-brand-c-500) / 0.12);
}

.dy-register__input-icon {
	position: absolute;
	inset-inline-start: 16px;

	color: var(--dy-text-muted);

	pointer-events: none;
}

.dy-register__input {
	width: 100%;
	min-width: 0;
	min-height: var(--dy-control-h-xl);

	padding: 0 48px 0 48px;

	border: 0;
	border-radius: var(--dy-radius-lg);

	background: transparent;

	color: var(--dy-text);

	font: inherit;
	font-size: 0.94rem;

	outline: none;
}

.dy-register__input::placeholder {
	color: var(--dy-text-muted);
}

.dy-register__input:disabled {
	opacity: 0.6;
}

.dy-register__password-toggle {
	position: absolute;
	inset-inline-end: 12px;

	display: inline-flex;
	align-items: center;
	justify-content: center;

	width: 36px;
	height: 36px;

	border: 0;
	border-radius: var(--dy-radius-md);

	background: transparent;

	color: var(--dy-text-muted);

	cursor: pointer;
}

.dy-register__password-toggle:hover {
	background: var(--dy-surface);
}

.dy-register__field-error {
	color: var(--dy-crimson-600);

	font-size: 0.78rem;
	font-weight: 600;
}

/* Password strength indicator */

.dy-register__strength {
	font-size: 0.78rem;
	font-weight: 700;
}

/* Terms checkbox */

.dy-register__terms {
	margin-top: var(--dy-space-2);
}

.dy-register__checkbox-label {
	display: flex;
	align-items: flex-start;
	gap: 10px;

	color: var(--dy-text-secondary);

	font-size: 0.84rem;
	line-height: 1.6;

	cursor: pointer;
}

.dy-register__checkbox-label input[type="checkbox"] {
	margin-top: 2px;
	accent-color: var(--dy-accent);
}

.dy-register__link {
	color: var(--dy-accent);

	font-weight: 600;

	text-decoration: underline;
}

/* Submit */

.dy-register__submit {
	margin-top: var(--dy-space-3);
}

/* =============================================================================
   Footer
   ============================================================================= */

.dy-register__footer {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;

	margin-top: var(--dy-space-8);

	color: var(--dy-text-muted);

	font-size: 0.75rem;
}

/* =============================================================================
   Responsive
   ============================================================================= */

@media (max-width: 768px) {
	.dy-register {
		grid-template-columns: 1fr;
	}

	.dy-register__brand {
		display: none;
	}

	.dy-register__mobile-logo {
		display: inline-flex;
	}
}

/* =============================================================================
   Session Timeout Warning
   ============================================================================= */

.dy-register__timeout {
	position: fixed;
	inset: 0;
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgb(0 0 0 / 0.5);
}

.dy-register__timeout-card {
	width: min(100%, 420px);
	padding: 24px;
	background: var(--dy-bg);
	border-radius: var(--dy-radius-xl);
	box-shadow: 0 24px 64px rgb(0 0 0 / 0.3);
	text-align: center;
}

.dy-register__timeout-card h3 {
	margin: 0;
	color: var(--dy-text-strong);
	font-size: 1.1rem;
	font-weight: 800;
}

.dy-register__timeout-card p {
	margin: 12px 0;
	color: var(--dy-text-secondary);
	font-size: 0.9rem;
	line-height: 1.8;
}

.dy-register__timeout-actions {
	display: flex;
	gap: 12px;
	justify-content: center;
	margin-top: 16px;
}

/* =============================================================================
   Password Strength Bar
   ============================================================================= */

.dy-register__field {
	margin-bottom: var(--dy-space-3);
}
</style>
