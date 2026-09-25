<script setup>
import { computed } from "vue"

const props = defineProps({
	/** Visual variant */
	variant: {
		type: String,
		default: "neutral",
		validator: (v) =>
			[
				"neutral",
				"primary",
				"success",
				"danger",
				"warning",
				"info",
				"brand",
			].includes(v),
	},
	/** Size */
	size: {
		type: String,
		default: "md",
		validator: (v) => ["sm", "md", "lg"].includes(v),
	},
	/** Live region (announces changes to screen readers) */
	live: { type: Boolean, default: false },
	/** Dot indicator */
	dot: { type: Boolean, default: false },
	/** Dot color variant */
	dotColor: {
		type: String,
		default: "default",
		validator: (v) =>
			["default", "success", "warning", "danger", "info"].includes(v),
	},
	/** Removable badge */
	removable: { type: Boolean, default: false },
	/** Label (if no slot) */
	label: { type: String, default: "" },
	/** ARIA label */
	ariaLabel: { type: String, default: "" },
})

const emit = defineEmits(["remove"])

const classes = computed(() => [
	"dy-badge",
	`dy-badge--${props.variant}`,
	`dy-badge--${props.size}`,
	{ "dy-badge--dot": props.dot },
	{ "dy-badge--removable": props.removable },
])

const badgeAttrs = computed(() => ({
	role: props.live ? "status" : undefined,
	"aria-live": props.live ? "polite" : undefined,
	"aria-atomic": props.live ? "true" : undefined,
	"aria-label": props.ariaLabel || undefined,
}))

function handleRemove(e) {
	e.stopPropagation()
	emit("remove")
}
</script>

<template>
  <span
    :class="classes"
    v-bind="badgeAttrs"
  >
    <!-- Dot indicator -->
    <span
      v-if="dot"
      class="dy-badge__dot"
      :class="`dy-badge__dot--${dotColor}`"
      aria-hidden="true"
    />

    <!-- Label -->
    <span class="dy-badge__label">
      <slot>{{ label }}</slot>
    </span>

    <!-- Remove button -->
    <button
      v-if="removable"
      type="button"
      class="dy-badge__remove"
      @click="handleRemove"
      :aria-label="`Remove ${label || 'badge'}`"
    >
      <svg
        class="dy-badge__remove-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </span>
</template>

<style scoped>
/* ============================================================================
   DyBadge — Upgraded with Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

/* Base */
.dy-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-1, 4px);
  border-radius: var(--dy-radius-full, 9999px);
  font-family: var(--dy-font-family-sans, inherit);
  font-weight: var(--dy-font-weight-medium, 500);
  line-height: 1;
  white-space: nowrap;
  vertical-align: middle;
}

/* Sizes */
.dy-badge--sm {
  padding: 2px var(--dy-spacing-2, 8px);
  font-size: var(--dy-typography-font-size-xs-max, 0.75rem);
  height: 20px;
  min-height: 20px;
}
.dy-badge--md {
  padding: 2px var(--dy-spacing-3, 12px);
  font-size: var(--dy-typography-font-size-sm-max, 0.875rem);
  height: 24px;
  min-height: 24px;
}
.dy-badge--lg {
  padding: 4px var(--dy-spacing-4, 16px);
  font-size: var(--dy-typography-font-size-base-max, 1rem);
  height: 28px;
  min-height: 28px;
}

/* Variants (using semantic status colors) */
.dy-badge--neutral {
  background: var(--dy-color-surface-sunken, #f1f5f9);
  color: var(--dy-color-text-secondary, #334155);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}
.dy-badge--primary {
  background: var(--dy-color-status-info-weak, #dbeafe);
  color: var(--dy-color-status-info-text, #1e40af);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-status-info-border, #bfdbfe);
}
.dy-badge--brand {
  background: var(--dy-color-brand-100, #d1fae5);
  color: var(--dy-color-brand-800, #065f46);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-brand-200, #a7f3d0);
}
.dy-badge--success {
  background: var(--dy-color-status-success-weak, #dcfce7);
  color: var(--dy-color-status-success-text, #166534);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-status-success-border, #bbf7d0);
}
.dy-badge--danger {
  background: var(--dy-color-status-danger-weak, #fee2e2);
  color: var(--dy-color-status-danger-text, #991b1b);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-status-danger-border, #fecaca);
}
.dy-badge--warning {
  background: var(--dy-color-status-warning-weak, #fef3c7);
  color: var(--dy-color-status-warning-text, #92400e);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-status-warning-border, #fde68a);
}
.dy-badge--info {
  background: var(--dy-color-status-info-weak, #dbeafe);
  color: var(--dy-color-status-info-text, #1e40af);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-status-info-border, #bfdbfe);
}

/* Dot indicator */
.dy-badge__dot {
  display: inline-flex;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dy-badge__dot--default { background: currentColor; opacity: 0.6; }
.dy-badge__dot--success { background: var(--dy-color-status-success-icon, #10b981); }
.dy-badge__dot--warning { background: var(--dy-color-status-warning-icon, #f59e0b); }
.dy-badge__dot--danger { background: var(--dy-color-status-danger-icon, #ef4444); }
.dy-badge__dot--info { background: var(--dy-color-status-info-icon, #3b82f6); }

/* Label */
.dy-badge__label {
  display: inline-flex;
  align-items: center;
}

/* Removable */
.dy-badge--removable {
  padding-inline-end: var(--dy-spacing-1, 4px);
}
.dy-badge__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  margin-inline-start: var(--dy-spacing-1, 4px);
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  transition: opacity var(--dy-motion-duration-fast, 100ms), background-color var(--dy-motion-duration-fast, 100ms);
}
.dy-badge__remove:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.1);
}
.dy-badge__remove:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
  border-radius: 50%;
}
.dy-badge__remove-icon {
  width: 100%;
  height: 100%;
  stroke-width: 2.5;
}

/* RTL: dot position handled by flex direction */
:dir(rtl) .dy-badge {
  /* Flex handles RTL automatically */
}

/* ============================================================================
   Reduced Motion
   ============================================================================ */
@media (prefers-reduced-motion: reduce) {
  .dy-badge__remove { transition: none; }
}

/* ============================================================================
   High Contrast / Forced Colors
   ============================================================================ */
@media (forced-colors: active) {
  .dy-badge {
    border-width: 2px;
    border-color: CanvasText;
    background: Canvas;
  }
  .dy-badge--primary,
  .dy-badge--brand,
  .dy-badge--success,
  .dy-badge--danger,
  .dy-badge--warning,
  .dy-badge--info {
    color: CanvasText;
    border-color: CanvasText;
  }
  .dy-badge__remove:focus-visible {
    outline-color: Highlight;
  }
}

/* ============================================================================
   Print
   ============================================================================ */
@media print {
  .dy-badge {
    background: none !important;
    color: #000 !important;
    border-color: #000 !important;
    box-shadow: none !important;
  }
  .dy-badge__dot {
    background: #000 !important;
  }
}
</style>