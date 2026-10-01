<!--
  =============================================================================
  DyPOS — session-lock dialog (login surface)

  The lock overlay is its own screen state: it hides the form behind a
  password check that `useSessionLock` owns (server, or the cached PBKDF2
  hash when offline). It lived inside Login.vue with its field, its error
  and its submit handler — a second form on a page already at its size cap.

  Its styles moved with it for the same reason as the timeout dialog's: a
  `<style scoped src>` reaches only the owning SFC's elements.
  =============================================================================
-->
<script setup>
import { ref } from "vue"

import { FeatherIcon } from "dypos-ui"

import DyButton from "@/components/ui/DyButton.vue"
import { useSessionLock } from "@/composables/useSessionLock"
import { __ } from "@/utils/translation"
import { logger } from "@/utils/logger"

const log = logger.create("LoginSessionLock")

const { isLocked, unlock } = useSessionLock()

const password = ref("")
const error = ref("")
const unlocking = ref(false)

/**
 * فتح الجلسة المقفلة.
 *
 * `unlock()` تتحقق من كلمة المرور على الخادم (أو من الكاش المخزّن محليًا)،
 * فالزر القديم كان يناديها بلا وسيط — أي زر يرسم ولا يفعل شيئًا. الآن خلفه
 * حقل كلمة مرور حقيقي ورسالة خطأ من الـ composable نفسه.
 */
async function submit() {
	if (unlocking.value) return

	if (!password.value) {
		error.value = __("أدخل كلمة المرور لفتح الجلسة.")
		return
	}

	unlocking.value = true
	error.value = ""

	try {
		const result = await unlock(password.value)

		if (result?.success) {
			password.value = ""
			return
		}

		error.value = result?.error || __("تعذر فتح الجلسة. حاول مرة أخرى.")
	} catch (caught) {
		log.warn("DyPOS session unlock failed", caught)
		error.value = __("تعذر فتح الجلسة. حاول مرة أخرى.")
	} finally {
		unlocking.value = false
	}
}
</script>

<template>
	<div
		v-if="isLocked"
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
				{{ __("الجلسة مقفلة") }}
			</h2>

			<p>
				{{ __("تم قفل جلسة التشغيل لحماية بيانات نقطة البيع.") }}
			</p>

			<form
				class="dy-login__lock-form"
				novalidate
				@submit.prevent="submit"
			>
				<label
					for="dypos-unlock-password"
					class="dy-login__lock-label"
				>
					{{ __("كلمة المرور") }}
				</label>

				<div class="dy-login__lock-input">
					<FeatherIcon
						name="lock"
						:size="18"
						class="dy-login__lock-input-icon"
						aria-hidden="true"
					/>

					<input
						id="dypos-unlock-password"
						v-model="password"
						class="dy-login__lock-field"
						type="password"
						autocomplete="current-password"
						dir="ltr"
						:placeholder="__('أدخل كلمة المرور')"
						:disabled="unlocking"
						:aria-invalid="!!error"
						aria-describedby="dypos-unlock-error"
					/>
				</div>

				<p
					v-if="error"
					id="dypos-unlock-error"
					class="dy-login__lock-error"
					role="alert"
					aria-live="assertive"
				>
					<FeatherIcon
						name="alert-circle"
						:size="14"

						aria-hidden="true"
					/>
					{{ error }}
				</p>

				<DyButton
					type="submit"
					variant="primary"
					size="lg"
					:loading="unlocking"
					:disabled="unlocking"
					class="dy-login__lock-submit"
				>
					{{ __("فتح الجلسة") }}
				</DyButton>
			</form>
		</div>
	</div>
</template>

<style scoped>
.dy-login__lock {
	position: fixed;
	z-index: var(--dy-z-modal);

	inset: 0;

	display: grid;
	place-items: center;

	padding: var(--dy-space-6);

	background: rgb(var(--dy-brand-c-950) / 0.72);

	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
}

.dy-login__lock-card {
	width: min(100%, 420px);

	padding: 28px;

	border: 1px solid var(--dy-border);

	border-radius: var(--dy-radius-2xl);

	background: var(--dy-surface);

	box-shadow: var(--dy-elevation-5);

	text-align: center;

	animation: dy-pop-in var(--dy-dur-moderate) var(--dy-ease-emphasized);
}

.dy-login__lock-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;

	width: 48px;
	height: 48px;

	margin-bottom: var(--dy-space-4);

	border-radius: 14px;

	background: rgb(var(--dy-brand-c-500) / 0.1);

	color: var(--dy-accent);
}

.dy-login__lock-card h2 {
	margin: 0;

	color: var(--dy-text-strong);

	font-size: 1.2rem;
	font-weight: 800;
}

.dy-login__lock-card p {
	margin: var(--dy-space-3) 0 var(--dy-space-6);

	color: var(--dy-text-secondary);

	font-size: 0.85rem;
	line-height: 1.8;
}

.dy-login__lock-form {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-2);
	text-align: start;
}

.dy-login__lock-label {
	color: var(--dy-text-muted);
	font-size: 0.8rem;
	font-weight: 600;
}

.dy-login__lock-input {
	position: relative;
	display: flex;
	align-items: center;
}

.dy-login__lock-input-icon {
	position: absolute;
	inset-inline-start: 12px;
	color: var(--dy-text-muted);
	pointer-events: none;
}

/* 16px floor: iOS Safari zooms the viewport for any focused field below it. */
.dy-login__lock-field {
	inline-size: 100%;
	min-height: var(--dy-touch-min);

	padding-inline: 40px 12px;

	font-size: 1rem;
	font-family: inherit;
	color: var(--dy-text);
	background: var(--dy-surface);
	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-lg);
}

.dy-login__lock-field:focus-visible {
	outline: 2px solid var(--dy-accent);
	outline-offset: 1px;
}

.dy-login__lock-field[aria-invalid="true"] {
	border-color: var(--dy-crimson-500);
}

.dy-login__lock-error {
	display: flex;
	align-items: center;
	gap: 6px;

	margin: 0;

	color: var(--dy-crimson-600);
	font-size: 0.8rem;
}

.dy-login__lock-submit {
	margin-top: var(--dy-space-3);
}

@media (forced-colors: active) {
	.dy-login__lock-card {
		border-color: CanvasText;
	}

	.dy-login__lock-field:focus-visible {
		outline: 2px solid Highlight;
	}
}

/* A lock overlay must never reach a printed shift report. */
@media print {
	.dy-login__lock {
		display: none !important;
	}
}
</style>
