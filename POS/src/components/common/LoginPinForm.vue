<template>
	<!--
		شاشة الدخول السريع بالرمز (PIN)، بدل نموذج كلمة المرور.

		كانت 144 سطرًا من آلة حالة داخل `Login.vue` — ست مراجع وأربع دوال
		ونصوص خطأ — ولا يختبرها شيء. الاستخراج هنا هو ما استجابة لرافعة
		الحجم، وهو ما يجعل «كود PIN خاطئ» يُعامل كفشل بدل نجاح.
	-->
	<form class="dy-login__form" novalidate @submit.prevent="submit">
		<p v-if="error" class="dy-login__error" role="alert" aria-live="assertive">
			{{ error }}
		</p>

		<!--PIN setup: two fields, one writer-->
		<template v-if="showPinSetup">
			<div class="dy-login__field">
				<label class="dy-login__label" for="dypos-pin-setup">
					{{ __('رمز الدخول السريع') }}
				</label>
				<input
					id="dypos-pin-setup"
					ref="codeInput"
					class="dy-login__input"
					type="password"
					inputmode="numeric"
					autocomplete="off"
					maxlength="8"
					:value="code"
					@input="onInput('code', $event)"
				/>
			</div>

			<div class="dy-login__field">
				<label class="dy-login__label" for="dypos-pin-confirm">
					{{ __('تأكيد الرمز') }}
				</label>
				<input
					id="dypos-pin-confirm"
					ref="confirmInput"
					class="dy-login__input"
					type="password"
					inputmode="numeric"
					autocomplete="off"
					maxlength="8"
					:value="confirm"
					@input="onInput('confirm', $event)"
				/>
			</div>

			<p v-if="setupError" class="dy-login__error" role="alert">
				{{ setupError }}
			</p>

			<div class="dy-login__actions">
				<ActionButton type="submit" :disabled="busy" size="sm">
					{{ __('حفظ الرمز') }}
				</ActionButton>

				<button
					type="button"
					class="dy-login__link-button"
					@click="$emit('cancel-setup')"
					:aria-label="__('إلغاء إعداد رمز PIN')"
				>
					{{ __('إلغاء') }}
				</button>
			</div>
		</template>

		<!--PIN sign-in: one field-->
		<template v-else>
			<div class="dy-login__field">
				<label class="dy-login__label" for="dypos-pin">
					{{ __('رمز الدخول السريع') }}
				</label>
				<input
					id="dypos-pin"
					ref="codeInput"
					class="dy-login__input"
					type="password"
					inputmode="numeric"
					autocomplete="off"
					maxlength="8"
					:value="code"
					@input="onLoginInput"
				/>
			</div>

			<div class="dy-login__actions">
				<ActionButton type="submit" :disabled="busy" size="sm">
					{{ busy ? __('جارٍ التحقق…') : __('دخول') }}
				</ActionButton>

				<button
					type="button"
					class="dy-login__link-button"
					@click="$emit('exit')"
				>
					{{ __('استخدام كلمة المرور') }}
				</button>
			</div>
		</template>
	</form>
</template>

<script setup>
import { nextTick, ref } from "vue"

import { ActionButton } from "dypos-ui"
import {
	sanitizePin,
	validatePinPair,
	PIN_EXPIRY_MS,
} from "@/composables/usePinAuthRules"
import { readPinLoginResult } from "@/composables/usePinSignInRules"
import { __ } from "@/utils/translation"

/**
 * PIN sign-in, as a component.
 *
 * The rules live in `usePinSignInRules` (pure, fully tested); this owns the
 * refs and the two submissions. `pinLogin` is injected as a prop rather than
 * imported so the suite can drive a wrong-code, a throwing transport and a
 * success without touching IndexedDB or WebAuthn.
 */
const props = defineProps({
	/** `async (code) => ({ success, error? })` — resolves, never rejects. */
	pinLogin: { type: Function, required: true },
	/** `async (pin, email, expiryMs) => boolean` — the SETUP save. */
	savePin: { type: Function, default: null },
	/** The address the PIN is bound to. */
	email: { type: String, default: "" },
	/** Show the two-field setup form instead of the one-field sign-in. */
	setup: { type: Boolean, default: false },
	/** Set when the page has no stored PIN to sign in with. */
	noPinStored: { type: Boolean, default: false },
})

const emit = defineEmits(["authenticated", "cancel-setup", "exit", "error"])

const code = ref("")
const confirm = ref("")
const error = ref("")
const setupError = ref("")
const busy = ref(false)

const codeInput = ref(null)
const confirmInput = ref(null)

defineExpose({
	codeInput,
	confirmInput,
	focus: () => nextTick(() => codeInput.value?.focus?.()),
})

/** ONE writer for both fields — see `usePinSignInRules`. */
function onInput(field, event) {
	const digits = sanitizePin(event.target.value)
	if (field === "code") code.value = digits
	else confirm.value = digits
	setupError.value = ""
}

function onLoginInput(event) {
	code.value = sanitizePin(event.target.value)
	error.value = ""
}

async function submit() {
	busy.value = true
	error.value = ""
	try {
		if (props.setup) return await submitSetup()
		return await submitLogin()
	} finally {
		busy.value = false
	}
}

async function submitLogin() {
	if (props.noPinStored) {
		error.value = __(
			"لم يتم إعداد كود PIN بعد. يرجى تسجيل الدخول بكلمة المرور أولاً.",
		)
		return
	}

	const result = await props.pinLogin(code.value)
	const verdict = readPinLoginResult(result)
	if (!verdict.ok) {
		error.value = verdict.message
		return
	}

	code.value = ""
	emit("authenticated", "pin_login")
}

async function submitSetup() {
	const invalid = validatePinPair(code.value, confirm.value)
	if (invalid) {
		setupError.value = invalid
		return
	}

	// `savePin(pin, email, expiryMs)` — the order was once reversed, which
	// stored the address in the code slot.
	const saved = await props.savePin?.(
		code.value,
		props.email.trim(),
		PIN_EXPIRY_MS,
	)
	if (!saved) {
		setupError.value = __("فشل إعداد كود PIN")
		return
	}

	code.value = ""
	confirm.value = ""
	setupError.value = ""
	emit("authenticated", "pin_setup")
}
</script>