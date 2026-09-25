/**
 * WorkDialog — مربع الحوار الموحد (WCAG 2.2 AA).
 *
 * Features:
 *  - Focus trap (Tab cycles within dialog)
 *  - Escape to close
 *  - ARIA: role="dialog", aria-modal="true", aria-labelledby/describedby
 *  - Portal to body
 *  - Sizes: sm, md, lg, xl, full
 *  - RTL-aware, reduced motion
 */
<template>
  <Teleport to="body">
    <Transition name="work-dialog-overlay">
      <div
        v-if="modelValue"
        class="work-dialog__overlay"
        @click.self="handleOverlayClick"
        :aria-hidden="true"
      >
        <Transition name="work-dialog-content">
          <div
            v-show="modelValue"
            :class="[
              'work-dialog',
              `work-dialog--${size}`,
              { 'work-dialog--fullscreen': fullscreen },
            ]"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="titleId"
            :aria-describedby="describedByIds"
            ref="dialogRef"
            @keydown="handleKeydown"
          >
            <!-- Header -->
            <header v-if="showHeader" class="work-dialog__header">
              <h2
                v-if="title"
                :id="titleId"
                class="work-dialog__title"
              >
                {{ t(title) }}
              </h2>
              <slot name="header" />

              <button
                v-if="closable"
                type="button"
                class="work-dialog__close"
                @click="handleClose"
                :aria-label="t('close')"
              >
                <FeatherIcon name="x" class="w-5 h-5" aria-hidden="true" />
              </button>
            </header>

            <!-- Body -->
            <div
              class="work-dialog__body"
              :class="{ 'work-dialog__body--scrollable': scrollable }"
            >
              <slot />
            </div>

            <!-- Footer -->
            <footer v-if="$slots.footer || showDefaultFooter" class="work-dialog__footer">
              <slot name="footer">
                <div class="work-dialog__footer-actions">
                  <DyButton
                    v-if="cancelLabel"
                    variant="ghost"
                    @click="handleCancel"
                    :disabled="busy"
                    :aria-label="t(cancelLabel)"
                  >
                    {{ t(cancelLabel) }}
                  </DyButton>
                  <DyButton
                    v-if="confirmLabel"
                    :variant="confirmVariant"
                    :loading="busy"
                    @click="handleConfirm"
                    :disabled="busy"
                    :aria-label="t(confirmLabel)"
                  >
                    {{ t(confirmLabel) }}
                  </DyButton>
                </div>
              </slot>
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import DyButton from "@/components/ui/DyButton.vue"

const props = defineProps({
	modelValue: { type: Boolean, required: true },
	title: { type: String, default: "" },
	size: {
		type: String,
		default: "md",
		validator: (v) => ["sm", "md", "lg", "xl", "full"].includes(v),
	},
	fullscreen: { type: Boolean, default: false },
	closable: { type: Boolean, default: true },
	closeOnOverlayClick: { type: Boolean, default: true },
	closeOnEscape: { type: Boolean, default: true },
	scrollable: { type: Boolean, default: true },
	showHeader: { type: Boolean, default: true },
	showDefaultFooter: { type: Boolean, default: false },
	cancelLabel: { type: String, default: "cancel" },
	confirmLabel: { type: String, default: "" },
	confirmVariant: {
		type: String,
		default: "primary",
		validator: (v) => ["primary", "danger", "success"].includes(v),
	},
	busy: { type: Boolean, default: false },
	describedBy: { type: String, default: "" },
})

const emit = defineEmits(["update:modelValue", "close", "confirm", "cancel"])

const dialogRef = ref(null)
const titleId = `work-dialog-title-${Math.random().toString(36).slice(2)}`
let lastFocusedElement = null
let focusableElements = []

const describedByIds = computed(() => {
	const ids = []
	if (props.describedBy) ids.push(props.describedBy)
	return ids.join(" ") || undefined
})

// Focus trap
function getFocusableElements() {
	if (!dialogRef.value) return []
	return Array.from(
		dialogRef.value.querySelectorAll(
			'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
		),
	).filter((el) => el.offsetParent !== null)
}

function handleKeydown(e) {
	if (e.key === "Escape" && props.closeOnEscape) {
		handleClose()
		return
	}

	if (e.key === "Tab") {
		focusableElements = getFocusableElements()
		if (focusableElements.length === 0) return

		const first = focusableElements[0]
		const last = focusableElements[focusableElements.length - 1]

		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault()
			last.focus()
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault()
			first.focus()
		}
	}
}

function handleClose() {
	emit("update:modelValue", false)
	emit("close")
	restoreFocus()
}

function handleCancel() {
	emit("cancel")
	handleClose()
}

function handleConfirm() {
	emit("confirm")
}

function handleOverlayClick() {
	if (props.closeOnOverlayClick) handleClose()
}

function trapFocus() {
	lastFocusedElement = document.activeElement
	nextTick(() => {
		focusableElements = getFocusableElements()
		const autofocus = dialogRef.value?.querySelector("[autofocus]")
		;(autofocus || focusableElements[0] || dialogRef.value)?.focus()
	})
}

function restoreFocus() {
	if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
		lastFocusedElement.focus()
	}
	lastFocusedElement = null
}

// Prevent body scroll
function setBodyScroll(disabled) {
	if (typeof document !== "undefined") {
		document.body.style.overflow = disabled ? "hidden" : ""
	}
}

watch(
	() => props.modelValue,
	(open) => {
		if (open) {
			setBodyScroll(true)
			trapFocus()
		} else {
			setBodyScroll(false)
		}
	},
)

onUnmounted(() => {
	setBodyScroll(false)
})
</script>

<style scoped>
/* ============================================================================
   WorkDialog — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-dialog__overlay {
  position: fixed;
  inset: 0;
  z-index: var(--dy-zIndex-modal, 400);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--dy-spacing-4, 16px);
  background: var(--dy-color-overlay-backdrop, rgba(15, 23, 42, 0.4));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.work-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 32px);
  width: 100%;
  background: var(--dy-color-surface-base, #ffffff);
  border-radius: var(--dy-radius-xl, 12px);
  box-shadow: var(--dy-elevation-6, 0 25px 50px -12px rgba(15, 23, 42, 0.15));
  overflow: hidden;
}

/* Sizes */
.work-dialog--sm { max-width: 400px; }
.work-dialog--md { max-width: 560px; }
.work-dialog--lg { max-width: 720px; }
.work-dialog--xl { max-width: 960px; }
.work-dialog--full { max-width: 100%; }

.work-dialog--fullscreen {
  max-width: 100%;
  max-height: 100vh;
  height: 100vh;
  border-radius: 0;
  margin: 0;
}

/* Header */
.work-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dy-spacing-4, 16px);
  padding: var(--dy-spacing-5, 20px) var(--dy-spacing-6, 24px);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  flex-shrink: 0;
}

.work-dialog__title {
  margin: 0;
  font-size: var(--dy-typography-font-size-lg-min, 1.06rem);
  font-weight: var(--dy-font-weight-bold, 700);
  color: var(--dy-color-text-primary, #0f172a);
  line-height: var(--dy-typography-lineHeight-snug, 1.375);
}

.work-dialog__close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: var(--dy-radius-lg, 8px);
  background: transparent;
  color: var(--dy-color-text-muted, #64748b);
  cursor: pointer;
  transition: background-color var(--dy-motion-duration-fast, 100ms), color var(--dy-motion-duration-fast, 100ms);
}
.work-dialog__close:hover { background: var(--dy-color-surface-sunken, #f1f5f9); color: var(--dy-color-text-primary, #0f172a); }
.work-dialog__close:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

/* Body */
.work-dialog__body {
  flex: 1;
  overflow: hidden;
}
.work-dialog__body--scrollable {
  overflow-y: auto;
  padding: var(--dy-spacing-6, 24px);
}
.work-dialog__body:not(.work-dialog__body--scrollable) {
  padding: var(--dy-spacing-6, 24px);
}

/* Footer */
.work-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--dy-spacing-3, 12px);
  padding: var(--dy-spacing-4, 16px) var(--dy-spacing-6, 24px);
  border-top: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  background: var(--dy-color-surface-overlay, #f8fafc);
  flex-shrink: 0;
}

.work-dialog__footer-actions {
  display: flex;
  gap: var(--dy-spacing-3, 12px);
}

/* Transitions */
.work-dialog-overlay-enter-active,
.work-dialog-overlay-leave-active {
  transition: opacity var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out);
}
.work-dialog-overlay-enter-from,
.work-dialog-overlay-leave-to { opacity: 0; }

.work-dialog-content-enter-active,
.work-dialog-content-leave-active {
  transition:
    opacity var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out),
    transform var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out);
}
.work-dialog-content-enter-from,
.work-dialog-content-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(8px);
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-dialog-overlay-enter-active,
  .work-dialog-overlay-leave-active,
  .work-dialog-content-enter-active,
  .work-dialog-content-leave-active {
    transition: none;
  }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-dialog { border: 2px solid CanvasText; }
  .work-dialog__header { border-color: CanvasText; }
  .work-dialog__footer { border-color: CanvasText; background: Canvas; }
  .work-dialog__close { color: CanvasText; }
  .work-dialog__close:hover { background: Highlight; color: HighlightText; }
}

/* Print */
@media print {
  .work-dialog__overlay { position: static; background: none; padding: 0; }
  .work-dialog { box-shadow: none; max-height: none; }
}
</style>