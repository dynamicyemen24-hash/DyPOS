/**
 * WorkNotification — الإشعارات الموحدة (Toast/Snackbar) (WCAG 2.2 AA).
 *
 * Features:
 *  - Types: success, error, warning, info
 *  - Auto-dismiss with pause on hover/focus
 *  - Action button support
 *  - Portal to body, stacked
 *  - RTL-aware animation
 *  - ARIA: role="status"/"alert", aria-live, aria-atomic
 */
<template>
  <Teleport to="body">
    <TransitionGroup
      name="work-notification"
      tag="div"
      id="work-notifications"
      class="work-notification__container"
      :class="`work-notification__container--${position}`"
      role="region"
      :aria-label="t('notifications')"
      aria-live="polite"
      aria-atomic="false"
    >
      <div
        v-for="notification in notifications"
        :key="notification.id"
        :class="[
          'work-notification',
          `work-notification--${notification.type}`,
          { 'work-notification--closable': notification.closable },
        ]"
        :role="notification.type === 'error' ? 'alert' : 'status'"
        :aria-live="notification.type === 'error' ? 'assertive' : 'polite'"
        :aria-atomic="true"
        @mouseenter="pause(notification.id)"
        @mouseleave="resume(notification.id)"
        @focusin="pause(notification.id)"
        @focusout="resume(notification.id)"
      >
        <div class="work-notification__content">
          <!-- Icon -->
          <div class="work-notification__icon" aria-hidden="true">
            <FeatherIcon :name="iconName(notification.type)" :class="iconClass(notification.type)" />
          </div>

          <!-- Message -->
          <div class="work-notification__message">
            <p v-if="notification.title" class="work-notification__title">
              {{ t(notification.title) }}
            </p>
            <p v-if="notification.message" class="work-notification__text">
              {{ t(notification.message) }}
            </p>
          </div>

          <!-- Action -->
          <div v-if="notification.action" class="work-notification__action">
            <DyButton
              :variant="notification.action.variant || 'ghost'"
              :size="'sm'"
              @click="executeAction(notification)"
            >
              {{ t(notification.action.label) }}
            </DyButton>
          </div>

          <!-- Close -->
          <button
            v-if="notification.closable !== false"
            type="button"
            class="work-notification__close"
            @click="remove(notification.id)"
            :aria-label="t('dismiss')"
          >
            <FeatherIcon name="x" class="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <!-- Progress Bar -->
        <div
          v-if="notification.duration && notification.duration > 0"
          class="work-notification__progress"
          :style="progressStyle(notification.id)"
          aria-hidden="true"
        />
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive } from "vue"
import { useLocale } from "@/composables/useLocale"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import DyButton from "@/components/ui/DyButton.vue"

const { direction } = useLocale()

const notifications = ref([])
const timers = reactive({})
const progressTimers = reactive({})

const position = computed(() =>
	direction.value === "rtl" ? "top-start" : "top-end",
)

function iconName(type) {
	switch (type) {
		case "success":
			return "check-circle"
		case "error":
			return "x-circle"
		case "warning":
			return "alert-triangle"
		default:
			return "info"
	}
}

function iconClass(type) {
	return {
		"work-notification__icon--success": type === "success",
		"work-notification__icon--error": type === "error",
		"work-notification__icon--warning": type === "warning",
		"work-notification__icon--info": type === "info",
	}
}

function progressStyle(id) {
	const notif = notifications.value.find((n) => n.id === id)
	if (!notif || !notif.duration) return { width: "0%" }
	const elapsed = notif._elapsed || 0
	const progress = Math.max(0, 100 - (elapsed / notif.duration) * 100)
	return { width: `${progress}%` }
}

function generateId() {
	return `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Show a notification
 * @param {Object} options
 * @param {string} options.type - success|error|warning|info
 * @param {string} options.title - Title key
 * @param {string} options.message - Message key
 * @param {number} options.duration - Auto-dismiss ms (0 = no auto-dismiss)
 * @param {Object} options.action - { label, variant, handler }
 * @param {boolean} options.closable - Show close button (default true)
 * @returns {string} Notification ID
 */
export function notify(options) {
	const id = generateId()
	const duration = options.duration ?? 5000

	const notif = {
		id,
		type: options.type || "info",
		title: options.title || "",
		message: options.message || "",
		duration,
		action: options.action || null,
		closable: options.closable !== false,
		_start: Date.now(),
		_elapsed: 0,
		_paused: false,
	}

	notifications.value.push(notif)

	if (duration > 0) {
		startTimer(id, duration)
		startProgress(id, duration)
	}

	return id
}

function startTimer(id, duration) {
	clearTimer(id)
	timers[id] = setTimeout(() => {
		remove(id)
	}, duration)
}

function startProgress(id, duration) {
	clearProgress(id)
	const notif = notifications.value.find((n) => n.id === id)
	if (!notif) return

	const start = Date.now()
	notif._start = start

	const tick = () => {
		if (notif._paused) {
			requestAnimationFrame(tick)
			return
		}
		const elapsed = Date.now() - start + (notif._elapsed || 0)
		notif._elapsed = elapsed
		if (elapsed < duration) {
			progressTimers[id] = requestAnimationFrame(tick)
		}
	}
	requestAnimationFrame(tick)
}

function clearTimer(id) {
	if (timers[id]) {
		clearTimeout(timers[id])
		delete timers[id]
	}
}

function clearProgress(id) {
	if (progressTimers[id]) {
		cancelAnimationFrame(progressTimers[id])
		delete progressTimers[id]
	}
}

function pause(id) {
	const notif = notifications.value.find((n) => n.id === id)
	if (notif) {
		notif._paused = true
		clearTimer(id)
	}
}

function resume(id) {
	const notif = notifications.value.find((n) => n.id === id)
	if (notif && notif.duration > 0) {
		notif._paused = false
		notif._start = Date.now()
		startTimer(id, notif.duration - (notif._elapsed || 0))
		startProgress(id, notif.duration)
	}
}

function remove(id) {
	clearTimer(id)
	clearProgress(id)
	const idx = notifications.value.findIndex((n) => n.id === id)
	if (idx >= 0) notifications.value.splice(idx, 1)
}

function executeAction(notification) {
	notification.action?.handler?.()
	if (notification.action?.dismiss !== false) {
		remove(notification.id)
	}
}

// Convenience methods
export function notifySuccess(title, message, options = {}) {
	return notify({ type: "success", title, message, ...options })
}

export function notifyError(title, message, options = {}) {
	return notify({ type: "error", title, message, duration: 0, ...options })
}

export function notifyWarning(title, message, options = {}) {
	return notify({ type: "warning", title, message, ...options })
}

export function notifyInfo(title, message, options = {}) {
	return notify({ type: "info", title, message, ...options })
}

export function dismissAll() {
	for (const id of Object.keys(timers)) clearTimer(id)
	for (const id of Object.keys(progressTimers)) clearProgress(id)
	notifications.value = []
}

// Export for composable use
const api = {
	notify,
	notifySuccess,
	notifyError,
	notifyWarning,
	notifyInfo,
	dismissAll,
	remove,
	pause,
	resume,
}
</script>

<style scoped>
/* ============================================================================
   WorkNotification — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-notification__container {
  position: fixed;
  z-index: var(--dy-zIndex-toast, 700);
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-3, 12px);
  padding: var(--dy-spacing-4, 16px);
  pointer-events: none;
  max-width: 420px;
  width: 100%;
}

/* Positions */
.work-notification__container--top-start {
  top: 0;
  inset-inline-start: 0;
}
.work-notification__container--top-end {
  top: 0;
  inset-inline-end: 0;
}
.work-notification__container--bottom-start {
  bottom: 0;
  inset-inline-start: 0;
}
.work-notification__container--bottom-end {
  bottom: 0;
  inset-inline-end: 0;
}
.work-notification__container--top-center {
  top: 0;
  left: 50%;
  transform: translateX(-50%);
}
.work-notification__container--bottom-center {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}

.work-notification {
  pointer-events: auto;
  display: flex;
  border-radius: var(--dy-radius-lg, 8px);
  box-shadow: var(--dy-elevation-5, 0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1));
  overflow: hidden;
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid transparent;
}

.work-notification__content {
  display: flex;
  align-items: flex-start;
  gap: var(--dy-spacing-3, 12px);
  padding: var(--dy-spacing-4, 16px);
  min-width: 0;
}

/* Icon */
.work-notification__icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: var(--dy-radius-full, 9999px);
}
.work-notification__icon--success {
  background: var(--dy-color-status-success-weak, #dcfce7);
  color: var(--dy-color-status-success-icon, #10b981);
}
.work-notification__icon--error {
  background: var(--dy-color-status-danger-weak, #fee2e2);
  color: var(--dy-color-status-danger-icon, #ef4444);
}
.work-notification__icon--warning {
  background: var(--dy-color-status-warning-weak, #fef3c7);
  color: var(--dy-color-status-warning-icon, #f59e0b);
}
.work-notification__icon--info {
  background: var(--dy-color-status-info-weak, #dbeafe);
  color: var(--dy-color-status-info-icon, #3b82f6);
}

/* Message */
.work-notification__message {
  flex: 1;
  min-width: 0;
}

.work-notification__title {
  margin: 0 0 var(--dy-spacing-1, 4px);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-semibold, 600);
  color: var(--dy-color-text-primary, #0f172a);
  line-height: var(--dy-typography-lineHeight-snug, 1.375);
}

.work-notification__text {
  margin: 0;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  color: var(--dy-color-text-secondary, #334155);
  line-height: var(--dy-typography-lineHeight-normal, 1.6);
}

/* Action */
.work-notification__action {
  flex-shrink: 0;
  margin-inline-start: var(--dy-spacing-2, 8px);
}

/* Close */
.work-notification__close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--dy-radius-md, 6px);
  background: transparent;
  color: var(--dy-color-text-muted, #64748b);
  cursor: pointer;
  transition: background-color var(--dy-motion-duration-fast, 100ms), color var(--dy-motion-duration-fast, 100ms);
  margin-inline-start: var(--dy-spacing-1, 4px);
}
.work-notification__close:hover {
  background: var(--dy-color-surface-sunken, #f1f5f9);
  color: var(--dy-color-text-primary, #0f172a);
}
.work-notification__close:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

/* Progress Bar */
.work-notification__progress {
  position: absolute;
  bottom: 0;
  inset-inline-start: 0;
  height: 3px;
  background: currentColor;
  opacity: 0.3;
  border-radius: 0 0 var(--dy-radius-lg, 8px) var(--dy-radius-lg, 8px);
  transition: width 0.1s linear;
}

/* Type Borders */
.work-notification--success { border-inline-start-color: var(--dy-color-status-success-icon, #10b981); }
.work-notification--error { border-inline-start-color: var(--dy-color-status-danger-icon, #ef4444); }
.work-notification--warning { border-inline-start-color: var(--dy-color-status-warning-icon, #f59e0b); }
.work-notification--info { border-inline-start-color: var(--dy-color-status-info-icon, #3b82f6); }

/* Transitions */
.work-notification-enter-active,
.work-notification-leave-active {
  transition: all var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out);
}
.work-notification-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
:dir(rtl) .work-notification-enter-from {
  transform: translateX(-100%);
}
.work-notification-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
:dir(rtl) .work-notification-leave-to {
  transform: translateX(-100%);
}
.work-notification-move {
  transition: transform var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out);
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-notification-enter-active,
  .work-notification-leave-active,
  .work-notification-move,
  .work-notification__progress {
    transition: none;
  }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-notification { border-width: 2px; border-color: CanvasText; }
  .work-notification__icon { background: Canvas; color: CanvasText; border: 2px solid CanvasText; }
  .work-notification__title { color: CanvasText; }
  .work-notification__text { color: CanvasText; }
  .work-notification__close { color: CanvasText; }
  .work-notification__close:hover { background: Highlight; color: HighlightText; }
}

/* Responsive */
@media (max-width: 480px) {
  .work-notification__container {
    inset-inline-start: var(--dy-spacing-3, 12px);
    inset-inline-end: var(--dy-spacing-3, 12px);
    max-width: none;
  }
}
</style>