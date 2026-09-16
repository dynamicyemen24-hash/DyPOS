<!--
  =============================================================================
  DyPOS — Subscriber Password Recovery (Set New Password)
  Production Grade / End-to-End SaaS
  =============================================================================

  المسؤوليات:
  - Secure password reset with single-use token (from URL)
  - Password policy enforcement (NIST SP 800-63B)
  - Password strength meter + visibility toggles
  - Token sanitisation (stripped from URL immediately)
  - Rate-limited submissions (token brute-force protection)
  - Accessibility (ARIA, focus management)
  - Navigation back to Login

  المبدأ:
  Token from email → Validate → New password → Login
  =============================================================================
-->

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue"

import { FeatherIcon } from "frappe-ui"
import DyButton from "@/components/ui/DyButton.vue"
import PasswordStrengthBar from "@/components/reports/dashboards/core/PasswordStrengthBar.vue"

import {
	consumeResetToken,
	getCachedResetToken,
	isTokenValid,
	usePasswordReset,
} from "@/composables/usePasswordReset"

import { useSessionTimeout } from "@/composables/useSessionTimeout"

import { validatePassword, PASSWORD_MIN_LENGTH } from "@/utils/passwordPolicy"
import { goToLogin } from "@/router"
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

const emit = defineEmits(["passwordReset", "error"])

/* ============================================================================
 * Reactive State
 * ========================================================================== */

const {
	isSubmitting,
	submitError,
	isSuccess,
	isRateLimited,
	rateLimitRetryAfter,
	resetPassword,
	formatRetryTime,
} = usePasswordReset()

const newPassword = ref("")
const confirmPassword = ref("")
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

const token = ref(null)
const tokenExpiry = ref(null)
const tokenState = ref("checking") // checking | valid | missing | expired

const newPwInput = ref(null)

/* ============================================================================
 * Session Timeout
 * ========================================================================== */

const sessionTimeout = useSessionTimeout({
	warningBeforeMs: 5 * 60 * 1000,
	sessionDurationMs: 30 * 60 * 1000,
	onLogout: () => {
		logger?.warn?.("Reset-password session expired")
	},
})

/* ============================================================================
 * Token Lifecycle
 * ========================================================================== */

function resolveToken() {
	const { token: consumed, expiry } = consumeResetToken()

	if (!consumed) {
		/* Check in-memory cache (e.g. SPA soft reload) */
		const cached = getCachedResetToken()
		if (cached) {
			token.value = cached
			tokenState.value = "valid"
			return
		}
		tokenState.value = "missing"
		return
	}

	token.value = consumed
	tokenExpiry.value = expiry
	tokenState.value = isTokenValid(consumed, expiry) ? "valid" : "expired"
}

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

const passwordPolicy = computed(() => {
	if (!newPassword.value) return null
	return validatePassword(newPassword.value)
})

const policyErrors = computed(() => passwordPolicy.value?.errors || [])

const mismatchError = computed(() => {
	if (!confirmPassword.value) return ""
	if (confirmPassword.value !== newPassword.value) {
		return "كلمتا المرور غير متطابقتين."
	}
	return ""
})

const canSubmit = computed(() => {
	return (
		tokenState.value === "valid" &&
		newPassword.value.length >= PASSWORD_MIN_LENGTH &&
		confirmPassword.value.length >= PASSWORD_MIN_LENGTH &&
		newPassword.value === confirmPassword.value &&
		(!passwordPolicy.value || passwordPolicy.value.valid) &&
		!isSubmitting.value &&
		!isRateLimited.value
	)
})

const displayError = computed(() => {
	if (tokenState.value === "missing") {
		return "رابط الاستعادة غير صالح. يرجى طلب رابط جديد من صفحة نسيت كلمة المرور."
	}
	if (tokenState.value === "expired") {
		return "انتهت صلاحية رابط الاستعادة. يرجى طلب رابط جديد."
	}
	return submitError.value
})

const displaySuccess = computed(() => {
	if (!isSuccess.value) return ""
	return "تمت استعادة كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة."
})

const rateLimitMessage = computed(() => {
	if (!isRateLimited.value) return ""
	return `تم تجاوز الحد. حاول مرة أخرى ${formatRetryTime(rateLimitRetryAfter.value)}.`
})

/* ============================================================================
 * Actions
 * ========================================================================== */

async function submitNewPassword() {
	if (!canSubmit.value) return

	const result = await resetPassword(
		newPassword.value,
		confirmPassword.value,
		token.value,
	)

	if (result.success) {
		emit("passwordReset")
		/* Redirect to Login after brief success feedback */
		setTimeout(() => goToLogin(), 2500)
	} else {
		emit("error", result.message)
	}
}

function goToLoginNow() {
	goToLogin()
}

/* ============================================================================
 * Keyboard + Lifecycle
 * ========================================================================== */

function handleGlobalKeydown(event) {
	if (event.key === "Escape" && !isSuccess.value) {
		newPassword.value = ""
		confirmPassword.value = ""
	}
}

onMounted(() => {
	window.addEventListener("keydown", handleGlobalKeydown)
	resolveToken()
	sessionTimeout.init()
	newPwInput.value?.focus?.()
})

onUnmounted(() => {
	sessionTimeout.destroy()
})
</script>

<template>
	<main
		class="dy-reset"
		:class="{ 'dy-reset--busy': isSubmitting }"
		dir="rtl"
	>
		<!-- Brand Panel -->

		<section
			class="dy-reset__brand"
			:style="brandBackground"
			aria-label="هوية DyPOS"
		>
			<div class="dy-reset__brand-overlay" />

			<div class="dy-reset__brand-content">
				<div class="dy-reset__logo-shell">
					<img
						:src="DyPOSLogo"
						alt="DyPOS"
						class="dy-reset__logo"
						width="176"
						height="64"
						decoding="async"
					/>
				</div>

				<div class="dy-reset__brand-copy">
					<span class="dy-reset__eyebrow">
						نقطة البيع الذكية
					</span>

					<h1 class="dy-reset__brand-title">
						كلمة مرور جديدة
						<br />
						آمنة وقوية.
					</h1>

					<p class="dy-reset__brand-description">
						اختر كلمة مرور قوية لحماية حسابك
						من الوصول غير المصرح به.
					</p>
				</div>

				<div class="dy-reset__brand-footer">
					<span>DyPOS</span>
					<span>© {{ new Date().getFullYear() }}</span>
					<span>جميع الحقوق محفوظة</span>
				</div>
			</div>
		</section>

		<!-- Reset Panel -->

		<section class="dy-reset__panel">
			<div class="dy-reset__panel-inner">
				<!-- Header -->

				<header class="dy-reset__header">
					<div class="dy-reset__mobile-logo">
						<img
							:src="DyPOSLogo"
							alt="DyPOS"
							width="148"
							height="54"
							decoding="async"
						/>
					</div>

					<div>
						<span class="dy-reset__section-label">
							استعادة كلمة المرور
						</span>

						<h2 class="dy-reset__title">
							تعيين كلمة مرور جديدة
						</h2>

						<p class="dy-reset__subtitle">
							أدخل كلمة المرور الجديدة وتأكيداً لها.
						</p>
					</div>
				</header>

				<!-- Invalid / Missing / Expired Token -->

				<Transition name="dy-fade">
					<div
						v-if="tokenState !== 'valid' && tokenState !== 'checking'"
						class="dy-reset__token-invalid"
						role="alert"
					>
						<FeatherIcon
							:name="tokenState === 'expired' ? 'clock' : 'shield-off'"
							size="20"
							class="dy-reset__token-invalid-icon"
						/>
						<span>{{ displayError }}</span>
						<DyButton
							variant="solid"
							class="dy-reset__token-invalid-btn"
							@click="goToLoginNow"
						>
							العودة إلى تسجيل الدخول
						</DyButton>
					</div>
				</Transition>

				<!-- Success -->

				<Transition name="dy-fade">
					<div
						v-if="displaySuccess"
						class="dy-reset__success"
						role="status"
						aria-live="polite"
					>
						<FeatherIcon
							name="check-circle"
							size="20"
							class="dy-reset__success-icon"
						/>
						<span>{{ displaySuccess }}</span>
					</div>
				</Transition>

				<!-- Rate Limit -->

				<Transition name="dy-fade">
					<div
						v-if="rateLimitMessage"
						class="dy-reset__rate-limit"
						role="alert"
						aria-live="polite"
					>
						<FeatherIcon name="clock" size="16" />
						<span>{{ rateLimitMessage }}</span>
					</div>
				</Transition>

				<!-- Error -->

				<Transition name="dy-fade">
					<div
						v-if="displayError && tokenState === 'valid'"
						class="dy-reset__error"
						role="alert"
						aria-live="assertive"
					>
						<FeatherIcon
							name="alert-circle"
							size="18"
							class="dy-reset__error-icon"
						/>
						<span>{{ displayError }}</span>
					</div>
				</Transition>

				<!-- Form -->

				<form
					v-if="tokenState === 'valid' && !displaySuccess"
					class="dy-reset__form"
					autocomplete="new-password"
					@submit.prevent="submitNewPassword"
				>
					<!-- New Password -->

					<div class="dy-reset__field">
						<label
							for="dypos-reset-new"
							class="dy-reset__label"
						>
							كلمة المرور الجديدة <span class="dy-reset__required">*</span>
						</label>

						<div class="dy-reset__input-wrap">
							<FeatherIcon
								name="lock"
								size="18"
								class="dy-reset__input-icon"
								aria-hidden="true"
							/>

							<input
								id="dypos-reset-new"
								ref="newPwInput"
								v-model="newPassword"
								class="dy-reset__input"
								:type="showNewPassword ? 'text' : 'password'"
								dir="ltr"
								:placeholder="`${PASSWORD_MIN_LENGTH} أحرف على الأقل`"
								:disabled="isSubmitting"
								autocomplete="new-password"
								required
								spellcheck="false"
							/>

							<button
								type="button"
								class="dy-reset__password-toggle"
								:aria-label="showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'"
								:disabled="isSubmitting"
								@click="showNewPassword = !showNewPassword"
							>
								<FeatherIcon
									:name="showNewPassword ? 'eye-off' : 'eye'"
									size="18"
								/>
							</button>
						</div>

						<PasswordStrengthBar :password="newPassword" />

						<!-- Policy Errors -->
						<ul
							v-if="policyErrors.length"
							class="dy-reset__policy-errors"
							aria-live="polite"
						>
							<li
								v-for="(err, i) in policyErrors"
								:key="i"
							>
								<FeatherIcon name="x-circle" size="14" />
								{{ err }}
							</li>
						</ul>
					</div>

					<!-- Confirm Password -->

					<div class="dy-reset__field">
						<label
							for="dypos-reset-confirm"
							class="dy-reset__label"
						>
							تأكيد كلمة المرور <span class="dy-reset__required">*</span>
						</label>

						<div class="dy-reset__input-wrap">
							<FeatherIcon
								name="lock"
								size="18"
								class="dy-reset__input-icon"
								aria-hidden="true"
							/>

							<input
								id="dypos-reset-confirm"
								v-model="confirmPassword"
								class="dy-reset__input"
								:type="showConfirmPassword ? 'text' : 'password'"
								dir="ltr"
								placeholder="أعد كتابة كلمة المرور"
								:disabled="isSubmitting"
								autocomplete="new-password"
								required
								spellcheck="false"
							/>

							<button
								type="button"
								class="dy-reset__password-toggle"
								:aria-label="showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'"
								:disabled="isSubmitting"
								@click="showConfirmPassword = !showConfirmPassword"
							>
								<FeatherIcon
									:name="showConfirmPassword ? 'eye-off' : 'eye'"
									size="18"
								/>
							</button>
						</div>

						<span
							v-if="mismatchError"
							class="dy-reset__field-error"
						>
							{{ mismatchError }}
						</span>
					</div>

					<!-- Submit -->

					<div class="dy-reset__submit">
						<DyButton
							:loading="isSubmitting"
							:disabled="!canSubmit"
							variant="solid"
							class="dy-reset__submit-btn"
						>
							{{ isSubmitting ? "جاري الحفظ..." : "تعيين كلمة المرور" }}
						</DyButton>
					</div>
				</form>

				<!-- Back to Login -->

				<div class="dy-reset__footer">
					<RouterLink
						to="/account/login"
						class="dy-reset__back-link"
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
.dy-reset {
	display: grid;
	grid-template-columns: 1fr 1fr;
	min-height: 100vh;

	background: var(--dy-surface);
	color: var(--dy-text);
}

.dy-reset--busy {
	pointer-events: none;
	user-select: none;
}

/* Brand Panel */

.dy-reset__brand {
	position: relative;
	overflow: hidden;

	display: flex;
	flex-direction: column;
	justify-content: space-between;
	padding: var(--dy-space-8);

	color: var(--dy-text-inverse);
}

.dy-reset__brand-overlay {
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

.dy-reset__brand-content {
	position: relative;
	z-index: 1;

	display: flex;
	flex-direction: column;
	gap: var(--dy-space-8);

	max-width: 420px;
	margin-top: auto;
}

.dy-reset__logo-shell {
	width: fit-content;
}

.dy-reset__logo {
	width: 176px;
	height: auto;
}

.dy-reset__eyebrow {
	font-size: 0.81rem;
	font-weight: 700;
	letter-spacing: 0.04em;

	color: rgb(var(--dy-brand-c-300));
	text-transform: uppercase;
}

.dy-reset__brand-title {
	font-size: 2.5rem;
	font-weight: 800;
	line-height: 1.15;
	letter-spacing: -0.02em;
}

.dy-reset__brand-description {
	font-size: 1.05rem;
	line-height: 1.7;

	color: rgb(var(--dy-brand-c-200));
}

.dy-reset__brand-footer {
	display: flex;
	align-items: center;
	gap: 6px;

	font-size: 0.82rem;
	color: rgb(var(--dy-brand-c-300) / 0.7);
}

/* Reset Panel */

.dy-reset__panel {
	display: flex;
	flex-direction: column;
	padding: var(--dy-space-10);
}

.dy-reset__panel-inner {
	width: 100%;
	max-width: 440px;
	margin: 0 auto;
}

.dy-reset__header {
	margin-bottom: var(--dy-space-6);
}

.dy-reset__mobile-logo {
	display: none;
}

.dy-reset__section-label {
	font-size: 0.81rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;

	color: var(--dy-text-muted);
}

.dy-reset__title {
	margin-top: var(--dy-space-2);
	font-size: 1.75rem;
	font-weight: 800;
	line-height: 1.2;
}

.dy-reset__subtitle {
	margin-top: var(--dy-space-2);
	font-size: 0.92rem;
	line-height: 1.6;

	color: var(--dy-text-secondary);
}

/* Form */

.dy-reset__form {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-5);
}

.dy-reset__field {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.dy-reset__label {
	color: var(--dy-text-strong);

	font-size: 0.84rem;
	font-weight: 750;
}

.dy-reset__required {
	color: var(--dy-crimson-600);
}

.dy-reset__input-wrap {
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

.dy-reset__input-wrap:focus-within {
	border-color: var(--dy-accent);

	box-shadow:
		0 0 0 3px rgb(var(--dy-brand-c-500) / 0.12);
}

.dy-reset__input-icon {
	position: absolute;
	inset-inline-start: 16px;

	color: var(--dy-text-muted);

	pointer-events: none;
}

.dy-reset__input {
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

.dy-reset__input::placeholder {
	color: var(--dy-text-muted);
}

.dy-reset__input:disabled {
	opacity: 0.6;
}

.dy-reset__password-toggle {
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

.dy-reset__password-toggle:hover {
	background: var(--dy-surface);
}

.dy-reset__field-error {
	color: var(--dy-crimson-600);

	font-size: 0.78rem;
	font-weight: 600;
}

/* Policy Errors */

.dy-reset__policy-errors {
	display: flex;
	flex-direction: column;
	gap: 4px;

	margin: 0;
	padding: 0;

	list-style: none;
}

.dy-reset__policy-errors li {
	display: flex;
	align-items: center;
	gap: 6px;

	color: var(--dy-crimson-600);

	font-size: 0.78rem;
	font-weight: 600;
}

/* Submit */

.dy-reset__submit {
	margin-top: var(--dy-space-3);
}

.dy-reset__submit-btn {
	width: 100%;
}

/* Token Invalid */

.dy-reset__token-invalid {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;

	padding: 28px 20px;

	border: 1px solid rgb(var(--dy-amber-c-500) / 0.3);
	border-radius: var(--dy-radius-xl);

	background: rgb(var(--dy-amber-c-500) / 0.07);

	color: var(--dy-amber-700);

	font-size: 0.92rem;
	line-height: 1.7;
	text-align: center;
}

.dy-reset__token-invalid-icon {
	flex: 0 0 auto;
}

.dy-reset__token-invalid-btn {
	width: 100%;
	margin-top: var(--dy-space-2);
}

/* Success */

.dy-reset__success {
	display: flex;
	align-items: flex-start;
	gap: 12px;

	padding: 18px;

	border: 1px solid rgb(var(--dy-mint-c-500) / 0.24);
	border-radius: var(--dy-radius-lg);

	background: rgb(var(--dy-mint-c-500) / 0.07);

	color: var(--dy-mint-700);

	font-size: 0.88rem;
	line-height: 1.7;
}

.dy-reset__success-icon {
	flex: 0 0 auto;
	margin-top: 1px;
}

/* Rate Limit */

.dy-reset__rate-limit {
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

/* Error */

.dy-reset__error {
	display: flex;
	align-items: flex-start;
	gap: 10px;

	margin-bottom: var(--dy-space-5);
	padding: 13px 14px;

	border: 1px solid rgb(var(--dy-crimson-c-500) / 0.24);
	border-radius: var(--dy-radius-lg);

	background: rgb(var(--dy-crimson-c-500) / 0.07);

	color: var(--dy-crimson-700);

	font-size: 0.82rem;
	line-height: 1.6;
}

.dy-reset__error-icon {
	display: inline-flex;
	flex: 0 0 auto;

	margin-top: 1px;
}

/* Footer */

.dy-reset__footer {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;

	margin-top: var(--dy-space-6);

	color: var(--dy-text-muted);

	font-size: 0.86rem;
}

.dy-reset__back-link {
	display: inline-flex;
	align-items: center;
	gap: 4px;

	color: var(--dy-accent);

	font-weight: 600;
	text-decoration: underline;
	text-underline-offset: 3px;
}

.dy-reset__back-link:hover {
	color: var(--dy-accent);
}

/* Responsive */

@media (max-width: 768px) {
	.dy-reset {
		grid-template-columns: 1fr;
	}

	.dy-reset__brand {
		display: none;
	}

	.dy-reset__panel {
		padding: var(--dy-space-10) var(--dy-space-6);
	}

	.dy-reset__mobile-logo {
		display: inline-flex;
	}
}

@media (max-width: 480px) {
	.dy-reset__title {
		font-size: 1.5rem;
	}
}

.dy-reset__success,
.dy-reset__error,
.dy-reset__rate-limit,
.dy-reset__token-invalid {
	animation: dy-reset-fade 0.2s ease-out;
}

@keyframes dy-reset-fade {
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




