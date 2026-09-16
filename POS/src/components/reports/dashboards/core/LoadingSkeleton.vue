<template>
	<div class="space-y-4" role="status" :aria-label="__('Loading dashboard')">
		<!-- KPI Skeleton Row -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
			<div v-for="i in kpiCount" :key="i" class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-gray-200">
				<div class="h-3 bg-gray-200 rounded w-2/3 mb-3 animate-pulse" />
				<div class="h-8 bg-gray-200 rounded w-1/2 mb-2 animate-pulse" />
				<div class="h-3 bg-gray-100 rounded w-1/3 animate-pulse" />
			</div>
		</div>

		<!-- Chart Skeleton Grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			<div v-for="i in chartCount" :key="i" class="bg-white rounded-lg shadow-sm p-5">
				<div class="h-4 bg-gray-200 rounded w-1/3 mb-4 animate-pulse" />
				<div class="h-48 bg-gray-100 rounded animate-pulse" />
			</div>
		</div>

		<span class="sr-only">{{ __("Loading dashboard data, please wait") }}</span>
	</div>
</template>

<script setup>
defineProps({
	kpiCount: { type: Number, default: 4 },
	chartCount: { type: Number, default: 3 },
})
</script>