/**
 * WorkPermissionState — حالة الصلاحية/عدم التفويض (WCAG 2.2 AA).
 *
 * Features:
 *  - Role="alert" for permission denial announcement
 *  - Clear messaging about what's needed
 *  - Go home / login actions
 *  - RTL-aware, reduced motion
 */
<template>
  <div
    class="work-permission-state"
    :class="`work-permission-state--${variant}`"
    role="alert"
    :aria-label="t('accessDenied')"
  >
    <div class="work-permission-state__content">
      <!-- Icon -->
      <div class="work-permission-state__icon" aria-hidden="true">
        <FeatherIcon :name="iconName" class="w-12 h-12" />
      </div>

      <!-- Message -->
      <div class="work-permission-state__message">
        <h3 class="work-permission-state__title">{{ t(title) }}</h3>
        <p v-if="message" class="work-permission-state__description">{{ t(message) }}</p>
        <p v-if="requiredPermission" class="work-permission-state__required">
          {{ t('requiredPermission', [requiredPermission]) }}
        </p>
      </div>

      <!-- Actions -->
      <div class="work-permission-state__actions">
        <DyButton
          v-if="showGoHome"
          variant="primary"
          @click="handleGoHome"
          :aria-label="t('goHome')"
        >
          <template #prefix>
            <FeatherIcon name="home" class="w-4 h-4" aria-hidden="true" />
          </template>
          {{ t('goHome') }}
        </DyButton>

        <DyButton
          v-if="showLogin"
          variant="secondary"
          @click="handleLogin"
          :aria-label="t('login')"
        >
          {{ t('login') }}
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
	title: { type: String, default: "permissionDenied" },
	message: { type: String, default: "" },
	requiredPermission: { type: String, default: "" },
	variant: {
		type: String,
		default: "warning",
		validator: (v) => ["warning", "danger", "info"].includes(v),
	},
	showGoHome: { type: Boolean, default: true },
	showLogin: { type: Boolean, default: false },
})

const emit = defineEmits(["go-home", "login"])

const iconName = computed(() => {
	switch (props.variant) {
		case "danger":
			return "lock"
		case "info":
			return "info"
		default:
			return "shield-off"
	}
})

function handleGoHome() {
	emit("go-home")
}

function handleLogin() {
	emit("login")
}
</script>

<style scoped>
/* ============================================================================
   WorkPermissionState — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-permission-state {
  display: flex;
  justify-content: center;
  padding: var(--dy-spacing-10, 40px) var(--dy-spacing-4, 16px);
}

.work-permission-state__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--dy-spacing-4, 16px);
  max-width: 480px;
  width: 100%;
}

.work-permission-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: var(--dy-radius-full, 9999px);
  flex-shrink: 0;
}
.work-permission-state--warning .work-permission-state__icon {
  background: var(--dy-color-status-warning-weak, #fef3c7);
  color: var(--dy-color-status-warning-icon, #f59e0b);
}
.work-permission-state--danger .work-permission-state__icon {
  background: var(--dy-color-status-danger-weak, #fee2e2);
  color: var(--dy-color-status-danger-icon, #ef4444);
}
.work-permission-state--info .work-permission-state__icon {
  background: var(--dy-color-status-info-weak, #dbeafe);
  color: var(--dy-color-status-info-icon, #3b82f6);
}

.work-permission-state__title {
  margin: 0;
  font-size: var(--dy-typography-font-size-xl-min, 1.25rem);
  font-weight: var(--dy-font-weight-bold, 700);
  color: var(--dy-color-text-primary, #0f172a);
  line-height: var(--dy-typography-lineHeight-tight, 1.25);
}

.work-permission-state__description {
  margin: var(--dy-spacing-2, 8px) 0 0;
  font-size: var(--dy-typography-font-size-base-min, 1rem);
  color: var(--dy-color-text-secondary, #334155);
  line-height: var(--dy-typography-lineHeight-normal, 1.6);
}

.work-permission-state__required {
  margin: var(--dy-spacing-3, 12px) 0 0;
  padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
  background: var(--dy-color-surface-overlay, #f8fafc);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-md, 6px);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  color: var(--dy-color-text-muted, #64748b);
  font-family: var(--dy-font-family-mono, monospace);
  direction: ltr;
  text-align: center;
}

.work-permission-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--dy-spacing-3, 12px);
  margin-top: var(--dy-spacing-2, 8px);
  width: 100%;
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-permission-state__icon { animation: none; }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-permission-state__content { border: 2px solid CanvasText; padding: var(--dy-spacing-6, 24px); }
  .work-permission-state__icon { background: Canvas; color: CanvasText; border: 2px solid CanvasText; }
  .work-permission-state__title { color: CanvasText; }
  .work-permission-state__description { color: CanvasText; }
  .work-permission-state__required { background: Canvas; border-color: CanvasText; color: CanvasText; }
}

/* Print */
@media print {
  .work-permission-state { page-break-inside: avoid; }
}
</style>