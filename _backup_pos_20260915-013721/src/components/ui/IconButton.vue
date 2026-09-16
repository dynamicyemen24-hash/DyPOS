<script setup>
import { FeatherIcon } from "frappe-ui"

const props = defineProps({
	icon: { type: String, required: true },
	variant: {
		type: String,
		default: "ghost",
		validator: (v) =>
			[
				"primary",
				"secondary",
				"soft",
				"ghost",
				"gray",
				"success",
				"danger",
				"warning",
				"hero",
			].includes(v),
	},
	size: {
		type: String,
		default: "md",
		validator: (v) => ["sm", "md", "lg"].includes(v),
	},
	title: { type: String, default: "" },
	ariaLabel: { type: String, default: "" },
	loading: { type: Boolean, default: false },
	disabled: { type: Boolean, default: false },
	touch: { type: Boolean, default: false },
	type: { type: String, default: "button" },
})

const emit = defineEmits(["click"])
</script>

<template>
	<button
		:type="props.type"
		:class="[
			'dy-icon-btn',
			'dy-icon-btn-' + variant,
			'dy-icon-btn-' + size,
			{ 'dy-touch dy-press': touch },
		]"
		:title="title || ariaLabel || undefined"
		:aria-label="ariaLabel || title || undefined"
		:aria-busy="loading"
		:disabled="disabled || loading"
		@click="emit('click', $event)"
	>
		<span v-if="loading" class="dy-icon-btn-spinner" aria-hidden="true"></span>
		<FeatherIcon v-else :name="icon" class="dy-icon-btn-icon" :stroke-width="2" />
	</button>
</template>

<style scoped>
.dy-icon-btn-icon {
	pointer-events: none;
}

.dy-icon-btn-spinner {
	width: 1em;
	height: 1em;
	border: 2px solid currentColor;
	border-inline-end-color: transparent;
	border-radius: var(--dy-radius-full);
	animation: dy-icon-btn-spin 0.8s linear infinite;
	opacity: 0.85;
}

/* ——— Sizes ——— */

.dy-icon-btn-sm {
	width: 30px;
	height: 30px;
}

.dy-icon-btn-sm .dy-icon-btn-icon {
	width: 16px;
	height: 16px;
}

.dy-icon-btn-md .dy-icon-btn-icon {
	width: 18px;
	height: 18px;
}

.dy-icon-btn-lg {
	width: 48px;
	height: 48px;
}

.dy-icon-btn-lg .dy-icon-btn-icon {
	width: 22px;
	height: 22px;
}

/* ——— Variants ——— */

.dy-icon-btn-primary {
	background: var(--dy-primary);
	color: var(--dy-primary-contrast);
	box-shadow: var(--dy-elevation-1);
}

.dy-icon-btn-primary:hover:not(:disabled) {
	background: var(--dy-primary-hover);
	box-shadow: var(--dy-elevation-2);
}

.dy-icon-btn-secondary {
	background: var(--dy-surface);
	color: var(--dy-text);
	border-color: var(--dy-border);
}

.dy-icon-btn-secondary:hover:not(:disabled) {
	background: var(--dy-surface-hover);
	border-color: var(--dy-border-strong);
}

.dy-icon-btn-soft {
	background: var(--dy-primary-soft);
	color: var(--dy-primary);
}

.dy-icon-btn-soft:hover:not(:disabled) {
	background: var(--dy-primary-softer);
}

.dy-icon-btn-ghost .dy-icon-btn-icon {
	color: var(--dy-text-secondary);
}

.dy-icon-btn-gray {
	background: var(--dy-surface, #ffffff);
	color: var(--dy-text-secondary);
	border-color: var(--dy-border, rgba(0, 0, 0, 0.08));
}

.dy-icon-btn-gray:hover:not(:disabled) {
	background: var(--dy-surface-hover);
	color: var(--dy-text-strong);
	border-color: var(--dy-border-strong);
}

.dy-icon-btn-success {
	background: var(--dy-success);
	color: var(--dy-success-contrast);
}

.dy-icon-btn-success:hover:not(:disabled) {
	background: var(--dy-success-hover);
}

.dy-icon-btn-danger {
	background: var(--dy-danger);
	color: var(--dy-danger-contrast);
}

.dy-icon-btn-danger:hover:not(:disabled) {
	background: var(--dy-danger-hover);
}

.dy-icon-btn-warning {
	background: var(--dy-warning);
	color: var(--dy-warning-contrast);
}

.dy-icon-btn-warning:hover:not(:disabled) {
	background: var(--dy-warning-hover);
}

.dy-icon-btn-hero {
	background: linear-gradient(135deg, var(--dy-brand-600), var(--dy-brand-800));
	color: var(--dy-brand-contrast, #ffffff);
	box-shadow: var(--dy-glow-brand);
}

.dy-icon-btn-hero:hover:not(:disabled) {
	background: linear-gradient(135deg, var(--dy-brand-500), var(--dy-brand-700));
}

@media (prefers-reduced-motion: reduce) {
	.dy-icon-btn-spinner {
		transition: none !important;
		animation: none !important;
	}
}

@keyframes dy-icon-btn-spin {
	to {
		transform: rotate(360deg);
	}
}
</style>