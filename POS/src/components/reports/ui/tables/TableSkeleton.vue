<template>
	<div class="bg-[var(--dy-surface)] rounded-lg shadow-sm overflow-hidden animate-pulse" role="status" :aria-label="__('Loading table')">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-[var(--dy-border-soft)]">
				<thead class="bg-[var(--dy-surface-soft)]">
					<tr>
						<th v-for="col in columnCount" :key="col" class="px-4 py-3 text-end text-xs font-medium text-[var(--dy-text-muted)] uppercase tracking-wider">
							<div class="h-3 bg-[var(--dy-bg-sunken)] rounded w-3/4 animate-pulse" />
						</th>
					</tr>
				</thead>
				<tbody class="bg-[var(--dy-surface)] divide-y divide-[var(--dy-border-soft)]">
					<tr v-for="row in rowCount" :key="row">
						<td v-for="col in columnCount" :key="col" class="px-4 py-3 text-sm">
							<div :class="['h-4 bg-[var(--dy-bg-sunken)] rounded animate-pulse', col === 0 ? 'w-1/2' : 'w-2/3']" />
						</td>
					</tr>
				</tbody>
			</table>
		</div>
		<span class="sr-only">{{ __("Loading table data") }}</span>
	</div>
</template>

<script setup>
import { __ } from "@/utils/translation"

defineProps({
	columnCount: { type: Number, default: 5 },
	rowCount: { type: Number, default: 5 },
})
</script>