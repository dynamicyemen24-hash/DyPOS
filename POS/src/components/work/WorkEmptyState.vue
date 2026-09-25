/**
 * WorkEmptyState — الحالة الفارغة الموحدة (WCAG 2.2 AA).
 *
 * Features:
 *  - Illustrative icon/illustration
 *  - Clear title and description
 *  - Primary action button
 *  - RTL-aware, responsive
 *  - Role="status" for screen readers
 */
<template>
  <div
    class="work-empty-state"
    :class="`work-empty-state--${size}`"
    role="status"
    :aria-label="t('noData')"
  >
    <div class="work-empty-state__content">
      <!-- Illustration/Icon -->
      <div
        v-if="illustration"
        class="work-empty-state__illustration"
        aria-hidden="true"
      >
        <component :is="illustration" :class="illustrationSize" />
      </div>
      <div
        v-else
        class="work-empty-state__icon"
        aria-hidden="true"
      >
        <FeatherIcon :name="icon" :class="iconSize" />
      </div>

      <!-- Message -->
      <div class="work-empty-state__message">
        <h3 class="work-empty-state__title">{{ t(title) }}</h3>
        <p v-if="description" class="work-empty-state__description">{{ t(description) }}</p>
      </div>

      <!-- Action -->
      <div v-if="actionLabel" class="work-empty-state__action">
        <DyButton
          :variant="actionVariant"
          :size="actionSize"
          :icon="actionIcon"
          :icon-position="actionIconPosition"
          @click="handleAction"
          :aria-label="actionAriaLabel || t(actionLabel)"
        >
          {{ t(actionLabel) }}
        </DyButton>
      </div>

      <!-- Secondary content -->
      <slot name="secondary" />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import DyButton from "@/components/ui/DyButton.vue"

const props = defineProps({
	/** Title */
	title: { type: String, default: "noData" },
	/** Description */
	description: { type: String, default: "noDataDescription" },
	/** Icon name (Feather) */
	icon: { type: String, default: "inbox" },
	/** Icon size */
	iconSize: { type: String, default: "w-14 h-14" },
	/** Custom illustration component */
	illustration: { type: Object, default: null },
	/** Illustration size */
	illustrationSize: { type: String, default: "w-24 h-24" },
	/** Action button label */
	actionLabel: { type: String, default: "" },
	/** Action button variant */
	actionVariant: {
		type: String,
		default: "primary",
		validator: (v) => ["primary", "secondary", "ghost", "outline"].includes(v),
	},
	/** Action button size */
	actionSize: {
		type: String,
		default: "md",
		validator: (v) => ["sm", "md", "lg"].includes(v),
	},
	/** Action button icon */
	actionIcon: { type: String, default: "plus" },
	/** Action button icon position */
	actionIconPosition: {
		type: String,
		default: "start",
		validator: (v) => ["start", "end"].includes(v),
	},
	/** Action aria label */
	actionAriaLabel: { type: String, default: "" },
	/** Size variant */
	size: {
		type: String,
		default: "md",
		validator: (v) => ["sm", "md", "lg"].includes(v),
	},
})

const emit = defineEmits(["action"])

function handleAction() {
	emit("action")
}
</script>

<style scoped>
/* ============================================================================
   WorkEmptyState — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-empty-state {
  display: flex;
  justify-content: center;
  padding: var(--dy-spacing-10, 40px) var(--dy-spacing-4, 16px);
}

.work-empty-state__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--dy-spacing-4, 16px);
  max-width: 400px;
  width: 100%;
}

/* Icon */
.work-empty-state__icon,
.work-empty-state__illustration {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: var(--dy-radius-full, 9999px);
  background: var(--dy-color-surface-overlay, #f8fafc);
  color: var(--dy-color-text-muted, #94a3b8);
  flex-shrink: 0;
}

.work-empty-state__illustration {
  width: 120px;
  height: 120px;
  background: transparent;
}

/* Message */
.work-empty-state__title {
  margin: 0;
  font-size: var(--dy-typography-font-size-lg-min, 1.06rem);
  font-weight: var(--dy-font-weight-semibold, 600);
  color: var(--dy-color-text-primary, #0f172a);
  line-height: var(--dy-typography-lineHeight-snug, 1.375);
}

.work-empty-state__description {
  margin: var(--dy-spacing-2, 8px) 0 0;
  font-size: var(--dy-typography-font-size-base-min, 1rem);
  color: var(--dy-color-text-secondary, #334155);
  line-height: var(--dy-typography-lineHeight-normal, 1.6);
  max-width: 320px;
}

/* Action */
.work-empty-state__action {
  margin-top: var(--dy-spacing-2, 8px);
  width: 100%;
}
.work-empty-state__action .dy-btn {
  width: 100%;
  max-width: 280px;
}

/* Sizes */
.work-empty-state--sm .work-empty-state__icon { width: 56px; height: 56px; }
.work-empty-state--sm .work-empty-state__title { font-size: var(--dy-typography-font-size-base-min, 1rem); }
.work-empty-state--sm .work-empty-state__description { font-size: var(--dy-typography-font-size-sm-min, 0.81rem); }

.work-empty-state--lg .work-empty-state__icon { width: 104px; height: 104px; }
.work-empty-state--lg .work-empty-state__title { font-size: var(--dy-typography-font-size-xl-min, 1.25rem); }
.work-empty-state--lg .work-empty-state__description { font-size: var(--dy-typography-font-size-lg-min, 1.06rem); }

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-empty-state__icon { animation: none; }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-empty-state__icon {
    background: Canvas;
    color: CanvasText;
    border: 2px solid CanvasText;
  }
  .work-empty-state__title { color: CanvasText; }
  .work-empty-state__description { color: CanvasText; }
}

/* Print */
@media print {
  .work-empty-state { page-break-inside: avoid; }
}
</style>