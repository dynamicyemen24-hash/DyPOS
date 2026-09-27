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
        <component
          :is="iconRight"
          v-if="iconRight && typeof iconRight !== 'string'"
        />
        <FeatherIcon v-else-if="iconRight" :name="iconRight" aria-hidden="true" />
      </slot>
    </span>
  </button>
</template>

<script setup>
/**
 * DyPOS Button — the primary action primitive.
 *
 * API-compatible with the previous kit (theme / size / variant / label / icon /
 * iconLeft / iconRight / loading / loadingText / disabled / type / route /
 * link, slots `prefix` `icon` `default` `suffix`) so the 137 call sites are
 * unchanged, but:
 *
 *  - colours resolve through the DyPOS design tokens, so light/dark and the
 *    five accents switch at runtime with zero extra CSS;
 *  - `xs` was added (older screens already pass it and previously got no
 *    height class at all);
 *  - focus is always visible and `disabled` also sets `aria-busy`.
 */
import { computed, useSlots } from "vue"
import { useRouter } from "vue-router"
import FeatherIcon from "./FeatherIcon.vue"
import LoadingIndicator from "./LoadingIndicator.vue"

const props = defineProps({
	/** Semantic colour family: gray | blue | green | red. */
	theme: { type: String, default: "gray" },
	/** xs | sm | md | lg | xl | 2xl */
	size: { type: String, default: "sm" },
	/** solid | subtle | outline | ghost */
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

const PALETTE = {
	gray: {
		solid:
			"bg-[var(--dy-text)] text-[var(--dy-surface)] hover:bg-[var(--dy-text-strong)]",
		subtle:
			"bg-[var(--dy-bg-sunken)] text-[var(--dy-text)] hover:bg-[var(--dy-surface-active)]",
		outline:
			"bg-transparent text-[var(--dy-text)] border border-[var(--dy-border-strong)] hover:bg-[var(--dy-bg-sunken)]",
		ghost:
			"bg-transparent text-[var(--dy-text-secondary)] hover:bg-[var(--dy-bg-sunken)]",
	},
	blue: {
		solid:
			"bg-[var(--dy-info)] text-[var(--dy-text-on-info)] hover:bg-[var(--dy-info-hover)]",
		subtle:
			"bg-[var(--dy-info-soft)] text-[var(--dy-info)] hover:bg-[var(--dy-info-subtle)]",
		outline:
			"bg-transparent text-[var(--dy-info)] border border-[var(--dy-info)] hover:bg-[var(--dy-info-soft)]",
		ghost:
			"bg-transparent text-[var(--dy-info)] hover:bg-[var(--dy-info-soft)]",
	},
	green: {
		solid:
			"bg-[var(--dy-success)] text-[var(--dy-text-on-mint)] hover:bg-[var(--dy-success-hover)]",
		subtle:
			"bg-[var(--dy-success-soft)] text-[var(--dy-success)] hover:bg-[var(--dy-success-soft)]",
		outline:
			"bg-transparent text-[var(--dy-success)] border border-[var(--dy-success)] hover:bg-[var(--dy-success-soft)]",
		ghost:
			"bg-transparent text-[var(--dy-success)] hover:bg-[var(--dy-success-soft)]",
	},
	red: {
		solid:
			"bg-[var(--dy-danger)] text-[var(--dy-text-on-crimson)] hover:bg-[var(--dy-danger-hover)]",
		subtle:
			"bg-[var(--dy-danger-soft)] text-[var(--dy-danger)] hover:bg-[var(--dy-danger-subtle)]",
		outline:
			"bg-transparent text-[var(--dy-danger)] border border-[var(--dy-danger)] hover:bg-[var(--dy-danger-soft)]",
		ghost:
			"bg-transparent text-[var(--dy-danger)] hover:bg-[var(--dy-danger-soft)]",
	},
}

/** Historical theme names still emitted by older screens. */
const THEME_ALIAS = {
	orange: "gray",
	purple: "blue",
	subtle: "gray",
	amber: "red",
}

const SIZE = {
	xs: "h-6 px-2 text-xs gap-1 rounded-md",
	sm: "h-8 px-2.5 text-sm gap-1.5 rounded-md",
	md: "h-9 px-3 text-sm gap-2 rounded-lg",
	lg: "h-10 px-4 text-base gap-2 rounded-lg",
	xl: "h-12 px-5 text-lg gap-2.5 rounded-xl",
	"2xl": "h-14 px-6 text-xl gap-3 rounded-xl",
}

const ICON_SIZE = {
	xs: "h-3 w-3",
	sm: "h-4 w-4",
	md: "h-4 w-4",
	lg: "h-5 w-5",
	xl: "h-5 w-5",
	"2xl": "h-6 w-6",
}

const classes = computed(() => {
	const theme = THEME_ALIAS[props.theme] || props.theme
	const palette = PALETTE[theme] || PALETTE.gray
	const variant = palette[props.variant] || palette.subtle
	return [
		"inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium select-none transition-colors",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dy-ring)]",
		"disabled:pointer-events-none disabled:opacity-50",
		isIconOnly.value ? "aspect-square px-0" : "",
		variant,
		SIZE[props.size] || SIZE.sm,
	]
})

const iconClass = computed(() => [
	"inline-flex shrink-0 items-center",
	ICON_SIZE[props.size] || ICON_SIZE.sm,
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
