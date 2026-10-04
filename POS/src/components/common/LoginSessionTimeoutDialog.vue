<!--
  =============================================================================
  DyPOS — session-timeout warning dialog (login surface)

  Extracted from Login.vue for the same reason ShiftOpeningDialog was: a
  self-contained dialog with one job. Its styles moved with it — a `<style
  scoped src>` stylesheet only ever reaches the page's own elements, so a
  dialog that changes file must change stylesheet too, or it ships unstyled.

  The overlay is `position: fixed; inset: 0` so a phone keyboard cannot
  clip it (a static dialog inside the card would be pushed off-screen by
  the on-screen keyboard).
  =============================================================================
-->
<script setup>
import { FeatherIcon } from "dypos-ui"

import { ActionButton } from "dypos-ui"
import { __ } from "@/utils/translation"

defineProps({
	/** هل يُعرض التحذير الآن (من `useSessionTimeout`). */
	show: { type: Boolean, default: false },
	/** ثوانٍ متبقية قبل انتهاء الجلسة. */
	seconds: { type: Number, default: 0 },
	/** أثناء إرسال تمديد الجلسة. */
	extending: { type: Boolean, default: false },
})

defineEmits(["extend", "dismiss"])
</script>

<template>
	<Transition name="dy-fade">
		<div
			v-if="show"
			class="dy-login__timeout"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="dy-timeout-title"
		>
			<div class="dy-login__timeout-card">
				<h3 id="dy-timeout-title">
					<FeatherIcon
						name="clock"
						:size="20"
						aria-hidden="true"
					/>

					{{ __('ستنتهي الجلسة قريباً') }}
				</h3>

				<p>
					{{
						__("يتبقى {0} ثانية. هل تريد تمديد الجلسة؟", {
							0: String(seconds),
						})
					}}
				</p>

				<div class="dy-login__timeout-actions">
					<ActionButton
						variant="solid"
						size="sm"
						:loading="extending"
						@click="$emit('extend')"
					>
						{{ __('تمديد الجلسة') }}
					</ActionButton>

					<ActionButton
						type="button"
						variant="ghost"
						size="sm"
						@click="$emit('dismiss')"
						:aria-label="__('تسجيل الخروج وإنهاء الجلسة')"
					>
						{{ __('تسجيل الخروج') }}
					</ActionButton>
				</div>
			</div>
		</div>
	</Transition>
</template>

<style scoped>
.dy-login__timeout {
	position: fixed;
	inset: 0;
	z-index: var(--dy-z-toast);
	display: flex;
	align-items: center;
	justify-content: center;

	padding: var(--dy-space-5);

	background: rgb(var(--dy-brand-c-950) / 0.62);

	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
}

/*
 * `<Transition name="dy-fade">` needs the four Vue classes to exist
 * anywhere; they lived in login.css, scoped to Login.vue, so they never
 * reached an element in another file. They move with the dialog that uses
 * them.
 */
.dy-fade-enter-active,
.dy-fade-leave-active {
	transition: opacity var(--dy-dur-moderate) var(--dy-ease-standard), transform
		var(--dy-dur-moderate) var(--dy-ease-emphasized);
}

.dy-fade-enter-from,
.dy-fade-leave-to {
	opacity: 0;

	transform: translateY(10px) scale(0.98);
}

.dy-login__timeout-card {
	width: min(100%, 420px);

	padding: 24px;

	border: 1px solid var(--dy-border);

	border-radius: var(--dy-radius-xl);

	background: var(--dy-surface);

	box-shadow: var(--dy-elevation-5);

	text-align: center;

	animation: dy-pop-in var(--dy-dur-moderate) var(--dy-ease-emphasized);
}

.dy-login__timeout-card h3 {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	margin: 0;
	color: var(--dy-text-strong);
	font-size: 1.1rem;
	font-weight: 800;
}

.dy-login__timeout-card p {
	margin: 12px 0;
	color: var(--dy-text-secondary);
	font-size: 0.9rem;
	line-height: 1.8;
}

.dy-login__timeout-actions {
	display: flex;
	gap: 12px;
	justify-content: center;
	margin-top: 16px;
}

.dy-login__timeout-logout {
	display: inline-flex;
	align-items: center;
	justify-content: center;

	min-height: var(--dy-touch-min);

	padding: 8px 16px;
	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-lg);
	background: transparent;
	color: var(--dy-text-secondary);
	font: inherit;
	font-size: 0.85rem;
	cursor: pointer;
	transition: background-color var(--dy-dur-fast) var(--dy-ease-standard),
		border-color var(--dy-dur-fast) var(--dy-ease-standard), color
		var(--dy-dur-fast) var(--dy-ease-standard);
}

.dy-login__timeout-logout:hover {
	background: var(--dy-surface);
	border-color: var(--dy-crimson-500);
	color: var(--dy-crimson-600);
}

/* خلفية السمة الداكنة: القاعدة كانت في login.css بنطاق Login.vue، فلا
   تصل إلى بطاقة داخل مكوّن آخر — لذلك انتقلت مع البطاقة نفسها. */
.dy-login--dark .dy-login__timeout-card {
	background: var(--dy-surface);
	box-shadow: var(--dy-elevation-5);
}
</style>
