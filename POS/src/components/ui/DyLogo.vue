<script setup>
import { computed } from "vue"

const props = defineProps({
	size: { type: [Number, String], default: 20 },
	title: { type: String, default: "DyPOS" },
})

const dimension = computed(() => {
	const value = Math.max(Number(props.size) || 20, 8)
	return { width: value, height: value }
})
</script>

<template>
	<svg
		:width="dimension.width"
		:height="dimension.height"
		viewBox="0 0 24 24"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		:aria-label="title"
	>
		<title>{{ title }}</title>
		<rect
			x="2"
			y="2"
			width="20"
			height="20"
			rx="6"
			fill="url(#dypos-logo-gradient)"
		/>
		<path
			d="M7 15.5v-7h10v7h-2.6l-2.4-3-2.4 3H7z"
			fill="#fff"
			fill-opacity="0.92"
		/>
		<rect
			x="6"
			y="8"
			width="12"
			height="2"
			rx="1"
			fill="#fff"
			fill-opacity="0.6"
		/>
		<defs>
			<linearGradient
				id="dypos-logo-gradient"
				x1="2"
				y1="2"
				x2="22"
				y2="22"
				gradientUnits="userSpaceOnUse"
			>
				<stop stop-color="var(--dy-brand-500, #0ea5e9)" />
				<stop
					offset="1"
					stop-color="var(--dy-brand-700, #0369a1)"
				/>
			</linearGradient>
		</defs>
	</svg>
</template>