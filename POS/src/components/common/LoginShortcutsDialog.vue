<template>
    <Teleport to="body">
        <Transition name="fade">
            <div
                v-if="show"
                class="dy-login__shortcuts-overlay"
                @click.self="emit('close')"
                role="dialog"
                aria-modal="true"
                aria-labelledby="shortcuts-title"
            >
                <div class="dy-login__shortcuts-dialog">
                    <header class="dy-login__shortcuts-header">
                        <h2 id="shortcuts-title" class="dy-login__shortcuts-title">
                            {{ __("اختصارات لوحة المفاتيح") }}
                        </h2>
                        <ActionButton
                            variant="ghost"
                            size="sm"
                            class="dy-login__shortcuts-close"
                            @click="emit('close')"
                            :aria-label="__('إغلاق')"
                        >
                            <FeatherIcon name="x" :size="18" aria-hidden="true" />
                        </ActionButton>
                    </header>
                    <div class="dy-login__shortcuts-content">
                        <dl class="dy-login__shortcuts-list">
                            <div
                                v-for="shortcut in SHORTCUTS"
                                :key="shortcut.keys.join('+')"
                                class="dy-login__shortcut-item"
                            >
                                <dt class="dy-login__shortcut-keys">
                                    <kbd v-for="key in shortcut.keys" :key="key" class="dy-login__kbd">
                                        {{ key }}
                                    </kbd>
                                </dt>
                                <dd class="dy-login__shortcut-desc">{{ __(shortcut.description) }}</dd>
                            </div>
                        </dl>
                    </div>
                    <footer class="dy-login__shortcuts-footer">
                        <ActionButton
                            variant="solid"
                            size="sm"
                            @click="emit('close')"
                        >
                            {{ __("فهمت") }}
                        </ActionButton>
                    </footer>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup>
import { ActionButton, FeatherIcon } from "dypos-ui"

import { __ } from "@/utils/translation"

/**
 * Keyboard shortcut reference for the login screen.
 *
 * Extracted from `Login.vue` with its styles (a scoped page stylesheet cannot
 * reach markup that lives in another component, so the CSS had to travel with
 * the template or the dialog would render unstyled).
 *
 * The table is a CONSTANT, not configuration: these are the keys this screen
 * binds, and each row is a dictionary key resolved through `__()` at render.
 */
defineProps({
	show: { type: Boolean, default: false },
})

const emit = defineEmits(["close"])

const SHORTCUTS = [
	{ keys: ["F1"], description: "عرض اختصارات لوحة المفاتيح" },
	{ keys: ["Enter"], description: "تسجيل الدخول / تأكيد" },
	{ keys: ["Escape"], description: "إغلاق مربعات الحوار / إلغاء" },
	{ keys: ["Tab"], description: "التنقل بين الحقول" },
	{ keys: ["Shift", "Tab"], description: "التنقل العكسي بين الحقول" },
	{ keys: ["Alt", "1"], description: "طريقة الدخول: البريد الإلكتروني" },
	{ keys: ["Alt", "2"], description: "طريقة الدخول: البصمة" },
	{ keys: ["Alt", "3"], description: "طريقة الدخول: لوحة المفاتيح" },
	{ keys: ["Alt", "4"], description: "طريقة الدخول: مفتاح المرور" },
	{ keys: ["Alt", "5"], description: "طريقة الدخول: رمز PIN" },
	{ keys: ["F2"], description: "التركيز على حقل البريد الإلكتروني" },
	{ keys: ["F3"], description: "التركيز على حقل كلمة المرور" },
	{ keys: ["F4"], description: "تبديل إظهار/إخفاء كلمة المرور" },
	{ keys: ["F5"], description: "إعادة محاولة الاتصال" },
]
</script>

<style scoped>
.dy-login__shortcuts-overlay {
	position: fixed;
	inset: 0;
	z-index: 9999;

	display: flex;
	align-items: center;
	justify-content: center;

	padding: var(--dy-space-4);

	background: rgb(0 0 0 / 0.6);
	backdrop-filter: blur(4px);
	-webkit-backdrop-filter: blur(4px);

	animation: dy-fade-in var(--dy-dur-fast) var(--dy-ease-standard);
}

@keyframes dy-fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

.dy-login__shortcuts-dialog {
	width: min(100%, 520px);
	max-height: 90vh;

	display: flex;
	flex-direction: column;

	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-xl);

	background: var(--dy-surface);
	color: var(--dy-text);

	box-shadow: var(--dy-elevation-4);

	overflow: hidden;

	animation: dy-slide-up var(--dy-dur-moderate) var(--dy-ease-emphasized);
}

@keyframes dy-slide-up {
	from {
		opacity: 0;
		transform: translateY(20px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.dy-login__shortcuts-header {
	display: flex;
	align-items: center;
	justify-content: space-between;

	padding: var(--dy-space-4) var(--dy-space-5);

	border-bottom: 1px solid var(--dy-border-soft);
}

.dy-login__shortcuts-title {
	margin: 0;

	color: var(--dy-text-strong);
	font-size: 1.1rem;
	font-weight: 700;
}

.dy-login__shortcuts-close {
	flex-shrink: 0;
}

.dy-login__shortcuts-close:focus-visible {
	outline: var(--dy-focus-width) solid var(--dy-focus-color);
	outline-offset: var(--dy-focus-offset);
}

.dy-login__shortcuts-content {
	flex: 1;
	overflow-y: auto;

	padding: var(--dy-space-4) var(--dy-space-5);
}

.dy-login__shortcuts-list {
	display: grid;
	gap: var(--dy-space-3);

	margin: 0;
}

.dy-login__shortcut-item {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: var(--dy-space-4);

	align-items: start;
}

.dy-login__shortcut-keys {
	display: inline-flex;
	flex-wrap: wrap;
	gap: var(--dy-space-1);
}

.dy-login__kbd {
	display: inline-flex;
	align-items: center;
	justify-content: center;

	min-width: 32px;
	min-height: 32px;
	padding: 4px 8px;

	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-sm);

	background: var(--dy-surface-soft);
	color: var(--dy-text-strong);

	font: inherit;
	font-size: 0.75rem;
	font-weight: 700;
	font-family: var(--dy-font-mono);
	line-height: 1;
	white-space: nowrap;

	box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}

.dy-login__shortcut-desc {
	color: var(--dy-text-secondary);
	font-size: 0.875rem;
	line-height: 1.6;

	margin: 0;
}

.dy-login__shortcuts-footer {
	display: flex;
	justify-content: flex-end;

	padding: var(--dy-space-4) var(--dy-space-5);

	border-top: 1px solid var(--dy-border-soft);
}

@media (max-width: 560px) {
	.dy-login__shortcuts-dialog {
		width: 100%;
		max-height: 100%;
		border-radius: 0;
		max-height: 100vh;
	}

	.dy-login__shortcut-item {
		grid-template-columns: 1fr;
		gap: var(--dy-space-1);
	}

	.dy-login__shortcut-keys {
		justify-content: flex-start;
	}
}

@media (forced-colors: active) {
	.dy-login__shortcuts-dialog {
		border-color: CanvasText;
		background: Canvas;
	}

	.dy-login__kbd {
		border-color: CanvasText;
		background: Canvas;
		color: CanvasText;
		box-shadow: 0 1px 0 CanvasText;
	}
}
</style>