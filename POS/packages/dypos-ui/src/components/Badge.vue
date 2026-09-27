<template>
  <div
    class="inline-flex select-none items-center gap-1 whitespace-nowrap rounded-full font-medium"
    :class="classes"
  >
    <span v-if="$slots.prefix" :class="slotClass">
      <slot name="prefix" />
    </span>
    <slot>{{ label }}</slot>
    <span v-if="$slots.suffix" :class="slotClass">
      <slot name="suffix" />
    </span>
  </div>
</template>

<script setup>
/**
 * DyPOS Badge — compact status pill.
 *
 * Themes are resolved against the DyPOS design tokens so badges follow the
 * runtime accent/theme switch (light ⇄ dark) with no extra CSS. `subtle`,
 * `amber` and `purple` are accepted as aliases because older screens pass them.
 */
import { computed } from "vue"

const props = defineProps({
	/** Semantic colour family. */
	theme: { type: String, default: "gray" },
	/** sm | md | lg | xl */
	size: { type: String, default: "md" },
	/** subtle | solid | outline | ghost */
	variant: { type: String, default: "subtle" },
	/** Text shown when no default slot is provided. */
	label: { type: [String, Number], default: "" },
})

const PALETTE = {
	gray: {
		subtle: "bg-[var(--dy-bg-sunken)] text-[var(--dy-text-secondary)]",
		solid: "bg-[var(--dy-text)] text-[var(--dy-surface)]",
		outline:
			"bg-transparent text-[var(--dy-text-secondary)] border border-[var(--dy-border-strong)]",
		ghost: "bg-transparent text-[var(--dy-text-secondary)]",
	},
	blue: {
		subtle: "bg-[var(--dy-info-soft)] text-[var(--dy-info)]",
		solid: "bg-[var(--dy-info)] text-[var(--dy-text-on-info)]",
		outline:
			"bg-transparent text-[var(--dy-info)] border border-[var(--dy-info)]",
		ghost: "bg-transparent text-[var(--dy-info)]",
	},
	green: {
		subtle: "bg-[var(--dy-success-soft)] text-[var(--dy-success)]",
		solid: "bg-[var(--dy-success)] text-[var(--dy-text-on-mint)]",
		outline:
			"bg-transparent text-[var(--dy-success)] border border-[var(--dy-success)]",
		ghost: "bg-transparent text-[var(--dy-success)]",
	},
	red: {
		subtle: "bg-[var(--dy-danger-soft)] text-[var(--dy-danger)]",
		solid: "bg-[var(--dy-danger)] text-[var(--dy-text-on-crimson)]",
		outline:
			"bg-transparent text-[var(--dy-danger)] border border-[var(--dy-danger)]",
		ghost: "bg-transparent text-[var(--dy-danger)]",
	},
	orange: {
		subtle: "bg-[var(--dy-warning-soft)] text-[var(--dy-warning)]",
		solid: "bg-[var(--dy-warning)] text-[var(--dy-text-on-warning)]",
		outline:
			"bg-transparent text-[var(--dy-warning)] border border-[var(--dy-warning)]",
		ghost: "bg-transparent text-[var(--dy-warning)]",
	},
	purple: {
		subtle: "bg-[var(--dy-accent-soft)] text-[var(--dy-accent)]",
		solid: "bg-[var(--dy-accent)] text-[var(--dy-accent-foreground)]",
		outline:
			"bg-transparent text-[var(--dy-accent)] border border-[var(--dy-accent)]",
		ghost: "bg-transparent text-[var(--dy-accent)]",
	},
}

/** `amber`/`subtle` are historical aliases for `orange`/`gray`. */
const THEME_ALIAS = { amber: "orange", orange: "orange", subtle: "gray" }

const SIZE_CLASS = {
	xs: "h-4 px-1.5 text-[10px]",
	sm: "h-4 px-1.5 text-xs",
	md: "h-5 px-2 text-xs",
	lg: "h-6 px-2.5 text-sm",
	xl: "h-7 px-3 text-base",
}

const classes = computed(() => {
	const theme = THEME_ALIAS[props.theme] || props.theme
	const palette = PALETTE[theme] || PALETTE.gray
	const variant = palette[props.variant] || palette.subtle
	return [variant, SIZE_CLASS[props.size] || SIZE_CLASS.md]
})

const slotClass = computed(() =>
	props.size === "lg" || props.size === "xl" ? "max-h-6" : "max-h-4",
)
</script>
