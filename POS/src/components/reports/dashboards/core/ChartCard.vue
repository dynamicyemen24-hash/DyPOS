<template>
	<div class="bg-[var(--dy-surface)] rounded-lg shadow-sm p-5 hover:shadow-md transition-shadow">
		<div class="flex items-center justify-between mb-4">
			<h3 class="text-sm font-semibold text-[var(--dy-text)]">{{ __(title) }}</h3>
			<FeatherIcon :name="icon" class="w-4 h-4 text-[var(--dy-text-muted)]" />
		</div>
		<div class="relative chart-container" :style="{ aspectRatio }">
			<div v-if="error" class="absolute inset-0 flex items-center justify-center">
				<ChartErrorState :message="error" @retry="$emit('retry')" />
			</div>
			<ChartCardSkeleton v-else-if="loading" :aspectRatio="aspectRatio" />
			<div v-else-if="isEmpty" class="absolute inset-0 flex items-center justify-center">
				<p class="text-sm text-[var(--dy-text-muted)]">{{ __("No data available") }}</p>
			</div>
			<slot v-else />
		</div>
		<span id="chart-desc" class="sr-only">{{ title }} chart visualization</span>
		<div v-if="$slots.footer" class="mt-3 pt-3 border-t border-[var(--dy-border-soft)]">
			<slot name="footer" />
		</div>
	</div>
</template>

<script setup>
import { FeatherIcon } from "dypos-ui"
import ChartErrorState from "./ChartErrorState.vue"
import ChartCardSkeleton from "./ChartCardSkeleton.vue"

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
