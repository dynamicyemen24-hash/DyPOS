<template>
	<div class="bg-white rounded-lg shadow-sm p-5 border border-red-100" role="alert">
		<div class="flex items-center justify-between mb-3">
			<h3 class="text-sm font-semibold text-red-700">{{ __("Error loading chart") }}</h3>
			<FeatherIcon name="alert-circle" class="w-4 h-4 text-red-400" />
		</div>
		<p class="text-sm text-red-500 mb-3">{{ message }}</p>
		<div class="flex gap-2">
			<Button variant="subtle" size="sm" @click="$emit('retry')">
				<FeatherIcon name="refresh-cw" class="w-3 h-3 mr-1" />
				{{ __("Retry") }}
			</Button>
		</div>
	</div>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
import { Button } from "frappe-ui"

defineProps({
	message: { type: String, default: "An error occurred while loading this chart" },
})

defineEmits(["retry"])
</script>