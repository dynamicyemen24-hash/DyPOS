<template>
  <Teleport to="body">
    <Transition :name="transitionName">
      <div
        v-if="modelValue"
        class="fixed inset-0 overflow-y-auto"
        :class="overlayClass"
        @click="onOverlayClick"
      >
        <div
          class="flex min-h-full flex-col items-center px-4 py-4"
          :class="positionClass"
          :style="positionStyle"
        >
          <div
            ref="panelRef"
            role="dialog"
            aria-modal="true"
            :aria-label="options?.title || undefined"
            tabindex="-1"
            class="dy-dialog-panel my-8 w-full transform overflow-hidden rounded-xl border border-[var(--dy-border)] bg-[var(--dy-surface)] text-start shadow-xl outline-none"
            :class="[sizeClass, panelClass]"
            @keydown.esc.stop="close"
            @keydown.tab="onTab"
          >
            <slot name="body">
              <div class="px-4 pb-6 pt-5 sm:px-6">
                <div class="mb-6 flex items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-2">
                    <span
                      v-if="iconName"
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                      :class="iconBgClass"
                    >
                      <FeatherIcon
                        :name="iconName"
                        class="h-4 w-4"
                        :class="iconClass"
                        aria-hidden="true"
                      />
                    </span>
                    <h3 class="truncate text-xl font-semibold text-[var(--dy-text)]">
                      <slot name="body-title">{{ options?.title || "—" }}</slot>
                    </h3>
                  </div>
                  <button
                    type="button"
                    class="rounded p-1 text-[var(--dy-text-muted)] transition-colors hover:bg-[var(--dy-bg-sunken)] hover:text-[var(--dy-text)]"
                    :aria-label="closeLabel"
                    @click="close"
                  >
                    <FeatherIcon name="x" class="h-5 w-5" />
                  </button>
                </div>

                <p
                  v-if="options?.message"
                  class="mb-4 text-sm text-[var(--dy-text-secondary)]"
                >
                  {{ options.message }}
                </p>

                <slot name="body-content" />

                <div
                  v-if="options?.actions?.length || $slots.actions"
                  class="mt-6 flex flex-wrap justify-end gap-2"
                >
                  <slot name="actions" :close="close">
                    <Button
                      v-for="(action, index) in options.actions"
                      :key="index"
                      :theme="action.theme || 'gray'"
                      :variant="action.variant || 'subtle'"
                      :label="action.label"
                      :loading="action.loading"
                      @click="runAction(action)"
                    />
                  </slot>
                </div>
              </div>
            </slot>

<script setup>
/**
 * DyPOS Dialog — modal built on native primitives.
 *
 * Replaces a headless-dialog + tooltip + icon library stack with ~0 KB of extra
 * JavaScript while keeping every behaviour the POS depends on:
 *
 *  - `v-model` open state, `options` for title / size / icon / actions;
 *  - focus moves into the panel on open and RETURNS to the trigger on close
 *    (a cashier must never lose the keyboard mid-sale);
 *  - Tab is trapped inside the panel, Escape closes, body scroll is locked;
 *  - `disableOutsideClickToClose` for destructive confirmations;
 *  - `after-leave` event, which the transition-aware callers rely on.
 *
 * Slots: `body` (full override), `body-title`, `body-content`, `actions({ close })`.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import Button from "./Button.vue"
import FeatherIcon from "./FeatherIcon.vue"

const props = defineProps({
	/** v-model open state. */
	modelValue: { type: Boolean, default: false },
	/** `{ title, message, size, icon, actions, position, paddingTop }`. */
	options: { type: Object, default: () => ({}) },
	/** Blocks closing by clicking the backdrop. */
	disableOutsideClickToClose: { type: Boolean, default: false },
	/** Arabic aria-label for the close button. */
	closeLabel: { type: String, default: "إغلاق" },
})

const emit = defineEmits(["update:modelValue", "close", "after-leave"])

const panelRef = ref(/** @type {HTMLElement|null} */ (null))
let previouslyFocused = null
let scrollLocked = false

const SIZE = {
	xs: "max-w-xs",
	sm: "max-w-sm",
	md: "max-w-md",
	lg: "max-w-lg",
	xl: "max-w-xl",
	"2xl": "max-w-2xl",
	"3xl": "max-w-3xl",
	"4xl": "max-w-4xl",
	"5xl": "max-w-5xl",
	"6xl": "max-w-6xl",
	"7xl": "max-w-7xl",
}

const sizeClass = computed(() => SIZE[props.options?.size] || SIZE.lg)
const panelClass = computed(() => props.options?.panelClass || "")
const overlayClass = computed(
	() => props.options?.overlayClass || "bg-[var(--dy-bg-overlay)]",
)
const positionClass = computed(() => {
	if (props.options?.paddingTop) return ""
	return props.options?.position === "top" ? "pt-[12vh]" : "justify-center"
})
const positionStyle = computed(() =>
	props.options?.paddingTop
		? { paddingTop: String(props.options.paddingTop) }
		: {},
)
const transitionName = computed(() =>
	props.options?.position === "top" ? "dy-dialog-top" : "dy-dialog",
)

const iconName = computed(() => {
	const icon = props.options?.icon
	if (!icon) return null
	return typeof icon === "string" ? icon : icon.name
})

const ICON_TONES = {
	warning: ["bg-[var(--dy-warning-soft)]", "text-[var(--dy-warning)]"],
	info: ["bg-[var(--dy-info-soft)]", "text-[var(--dy-info)]"],
	danger: ["bg-[var(--dy-danger-soft)]", "text-[var(--dy-danger)]"],
	success: ["bg-[var(--dy-success-soft)]", "text-[var(--dy-success)]"],
}
const iconTone = computed(() => {
	const icon = props.options?.icon
	const appearance = typeof icon === "object" ? icon?.appearance : null
	const key = /** @type {keyof typeof ICON_TONES} */ (appearance)
	return (
		ICON_TONES[key] || [
			"bg-[var(--dy-bg-sunken)]",
			"text-[var(--dy-text-muted)]",
		]
	)
})
const iconBgClass = computed(() => iconTone.value[0])
const iconClass = computed(() => iconTone.value[1])

function close() {
	emit("update:modelValue", false)
	emit("close")
}

function onOverlayClick(event) {
	if (props.disableOutsideClickToClose) return
	if (event.target !== event.currentTarget) return
	close()
}

const FOCUSABLE =
	'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Keep Tab inside the panel while it is open. */
function onTab(event) {
	const panel = panelRef.value
	if (!panel) return
	const focusable = [...panel.querySelectorAll(FOCUSABLE)]
	if (focusable.length === 0) {
		event.preventDefault()
		panel.focus()
		return
	}
	const first = focusable[0]
	const last = focusable[focusable.length - 1]
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault()
		last.focus()
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault()
		first.focus()
	}
}

function lockScroll(lock) {
	if (lock === scrollLocked) return
	scrollLocked = lock
	document.body.style.overflow = lock ? "hidden" : ""
}

/** @param {{ onClick?: (ctx: { close: () => void }) => unknown }} action */
function runAction(action) {
	const result = action.onClick?.({ close })
	if (result && typeof result.then === "function") {
		result.then(() => close())
	} else {
		close()
	}
}

watch(
	() => props.modelValue,
	async (open) => {
		if (open) {
			previouslyFocused = document.activeElement
			lockScroll(true)
			await nextTick()
			const panel = panelRef.value
			const target = panel?.querySelector(FOCUSABLE) || panel
			target?.focus?.()
		} else {
			lockScroll(false)
			if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
			previouslyFocused = null
			emit("after-leave")
		}
	},
)

onBeforeUnmount(() => lockScroll(false))
</script>

<style>
.dy-dialog-enter-active,
.dy-dialog-leave-active {
	transition: opacity 150ms ease;
}
.dy-dialog-enter-active .dy-dialog-panel,
.dy-dialog-leave-active .dy-dialog-panel {
	transition:
		transform 150ms ease,
		opacity 150ms ease;
}
.dy-dialog-enter-from,
.dy-dialog-leave-to {
	opacity: 0;
}
.dy-dialog-enter-from .dy-dialog-panel,
.dy-dialog-leave-to .dy-dialog-panel {
	transform: scale(0.98) translateY(6px);
	opacity: 0;
}
.dy-dialog-top-enter-from .dy-dialog-panel,
.dy-dialog-top-leave-to .dy-dialog-panel {
	transform: translateY(-12px);
}
@media (prefers-reduced-motion: reduce) {
	.dy-dialog-enter-active,
	.dy-dialog-leave-active,
	.dy-dialog-enter-active .dy-dialog-panel,
	.dy-dialog-leave-active .dy-dialog-panel {
		transition: none;
	}
}
</style>

          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
