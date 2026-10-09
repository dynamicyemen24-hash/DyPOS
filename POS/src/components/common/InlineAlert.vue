<script setup>
import { computed } from "vue"
import { ActionButton, FeatherIcon } from "dypos-ui"
import { __ } from "@/utils/translation"

const props = defineProps({
	variant: {
		type: String,
		default: "info",
		validator: (value) => ["info", "success", "warning", "error"].includes(value),
	},
	title: { type: String, default: "" },
	message: { type: String, default: "" },
	dismissible: { type: Boolean, default: false },
	dismissLabel: { type: String, default: "" },
})

const emit = defineEmits(["dismiss"])
const isUrgent = computed(() => props.variant === "error")
const role = computed(() => (isUrgent.value ? "alert" : "status"))
const live = computed(() => (isUrgent.value ? "assertive" : "polite"))
const closeLabel = computed(() => props.dismissLabel || __("Close"))
</script>

<template>
	<section
		class="dy-inline-alert flex items-start gap-3 rounded-lg border p-3 sm:p-4"
		:class="`dy-inline-alert--${variant}`"
		:role="role"
		:aria-live="live"
		:aria-atomic="true"
	>
		<div class="mt-0.5 shrink-0" aria-hidden="true">
			<FeatherIcon
				:name="{ info: 'info', success: 'check-circle', warning: 'alert-triangle', error: 'alert-circle' }[variant]"
				class="h-5 w-5"
			/>
		</div>
		<div class="min-w-0 flex-1">
			<p v-if="title" class="font-semibold text-sm">{{ title }}</p>
			<p v-if="message" class="text-sm" :class="{ 'mt-1': title }">{{ message }}</p>
			<div v-if="$slots.default" class="text-sm" :class="{ 'mt-1': title || message }">
				<slot />
			</div>
		</div>
		<ActionButton
			v-if="dismissible"
			variant="ghost"
			size="sm"
			class="min-h-11 min-w-11 shrink-0"
			:aria-label="closeLabel"
			@click="emit('dismiss')"
		>
			<FeatherIcon name="x" class="h-4 w-4" aria-hidden="true" />
		</ActionButton>
	</section>
</template>

<style scoped>
.dy-inline-alert--info {
	color: var(--dy-info-contrast, #1e40af);
	background: var(--dy-info-soft, #eff6ff);
	border-color: var(--dy-info-border, #bfdbfe);
}
.dy-inline-alert--success {
	color: var(--dy-success-contrast, #166534);
	background: var(--dy-success-soft, #f0fdf4);
	border-color: var(--dy-success-border, #bbf7d0);
}
.dy-inline-alert--warning {
	color: var(--dy-warning-contrast, #92400e);
	background: var(--dy-warning-soft, #fffbeb);
	border-color: var(--dy-warning-border, #fde68a);
}
.dy-inline-alert--error {
	color: var(--dy-danger-contrast, #991b1b);
	background: var(--dy-danger-soft, #fef2f2);
	border-color: var(--dy-danger-border, #fecaca);
}
@media (prefers-reduced-motion: reduce) {
	.dy-inline-alert,
	.dy-inline-alert * {
		animation: none !important;
		transition: none !important;
	}
}
</style>
