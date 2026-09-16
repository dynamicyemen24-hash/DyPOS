<template>
	<div class="saas-branding" :style="brandVars">
		<slot />
	</div>
</template>

<script setup>
import { computed } from "vue"

const props = defineProps({
	companyName: { type: String, default: "" },
	primaryColor: { type: String, default: "" },
	logoUrl: { type: String, default: "" },
	logoHeight: { type: Number, default: 32 },
})

const brandVars = computed(() => {
	const vars = {}
	if (props.primaryColor) {
		vars["--dy-brand-primary"] = props.primaryColor
		vars["--dy-brand-primary-rgb"] = hexToRgb(props.primaryColor)
	}
	return vars
})

function hexToRgb(hex) {
	if (!hex || !hex.startsWith("#")) return "99,102,241"
	const r = Number.parseInt(hex.slice(1, 3), 16)
	const g = Number.parseInt(hex.slice(3, 5), 16)
	const b = Number.parseInt(hex.slice(5, 7), 16)
	return `${r},${g},${b}`
}
</script>

<style>
:root {
	--dy-brand-primary: #6366f1;
	--dy-brand-primary-rgb: 99,102,241;
}
</style>
