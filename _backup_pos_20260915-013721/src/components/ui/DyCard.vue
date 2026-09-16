<script setup>
import { computed } from "vue"

const props = defineProps({
	variant: {
		type: String,
		default: "default",
		validator: (v) => ["default", "glass", "elevated"].includes(v),
	},
	interactive: { type: Boolean, default: false },
	accent: { type: Boolean, default: false },
	as: { type: String, default: "div" },
})

const classes = computed(() => [
	"dy-card",
	props.variant === "glass" && "dy-card-glass",
	props.variant === "elevated" && "dy-card-elevated",
	props.interactive && "dy-card-interactive",
	props.accent && "dy-card-accent",
])
</script>

<template>
	<component :is="as" :class="classes">
		<header v-if="$slots.header" class="dy-card-header">
			<slot name="header" />
		</header>
		<div v-if="$slots.default" class="dy-card-body">
			<slot />
		</div>
		<footer v-if="$slots.footer" class="dy-card-footer">
			<slot name="footer" />
		</footer>
	</component>
</template>