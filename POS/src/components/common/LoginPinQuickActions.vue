<template>
    <div v-if="!pinModeActive && pinAvailable" class="dy-login__quick-actions">
        <ActionButton
            v-if="pinAvailable"
            type="button"
            variant="tertiary"
            size="sm"
            class="dy-login__link-button"
            :disabled="busy"
            @click="emit('enter-pin')"
            :aria-label="__('التبديل لتسجيل الدخول السريع برمز PIN')"
        >
            <FeatherIcon
                name="zap"
                :size="15"
                aria-hidden="true"
            />
            {{ __("دخول سريع برمز PIN") }}
        </ActionButton>

        <ActionButton
            v-if="pinAvailable"
            type="button"
            variant="tertiary"
            size="sm"
            theme="red"
            class="dy-login__link-button dy-login__link-button--quiet"
            :disabled="busy"
            @click="emit('clear-pin')"
            :aria-label="__('إلغاء رمز الدخول السريع المحفوظ')"
        >
            {{ __("إلغاء الرمز") }}
        </ActionButton>
    </div>
</template>

<script setup>
import { ActionButton, FeatherIcon } from "dypos-ui"

import { __ } from "@/utils/translation"

/**
 * Quick-access row: enter a saved PIN or revoke it. PIN creation belongs to
 * authenticated device settings, not the public login path.
 *
 * Extracted from `Login.vue` with its styles (a scoped page stylesheet cannot
 * style markup that lives in another component).
 *
 * Every button is gated on the SAME `pinAvailable` fact, so the row can never
 * render a control that does nothing — the third dead handler on this screen
 * was `handleClearPin`, which existed, was correct, and had no way to be
 * called, leaving a saved PIN unrevocable from the screen that owns it.
 *
 * `busy` replaces the page's `.dy-login--busy .dy-login__link-button
 * { pointer-events: none }` rule: a disabled button is honest (unreachable by
 * pointer AND keyboard), while `pointer-events: none` left the control
 * focusable and activatable from the keyboard.
 */
defineProps({
	/** A PIN is already stored on this terminal. */
	pinAvailable: { type: Boolean, default: false },
	/** The PIN form is open, so this row stands down. */
	pinModeActive: { type: Boolean, default: false },
	/** An email is required before a PIN can be attached to it. */
	email: { type: String, default: "" },
	/** A login is in flight. */
	busy: { type: Boolean, default: false },
	/** Hint shown on the setup button once an email is present. */
	deviceHint: { type: String, default: "اضبط رمز دخول سريع لهذا الجهاز" },
	emailTooShort: { type: String, default: "أدخل بريدك أولًا" },
	emailRequired: {
		type: String,
		default: "أدخل بريدك الإلكتروني أولًا لتمكين إنشاء رمز PIN",
	},
})

const emit = defineEmits(["enter-pin", "clear-pin"])
</script>

<style scoped>
.dy-login__quick-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--dy-space-4);

	margin-top: var(--dy-space-4);
	padding-top: var(--dy-space-4);

	border-top: 1px solid var(--dy-border-soft);
}

/*
 * A link that behaves like a link.
 *
 * `min-height: var(--dy-touch-min)` is not decoration: WCAG 2.2 AA §2.5.8
 * requires a 24px minimum target and the design system's own floor is 44px.
 * A 0.72rem text button is nowhere near that on a touch terminal.
 */
.dy-login__link-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: var(--dy-space-2);

	min-height: var(--dy-touch-min);

	padding-inline: var(--dy-space-2);

	border: 0;
	border-radius: var(--dy-radius-sm);

	background: transparent;
	color: var(--dy-primary);
	font: inherit;
	font-size: 0.82rem;
	font-weight: 700;

	cursor: pointer;

	transition: background-color var(--dy-dur-fast) var(--dy-ease-standard), color
		var(--dy-dur-fast) var(--dy-ease-standard);
}

.dy-login__link-button:hover:not(:disabled) {
	background: var(--dy-surface-hover);
}

/* `--dy-focus-width/--dy-focus-color/--dy-focus-offset` are the system's own
   names. The ring-* aliases resolve only through the legacy brand layer, and
   a page style that depends on the layer the repo is trying to retire is one
   refactor away from losing its focus indicator silently. */
.dy-login__link-button:focus-visible {
	outline: var(--dy-focus-width) solid var(--dy-focus-color);
	outline-offset: var(--dy-focus-offset);
}

.dy-login__link-button:disabled {
	color: var(--dy-text-muted);
	cursor: not-allowed;
	/*
	 * لا `opacity: var(--dy-disabled-opacity)` هنا.
	 *
	 * الرمادي المحلي (#64748b على سطح #f8fafc = 4.76:1) يكفي للقراءة لكنه
	 * لا يجتاز 0.55 في기고 التباين المطلوب: التكست عبر السطحterosق بنسبة
	 * 2.13:1 — أي زر معطّل ظهر غير مقروء.
	 */
}

.dy-login__link-button--quiet {
	color: var(--dy-text-muted);
	font-weight: 600;
}
</style>