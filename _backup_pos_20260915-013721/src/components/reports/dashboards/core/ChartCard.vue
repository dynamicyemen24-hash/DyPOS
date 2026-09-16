<template>
	<div class="bg-white rounded-lg shadow-sm p-5 hover:shadow-md transition-shadow">
		<div class="flex items-center justify-between mb-4">
			<h3 class="text-sm font-semibold text-gray-700">{{ __(title) }}</h3>
			<FeatherIcon :name="icon" class="w-4 h-4 text-gray-400" />
		</div>
		<div class="relative chart-container" :style="{ aspectRatio }">
			<div v-if="error" class="absolute inset-0 flex items-center justify-center">
				<ChartErrorState :message="error" @retry="$emit('retry')" />
			</div>
			<div v-else-if="loading" class="absolute inset-0 flex items-center justify-center">
				<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
			</div>
			<div v-else-if="isEmpty" class="absolute inset-0 flex items-center justify-center">
				<p class="text-sm text-gray-400">{{ __("No data available") }}</p>
			</div>
			<slot v-else />
		</div>
		<span id="chart-desc" class="sr-only">{{ title }} chart visualization</span>
		<div v-if="$slots.footer" class="mt-3 pt-3 border-t border-gray-100">
			<slot name="footer" />
		</div>
	</div>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
import ChartErrorState from "./ChartErrorState.vue"

defineProps({
	title: { type: String, required: true },
	icon: { type: String, default: "bar-chart-2" },
	aspectRatio: { type: String, default: "16/9" },
	loading: { type: Boolean, default: false },
	isEmpty: { type: Boolean, default: false },
	error: { type: String, default: "" },
})

defineEmits(["retry"])

defineOptions({ inheritAttrs: false })
</script>
