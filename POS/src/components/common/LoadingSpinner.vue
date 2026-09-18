<template>
	<div
		class="flex-1 flex items-center justify-center bg-gray-50"
		role="status"
		:aria-live="'polite'"
		:aria-label="text"
	>
		<div class="text-center">
			<div
				class="dy-spinner animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"
				aria-hidden="true"
			></div>
			<p v-if="text" class="mt-4 text-sm text-gray-500">{{ text }}</p>
		</div>
	</div>
</template>

<script setup>
import { __ } from "@/utils/translation"

defineProps({
	text: {
		type: String,
		default: () => __("Loading..."),
	},
})
</script>

<style scoped>
/* Reduced-motion: static ring instead of spin — no vestibular trigger. */
@media (prefers-reduced-motion: reduce) {
	.dy-spinner {
		animation: none;
		border-bottom-color: transparent;
		border: 3px solid currentColor;
		opacity: 0.55;
	}
}
</style>
