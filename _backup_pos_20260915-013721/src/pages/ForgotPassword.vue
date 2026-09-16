<!--
  =============================================================================
  DyPOS — Subscriber Password Recovery (Request Reset Link)
  Production Grade / End-to-End SaaS
  =============================================================================

  المسؤوليات:
  - Request a password-reset email link
  - Rate-limited client-side (brute-force / email-bombing protection)
  - CSRF readiness before API calls
  - Anti-enumeration: generic success regardless of account existence
  - Accessibility (ARIA, focus management, keyboard nav)
  - Session timeout (idle / absolute)
  - Error feedback with retry-backoff display
  - Navigation back to Login

  المبدأ:
  Enter email → Server sends secure single-use token link → ResetPassword page
  =============================================================================
-->

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"

import { FeatherIcon } from "frappe-ui"
import DyButton from "@/components/ui/DyButton.vue"

import { usePasswordReset } from "@/composables/usePasswordReset"
import { useSessionTimeout } from "@/composables/useSessionTimeout"
import { normalizeArabic } from "@/utils/arabic"
import { logger } from "@/utils/logger"

import DyPOSLogo from "@/assets/DyPOSLogo.png"
import smartPortsBg from "@/assets/smart-ports-og.jpg"

/* ============================================================================
 * Props / Emits
 * ========================================================================== */

const props = defineProps({
	backgroundImage: {
		type: String,
		default: "",
	},
})

const emit = defineEmits(["resetRequested", "error"])

/* ============================================================================
 * Reactive State
 * ========================================================================== */

const {
	isSubmitting,
	requestError,
	isSuccess,
	isRateLimited,
	rateLimitRetryAfter,
	requestReset,
	formatRetryTime,
} = usePasswordReset()

const email = ref("")
const emailInput = ref(null)

const loginError = ref("")

/* ============================================================================
 * Session Timeout
 * ========================================================================== */

const sessionTimeout = useSessionTimeout({
	warningBeforeMs: 5 * 60 * 1000,
	sessionDurationMs: 30 * 60 * 1000,
	onLogout: () => {
		logger?.warn?.("Forgot-password session expired")
	},
})

/* ============================================================================
 * Computed
 * ========================================================================== */

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

const emailError = computed(() => {
	if (!email.value) return ""
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	if (!emailRegex.test(email.value)) return "البريد الإلكتروني غير صالح"
	return ""
})

const canSubmit = computed(() => {
	return (
		email.value.trim().length > 0 &&
		!emailError.value &&
		!isSubmitting.value &&
		!isRateLimited.value
	)
})

const displayError = computed(() => {
	return requestError.value || loginError.value
})

const displaySuccess = computed(() => {
	if (isSuccess.value) {
		return "إذا كان الحساب موجودًا، سيتم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني. يرجى فحص بريدك (وشامل مجلد غير المرغوب فيه)."
	}
	return ""
})

const rateLimitMessage = computed(() => {
	if (!isRateLimited.value) return ""
	return `تم تجاوز الحد. حاول مرة أخرى ${formatRetryTime(rateLimitRetryAfter.value)}.`
})

/* ============================================================================
 * Helpers
 * ========================================================================== */

function clearError() {
	loginError.value = ""
}

/* ============================================================================
 * Form Submission
 * ========================================================================== */

async function submitResetRequest() {
	if (!canSubmit.value) return

	clearError()

	const result = await requestReset(email.value.trim())

	if (result.success) {
		emit("resetRequested")
	} else {
		emit("error", result.message)
	}
}

/* ============================================================================
 * Keyboard
 * ========================================================================== */

function handleGlobalKeydown(event) {
	if (event.key === "Escape") {
		clearError()
	}
}

/* ============================================================================
 * Lifecycle
 * ========================================================================== */

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
		class="dy-forgot"
		:class="{ 'dy-forgot--busy': isSubmitting }"
		dir="rtl"
	>
		<!-- Brand Panel -->

		<section
			class="dy-forgot__brand"
			:style="brandBackground"
			aria-label="هوية DyPOS"
		>
			<div class="dy-forgot__brand-overlay" />

			<div class="dy-forgot__brand-content">
				<div class="dy-forgot__logo-shell">
					<img
						:src="DyPOSLogo"
						alt="DyPOS"
						class="dy-forgot__logo"
						width="176"
						height="64"
						decoding="async"
					/>
				</div>

				<div class="dy-forgot__brand-copy">
					<span class="dy-forgot__eyebrow">
						نقطة البيع الذكية
					</span>

					<h1 class="dy-forgot__brand-title">
						هل نسيت كلمة المرور؟
						<br />
						لا تقلق، سنساعدك.
					</h1>

					<p class="dy-forgot__brand-description">
						أدخل بريدك الإلكتروني وسنرسل لك رابطًا
						لاستعادة كلمة المرور بأمان.
					</p>
				</div>

				<div class="dy-forgot__brand-footer">
					<span>DyPOS</span>
					<span>© {{ new Date().getFullYear() }}</span>
					<span>جميع الحقوق محفوظة</span>
				</div>
			</div>
		</section>

		<!-- Recovery Panel -->

		<section class="dy-forgot__panel">
			<div class="dy-forgot__panel-inner">
				<!-- Header -->

				<header class="dy-forgot__header">
					<div class="dy-forgot__mobile-logo">
						<img
							:src="DyPOSLogo"
							alt="DyPOS"
							width="148"
							height="54"
							decoding="async"
						/>
					</div>

					<div>
						<span class="dy-forgot__section-label">
							استعادة كلمة المرور
						</span>

						<h2 class="dy-forgot__title">
							أدخل بريدك الإلكتروني
						</h2>

						<p class="dy-forgot__subtitle">
							سنرسل لك رابطًا لإعادة تعيين كلمة المرور.
						</p>
					</div>
						</header>

				<!-- Success Message -->

				<Transition name="dy-fade">
					<div
						v-if="displaySuccess"
						class="dy-forgot__success"
						role="status"
						aria-live="polite"
					>
						<FeatherIcon
							name="check-circle"
							size="18"
							class="dy-forgot__success-icon"
						/>
						<span>{{ displaySuccess }}</span>
					</div>
				</Transition>

				<!-- Rate Limit Message -->

				<Transition name="dy-fade">
					<div
						v-if="rateLimitMessage"
						class="dy-forgot__rate-limit"
						role="alert"
						aria-live="polite"
					>
						<FeatherIcon
							name="clock"
							size="16"
							class="dy-forgot__rate-limit-icon"
						/>
						<span>{{ rateLimitMessage }}</span>
					</div>
				</Transition>

				<!-- Error -->

				<Transition name="dy-fade">
					<div
						v-if="displayError"
						class="dy-forgot__error"
						role="alert"
						aria-live="assertive"
					>
						<FeatherIcon
							name="alert-circle"
							size="18"
							class="dy-forgot__error-icon"
						/>
						<div class="dy-forgot__error-content">
							<strong>تعذر إرسال الرابط</strong>
							<span>{{ displayError }}</span>
						</div>
						<button
							type="button"
							class="dy-forgot__error-close"
							aria-label="إغلاق رسالة الخطأ"
							title="إغلاق"
							@click="clearError"
						>
							<FeatherIcon name="x" size="16" />
						</button>
					</div>
				</Transition>

				<!-- Form -->

				<form
					v-if="!displaySuccess"
					class="dy-forgot__form"
					autocomplete="off"
					@submit.prevent="submitResetRequest"
				>
					<!-- Email -->

					<div class="dy-forgot__field">
						<label
							for="dypos-forgot-email"
							class="dy-forgot__label"
						>
							البريد الإلكتروني <span class="dy-forgot__required">*</span>
						</label>

						<div class="dy-forgot__input-wrap">
							<FeatherIcon
								name="mail"
								size="18"
								class="dy-forgot__input-icon"
								aria-hidden="true"
							/>

							<input
								id="dypos-forgot-email"
								ref="emailInput"
								v-model="email"
								class="dy-forgot__input"
								type="email"
								autocomplete="username"
								placeholder="example@company.com"
								:disabled="isSubmitting"
								required
								spellcheck="false"
								@input="clearError"
							/>
						</div>

						<span
							v-if="emailError"
							class="dy-forgot__field-error"
						>
							{{ emailError }}
						</span>
					</div>

					<!-- Submit -->

					<div class="dy-forgot__submit">
						<DyButton
							:loading="isSubmitting"
							:disabled="!canSubmit"
							variant="solid"
							class="dy-forgot__submit-btn"
						>
							<FeatherIcon
								v-if="isSubmitting"
								name="loader-circle"
								size="18"
								class="dy-forgot__spinner"
								aria-hidden="true"
							/>
							{{ isSubmitting ? "جاري الإرسال..." : "إرسال رابط الاستعادة" }}
						</DyButton>
					</div>
				</form>

				<!-- Back to Login -->

				<div class="dy-forgot__footer">
					<RouterLink
						to="/account/login"
						class="dy-forgot__back-link"
					>
						<FeatherIcon name="arrow-right" size="14" />
						عودة إلى تسجيل الدخول
					</RouterLink>
				</div>
			</div>
		</section>
	</main>
</template>

<style scoped>
.dy-forgot {
	display: grid;
	grid-template-columns: 1fr 1fr;
	min-height: 100vh;

	background: var(--dy-surface);
	color: var(--dy-text);
}

.dy-forgot--busy {
	pointer-events: none;
	user-select: none;
}

/* Brand Panel */

.dy-forgot__brand {
	position: relative;
	overflow: hidden;

	display: flex;
	flex-direction: column;
	justify-content: space-between;
	padding: var(--dy-space-8);

	color: var(--dy-text-inverse);
}

.dy-forgot__brand-overlay {
	position: absolute;
	inset: 0;

	background:
		radial-gradient(
			circle at 50% 0%,
			rgb(var(--dy-brand-c-500) / 0.15) 0%,
			transparent 60%
		);
	backdrop-filter: blur(1px);

	pointer-events: none;
}

.dy-forgot__brand-content {
	position: relative;
	z-index: 1;

	display: flex;
	flex-direction: column;
	gap: var(--dy-space-8);

	max-width: 420px;
	margin-top: auto;
}

.dy-forgot__logo-shell {
	width: fit-content;
}

.dy-forgot__logo {
	width: 176px;
	height: auto;
}

.dy-forgot__eyebrow {
	font-size: 0.81rem;
	font-weight: 700;
	letter-spacing: 0.04em;

	color: rgb(var(--dy-brand-c-300));
	text-transform: uppercase;
}

.dy-forgot__brand-title {
	font-size: 2.5rem;
	font-weight: 800;
	line-height: 1.15;
	letter-spacing: -0.02em;
}

.dy-forgot__brand-description {
	font-size: 1.05rem;
	line-height: 1.7;

	color: rgb(var(--dy-brand-c-200));
}

.dy-forgot__brand-footer {
	display: flex;
	align-items: center;
	gap: 6px;

	font-size: 0.82rem;
	color: rgb(var(--dy-brand-c-300) / 0.7);
}

/* Recovery Panel */

.dy-forgot__panel {
	display: flex;
	flex-direction: column;
	padding: var(--dy-space-10);
}

.dy-forgot__panel-inner {
	width: 100%;
	max-width: 420px;
	margin: 0 auto;
}

.dy-forgot__header {
	margin-bottom: var(--dy-space-8);
}

.dy-forgot__mobile-logo {
	display: none;
}

.dy-forgot__section-label {
	font-size: 0.81rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;

	color: var(--dy-text-muted);
}

.dy-forgot__title {
	margin-top: var(--dy-space-2);
	font-size: 1.75rem;
	font-weight: 800;
	line-height: 1.2;
}

.dy-forgot__subtitle {
	margin-top: var(--dy-space-2);
	font-size: 0.92rem;
	line-height: 1.6;

	color: var(--dy-text-secondary);
}

/* Form */

.dy-forgot__form {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-5);
}

.dy-forgot__field {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.dy-forgot__label {
	color: var(--dy-text-strong);

	font-size: 0.84rem;
	font-weight: 750;
}

.dy-forgot__required {
	color: var(--dy-crimson-600);
}

.dy-forgot__input-wrap {
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

.dy-forgot__input-wrap:focus-within {
	border-color: var(--dy-accent);

	box-shadow:
		0 0 0 3px rgb(var(--dy-brand-c-500) / 0.12);
}

.dy-forgot__input-icon {
	position: absolute;
	inset-inline-start: 16px;

	color: var(--dy-text-muted);

	pointer-events: none;
}

.dy-forgot__input {
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

.dy-forgot__input::placeholder {
	color: var(--dy-text-muted);
}

.dy-forgot__input:disabled {
	opacity: 0.6;
}

.dy-forgot__field-error {
	color: var(--dy-crimson-600);

	font-size: 0.78rem;
	font-weight: 600;
}

/* Submit Button */

.dy-forgot__submit {
	margin-top: var(--dy-space-3);
}

.dy-forgot__submit-btn {
	width: 100%;
}

.dy-forgot__spinner {
	margin-inline-end: 6px;
	animation: dy-spin 0.8s linear infinite;
}

@keyframes dy-spin {
	to { transform: rotate(360deg); }
}

/* Status Messages */

.dy-forgot__success {
	display: flex;
	align-items: flex-start;
	gap: 12px;

	padding: 16px 16px;

	border: 1px solid rgb(var(--dy-mint-c-500) / 0.24);
	border-radius: var(--dy-radius-lg);

	background: rgb(var(--dy-mint-c-500) / 0.07);

	color: var(--dy-mint-700);

	font-size: 0.86rem;
	line-height: 1.6;
}

.dy-forgot__success-icon {
	flex: 0 0 auto;
	margin-top: 1px;
}

.dy-forgot__rate-limit {
	display: flex;
	align-items: center;
	gap: 10px;

	padding: 14px 16px;

	border: 1px solid rgb(var(--dy-amber-c-500) / 0.24);
	border-radius: var(--dy-radius-lg);

	background: rgb(var(--dy-amber-c-500) / 0.07);

	color: var(--dy-amber-700);

	font-size: 0.86rem;
}

.dy-forgot__rate-limit-icon {
	flex: 0 0 auto;
}

.dy-forgot__error {
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

.dy-forgot__error-icon {
	display: inline-flex;
	flex: 0 0 auto;

	margin-top: 1px;
}

.dy-forgot__error-content {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 2px;

	min-width: 0;

	font-size: 0.82rem;
	line-height: 1.6;
}

.dy-forgot__error-content strong {
	font-weight: 800;
}

.dy-forgot__error-close {
	display: inline-flex;
	align-items: center;
	justify-content: center;

	flex: 0 0 auto;

	width: 32px;
	height: 32px;

	border: 0;
	border-radius: var(--dy-radius-md);

	background: transparent;

	color: inherit;

	cursor: pointer;
}

.dy-forgot__error-close:hover {
	background: rgb(var(--dy-crimson-c-500) / 0.08);
}

/* Footer */

.dy-forgot__footer {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;

	margin-top: var(--dy-space-6);

	color: var(--dy-text-muted);

	font-size: 0.86rem;
}

.dy-forgot__back-link {
	display: inline-flex;
	align-items: center;
	gap: 4px;

	color: var(--dy-accent);

	font-weight: 600;
	text-decoration: underline;
	text-underline-offset: 3px;
}

.dy-forgot__back-link:hover {
	color: var(--dy-accent);
}

/* Responsive */

@media (max-width: 768px) {
	.dy-forgot {
		grid-template-columns: 1fr;
	}

	.dy-forgot__brand {
		padding: var(--dy-space-6);
	}

	.dy-forgot__panel {
		padding: var(--dy-space-10) var(--dy-space-6);
	}

	.dy-forgot__brand {
		display: none;
	}

	.dy-forgot__mobile-logo {
		display: inline-flex;
	}
}

@media (max-width: 480px) {
	.dy-forgot__title {
		font-size: 1.5rem;
	}
}

.dy-forgot__success,
.dy-forgot__error,
.dy-forgot__rate-limit {
	animation: dy-fade-in 0.2s ease-out;
}

@keyframes dy-fade-in {
	from {
		opacity: 0;
		transform: translateY(-4px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
</style>


