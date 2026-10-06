<template>
	<div class="grid gap-4" :class="gridClass" role="status" :aria-label="__('Loading KPIs')">
		<div
			v-for="i in kpiCount"
			:key="i"
			class="bg-[var(--dy-surface)] rounded-lg shadow-sm p-4 border-l-4 border-[var(--dy-border-soft)] animate-pulse"
		>
			<div class="flex items-start justify-between">
				<div class="min-w-0">
					<div class="h-2.5 bg-[var(--dy-bg-sunken)] rounded w-2/3 mb-2" />
					<div class="h-7 bg-[var(--dy-bg-sunken)] rounded w-1/2 mb-1" />
					<div class="h-2 bg-[var(--dy-border-soft)] rounded w-1/4" />
				</div>
				<div class="w-5 h-5 bg-[var(--dy-bg-sunken)] rounded flex-shrink-0" />
			</div>
		</div>
		<span class="sr-only">{{ __("Loading key performance indicators") }}</span>
	</div>
</template>

<script setup>
import { computed } from "vue"

import { __ } from "@/utils/translation"

const props = defineProps({
	kpiCount: { type: Number, default: 4 },
	columns: { type: Number, default: 4 },
})

const gridClass = computed(() => {
	const cols = props.columns
	if (cols === 2) return "grid-cols-1 sm:grid-cols-2"
	if (cols === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
	return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
})
</script>