<script setup>
import { computed } from "vue"
import { FeatherIcon } from "dypos-ui"
import { __ } from "@/utils/translation"

const props = defineProps({
	label: { type: String, default: "تصفية سريعة" },
	options: { type: Array, default: () => [] },
	modelValue: { type: String, default: "" },
	total: { type: Number, default: 0 },
})

const emit = defineEmits(["update:modelValue"])
const visibleOptions = computed(() =>
	props.options.filter((option) => option && option.value !== ""),
)

function select(value) {
	emit("update:modelValue", value === props.modelValue ? "" : value)
}
</script>

<template>
	<div v-if="visibleOptions.length" class="work-quick-filters" :aria-label="label">
		<span class="work-quick-filters__label">{{ __(label) }}</span>
		<div class="work-quick-filters__items" role="group" :aria-label="__(label)">
			<button
				type="button"
				class="work-quick-filters__chip"
				:class="{ 'work-quick-filters__chip--active': !modelValue }"
				:aria-pressed="!modelValue"
				@click="select('')"
			>
				{{ __("الكل") }}
				<span class="work-quick-filters__count">{{ total.toLocaleString() }}</span>
			</button>
			<button
				v-for="option in visibleOptions"
				:key="option.value"
				type="button"
				class="work-quick-filters__chip"
				:class="{ 'work-quick-filters__chip--active': modelValue === option.value }"
				:aria-pressed="modelValue === option.value"
				@click="select(option.value)"
			>
				<span>{{ option.label }}</span>
				<span class="work-quick-filters__count">{{ option.count.toLocaleString() }}</span>
			</button>
		</div>
	</div>
</template>

<style scoped>
.work-quick-filters {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 0.65rem;
	padding: 0.25rem 0;
	min-width: 0;
}
.work-quick-filters__label {
	color: var(--dy-text-muted, #64748b);
	font-size: 0.8rem;
	font-weight: 600;
}
.work-quick-filters__items {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 0.45rem;
}
.work-quick-filters__chip {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.45rem;
	min-height: 44px;
	padding: 0.45rem 0.75rem;
	border: 1px solid var(--dy-border, #cbd5e1);
	border-radius: 999px;
	background: var(--dy-surface, #fff);
	color: var(--dy-text, #0f172a);
	font-size: 0.8125rem;
	cursor: pointer;
	transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
.work-quick-filters__chip:hover { border-color: var(--dy-primary, #047857); }
.work-quick-filters__chip:focus-visible {
	outline: 2px solid var(--dy-primary, #047857);
	outline-offset: 2px;
}
.work-quick-filters__chip--active {
	background: var(--dy-primary-soft, #ecfdf5);
	border-color: var(--dy-primary, #047857);
	color: var(--dy-primary, #047857);
	font-weight: 650;
}
.work-quick-filters__count {
	font-variant-numeric: tabular-nums;
	font-size: 0.75rem;
	opacity: 0.8;
}
@media (prefers-reduced-motion: reduce) {
	.work-quick-filters__chip { transition: none; }
}
</style>
