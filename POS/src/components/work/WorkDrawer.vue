/**
 * WorkDrawer — الدرج الجانبي الموحد (WCAG 2.2 AA).
 *
 * Features:
 *  - Positions: start (RTL: right), end (RTL: left), top, bottom
 *  - Focus trap, Escape to close
 *  - ARIA: role="dialog", aria-modal, aria-labelledby
 *  - Portal to body
 *  - Sizes: sm, md, lg, xl, full
 *  - RTL-aware positioning
 */
<template>
  <Teleport to="body">
    <Transition name="work-drawer-overlay">
      <div
        v-if="modelValue"
        class="work-drawer__overlay"
        @click.self="handleOverlayClick"
        :aria-hidden="true"
      >
        <Transition :name="drawerTransition">
          <aside
            v-show="modelValue"
            :class="[
              'work-drawer',
              `work-drawer--${position}`,
              `work-drawer--${size}`,
              { 'work-drawer--full': fullscreen },
            ]"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="titleId"
            :aria-describedby="describedByIds"
            ref="drawerRef"
            @keydown="handleKeydown"
          >
            <!-- Header -->
            <header v-if="showHeader" class="work-drawer__header">
              <h2
                v-if="title"
                :id="titleId"
                class="work-drawer__title"
              >
                {{ t(title) }}
              </h2>
              <slot name="header" />

              <button
                v-if="closable"
                type="button"
                class="work-drawer__close"
                @click="handleClose"
                :aria-label="t('close')"
              >
                <FeatherIcon :name="closeIcon" class="w-5 h-5" aria-hidden="true" />
              </button>
            </header>

            <!-- Body -->
            <div
              class="work-drawer__body"
              :class="{ 'work-drawer__body--scrollable': scrollable }"
            >
              <slot />
            </div>

            <!-- Footer -->
            <footer v-if="$slots.footer || showDefaultFooter" class="work-drawer__footer">
              <slot name="footer">
                <div class="work-drawer__footer-actions">
                  <DyButton
                    v-if="cancelLabel"
                    variant="ghost"
                    @click="handleCancel"
                    :disabled="busy"
                  >
                    {{ t(cancelLabel) }}
                  </DyButton>
                  <DyButton
                    v-if="confirmLabel"
                    :variant="confirmVariant"
                    :loading="busy"
                    @click="handleConfirm"
                    :disabled="busy"
                  >
                    {{ t(confirmLabel) }}
                  </DyButton>
                </div>
              </slot>
            </footer>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue"
import { useLocale } from "@/composables/useLocale"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import DyButton from "@/components/ui/DyButton.vue"

const props = defineProps({
	modelValue: { type: Boolean, required: true },
	title: { type: String, default: "" },
	position: {
		type: String,
		default: "end",
		validator: (v) => ["start", "end", "top", "bottom"].includes(v),
	},
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

const drawerRef = ref(null)
const titleId = `work-drawer-title-${Math.random().toString(36).slice(2)}`
const { direction } = useLocale()

let lastFocusedElement = null
let focusableElements = []

const describedByIds = computed(() => {
	const ids = []
	if (props.describedBy) ids.push(props.describedBy)
	return ids.join(" ") || undefined
})

const closeIcon = computed(() => {
	if (position === "top" || position === "bottom") return "chevron-down"
	return direction === "rtl" ? "chevron-left" : "chevron-right"
})

const drawerTransition = computed(() => {
	switch (props.position) {
		case "start":
			return "work-drawer-slide-start"
		case "end":
			return "work-drawer-slide-end"
		case "top":
			return "work-drawer-slide-top"
		case "bottom":
			return "work-drawer-slide-bottom"
	}
})

function getFocusableElements() {
	if (!drawerRef.value) return []
	return Array.from(
		drawerRef.value.querySelectorAll(
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
		const autofocus = drawerRef.value?.querySelector("[autofocus]")
		;(autofocus || focusableElements[0] || drawerRef.value)?.focus()
	})
}

function restoreFocus() {
	if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
		lastFocusedElement.focus()
	}
	lastFocusedElement = null
}

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
   WorkDrawer — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-drawer__overlay {
  position: fixed;
  inset: 0;
  z-index: var(--dy-zIndex-modal, 400);
  background: var(--dy-color-overlay-backdrop, rgba(15, 23, 42, 0.4));
  overflow: hidden;
}

.work-drawer {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--dy-color-surface-base, #ffffff);
  box-shadow: var(--dy-elevation-6, 0 25px 50px -12px rgba(15, 23, 42, 0.15));
  z-index: 1;
  max-height: 100vh;
  max-width: 100vw;
  overflow: hidden;
}

/* Positions */
.work-drawer--start {
  inset-block-start: 0;
  inset-block-end: 0;
  inset-inline-start: 0;
  border-inline-end: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}
.work-drawer--end {
  inset-block-start: 0;
  inset-block-end: 0;
  inset-inline-end: 0;
  border-inline-start: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}
.work-drawer--top {
  inset-inline-start: 0;
  inset-inline-end: 0;
  inset-block-start: 0;
  border-block-end: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}
.work-drawer--bottom {
  inset-inline-start: 0;
  inset-inline-end: 0;
  inset-block-end: 0;
  border-block-start: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}

/* Sizes */
.work-drawer--sm { width: 320px; }
.work-drawer--md { width: 480px; }
.work-drawer--lg { width: 640px; }
.work-drawer--xl { width: 800px; }
.work-drawer--full { width: 100%; }

.work-drawer--top.work-drawer--sm { height: 25vh; }
.work-drawer--top.work-drawer--md { height: 40vh; }
.work-drawer--top.work-drawer--lg { height: 60vh; }
.work-drawer--top.work-drawer--xl { height: 80vh; }
.work-drawer--top.work-drawer--full { height: 100%; }

.work-drawer--bottom.work-drawer--sm { height: 25vh; }
.work-drawer--bottom.work-drawer--md { height: 40vh; }
.work-drawer--bottom.work-drawer--lg { height: 60vh; }
.work-drawer--bottom.work-drawer--xl { height: 80vh; }
.work-drawer--bottom.work-drawer--full { height: 100%; }

.work-drawer--full {
  width: 100%;
  height: 100%;
  inset: 0;
  border: none;
  border-radius: 0;
}

/* Header */
.work-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dy-spacing-4, 16px);
  padding: var(--dy-spacing-5, 20px) var(--dy-spacing-6, 24px);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  flex-shrink: 0;
}

.work-drawer__title {
  margin: 0;
  font-size: var(--dy-typography-font-size-lg-min, 1.06rem);
  font-weight: var(--dy-font-weight-bold, 700);
  color: var(--dy-color-text-primary, #0f172a);
  line-height: var(--dy-typography-lineHeight-snug, 1.375);
}

.work-drawer__close {
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
.work-drawer__close:hover { background: var(--dy-color-surface-sunken, #f1f5f9); color: var(--dy-color-text-primary, #0f172a); }
.work-drawer__close:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

/* Body */
.work-drawer__body {
  flex: 1;
  overflow: hidden;
}
.work-drawer__body--scrollable {
  overflow-y: auto;
  padding: var(--dy-spacing-6, 24px);
}
.work-drawer__body:not(.work-drawer__body--scrollable) {
  padding: var(--dy-spacing-6, 24px);
}

/* Footer */
.work-drawer__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--dy-spacing-3, 12px);
  padding: var(--dy-spacing-4, 16px) var(--dy-spacing-6, 24px);
  border-top: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  background: var(--dy-color-surface-overlay, #f8fafc);
  flex-shrink: 0;
}

.work-drawer__footer-actions {
  display: flex;
  gap: var(--dy-spacing-3, 12px);
}

/* Transitions */
.work-drawer-overlay-enter-active,
.work-drawer-overlay-leave-active {
  transition: opacity var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out);
}
.work-drawer-overlay-enter-from,
.work-drawer-overlay-leave-to { opacity: 0; }

/* Slide from start (RTL-aware) */
.work-drawer-slide-start-enter-active,
.work-drawer-slide-start-leave-active {
  transition: transform var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out);
}
.work-drawer-slide-start-enter-from,
.work-drawer-slide-start-leave-to {
  transform: translateX(-100%);
}
:dir(rtl) .work-drawer-slide-start-enter-from,
:dir(rtl) .work-drawer-slide-start-leave-to {
  transform: translateX(100%);
}

/* Slide from end */
.work-drawer-slide-end-enter-active,
.work-drawer-slide-end-leave-active {
  transition: transform var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out);
}
.work-drawer-slide-end-enter-from,
.work-drawer-slide-end-leave-to {
  transform: translateX(100%);
}
:dir(rtl) .work-drawer-slide-end-enter-from,
:dir(rtl) .work-drawer-slide-end-leave-to {
  transform: translateX(-100%);
}

/* Slide from top */
.work-drawer-slide-top-enter-active,
.work-drawer-slide-top-leave-active {
  transition: transform var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out);
}
.work-drawer-slide-top-enter-from,
.work-drawer-slide-top-leave-to {
  transform: translateY(-100%);
}

/* Slide from bottom */
.work-drawer-slide-bottom-enter-active,
.work-drawer-slide-bottom-leave-active {
  transition: transform var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out);
}
.work-drawer-slide-bottom-enter-from,
.work-drawer-slide-bottom-leave-to {
  transform: translateY(100%);
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-drawer-overlay-enter-active,
  .work-drawer-overlay-leave-active,
  .work-drawer-slide-start-enter-active,
  .work-drawer-slide-start-leave-active,
  .work-drawer-slide-end-enter-active,
  .work-drawer-slide-end-leave-active,
  .work-drawer-slide-top-enter-active,
  .work-drawer-slide-top-leave-active,
  .work-drawer-slide-bottom-enter-active,
  .work-drawer-slide-bottom-leave-active {
    transition: none;
  }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-drawer { border-color: CanvasText; }
  .work-drawer__header { border-color: CanvasText; }
  .work-drawer__footer { border-color: CanvasText; background: Canvas; }
  .work-drawer__close { color: CanvasText; }
  .work-drawer__close:hover { background: Highlight; color: HighlightText; }
}

/* Print */
@media print {
  .work-drawer__overlay { display: none; }
}
</style>