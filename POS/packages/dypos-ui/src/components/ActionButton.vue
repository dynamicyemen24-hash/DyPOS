<template>
  <button
    v-bind="$attrs"
    :type="props.type"
    :disabled="isDisabled"
    :aria-label="props.ariaLabel || label || undefined"
    :aria-describedby="props.ariaDescribedBy || undefined"
    :aria-busy="loading || undefined"
    :class="classes"
    @click="onClick"
  >
    <LoadingIndicator v-if="loading" :class="iconClass" />
    <span v-else-if="$slots.prefix || resolvedIconLeft" :class="iconClass">
      <slot name="prefix">
        <component
          :is="resolvedIconLeft"
          v-if="resolvedIconLeft && typeof resolvedIconLeft !== 'string'"
        />
        <FeatherIcon
          v-else-if="resolvedIconLeft"
          :name="resolvedIconLeft"
          aria-hidden="true"
        />
      </slot>
    </span>

    <span class="truncate" :class="{ 'sr-only': isIconOnly }">
      <template v-if="loading && loadingText">{{ loadingText }}</template>
      <slot v-else>{{ label }}</slot>
    </span>

    <span v-if="($slots.suffix || iconRight) && !loading" :class="iconClass">
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
	/**
	 * Semantic colour family.
	 *
	 * `brand` is the default, not `default`, and that choice is load-bearing.
	 * The three retired families disagreed about what an unset theme meant:
	 * `Button` painted neutral ink (`--dy-text`), `DyButton` painted the
	 * brand. A POS spends most of its time on brand-filled primary actions,
	 * so inheriting `default` here would have silently turned every primary
	 * button neutral — the unification would have looked like a cleanup and
	 * shipped as a visual regression. `BRAND_DEFAULT` below says it once and
	 * `tests/buttonUnification.test.js` pins it.
	 */
	theme: { type: String, default: "brand" },
	/** xs | sm | md | lg | xl | 2xl */
	size: { type: String, default: "md" },
	/** solid | subtle | outline | ghost | tertiary */
	variant: { type: String, default: "subtle" },
	/** Text shown when the default slot is empty. */
	label: { type: String, default: "" },
	/** Historical alias for `iconLeft` — resolved in `resolvedIconLeft`. */
	icon: { type: [String, Object], default: null },
	/** Icon rendered before the label. */
	iconLeft: { type: [String, Object], default: null },
	/** Icon rendered after the label. */
	iconRight: { type: [String, Object], default: null },
	/**
	 * Mirror the icon in RTL (arrows, back/forward chevrons).
	 * Text never mirrors — only opt directional glyphs into this.
	 */
	mirrorRtl: { type: Boolean, default: false },
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
	/** Renders the button full-width — the shape dialogs and toolbars need. */
	block: { type: Boolean, default: false },
	/** Explicit accessible name, for icon-only buttons that carry no text. */
	ariaLabel: { type: String, default: "" },
	/**
	 * Accessibility description (`aria-describedby` target).
	 *
	 * It is here because every screen that needed one was hand-rolling a raw
	 * `<button aria-describedby=…>` — the same escape hatch that produced 169
	 * unstyled raw buttons, minus even the focus ring.
	 */
	ariaDescribedBy: { type: String, default: "" },
})

const emit = defineEmits(["click"])
const slots = useSlots()
const router = useRouter()

const isDisabled = computed(() => props.disabled || props.loading)
/**
 * وضع الأيقونة فقط: لا نص في الشق الافتراضي ولا في `label`.
 * كان `icon` وحده يُخفي النص حتى مع وجود `label`، و`slots.icon`
 * لا يرسمه القالب أصلًا — فزر مُسمّى كان يُقرأ فارغًا لقارئ الشاشة.
 */
const isIconOnly = computed(() => !slots.default && !props.label)
/** `icon` اسم تاريخي لـ `iconLeft` — يُحسم هنا لا في كل قالب. */
const resolvedIconLeft = computed(() => props.iconLeft || props.icon)

// Carbon + Fluent token palettes using DyPOS design tokens
const CARBON = {
	/**
	 * `brand` is the primary colour theme — the one a POS spends most of its
	 * time on: "احفظ", "ادفع", "إرسال".
	 *
	 * It is separate from `default` (which paints with `--dy-text`, the
	 * neutral ink) because a till's primary action must never change hue when
	 * the operator switches accent. That was the point `DyButton`'s
	 * `variant="primary"` served, and losing it during unification would have
	 * made every primary action neutral.
	 */
	brand: {
		solid:
			"bg-[var(--dy-primary)] text-[var(--dy-text-on-primary)] hover:bg-[var(--dy-primary-hover)]",
		subtle:
			"bg-[var(--dy-primary-soft)] text-[var(--dy-primary)] hover:bg-[var(--dy-primary-subtle)]",
		outline:
			"bg-transparent text-[var(--dy-primary)] border border-[var(--dy-primary)] hover:bg-[var(--dy-primary-soft)]",
		ghost:
			"bg-transparent text-[var(--dy-primary)] hover:bg-[var(--dy-primary-soft)]",
		tertiary:
			"bg-transparent underline text-[var(--dy-primary)] hover:bg-[var(--dy-primary-soft)]",
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
		tertiary:
			"bg-transparent underline text-[var(--dy-danger)] hover:bg-[var(--dy-danger-soft)]",
	},
	green: {
		solid:
			"bg-[var(--dy-success)] text-[var(--dy-text-on-mint)] hover:bg-[var(--dy-success-hover)]",
		subtle:
			"bg-[var(--dy-success-soft)] text-[var(--dy-success)] hover:bg-[var(--dy-success-subtle)]",
		outline:
			"bg-transparent text-[var(--dy-success)] border border-[var(--dy-success)] hover:bg-[var(--dy-success-soft)]",
		ghost:
			"bg-transparent text-[var(--dy-success)] hover:bg-[var(--dy-success-soft)]",
		tertiary:
			"bg-transparent underline text-[var(--dy-success)] hover:bg-[var(--dy-success-soft)]",
	},
	yellow: {
		solid:
			"bg-[var(--dy-warning)] text-[var(--dy-text-on-warning)] hover:bg-[var(--dy-warning-hover)]",
		subtle:
			"bg-[var(--dy-warning-soft)] text-[var(--dy-warning)] hover:bg-[var(--dy-warning-subtle)]",
		outline:
			"bg-transparent text-[var(--dy-warning)] border border-[var(--dy-warning)] hover:bg-[var(--dy-warning-soft)]",
		ghost:
			"bg-transparent text-[var(--dy-warning)] hover:bg-[var(--dy-warning-soft)]",
		tertiary:
			"bg-transparent underline text-[var(--dy-warning)] hover:bg-[var(--dy-warning-soft)]",
	},
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
	// The three semantic themes `DyButton` expressed as `variant`
	// (danger/success/warning) now live here as themes, because that is what
	// they always were. Unifying the three button families is only honest if
	// the survivor can paint every colour the retired ones could — otherwise
	// "unify" means "delete a colour from the product".
	danger: "red",
	error: "red",
	positive: "green",
	caution: "yellow",
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
	const baseTheme = props.theme.replace(/^(carbon|fluent)-/, "")
	const carbonTheme = THEME_ALIAS[baseTheme] || baseTheme
	const themeMap = props.theme.startsWith("fluent-") ? FLUENT : CARBON

	const theme = carbonTheme in themeMap ? carbonTheme : "default"
	const palette = themeMap[theme] || CARBON.default

	const variant = props.variant || "subtle"
	const variantStyles = palette[variant] || palette.subtle

	return [
		"dy-action-btn inline-flex shrink-0 touch-manipulation items-center justify-center whitespace-nowrap font-medium select-none transition-colors active:scale-[0.98] [-webkit-tap-highlight-color:transparent]",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dy-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dy-surface)]",
		"disabled:pointer-events-none disabled:opacity-50",
		props.block ? "w-full" : "",
		isIconOnly.value ? "dy-action-btn-icononly aspect-square px-0" : "",
		variantStyles,
		SIZE[props.size] || SIZE.md,
	]
})

const iconClass = computed(() => [
	"inline-flex shrink-0 items-center",
	// A spinner is symmetric, so mirroring it is a no-op by construction.
	props.mirrorRtl ? "rtl:-scale-x-100" : "",
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