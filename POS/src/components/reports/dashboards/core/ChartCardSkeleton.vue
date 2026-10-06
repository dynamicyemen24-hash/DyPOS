<template>
	<div class="bg-[var(--dy-surface)] rounded-lg shadow-sm p-5 animate-pulse" :style="{ aspectRatio }" role="status" :aria-label="__('Loading chart')">
		<div class="flex items-center justify-between mb-4">
			<div class="h-4 bg-[var(--dy-bg-sunken)] rounded w-1/3" />
			<div class="w-4 h-4 bg-[var(--dy-bg-sunken)] rounded" />
		</div>
		<div class="relative chart-container" :style="{ aspectRatio }">
			<div class="absolute inset-0 flex items-center justify-center">
				<div class="h-full w-full bg-[var(--dy-bg-sunken)] rounded animate-pulse" />
			</div>
		</div>
		<div v-if="$slots.footer" class="mt-3 pt-3 border-t border-[var(--dy-border-soft)]">
			<div class="h-4 bg-[var(--dy-bg-sunken)] rounded w-1/4 animate-pulse" />
		</div>
		<span class="sr-only">{{ __("Loading chart visualization") }}</span>
	</div>
</template>

<script setup>
import { __ } from "@/utils/translation"

defineProps({
	aspectRatio: { type: String, default: "16/9" },
})
</script>