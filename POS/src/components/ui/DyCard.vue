<script setup>
import { computed } from "vue"

const props = defineProps({
	/** Visual variant */
	variant: {
		type: String,
		default: "default",
		validator: (v) => ["default", "outlined", "elevated", "filled"].includes(v),
	},
	/** Interactive card (clickable/hoverable) */
	interactive: { type: Boolean, default: false },
	/** Accent border (left in LTR, right in RTL) */
	accent: { type: Boolean, default: false },
	/** Accent color variant */
	accentColor: {
		type: String,
		default: "primary",
		validator: (v) =>
			["primary", "success", "warning", "danger", "info"].includes(v),
	},
	/** Padding size */
	padding: {
		type: String,
		default: "md",
		validator: (v) => ["none", "sm", "md", "lg"].includes(v),
	},
	/** Hover elevation */
	hoverable: { type: Boolean, default: false },
	/** Render as element */
	as: { type: String, default: "div" },
	/** ARIA role */
	role: { type: String, default: "region" },
	/** ARIA label */
	ariaLabel: { type: String, default: "" },
	/** ARIA describedby */
	ariaDescribedBy: { type: String, default: "" },
})

const classes = computed(() => [
	"dy-card",
	`dy-card--${props.variant}`,
	`dy-card--padding-${props.padding}`,
	{ "dy-card--interactive": props.interactive },
	{ "dy-card--accent": props.accent },
	{ [`dy-card--accent-${props.accentColor}`]: props.accent },
	{ "dy-card--hoverable": props.hoverable && props.interactive },
])

const cardAttrs = computed(() => ({
	role: props.interactive ? "button" : props.role,
	tabindex: props.interactive ? 0 : undefined,
	"aria-label": props.ariaLabel || undefined,
	"aria-describedby": props.ariaDescribedBy || undefined,
}))
</script>

<template>
  <component
    :is="as"
    :class="classes"
    v-bind="cardAttrs"
  >
    <header v-if="$slots.header" class="dy-card__header">
      <slot name="header" />
    </header>

    <div v-if="$slots.default" class="dy-card__body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="dy-card__footer">
      <slot name="footer" />
    </footer>
  </component>
</template>

<style scoped>
/* ============================================================================
   DyCard — Upgraded with Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

/* Base */
.dy-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--dy-radius-xl, 12px);
  background: var(--dy-color-surface-base, #ffffff);
  color: var(--dy-color-text-primary, #0f172a);

  /* Container queries ready */
  container-type: inline-size;
}

/* Variants */
.dy-card--default {
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  box-shadow: var(--dy-elevation-1, 0 1px 2px 0 rgba(15, 23, 42, 0.05));
}

.dy-card--outlined {
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border-strong, #cbd5e1);
  box-shadow: none;
}

.dy-card--elevated {
  border: none;
  box-shadow: var(--dy-elevation-3, 0 4px 6px -1px rgba(15, 23, 42, 0.1), 0 2px 4px -2px rgba(15, 23, 42, 0.1));
}

.dy-card--filled {
  border: none;
  background: var(--dy-color-surface-overlay, #f8fafc);
  box-shadow: var(--dy-elevation-1, 0 1px 2px 0 rgba(15, 23, 42, 0.05));
}

/* Padding */
.dy-card--padding-none { padding: 0; }
.dy-card--padding-sm { padding: var(--dy-spacing-3, 12px); }
.dy-card--padding-md { padding: var(--dy-spacing-6, 24px); }
.dy-card--padding-lg { padding: var(--dy-spacing-8, 32px); }

/* Accent border (logical property for RTL) */
.dy-card--accent {
  border-inline-start-width: 4px;
  border-inline-start-style: solid;
}
.dy-card--accent-primary { border-inline-start-color: var(--dy-color-brand-500, #10b981); }
.dy-card--accent-success { border-inline-start-color: var(--dy-color-status-success-icon, #10b981); }
.dy-card--accent-warning { border-inline-start-color: var(--dy-color-status-warning-icon, #f59e0b); }
.dy-card--accent-danger { border-inline-start-color: var(--dy-color-status-danger-icon, #ef4444); }
.dy-card--accent-info { border-inline-start-color: var(--dy-color-status-info-icon, #3b82f6); }

/* Interactive */
.dy-card--interactive {
  cursor: pointer;
  transition:
    box-shadow var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out),
    transform var(--dy-motion-duration-fast, 100ms) var(--dy-motion-easing-ease-out, ease-out),
    border-color var(--dy-motion-duration-fast, 100ms) var(--dy-motion-easing-ease-out, ease-out);
}
.dy-card--interactive:hover {
  box-shadow: var(--dy-elevation-4, 0 10px 15px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -4px rgba(15, 23, 42, 0.1));
  transform: translateY(-2px);
}
.dy-card--interactive:active {
  transform: translateY(0);
  transition-duration: 50ms;
}
.dy-card--interactive:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff),
    var(--dy-elevation-4, 0 10px 15px -3px rgba(15, 23, 42, 0.1));
}

/* Hoverable (subtle, for lists) */
.dy-card--hoverable:hover {
  box-shadow: var(--dy-elevation-2, 0 1px 3px 0 rgba(15, 23, 42, 0.1), 0 1px 2px -1px rgba(15, 23, 42, 0.1));
}

/* Sections */
.dy-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dy-spacing-4, 16px);
  padding-bottom: var(--dy-spacing-4, 16px);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  margin-bottom: calc(var(--dy-spacing-4, 16px) * -1);
}
.dy-card--padding-none .dy-card__header {
  margin-bottom: 0;
  border-bottom: none;
}

.dy-card__body {
  flex: 1;
  min-width: 0;
}

.dy-card__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--dy-spacing-3, 12px);
  padding-top: var(--dy-spacing-4, 16px);
  border-top: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  margin-top: calc(var(--dy-spacing-4, 16px) * -1);
}
.dy-card--padding-none .dy-card__footer {
  margin-top: 0;
  border-top: none;
}

/* ============================================================================
   Reduced Motion
   ============================================================================ */
@media (prefers-reduced-motion: reduce) {
  .dy-card--interactive,
  .dy-card--hoverable {
    transition: none;
  }
}

/* ============================================================================
   High Contrast / Forced Colors
   ============================================================================ */
@media (forced-colors: active) {
  .dy-card {
    border-width: 2px;
    border-color: CanvasText;
  }
  .dy-card--filled {
    background: Canvas;
  }
  .dy-card--interactive:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
}

/* ============================================================================
   Print
   ============================================================================ */
@media print {
  .dy-card {
    break-inside: avoid;
    box-shadow: none !important;
    border-color: #000 !important;
  }
  .dy-card--filled {
    background: #fff !important;
  }
}

/* ============================================================================
   Container Queries (for responsive internal layouts)
   ============================================================================ */
@container (max-width: 400px) {
  .dy-card--padding-md { padding: var(--dy-spacing-4, 16px); }
  .dy-card--padding-lg { padding: var(--dy-spacing-6, 24px); }
}
@container (max-width: 300px) {
  .dy-card--padding-md { padding: var(--dy-spacing-3, 12px); }
  .dy-card__header { flex-direction: column; align-items: flex-start; }
}
</style>