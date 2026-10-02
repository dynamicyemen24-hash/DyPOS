<template>
  <button
    ref="rootRef"
    v-bind="$attrs"
    :type="props.type"
    :disabled="isDisabled"
    :aria-label="label || undefined"
    :aria-busy="loading || undefined"
    :class="classes"
    @click="onClick"
  >
    <LoadingIndicator v-if="loading" :class="iconClass" />
    <span v-else-if="$slots.prefix || iconLeft" :class="iconClass">
      <slot name="prefix">
        <component :is="iconLeft" v-if="iconLeft && typeof iconLeft !== 'string'" />
        <FeatherIcon v-else-if="iconLeft" :name="iconLeft" aria-hidden="true" />
      </slot>
    </span>

    <span class="truncate" :class="{ 'sr-only': isIconOnly }">
      <template v-if="loading && loadingText">{{ loadingText }}</template>
      <slot v-else>{{ label }}</slot>
    </span>

    <span v-if="$slots.suffix || iconRight" :class="iconClass">
      <slot name="suffix">
        <component :is="iconRight" v-if="iconRight && typeof iconRight !== 'string'" />
        <FeatherIcon v-else-if="iconRight" :name="iconRight" aria-hidden="true" />
      </slot>
    </span>
  </button>
</template>

<script setup>
/**
 * ActionButton — patterned after Carbon and Fluent design systems.
 *
 * Provides a richer set of themes and variants for toolbars, headers, and
 * action lists. Colours resolve through DyPOS design tokens so light/dark and
 * theme switches work at runtime with zero extra CSS.
 *
 * Carbon themes:   default | critical | destructive | secondary | subtle
 * Fluent themes:   default | accent | success | warning | destructive
 */
import { computed, useSlots } from "vue"
import { useRouter } from "vue-router"
import FeatherIcon from "./FeatherIcon.vue"
import LoadingIndicator from "./LoadingIndicator.vue"

const props = defineProps({
	/** Carbon: default | critical | destructive | secondary | subtle
	 * Fluent:    default | accent | success | warning | destructive */
	theme: { type: String, default: "default" },
	/** xs | sm | md | lg | xl | 2xl */
	size: { type: String, default: "md" },
	/** solid | subtle | outline | ghost | tertiary */
	variant: { type: String, default: "subtle" },
	/** Text shown when the default slot is empty. */
	label: { type: String, default: "" },
	/** Icon-only mode (renders `icon` instead of the label). */
	icon: { type: [String, Object], default: null },
	/** Icon rendered before the label. */
	iconLeft: { type: [String, Object], default: null },
	/** Icon rendered after the label. */
	iconRight: { type: [String, Object], default: null },
	/** Native button type. */
	type: { type: String, default: "button" },
	/** Shows a spinner and blocks interaction. */
	loading: { type: Boolean, default: false },
	/** Label shown while loading. */
	loadingText: { type: String, default: "" },
	disabled: { type: Boolean, default: false },
	/** Vue Router destination (navigates instead of emitting `click`). */
	route: { type: [String, Object], default: null },
	/** External URL opened in a new tab. */
	link: { type: String, default: null },
})

const emit = defineEmits(["click"])
const slots = useSlots()
const router = useRouter()

const isDisabled = computed(() => props.disabled || props.loading)
const isIconOnly = computed(
	() => Boolean(props.icon) || Boolean(slots.icon) || !slots.default,
)

// Carbon + Fluent token palettes using DyPOS design tokens
const CARBON = {
	default: {
		solid:
			"bg-[var(--dy-text)] text-[var(--dy-surface)] hover:bg-[var(--dy-text-strong)]",
		subtle:
			"bg-[var(--dy-bg-sunken)] text-[var(--dy-text)] hover:bg-[var(--dy-surface-active)]",
		outline:
			"bg-transparent text-[var(--dy-text)] border border-[var(--dy-border-strong)] hover:bg-[var(--dy-bg-sunken)]",
		ghost:
			"bg-transparent text-[var(--dy-text-secondary)] hover:bg-[var(--dy-bg-sunken)]",
		critical:
			"bg-[var(--dy-danger)] text-[var(--dy-text-on-crimson)] hover:bg-[var(--dy-danger-hover)]",
		destructive:
			"bg-[var(--dy-danger)] text-[var(--dy-text-on-crimson)] hover:bg-[var(--dy-danger-hover)]",
		secondary:
			"bg-[var(--dy-info)] text-[var(--dy-text-on-info)] hover:bg-[var(--dy-info-hover)]",
		subtleSecondary:
			"bg-[var(--dy-info-soft)] text-[var(--dy-info)] hover:bg-[var(--dy-info-subtle)]",
	},
}

const FLUENT = {
	default: {
		solid:
			"bg-[var(--dy-primary)] text-[var(--dy-text-on-primary)] hover:bg-[var(--dy-primary-hover)]",
		subtle:
			"bg-[var(--dy-primary-soft)] text-[var(--dy-primary)] hover:bg-[var(--dy-primary-subtle)]",
		outline:
			"bg-transparent text-[var(--dy-primary)] border border-[var(--dy-primary)] hover:bg-[var(--dy-primary-subtle)]",
		ghost:
			"bg-transparent text-[var(--dy-primary)] hover:bg-[var(--dy-primary-subtle)]",
		success:
			"bg-[var(--dy-success)] text-[var(--dy-text-on-mint)] hover:bg-[var(--dy-success-hover)]",
		warning:
			"bg-[var(--dy-warning)] text-[var(--dy-text-on-warning)] hover:bg-[var(--dy-warning-hover)]",
		destructive:
			"bg-[var(--dy-danger)] text-[var(--dy-text-on-crimson)] hover:bg-[var(--dy-danger-hover)]",
	},
}

// Historical theme name aliases
const THEME_ALIAS = {
	critical: "destructive",
	subtle: "subtle",
	amber: "red",
	teal: "green",
}

// Size classes matching Carbon/Fluent standards
const SIZE = {
	xs: "h-6 px-2 text-xs gap-1 rounded-md",
	sm: "h-8 px-2.5 text-sm gap-1.5 rounded-md",
	md: "h-9 px-3 text-sm gap-2 rounded-lg",
	lg: "h-10 px-4 text-base gap-2 rounded-lg",
	xl: "h-12 px-5 text-lg gap-2.5 rounded-xl",
	"2xl": "h-14 px-6 text-xl gap-3 rounded-xl",
}

// Icon sizes
const ICON_SIZE = {
	xs: "h-3 w-3",
	sm: "h-4 w-4",
	md: "h-4 w-4",
	lg: "h-5 w-5",
	xl: "h-5 w-5",
	"2xl": "h-6 w-6",
}

const classes = computed(() => {
	const carbonTheme = THEME_ALIAS[props.theme] || props.theme
	const themeMap = props.theme.startsWith("carbon-")
		? CARBON
		: props.theme.startsWith("fluent-")
			? FLUENT
			: CARBON

	const theme = carbonTheme in themeMap ? carbonTheme : "default"
	const palette = themeMap[theme] || CARBON.default

	const variant = props.variant || "subtle"
	const variantStyles = palette[variant] || palette.subtle

	return [
		"inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium select-none transition-colors",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dy-ring)]",
		"disabled:pointer-events-none disabled:opacity-50",
		isIconOnly.value ? "aspect-square px-0" : "",
		variantStyles,
		SIZE[props.size] || SIZE.md,
	]
})

const iconClass = computed(() => [
	"inline-flex shrink-0 items-center",
	ICON_SIZE[props.size] || ICON_SIZE.md,
])

/**
 * Route/link navigation wins over `click`, matching the historical contract.
 * @param {MouseEvent} event
 */
function onClick(event) {
	if (isDisabled.value) {
		event.preventDefault()
		return
	}
	if (props.route) {
		event.preventDefault()
		router.push(props.route)
		return
	}
	if (props.link) {
		event.preventDefault()
		window.open(props.link, "_blank", "noopener,noreferrer")
		return
	}
	emit("click", event)
}
</script>