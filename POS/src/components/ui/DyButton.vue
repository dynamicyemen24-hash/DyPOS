<script setup>
import { computed } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"

const props = defineProps({
	/** Visual style variant */
	variant: {
		type: String,
		default: "primary",
		validator: (v) =>
			[
				"primary",
				"secondary",
				"ghost",
				"danger",
				"success",
				"warning",
				"outline",
			].includes(v),
	},
	/** Size variant */
	size: {
		type: String,
		default: "md",
		validator: (v) => ["sm", "md", "lg"].includes(v),
	},
	/** Icon name (Feather Icons) */
	icon: { type: String, default: null },
	/** Icon position relative to label */
	iconPosition: {
		type: String,
		default: "start",
		validator: (v) => ["start", "end"].includes(v),
	},
	/** Loading state */
	loading: { type: Boolean, default: false },
	/** Disabled state */
	disabled: { type: Boolean, default: false },
	/** Touch ripple effect (mobile) */
	touch: { type: Boolean, default: false },
	/** Native button type */
	type: { type: String, default: "button" },
	/** Render as anchor link */
	href: { type: String, default: null },
	/** Aria label (overrides label/slot for screen readers) */
	ariaLabel: { type: String, default: "" },
	/** Additional aria-describedby */
	ariaDescribedBy: { type: String, default: "" },
	/** Explicit label (used if no slot) */
	label: { type: String, default: "" },
	/** Full width */
	block: { type: Boolean, default: false },
})

const emit = defineEmits(["click"])

const isLink = computed(() => !!props.href)

const classes = computed(() => [
	"dy-btn",
	`dy-btn--${props.variant}`,
	`dy-btn--${props.size}`,
	{ "dy-btn--block": props.block },
	{ "dy-btn--loading": props.loading },
	{ "dy-btn--disabled": props.disabled || props.loading },
	{ "dy-btn--touch": props.touch },
])

const buttonAttrs = computed(() => ({
	type: isLink.value ? undefined : props.type,
	disabled: !isLink.value && (props.disabled || props.loading),
	href: isLink.value ? props.href : undefined,
	target: isLink.value ? "_blank" : undefined,
	rel: isLink.value ? "noopener noreferrer" : undefined,
	"aria-busy": props.loading,
	"aria-disabled": props.disabled || props.loading,
	"aria-label": props.ariaLabel || undefined,
	"aria-describedby": props.ariaDescribedBy || undefined,
	tabindex: props.disabled ? -1 : undefined,
}))

function handleClick(e) {
	if (props.disabled || props.loading) {
		e.preventDefault()
		e.stopPropagation()
		return
	}
	emit("click", e)
}

function handleKeydown(e) {
	// Space/Enter activation for links (native button handles this)
	if (isLink.value && (e.key === " " || e.key === "Enter")) {
		e.preventDefault()
		handleClick(e)
	}
}
</script>

<template>
  <component
    :is="isLink ? 'a' : 'button'"
    v-bind="buttonAttrs"
    :class="classes"
    @click="handleClick"
    @keydown="handleKeydown"
  >
    <!-- Loading spinner -->
    <span
      v-if="loading"
      class="dy-btn__spinner"
      aria-hidden="true"
      role="status"
    >
      <svg
        class="dy-btn__spinner-svg"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          class="dy-btn__spinner-circle"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
        />
      </svg>
      <span class="sr-only">{{ t("loading") }}</span>
    </span>

    <!-- Start icon -->
    <FeatherIcon
      v-else-if="icon && iconPosition === 'start'"
      :name="icon"
      class="dy-btn__icon"
      :stroke-width="2"
      aria-hidden="true"
    />

    <!-- Label -->
    <span v-if="$slots.default || label" class="dy-btn__label">
      <slot>{{ label }}</slot>
    </span>

    <!-- End icon -->
    <FeatherIcon
      v-if="icon && iconPosition === 'end'"
      :name="icon"
      class="dy-btn__icon"
      :stroke-width="2"
      aria-hidden="true"
    />
  </component>
</template>

<style scoped>
/* ============================================================================
   DyButton — Upgraded with Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

/* Base */
.dy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--dy-spacing-2, 8px);

  border: var(--dy-border-width-thin, 1px) solid transparent;
  border-radius: var(--dy-radius-lg, 8px);

  font-family: var(--dy-font-family-sans, inherit);
  font-weight: var(--dy-font-weight-semibold, 600);
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  user-select: none;

  cursor: pointer;
  transition:
    background-color var(--dy-motion-duration-fast, 100ms) var(--dy-motion-easing-ease-out, ease-out),
    color var(--dy-motion-duration-fast, 100ms) var(--dy-motion-easing-ease-out, ease-out),
    border-color var(--dy-motion-duration-fast, 100ms) var(--dy-motion-easing-ease-out, ease-out),
    box-shadow var(--dy-motion-duration-fast, 100ms) var(--dy-motion-easing-ease-out, ease-out),
    transform var(--dy-motion-duration-fast, 100ms) var(--dy-motion-easing-ease-out, ease-out);
}

/* Focus visible (WCAG 2.4.7) */
.dy-btn:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

/* Disabled */
.dy-btn--disabled,
.dy-btn[disabled],
.dy-btn[aria-disabled="true"] {
  opacity: 0.6;
  cursor: not-allowed;
  pointer-events: none;
}

/* Touch ripple */
.dy-btn--touch {
  position: relative;
  overflow: hidden;
}
.dy-btn--touch::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  background: currentColor;
  transform: scale(0);
  transition: transform 0.3s ease, opacity 0.1s ease;
}
.dy-btn--touch:active::after {
  opacity: 0.12;
  transform: scale(2.5);
  transition: transform 0s, opacity 0s;
}

/* Loading state */
.dy-btn--loading {
  color: transparent !important;
  pointer-events: none;
}
.dy-btn__spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  animation: dy-btn-spin 1s linear infinite;
}
.dy-btn__spinner-svg {
  width: 100%;
  height: 100%;
}
.dy-btn__spinner-circle {
  stroke-dasharray: 60;
  stroke-dashoffset: 20;
  animation: dy-btn-spin-dash 1.5s ease-in-out infinite;
}
@keyframes dy-btn-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes dy-btn-spin-dash {
  0% { stroke-dashoffset: 20; stroke-dasharray: 60; }
  50% { stroke-dashoffset: 40; stroke-dasharray: 20; }
  100% { stroke-dashoffset: 20; stroke-dasharray: 60; }
}

/* Icon */
.dy-btn__icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 1em;
  height: 1em;
  color: inherit;
}

/* Label */
.dy-btn__label {
  display: inline-flex;
  align-items: center;
}

/* ============================================================================
   Sizes (using design tokens)
   ============================================================================ */
.dy-btn--sm {
  height: var(--dy-components-button-height-sm, 32px);
  padding: 0 var(--dy-components-button-padding-sm, 12px);
  font-size: var(--dy-typography-font-size-xs-max, 0.75rem);
  min-width: 32px;
}

.dy-btn--md {
  height: var(--dy-components-button-height-md, 40px);
  padding: 0 var(--dy-components-button-padding-md, 16px);
  font-size: var(--dy-typography-font-size-sm-max, 0.875rem);
  min-width: 40px;
}

.dy-btn--lg {
  height: var(--dy-components-button-height-lg, 48px);
  padding: 0 var(--dy-components-button-padding-lg, 24px);
  font-size: var(--dy-typography-font-size-base-max, 1rem);
  min-width: 48px;
}

/* Block width */
.dy-btn--block {
  width: 100%;
}

/* ============================================================================
   Variants (Semantic colors from design tokens)
   ============================================================================ */

/* Primary — Brand action */
.dy-btn--primary {
  background: var(--dy-color-interactive-primary-bg, #059669);
  color: var(--dy-color-interactive-primary-text, #ffffff);
  border-color: var(--dy-color-interactive-primary-bg, #059669);
}
.dy-btn--primary:hover:not(.dy-btn--disabled) {
  background: var(--dy-color-interactive-primary-bg-hover, #047857);
  border-color: var(--dy-color-interactive-primary-bg-hover, #047857);
}
.dy-btn--primary:active:not(.dy-btn--disabled) {
  background: var(--dy-color-interactive-primary-bg-active, #065f46);
}
.dy-btn--primary.dy-btn--disabled {
  background: var(--dy-color-interactive-primary-bg-disabled, #a7f3d0);
  border-color: var(--dy-color-interactive-primary-bg-disabled, #a7f3d0);
}

/* Secondary — Alternative action */
.dy-btn--secondary {
  background: var(--dy-color-interactive-secondary-bg, transparent);
  color: var(--dy-color-interactive-secondary-text, #334155);
  border-color: var(--dy-color-interactive-secondary-border, #e2e8f0);
}
.dy-btn--secondary:hover:not(.dy-btn--disabled) {
  background: var(--dy-color-interactive-secondary-bg-hover, #f1f5f9);
  border-color: var(--dy-color-interactive-secondary-border-hover, #059669);
  color: var(--dy-color-interactive-secondary-border-hover, #059669);
}
.dy-btn--secondary:active:not(.dy-btn--disabled) {
  background: var(--dy-color-interactive-secondary-bg-active, #e2e8f0);
}

/* Ghost — Subtle action */
.dy-btn--ghost {
  background: var(--dy-color-interactive-ghost-bg, transparent);
  color: var(--dy-color-interactive-ghost-text, #334155);
  border-color: transparent;
}
.dy-btn--ghost:hover:not(.dy-btn--disabled) {
  background: var(--dy-color-interactive-ghost-bg-hover, #f1f5f9);
}
.dy-btn--ghost:active:not(.dy-btn--disabled) {
  background: var(--dy-color-interactive-ghost-bg-active, #e2e8f0);
}

/* Danger — Destructive action */
.dy-btn--danger {
  background: var(--dy-color-interactive-danger-bg, #ef4444);
  color: var(--dy-color-interactive-danger-text, #ffffff);
  border-color: var(--dy-color-interactive-danger-bg, #ef4444);
}
.dy-btn--danger:hover:not(.dy-btn--disabled) {
  background: var(--dy-color-interactive-danger-bg-hover, #dc2626);
  border-color: var(--dy-color-interactive-danger-bg-hover, #dc2626);
}
.dy-btn--danger:active:not(.dy-btn--disabled) {
  background: var(--dy-color-interactive-danger-bg-active, #b91c1c);
}
.dy-btn--danger.dy-btn--disabled {
  background: var(--dy-color-interactive-danger-bg-disabled, #fca5a5);
  border-color: var(--dy-color-interactive-danger-bg-disabled, #fca5a5);
}

/* Success — Positive action */
.dy-btn--success {
  background: var(--dy-color-status-success-icon, #10b981);
  color: #ffffff;
  border-color: var(--dy-color-status-success-icon, #10b981);
}
.dy-btn--success:hover:not(.dy-btn--disabled) {
  background: var(--dy-color-brand-600, #059669);
  border-color: var(--dy-color-brand-600, #059669);
}

/* Warning — Caution action */
.dy-btn--warning {
  background: var(--dy-color-status-warning-icon, #f59e0b);
  color: #ffffff;
  border-color: var(--dy-color-status-warning-icon, #f59e0b);
}
.dy-btn--warning:hover:not(.dy-btn--disabled) {
  background: #d97706;
  border-color: #d97706;
}

/* Outline — Bordered alternative */
.dy-btn--outline {
  background: transparent;
  color: var(--dy-color-interactive-primary-bg, #059669);
  border-color: var(--dy-color-interactive-primary-bg, #059669);
}
.dy-btn--outline:hover:not(.dy-btn--disabled) {
  background: var(--dy-color-interactive-primary-bg, #059669);
  color: var(--dy-color-interactive-primary-text, #ffffff);
}

/* ============================================================================
   RTL Support (Logical properties handled by browser, explicit for icons)
   ============================================================================ */
:dir(rtl) .dy-btn {
  /* Flex direction is handled by browser for inline-flex */
}
:dir(rtl) .dy-btn__icon {
  /* Icons don't flip automatically, but Feather icons are symmetrical */
}

/* ============================================================================
   Reduced Motion
   ============================================================================ */
@media (prefers-reduced-motion: reduce) {
  .dy-btn {
    transition: none;
  }
  .dy-btn--touch::after {
    transition: none;
  }
  .dy-btn__spinner {
    animation: none;
  }
  .dy-btn__spinner-circle {
    animation: none;
  }
}

/* ============================================================================
   High Contrast / Forced Colors
   ============================================================================ */
@media (forced-colors: active) {
  .dy-btn {
    border-width: 2px;
  }
  .dy-btn--primary,
  .dy-btn--danger,
  .dy-btn--success,
  .dy-btn--warning {
    border-color: currentColor;
  }
  .dy-btn--ghost {
    border-color: transparent;
  }
  .dy-btn--ghost:hover {
    background: ButtonFace;
  }
}

/* ============================================================================
   Print
   ============================================================================ */
@media print {
  .dy-btn {
    background: none !important;
    color: #000 !important;
    border-color: #000 !important;
    box-shadow: none !important;
  }
  .dy-btn--ghost {
    border-color: transparent !important;
  }
}
</style>