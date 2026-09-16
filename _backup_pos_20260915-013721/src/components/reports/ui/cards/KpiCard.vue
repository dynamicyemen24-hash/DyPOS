<template>
	<div
		class="bg-white rounded-lg shadow-sm p-4 border-l-4 hover:shadow-md transition-shadow"
		:class="borderClass"
	>
		<div class="flex items-start justify-between">
			<div>
				<p class="text-sm text-gray-500">{{ __(label) }}</p>
				<p class="text-2xl font-bold mt-1" :class="valueClass">{{ value }}</p>
				<p v-if="hint" class="text-xs text-gray-400 mt-1">{{ hint }}</p>
			</div>
			<FeatherIcon :name="icon" class="w-6 h-6" :class="iconClass" />
		</div>
	</div>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
import { computed } from "vue"

const props = defineProps({
	label: { type: String, required: true },
	value: { type: [String, Number], default: "-" },
	hint: { type: String, default: "" },
	icon: { type: String, default: "bar-chart-2" },
	status: {
		type: String,
		default: "neutral",
		validator: (value) =>
			["good", "warning", "danger", "neutral"].includes(value),
	},
})

const THEME = {
	good: {
		border: "border-green-500",
		value: "text-green-600",
		icon: "text-green-500",
	},
	warning: {
		border: "border-amber-500",
		value: "text-amber-600",
		icon: "text-amber-500",
	},
	danger: {
		border: "border-red-500",
		value: "text-red-600",
		icon: "text-red-500",
	},
	neutral: {
		border: "border-indigo-500",
		value: "text-indigo-600",
		icon: "text-indigo-500",
	},
}

const theme = computed(() => THEME[props.status] || THEME.neutral)
const borderClass = computed(() => theme.value.border)
const valueClass = computed(() => theme.value.value)
const iconClass = computed(() => theme.value.icon)
</script>
