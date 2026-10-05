<!--
  TechnicalModeToggle — Odoo-like debug mode toggle for the login screen.

  In Odoo, technical features are hidden behind "Debug Mode" (activated via
  URL parameter ?debug=1 or keyboard shortcut). This component provides a
  visible toggle in the login brand bar that persists via localStorage.

  When enabled, it reveals hardware diagnostics, network diagnostics, and
  version/build information — tools for technicians and power users.
-->
<script setup>
import { computed } from "vue"

import { FeatherIcon } from "dypos-ui"
import { useTechnicalMode } from "@/composables/useTechnicalMode"
import { __ } from "@/utils/translation"

const { technicalModeEnabled, toggleTechnicalMode, setupKeyboardShortcut } =
	useTechnicalMode()

// Setup keyboard shortcut on mount
let cleanup = null
if (typeof window !== "undefined") {
	cleanup = setupKeyboardShortcut()
}

const toggleLabel = computed(() =>
	technicalModeEnabled.value
		? __("إخفاء الأدوات التقنية")
		: __("إظهار الأدوات التقنية"),
)

const toggleTitle = computed(() =>
	technicalModeEnabled.value
		? __("تعطيل الوضع التقني (Ctrl+Shift+D)")
		: __("تفعيل الوضع التقني (Ctrl+Shift+D)"),
)
</script>

<template>
	<button
		type="button"
		class="dy-login__technical-toggle-btn"
		:aria-pressed="technicalModeEnabled"
		:aria-label="toggleLabel"
		:title="toggleTitle"
		@click="toggleTechnicalMode"
	>
		<FeatherIcon
			:icon="technicalModeEnabled ? 'terminal' : 'code'"
			:size="16"
			aria-hidden="true"
		/>
		<span class="dy-login__technical-toggle-text">
			{{ technicalModeEnabled ? __("أدوات تقنية") : __("أدوات تقنية") }}
		</span>
		<span
			v-if="technicalModeEnabled"
			class="dy-login__technical-badge"
			aria-hidden="true"
		>
			<FeatherIcon name="alert-triangle" :size="10" />
		</span>
	</button>
</template>

<style scoped>
.dy-login__technical-toggle-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;

	min-height: 36px;
	padding: 0 12px;

	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-lg);

	background: var(--dy-surface-soft);
	color: var(--dy-text-secondary);

	font-size: 0.75rem;
	font-weight: 600;
	line-height: 1;

	cursor: pointer;

	transition: all var(--dy-dur-fast) var(--dy-ease-standard);
}

.dy-login__technical-toggle-btn:hover {
	background: var(--dy-surface);
	border-color: var(--dy-border-strong);
	color: var(--dy-text);
}

.dy-login__technical-toggle-btn:focus-visible {
	outline: var(--dy-focus-width) solid var(--dy-focus-color);
	outline-offset: var(--dy-focus-offset);
}

/* Active state — technical mode ON */
.dy-login__technical-toggle-btn[aria-pressed="true"] {
	background: rgb(var(--dy-amber-c-500) / 0.12);
	border-color: var(--dy-amber-500);
	color: var(--dy-amber-700);
}

.dy-login__technical-toggle-btn[aria-pressed="true"]:hover {
	background: rgb(var(--dy-amber-c-500) / 0.18);
	border-color: var(--dy-amber-600);
	color: var(--dy-amber-800);
}

.dy-login__technical-toggle-text {
	white-space: nowrap;
}

.dy-login__technical-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;

	width: 18px;
	height: 18px;

	border-radius: 50%;

	background: var(--dy-amber-500);
	color: white;

	font-size: 0.6rem;
	animation: dy-pulse 1.5s ease-in-out infinite;
}

@keyframes dy-pulse {
	0%,
	100% {
		opacity: 0.6;
		transform: scale(1);
	}
	50% {
		opacity: 1;
		transform: scale(1.1);
	}
}

@media (prefers-reduced-motion: reduce) {
	.dy-login__technical-badge {
		animation: none;
		opacity: 1;
	}
}

@media (forced-colors: active) {
	.dy-login__technical-toggle-btn {
		border-color: CanvasText;
		color: CanvasText;
	}

	.dy-login__technical-toggle-btn[aria-pressed="true"] {
		background: Highlight;
		color: HighlightText;
		border-color: Highlight;
	}

	.dy-login__technical-badge {
		background: Highlight;
		color: HighlightText;
	}
}
</style>