<template>
	<div class="grid gap-2" :class="gridClass" role="status" :aria-label="__('Loading products')">
		<div
			v-for="i in itemCount"
			:key="i"
			class="bg-[var(--dy-surface)] rounded-lg shadow-sm border border-[var(--dy-border-soft)] p-3 hover:shadow-md transition-shadow animate-pulse"
		>
			<div class="flex flex-col items-center text-center">
				<div class="w-20 h-20 bg-[var(--dy-bg-sunken)] rounded-lg mb-2" />
				<div class="h-4 bg-[var(--dy-bg-sunken)] rounded w-3/4 mb-1" />
				<div class="h-3 bg-[var(--dy-border-soft)] rounded w-1/2" />
			</div>
		</div>
		<span class="sr-only">{{ __("Loading product catalog") }}</span>
	</div>
</template>

<script setup>
import { computed } from "vue"

import { __ } from "@/utils/translation"

const props = defineProps({
	itemCount: { type: Number, default: 12 },
	columns: { type: Number, default: 4 },
})

const gridClass = computed(() => {
	const cols = props.columns
	if (cols <= 2) return "grid-cols-1 sm:grid-cols-2"
	if (cols === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
	if (cols === 4)
		return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
	return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
})
</script>