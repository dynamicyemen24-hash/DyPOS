<template>
    <Teleport to="body">
        <Transition name="fade">
            <div
                v-if="visible && email"
                class="dy-login__email-suggestions"
                role="listbox"
                :aria-label="__('مقترحات النطاقات')"
            >
                <div
                    v-for="domain in DOMAINS"
                    :key="domain"
                    class="dy-login__email-suggestion"
                    role="option"
                    @click="emit('select', domain)"
                    @mousedown.prevent
                >
                    <span>{{ email }}@{{ domain }}</span>
                    <FeatherIcon name="at-sign" :size="14" aria-hidden="true" class="dy-login__suggestion-icon" />
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup>
import { FeatherIcon } from "dypos-ui"

import { __ } from "@/utils/translation"

/**
 * Email-domain autocomplete for the login email field.
 *
 * Extracted from `Login.vue` together with its styles (a scoped page
 * stylesheet cannot style markup that lives in another component).
 *
 * The suggestion list is derived from what the field already holds, so it only
 * appears while the address has no `@` — proposing `a@b.com@c.com` is worse
 * than proposing nothing. Visibility stays with the parent, which owns focus.
 */
defineProps({
	visible: { type: Boolean, default: false },
	/** Current (partial) email, used to preview the completed address. */
	email: { type: String, default: "" },
})

const emit = defineEmits(["select"])

/** Common consumer mail providers. A constant, not shop data. */
const DOMAINS = [
	"gmail.com",
	"outlook.com",
	"yahoo.com",
	"hotmail.com",
	"company.com",
	"organization.org",
	"enterprise.net",
]
</script>

<style scoped>
.dy-login__email-suggestions {
	position: fixed;
	z-index: 9999;

	display: flex;
	flex-direction: column;

	min-width: 220px;
	max-width: 320px;

	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-lg);

	background: var(--dy-surface);
	color: var(--dy-text);

	box-shadow: var(--dy-elevation-4);

	animation: dy-slide-down var(--dy-dur-fast) var(--dy-ease-standard);
}

.dy-login__email-suggestion {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--dy-space-3);

	padding: var(--dy-space-2) var(--dy-space-3);

	color: var(--dy-text);

	font-size: 0.875rem;
	line-height: 1.5;

	cursor: pointer;

	transition: background-color var(--dy-dur-fast) var(--dy-ease-standard);
}

.dy-login__email-suggestion:hover,
.dy-login__email-suggestion:focus {
	background: var(--dy-surface-hover);
	outline: none;
}

.dy-login__email-suggestion:focus-visible {
	outline: var(--dy-focus-width) solid var(--dy-focus-color);
	outline-offset: -2px;
}

.dy-login__suggestion-icon {
	flex-shrink: 0;

	color: var(--dy-text-muted);
}

@media (forced-colors: active) {
	.dy-login__email-suggestions {
		border-color: CanvasText;
		background: Canvas;
	}

	.dy-login__email-suggestion:hover,
	.dy-login__email-suggestion:focus {
		background: Highlight;
		color: HighlightText;
	}
}
</style>