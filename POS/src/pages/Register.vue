<!--
  =============================================================================
  DyPOS â€” Subscriber Registration Page
  Production Grade / End-to-End SaaS
  =============================================================================

  Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„ÙŠØ§Øª:
  - Subscriber registration UI
  - Form validation (Arabic)
  - API registration via the method router
  - Success/error feedback
  - Navigation back to login

  Ø§Ù„Ù…Ø¨Ø¯Ø£:
  Register â†’ Verify â†’ Login
  -->

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue"

import { FeatherIcon } from "dypos-ui"
import { ActionButton } from "dypos-ui"

import DyButton from "@/components/ui/DyButton.vue"
import CompanyFooter from "@/components/common/CompanyFooter.vue"
import PasswordStrengthBar from "@/components/reports/dashboards/core/PasswordStrengthBar.vue"

import { goToLogin } from "@/router"
import { session } from "@/stores/session"
import { normalizeArabic } from "@/utils/arabic"
import { logger } from "@/utils/logger"
import { useReducedMotion } from "@/composables/useReducedMotion"
import { useMediaQuery } from "@/composables/useMediaQuery"
import { isLinkEnabled } from "@/services/link-consent"
import { userRepository } from "@/repositories/userRepository"
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
const agreeToTerms = ref(false)

const isSubmitting = ref(false)
const registerError = ref("")
const registerSuccess = ref(false)

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
 * copy of the strength scoring, while `utils/passwordPolicy.js` â€” the
 * module `usePasswordReset` judges with â€” said 8. Two screens then gave
 * two different answers to "is this password valid": an account could be
 * registered with six characters and be refused the same value later.
 * One module, one answer, both screens.
 */
const canSubmit = computed(() => {
	return (
		fullName.value.trim().length >= 2 &&
		email.value.trim().length > 0 &&
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

const emailError = computed(() => {
	if (!email.value) return ""
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	if (!emailRegex.test(email.value))
		return "Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ ØºÙŠØ± ØµØ§Ù„Ø­"
	return ""
})

const confirmPasswordError = computed(() => {
	if (!confirmPassword.value) return ""
	if (confirmPassword.value !== password.value)
		return "ÙƒÙ„Ù…Ø§Øª Ø§Ù„Ù…Ø±ÙˆØ± ØºÙŠØ± Ù…ØªØ·Ø§Ø¨Ù‚Ø©"
	return ""
})

const fullNameError = computed(() => {
	if (!fullName.value.trim()) return ""
	if (fullName.value.trim().length < 2)
		return "Ø§Ù„Ø§Ø³Ù… ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø­Ø±ÙÙŠÙ† Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„"
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
 * Offline Detection & Registration
 * ============================================================================ */

const isBrowser = typeof window !== "undefined"

const isOfflineMode = ref(false)
const offlineDetected = ref(false)
const showOfflineIndicator = ref(false)

const log = logger.create("Register")

async function detectOfflineMode() {
	if (!isBrowser) return false

	// Standalone-first (user-mandated): no boot probe â€” pinging the backend
	// to decide the mode was itself an undemanded connection. Pure local
	// state: standalone until the user demands server linkage.
	return !isLinkEnabled()
}

async function detectAndSetOfflineMode() {
	isOfflineMode.value = await detectOfflineMode()
	offlineDetected.value = true

	if (isOfflineMode.value) {
		log.info("OFFLINE MODE: Enabling offline registration")
		showOfflineIndicator.value = true
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

		const db = await import("@/services/db").then((m) => m.default)
		await db.open().catch((error) => {
			log.warn("Offline DB open failed", error)
		})

		log.info("Offline systems initialized")
	} catch (error) {
		log.error("Offline systems initialization failed", error)
	}
}

async function attemptOfflineRegistration(userData) {
	if (!isOfflineMode.value) {
		return { success: false, reason: "Online mode - use server registration" }
	}

	try {
		const user = await userRepository.create({
			fullName: normalizeValue(userData.fullName),
			email: normalizeValue(userData.email),
			password: userData.password,
			phone: userData.phone || "",
			company: userData.company ? normalizeValue(userData.company) : "",
		})

		log.info("Offline registration successful for:", userData.email)
		return { success: true, user }
	} catch (error) {
		log.error("Offline registration failed:", error)
		return {
			success: false,
			error: error.message || "ÙØ´Ù„ Ø§Ù„ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ù…Ø­Ù„ÙŠ",
		}
	}
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

	try {
		const name = normalizeValue(fullName.value)
		const emailValue = normalizeValue(email.value)
		const phoneValue = phoneNumber.value
			? phoneNumber.value.replace(/\D/g, "")
			: ""
		const companyValue = normalizeValue(companyName.value)

		let result

		if (isOfflineMode.value) {
			result = await attemptOfflineRegistration({
				fullName: name,
				email: emailValue,
				password: password.value,
				phone: phoneValue,
				company: companyValue,
			})
		} else {
			// Online mode - use local API endpoint for registration
			try {
				const response = await fetch("/api/method/DyPOS.api.auth.register", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						full_name: name,
						email: emailValue,
						password: password.value,
						phone: phoneValue,
						company: companyValue,
					}),
				})
				if (response.ok) {
					result = { success: true }
				} else {
					const err = await response.json().catch(() => ({}))
					throw new Error(err.message || "Registration failed")
				}
			} catch {
				// Fallback to local registration if API unavailable
				const localResult = await attemptOfflineRegistration({
					fullName: name,
					email: emailValue,
					password: password.value,
					phone: phoneValue,
					company: companyValue,
				})
				result = localResult
			}
		}

		if (result.success) {
			registerSuccess.value = true
			emit("registered")
			log.info("DyPOS subscriber registered successfully", {
				offline: isOfflineMode.value,
			})
		} else {
			throw new Error(result.error || "Registration failed")
		}
	} catch (error) {
		registerSuccess.value = false

		const errorMessage =
			error?.message ||
			error?.response?.data?.message ||
			"Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„ØªØ³Ø¬ÙŠÙ„. ÙŠØ±Ø¬Ù‰ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ù…Ø±Ø© Ø£Ø®Ø±Ù‰."

		registerError.value = errorMessage

		log.warn("DyPOS registration failed", error)

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

onMounted(async () => {
	window.addEventListener("keydown", handleGlobalKeydown)
	emailInput.value?.focus?.()

	await detectAndSetOfflineMode()

	window.addEventListener("online", () => {
		if (isOfflineMode.value) {
			log.info("Connection restored â€” switching to online mode")
			isOfflineMode.value = false
			showOfflineIndicator.value = false
		}
	})

	window.addEventListener("offline", () => {
		if (!isOfflineMode.value) {
			log.info("Connection lost â€” switching to offline mode")
			isOfflineMode.value = true
			showOfflineIndicator.value = true
		}
	})
})

onUnmounted(() => {
	window.removeEventListener("keydown", handleGlobalKeydown)
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
		<!-- Offline Indicator -->
		<div
			v-if="showOfflineIndicator && offlineDetected"
			class="dy-register__offline-banner"
			role="status"
			aria-live="polite"
		>
			<FeatherIcon name="wifi-off" :size="16" aria-hidden="true" />
			<span>ÙˆØ¶Ø¹ Ø¹Ø¯Ù… Ø§Ù„Ø§ØªØµØ§Ù„ â€” Ø³ÙŠØªÙ… Ø­ÙØ¸ Ø§Ù„Ø­Ø³Ø§Ø¨ Ù…Ø­Ù„ÙŠÙ‹Ø§</span>
		</div>

		<!--
			Ù„Ø§ Ù„ÙˆØ­Ø© Ù‡ÙˆÙŠØ© ÙˆÙ„Ø§ ØµÙˆØ± Ù‡Ù†Ø§.

			ÙƒØ§Ù†Øª Ø¹Ù…ÙˆØ¯Ù‹Ø§ ÙƒØ§Ù…Ù„Ù‹Ø§ Ø¨ØµÙˆØ±Ø© 1200Ã—630 ÙˆØ´Ø¹Ø§Ø± ÙˆØªØ°ÙŠÙŠÙ„ØŒ ÙØ¨Ù‚ÙŠ Ø¨Ø¹Ø¯
			Ø­Ø°Ù Ø§Ù„ØµÙˆØ± ÙØ±Ø§ØºÙ‹Ø§ Ù…ÙŠØªÙ‹Ø§ ÙŠØ´Ø¯Ù‘ Ø§Ù„Ø¹ÙŠÙ† Ø¨Ù„Ø§ Ù…Ø¹Ù„ÙˆÙ…Ø©: Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ù‡Ù†Ø§
			Ù„Ù… signingStyle ÙŠØ­ØªØ§Ø¬ Ù†Ù…ÙˆØ°Ø¬Ù‹Ø§ Ù„Ø§ Ø¥Ø¹Ù„Ø§Ù†Ù‹Ø§. Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯_
			ÙŠØªØ£ØªÙ‰ Ù…Ù† `CompanyFooter` Ù†ØµÙ‹Ù‘Ø§ ÙÙŠ Ø£Ø³ÙÙ„ Ø§Ù„ØµÙØ­Ø©.
		-->

		<!-- =================================================================
             Registration Panel
             =========================================================== -->

		<section class="dy-register__panel">
			<div class="dy-register__panel-inner">
				<!-- Header -->

				<header class="dy-register__header">

					<div>
						<span class="dy-register__section-label">
							ØªØ³Ø¬ÙŠÙ„ Ø­Ø³Ø§Ø¨ Ø¬Ø¯ÙŠØ¯
						</span>

						<h2 class="dy-register__title">
							Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ø´ØªØ±Ùƒ
						</h2>

						<p class="dy-register__subtitle">
							Ø£Ø¯Ø®Ù„ Ø¨ÙŠØ§Ù†Ø§ØªÙƒ Ù„Ø¨Ø¯Ø¡ Ø§Ø³ØªØ®Ø¯Ø§Ù… Ù†Ù‚Ø·Ø© Ø§Ù„Ø¨ÙŠØ¹ Ø§Ù„Ø°ÙƒÙŠØ©.
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
						Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„
					</a>
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
						ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨ Ø¨Ù†Ø¬Ø§Ø­!
					</h3>

					<p class="dy-register__success-message">
						Ù…Ø±Ø­Ø¨Ù‹Ø§ Ø¨Ùƒ ÙÙŠ DyPOS. ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„Ø¢Ù† ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„
						Ù„Ø¨Ø¯Ø¡ Ø§Ø³ØªØ®Ø¯Ø§Ù… Ù†Ù‚Ø·Ø© Ø§Ù„Ø¨ÙŠØ¹.
					</p>

					<DyButton
						variant="primary"
						size="lg"
						@click="goToLogin"
					>
						Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ø¥Ù„Ù‰ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„
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
							ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨
						</strong>

						<span>
							{{ registerError }}
						</span>
					</div>

					<button
						type="button"
						class="dy-register__error-close"
						aria-label="Ø¥ØºÙ„Ø§Ù‚ Ø±Ø³Ø§Ù„Ø© Ø§Ù„Ø®Ø·Ø£"
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
							Ø§Ù„Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ù…Ù„ <span class="dy-register__required" aria-hidden="true">*</span>
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
								placeholder="Ø£Ø¯Ø®Ù„ Ø§Ø³Ù…Ùƒ Ø§Ù„ÙƒØ§Ù…Ù„"
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

					<div class="dy-register__field">
						<label
							for="dypos-register-email"
							class="dy-register__label"
						>
							Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ <span class="dy-register__required" aria-hidden="true">*</span>
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

					<div class="dy-register__field">
						<div class="dy-register__label-row">
							<label
								for="dypos-register-password"
								class="dy-register__label"
							>
								ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± <span class="dy-register__required" aria-hidden="true">*</span>
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
							aria-label="Ù‚ÙˆØ© ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±"
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
								placeholder="6 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„"
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
										? 'Ø¥Ø®ÙØ§Ø¡ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±'
										: 'Ø¥Ø¸Ù‡Ø§Ø± ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±'
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

					<div class="dy-register__field">
						<label
							for="dypos-register-confirm"
							class="dy-register__label"
						>
							ØªØ£ÙƒÙŠØ¯ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± <span class="dy-register__required" aria-hidden="true">*</span>
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
								placeholder="Ø£Ø¹Ø¯ ÙƒØªØ§Ø¨Ø© ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±"
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
										? 'Ø¥Ø®ÙØ§Ø¡ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±'
										: 'Ø¥Ø¸Ù‡Ø§Ø± ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±'
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

					<div class="dy-register__field">
						<label
							for="dypos-register-phone"
							class="dy-register__label"
						>
							Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ
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

					<!-- Company (Optional) -->

					<div class="dy-register__field">
						<label
							for="dypos-register-company"
							class="dy-register__label"
						>
							Ø§Ø³Ù… Ø§Ù„Ø´Ø±ÙƒØ© / Ø§Ù„Ù…Ø¤Ø³Ø³Ø©
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
								placeholder="Ø£Ø¯Ø®Ù„ Ø§Ø³Ù… Ø´Ø±ÙƒØªÙƒ"
								:disabled="isSubmitting"
								spellcheck="false"
								@input="clearErrors"
								autocomplete="organization"
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
								id="dypos-register-terms"
								aria-describedby="dypos-register-terms-desc"
							/>

							<span
								class="dy-register__checkbox"
								aria-hidden="true"
							/>

							<span id="dypos-register-terms-desc">
								Ø£ÙˆØ§ÙÙ‚ Ø¹Ù„Ù‰
								<a href="/terms" class="dy-register__link">
									Ø´Ø±ÙˆØ· Ø§Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù…
								</a>
								Ùˆ
								<a href="/privacy" class="dy-register__link">
									Ø³ÙŠØ§Ø³Ø© Ø§Ù„Ø®ØµÙˆØµÙŠØ©
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

						{{ isSubmitting ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ³Ø¬ÙŠÙ„...' : 'Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨' }}
					</DyButton>

					<ActionButton
						variant="subtle"
						size="lg"
						@click="goToLogin"
						:title="__('Ø¹ÙˆØ¯Ø© Ù„Ù„ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„')"
						:aria-label="__('Ø¹ÙˆØ¯Ø© Ù„Ù„ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„')"
					>
						<FeatherIcon name="arrow-left" class="h-[16px] w-[16px]" />
						<span>Ø¹ÙˆØ¯Ø© Ù„Ù„ØªØ³Ø¬ÙŠÙ„</span>
					</ActionButton>
				</form>

				<!-- Footer â€” Ø§Ø³Ù… Ø§Ù„Ø´Ø±ÙƒØ© + Ø±Ø§Ø¨Ø· Ù…ÙˆÙ‚Ø¹Ù‡Ø§ Ø§Ù„Ø±Ø³Ù…ÙŠ -->

				<CompanyFooter class="dy-register__footer" />
			</div>
		</section>
	</main>
</template>

<style scoped>
/* =============================================================================
   DyPOS â€” Subscriber Registration Page
   RTL-first / Arabic-first / Production Grade
   ============================================================================= */

.dy-register {
	--register-panel-width: min(100%, 620px);
	--register-content-width: 480px;

	position: relative;
	/* A single centered column. This was a two-column grid whose left cell
	   held the 1200Ã—630 artwork; removing the artwork without touching the
	   grid would have left a guaranteed-empty column â€” the "stupid space".
	   One column, one job. */
	display: flex;
	align-items: center;
	justify-content: center;

	min-height: 100vh;
	min-height: 100dvh;

	overflow: hidden;

	background: var(--dy-bg);
	color: var(--dy-text);

	font-family: var(--dy-font-arabic);

	isolation: isolate;
}

/* =============================================================================
   Brand panel — REMOVED, deliberately
   =============================================================================
   This page used to be a two-column grid: the left cell held the 1200x630
   company card in a glass plaque (`.dy-register__brand*`). Every rule of
   that column is gone with it — 13 selectors, zero references in the
   template. They were kept because "the CSS looks nice", which is how a
   stylesheet grows to a thousand lines of rules nothing renders.

   The card moved to `components/common/SystemAboutPanel.vue`, which is the
   identity card the login family renders; `CompanyFooter` carries the
   company name at the bottom of the page. What is deliberately NOT here:
   the artwork behind live copy. A 1200x630 sharing card used as a `cover`
   backdrop of a tall panel can only ever show fragments of that
   typography, cut mid-word, underneath the headline.
   ============================================================================= */
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
   =============================================================================
   The page is a single centred column (see `.dy-register`), so there is
   nothing to collapse at 768px. The rule that used to live here
   (`grid-template-columns: 1fr`, plus hiding the brand column and showing a
   mobile logo) all addressed markup this page no longer has — a media
   query that styles nothing is a comment that costs a parse.
   ============================================================================= */

/* =============================================================================
   Password Strength Bar
   ============================================================================= */

.dy-register__field {
	margin-bottom: var(--dy-space-3);
}

/* =============================================================================
   Offline Indicator
   ============================================================================= */

.dy-register__offline-banner {
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

.dy-register__input--error + .dy-register__password-toggle {
	color: var(--dy-crimson-600);
}

.dy-register__input-wrap:has(.dy-register__input--error) {
	border-color: var(--dy-crimson-500);
}

.dy-register__input-wrap:has(.dy-register__input--error):focus-within {
	border-color: var(--dy-crimson-500);
	box-shadow: 0 0 0 3px rgb(var(--dy-crimson-c-500) / 0.12);
}

/* =============================================================================
   Offline Mode Variant
   ============================================================================= */

.dy-register--offline .dy-register__panel {
	background: var(--dy-bg);
}

.dy-register--offline .dy-register__title::after {
	content: " (ØºÙŠØ± Ù…ØªØµÙ„)";
	color: var(--dy-amber-600);
	font-weight: 600;
	font-size: 0.9em;
}

/* =============================================================================
   Reduced Motion
   ============================================================================= */

.dy-register--reduced-motion *,
.dy-register--reduced-motion *::before,
.dy-register--reduced-motion *::after {
	animation-duration: 0.01ms !important;
	transition-duration: 0.01ms !important;
}

/* =============================================================================
   Dark Mode Enhancements
   ============================================================================= */

.dy-register--dark .dy-register__offline-banner {
	background: rgb(var(--dy-amber-c-500) / 0.18);
	border-bottom-color: rgb(var(--dy-amber-c-500) / 0.3);
	color: var(--dy-amber-400);
}

.dy-register--dark .dy-register__input-wrap {
	background: var(--dy-surface);
	border-color: var(--dy-border);
}

.dy-register--dark .dy-register__input-wrap:focus-within {
	box-shadow: 0 0 0 3px rgb(var(--dy-brand-c-500) / 0.18);
}

.dy-register--dark .dy-register__error {
	background: rgb(var(--dy-crimson-c-500) / 0.12);
	border-color: rgb(var(--dy-crimson-c-500) / 0.3);
	color: var(--dy-crimson-400);
}

.dy-register--dark .dy-register__error-close:hover {
	background: rgb(var(--dy-crimson-c-500) / 0.12);
}

/* =============================================================================
   Mobile Enhancements
   ============================================================================= */

@media (max-width: 768px) {
	.dy-register--mobile .dy-register__panel-inner {
		padding-inline: 24px;
	}

	.dy-register--mobile .dy-register__offline-banner {
		font-size: 0.78rem;
		padding: 8px 12px;
	}
}

@media (max-width: 480px) {
	.dy-register--mobile .dy-register__panel-inner {
		padding-inline: 16px;
	}

	.dy-register--mobile .dy-register__title {
		font-size: 1.6rem;
	}

	.dy-register--mobile .dy-register__submit {
		width: 100%;
	}
}

/* =============================================================================
   Focus Visible Enhancement
   ============================================================================= */

.dy-register__input:focus-visible,
.dy-register__password-toggle:focus-visible,
.dy-register__back:focus-visible,
.dy-register__link:focus-visible,
.dy-register__checkbox-label:focus-visible {
	outline: 2px solid var(--dy-accent);
	outline-offset: 2px;
}

.dy-register__checkbox-label:focus-visible {
	border-radius: var(--dy-radius-sm);
}
</style>
