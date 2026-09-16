<script setup>
const props = defineProps({
	variant: {
		type: String,
		default: "neutral",
		validator: (v) =>
			["neutral", "primary", "success", "danger", "warning", "info"].includes(
				v,
			),
	},
	live: { type: Boolean, default: false },
	label: { type: String, default: "" },
})
</script>

<template>
	<span :class="['dy-badge', 'dy-badge-' + variant, { 'dy-badge-live': live }]">
		<slot>{{ label }}</slot>
	</span>
</template>