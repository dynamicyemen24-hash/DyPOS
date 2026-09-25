/**
 * WorkErrorState — حالة الخطأ الموحدة (WCAG 2.2 AA).
 *
 * Features:
 *  - Role="alert" for immediate screen reader announcement
 *  - Retry action with keyboard support
 *  - Details toggle for technical info
 *  - RTL-aware icons and layout
 *  - Reduced motion support
 */
<template>
  <div
    class="work-error-state"
    :class="`work-error-state--${variant}`"
    role="alert"
    :aria-label="t('errorOccurred')"
  >
    <div class="work-error-state__content">
      <!-- Icon -->
      <div class="work-error-state__icon" aria-hidden="true">
        <FeatherIcon :name="iconName" :class="iconSize" />
      </div>

      <!-- Message -->
      <div class="work-error-state__message">
        <h3 class="work-error-state__title">{{ t(title) }}</h3>
        <p v-if="message" class="work-error-state__description">{{ t(message) }}</p>
      </div>

      <!-- Details (dev only) -->
      <details
        v-if="details && showDetails"
        class="work-error-state__details"
      >
        <summary class="work-error-state__summary">
          {{ t('technicalDetails') }}
        </summary>
        <pre class="work-error-state__pre">{{ details }}</pre>
      </details>

      <!-- Actions -->
      <div class="work-error-state__actions">
        <DyButton
          v-if="showRetry"
          variant="primary"
          :loading="retryLoading"
          :disabled="retryLoading"
          @click="handleRetry"
          :aria-label="t('retry')"
        >
          <template #prefix>
            <FeatherIcon name="refresh-cw" class="w-4 h-4" aria-hidden="true" />
          </template>
          {{ t('retry') }}
        </DyButton>

        <DyButton
          v-if="showGoHome"
          variant="ghost"
          @click="handleGoHome"
          :aria-label="t('goHome')"
        >
          {{ t('goHome') }}
        </DyButton>

        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import DyButton from "@/components/ui/DyButton.vue"

const props = defineProps({
	/** Error title */
	title: { type: String, default: "errorLoadingContent" },
	/** Error message */
	message: { type: String, default: "" },
	/** Technical details (shown in details) */
	details: { type: String, default: "" },
	/** Visual variant */
	variant: {
		type: String,
		default: "danger",
		validator: (v) => ["danger", "warning", "info"].includes(v),
	},
	/** Icon size */
	iconSize: { type: String, default: "w-10 h-10" },
	/** Show retry button */
	showRetry: { type: Boolean, default: true },
	/** Show go home button */
	showGoHome: { type: Boolean, default: false },
	/** Retry loading state */
	retryLoading: { type: Boolean, default: false },
	/** Show technical details (dev mode) */
	showDetails: { type: Boolean, default: false },
})

const emit = defineEmits(["retry", "go-home"])

const iconName = computed(() => {
	switch (props.variant) {
		case "warning":
			return "alert-triangle"
		case "info":
			return "info"
		default:
			return "alert-circle"
	}
})

function handleRetry() {
	emit("retry")
}

function handleGoHome() {
	emit("go-home")
}
</script>

<style scoped>
/* ============================================================================
   WorkErrorState — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-error-state {
  display: flex;
  justify-content: center;
  padding: var(--dy-spacing-10, 40px) var(--dy-spacing-4, 16px);
}

.work-error-state__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--dy-spacing-4, 16px);
  max-width: 480px;
  width: 100%;
}

/* Icon */
.work-error-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--dy-radius-full, 9999px);
  flex-shrink: 0;
}
.work-error-state--danger .work-error-state__icon {
  background: var(--dy-color-status-danger-weak, #fee2e2);
  color: var(--dy-color-status-danger-icon, #ef4444);
}
.work-error-state--warning .work-error-state__icon {
  background: var(--dy-color-status-warning-weak, #fef3c7);
  color: var(--dy-color-status-warning-icon, #f59e0b);
}
.work-error-state--info .work-error-state__icon {
  background: var(--dy-color-status-info-weak, #dbeafe);
  color: var(--dy-color-status-info-icon, #3b82f6);
}

/* Message */
.work-error-state__title {
  margin: 0;
  font-size: var(--dy-typography-font-size-xl-min, 1.25rem);
  font-weight: var(--dy-font-weight-bold, 700);
  color: var(--dy-color-text-primary, #0f172a);
  line-height: var(--dy-typography-lineHeight-tight, 1.25);
}

.work-error-state__description {
  margin: var(--dy-spacing-2, 8px) 0 0;
  font-size: var(--dy-typography-font-size-base-min, 1rem);
  color: var(--dy-color-text-secondary, #334155);
  line-height: var(--dy-typography-lineHeight-normal, 1.6);
}

/* Details */
.work-error-state__details {
  width: 100%;
  margin-top: var(--dy-spacing-4, 16px);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
  overflow: hidden;
  text-align: start;
}

.work-error-state__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
  background: var(--dy-color-surface-overlay, #f8fafc);
  border: none;
  cursor: pointer;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-medium, 500);
  color: var(--dy-color-text-muted, #64748b);
  list-style: none;
}
.work-error-state__summary::-webkit-details-marker { display: none; }
.work-error-state__summary::marker { display: none; }
.work-error-state__summary:focus-visible {
  outline: none;
  box-shadow:
    inset 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}

.work-error-state__pre {
  margin: 0;
  padding: var(--dy-spacing-4, 16px);
  font-family: var(--dy-font-family-mono, monospace);
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
  line-height: var(--dy-typography-lineHeight-normal, 1.6);
  color: var(--dy-color-text-secondary, #334155);
  background: var(--dy-color-surface-base, #ffffff);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Actions */
.work-error-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--dy-spacing-3, 12px);
  margin-top: var(--dy-spacing-2, 8px);
  width: 100%;
}

/* ============================================================================
   Reduced Motion
   ============================================================================ */
@media (prefers-reduced-motion: reduce) {
  .work-error-state__icon { animation: none; }
}

/* ============================================================================
   High Contrast
   ============================================================================ */
@media (forced-colors: active) {
  .work-error-state__content { border: 2px solid CanvasText; padding: var(--dy-spacing-6, 24px); }
  .work-error-state__icon { background: Canvas; color: CanvasText; border: 2px solid CanvasText; }
  .work-error-state__title { color: CanvasText; }
  .work-error-state__description { color: CanvasText; }
  .work-error-state__details { border-color: CanvasText; }
  .work-error-state__summary { background: Canvas; color: CanvasText; }
  .work-error-state__pre { background: Canvas; color: CanvasText; }
}

/* ============================================================================
   Print
   ============================================================================ */
@media print {
  .work-error-state { page-break-inside: avoid; }
}
</style>