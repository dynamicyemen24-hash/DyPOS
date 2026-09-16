<template>
	<button
		type="button"
		:class="buttonClasses"
		:title="resolvedTitle"
		:aria-label="resolvedAriaLabel"
		:aria-disabled="disabled || undefined"
		:aria-busy="loading || undefined"
		:disabled="disabled || loading"
		:data-variant="variant"
		:data-size="size"
		:data-testid="testId"
		@click="handleClick"
	>
		<span
			class="relative inline-flex shrink-0 items-center justify-center"
			:class="iconWrapperClasses"
		>
			<svg
				v-if="!loading"
				:class="iconClasses"
				:fill="iconFill"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
				focusable="false"
				:style="{ strokeWidth }"
			>
				<path
					:stroke-linecap="strokeLinecap"
					:stroke-linejoin="strokeLinejoin"
					:d="icon"
				/>
			</svg>

			<svg
				v-else
				class="animate-spin"
				:class="iconClasses"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
				focusable="false"
			>
				<circle
					cx="12"
					cy="12"
					r="9"
					class="opacity-20"
					stroke="currentColor"
					:stroke-width="strokeWidth"
				/>
				<path
					d="M21 12a9 9 0 0 0-9-9"
					stroke="currentColor"
					:stroke-width="strokeWidth"
					:stroke-linecap="round"
				/>
			</svg>

			<span
				v-if="showBadge"
				class="absolute flex items-center justify-center rounded-full font-bold leading-none tabular-nums"
				:class="badgeClasses"
				:aria-label="badgeAriaLabel"
			>
				{{ displayBadge }}
			</span>
		</span>
	</button>
</template>

<script setup>
import { computed } from "vue"

const props = defineProps({
	icon: {
		type: String,
		required: true,
	},

	title: {
		type: String,
		default: "",
	},

	ariaLabel: {
		type: String,
		default: "",
	},

	variant: {
		type: String,
		default: "gray",
		validator: (value) =>
			["gray", "green", "orange", "red", "blue"].includes(value),
	},

	size: {
		type: String,
		default: "md",
		validator: (value) => ["sm", "md", "lg"].includes(value),
	},

	badge: {
		type: [String, Number],
		default: null,
	},

	badgeMax: {
		type: Number,
		default: 99,
	},

	iconFill: {
		type: String,
		default: "none",
	},

	strokeLinecap: {
		type: String,
		default: "round",
	},

	strokeLinejoin: {
		type: String,
		default: "round",
	},

	strokeWidth: {
		type: [String, Number],
		default: 2,
	},

	animate: {
		type: Boolean,
		default: false,
	},

	loading: {
		type: Boolean,
		default: false,
	},

	disabled: {
		type: Boolean,
		default: false,
	},

	testId: {
		type: String,
		default: "",
	},
})

const emit = defineEmits(["click"])

const hasBadge = computed(() => {
	return (
		props.badge !== null &&
		props.badge !== undefined &&
		String(props.badge).trim() !== ""
	)
})

const numericBadge = computed(() => {
	if (!hasBadge.value) return null

	const value = Number(props.badge)

	return Number.isFinite(value) ? value : null
})

const displayBadge = computed(() => {
	if (!hasBadge.value) return ""

	if (numericBadge.value === null) {
		return String(props.badge)
	}

	if (numericBadge.value > props.badgeMax) {
		return `${props.badgeMax}+`
	}

	return String(numericBadge.value)
})

const showBadge = computed(() => {
	return hasBadge.value && !props.loading
})

const badgeAriaLabel = computed(() => {
	if (!showBadge.value) return ""

	return `عدد ${displayBadge.value}`
})

const resolvedAriaLabel = computed(() => {
	return props.ariaLabel || props.title || "إجراء"
})

const resolvedTitle = computed(() => {
	return props.title || props.ariaLabel || ""
})

const buttonClasses = computed(() => {
	const variants = {
		gray: [
			"text-gray-600",
			"hover:bg-gray-100",
			"hover:text-gray-900",
			"active:bg-gray-200",
		],

		green: [
			"text-emerald-600",
			"hover:bg-emerald-50",
			"hover:text-emerald-700",
			"active:bg-emerald-100",
		],

		orange: [
			"text-amber-600",
			"hover:bg-amber-50",
			"hover:text-amber-700",
			"active:bg-amber-100",
		],

		red: [
			"text-red-600",
			"hover:bg-red-50",
			"hover:text-red-700",
			"active:bg-red-100",
		],

		blue: [
			"text-indigo-600",
			"hover:bg-indigo-50",
			"hover:text-indigo-700",
			"active:bg-indigo-100",
		],
	}

	const sizes = {
		sm: "min-h-9 min-w-9 p-2",
		md: "min-h-11 min-w-11 p-2.5",
		lg: "min-h-12 min-w-12 p-3",
	}

	return [
		"relative",
		"inline-flex",
		"shrink-0",
		"items-center",
		"justify-center",
		"rounded-xl",
		"touch-manipulation",
		"select-none",
		"outline-none",
		"transition-[background-color,color,box-shadow,transform]",
		"duration-150",
		"ease-out",
		"focus-visible:ring-2",
		"focus-visible:ring-emerald-500",
		"focus-visible:ring-offset-2",
		"active:scale-[0.97]",
		"disabled:pointer-events-none",
		"disabled:cursor-not-allowed",
		"disabled:opacity-45",
		"disabled:active:scale-100",
		sizes[props.size],
		variants[props.variant],
		props.animate && !props.loading ? "animate-pulse" : "",
	]
		.filter(Boolean)
		.join(" ")
})

const iconWrapperClasses = computed(() => {
	const sizes = {
		sm: "h-4 w-4",
		md: "h-5 w-5",
		lg: "h-6 w-6",
	}

	return sizes[props.size]
})

const iconClasses = computed(() => {
	const sizes = {
		sm: "h-4 w-4",
		md: "h-5 w-5",
		lg: "h-6 w-6",
	}

	return sizes[props.size]
})

const badgeClasses = computed(() => {
	const sizes = {
		sm: ["-end-1.5", "-top-1.5", "min-h-4", "min-w-4", "px-1", "text-[9px]"],

		md: ["-end-1.5", "-top-1.5", "min-h-5", "min-w-5", "px-1.5", "text-[10px]"],

		lg: ["-end-1.5", "-top-1.5", "min-h-5", "min-w-5", "px-1.5", "text-[10px]"],
	}

	return [
		"bg-red-600",
		"text-white",
		"ring-2",
		"ring-white",
		"shadow-sm",
		sizes[props.size],
	]
		.filter(Boolean)
		.join(" ")
})

function handleClick(event) {
	if (props.disabled || props.loading) {
		event.preventDefault()
		return
	}

	emit("click", event)
}
</script>

<style scoped>
button {
	-webkit-tap-highlight-color: transparent;
}

@media (prefers-reduced-motion: reduce) {
	button,
	button svg {
		transition: none !important;
		animation: none !important;
	}

	button:active {
		transform: none !important;
	}
}
</style>
