/**
 * WorkActions — مجموعة إجراءات موحدة (WCAG 2.2 AA).
 *
 * Features:
 *  - Primary + secondary actions
 *  - Overflow menu for responsive
 *  - Split button support
 *  - ARIA: toolbar, menu, menuitem
 *  - Keyboard navigation
 */
<template>
  <div
    class="work-actions"
    :class="[
      `work-actions--${align}`,
      { 'work-actions--wrap': wrap },
    ]"
    role="toolbar"
    :aria-label="ariaLabel"
  >
    <!-- Primary Actions -->
    <div class="work-actions__primary">
      <slot name="primary">
        <DyButton
          v-for="action in primaryActions"
          :key="action.id"
          :variant="action.variant || 'primary'"
          :size="size"
          :icon="action.icon"
          :icon-position="action.iconPosition"
          :loading="action.loading"
          :disabled="action.disabled"
          @click="handleAction(action)"
        >
          {{ t(action.label) }}
        </DyButton>
      </slot>
    </div>

    <!-- Secondary Actions -->
    <div v-if="secondaryActions.length || $slots.secondary" class="work-actions__secondary">
      <slot name="secondary">
        <DyButton
          v-for="action in secondaryActions"
          :key="action.id"
          :variant="action.variant || 'ghost'"
          :size="size"
          :icon="action.icon"
          :icon-position="action.iconPosition"
          :loading="action.loading"
          :disabled="action.disabled"
          @click="handleAction(action)"
        >
          {{ t(action.label) }}
        </DyButton>
      </slot>
    </div>

    <!-- Overflow Menu -->
    <div v-if="overflowActions.length" class="work-actions__overflow">
      <DyButton
        type="button"
        variant="ghost"
        :size="size"
        :aria-expanded="overflowOpen"
        :aria-haspopup="true"
        :aria-controls="overflowId"
        @click="toggleOverflow"
        class="work-actions__overflow-trigger"
      >
        <FeatherIcon name="more-horizontal" class="w-5 h-5" aria-hidden="true" />
        <span class="sr-only">{{ t('moreActions') }}</span>
      </DyButton>

      <Transition name="work-actions-dropdown">
        <div
          v-show="overflowOpen"
          :id="overflowId"
          class="work-actions__dropdown"
          role="menu"
          :aria-label="t('moreActions')"
        >
          <button
            v-for="action in overflowActions"
            :key="action.id"
            type="button"
            role="menuitem"
            :disabled="action.disabled"
            class="work-actions__dropdown-item"
            @click="executeOverflow(action)"
          >
            <FeatherIcon v-if="action.icon" :name="action.icon" class="w-4 h-4" aria-hidden="true" />
            <span>{{ t(action.label) }}</span>
            <span v-if="action.shortcut" class="work-actions__shortcut">{{ action.shortcut }}</span>
          </button>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import DyButton from "@/components/ui/DyButton.vue"

const props = defineProps({
	/** Primary actions */
	primaryActions: {
		type: Array,
		default: () => [],
		// [{ id, label, icon?, iconPosition?, variant?, loading?, disabled?, handler }]
	},
	/** Secondary actions */
	secondaryActions: {
		type: Array,
		default: () => [],
	},
	/** Overflow actions (shown in dropdown) */
	overflowActions: {
		type: Array,
		default: () => [],
		// [{ id, label, icon?, shortcut?, disabled?, handler }]
	},
	/** Alignment */
	align: {
		type: String,
		default: "end",
		validator: (v) => ["start", "center", "end", "between"].includes(v),
	},
	/** Wrap on small screens */
	wrap: { type: Boolean, default: true },
	/** Button size */
	size: {
		type: String,
		default: "md",
		validator: (v) => ["sm", "md", "lg"].includes(v),
	},
	/** ARIA label */
	ariaLabel: { type: String, default: "Actions" },
})

const emit = defineEmits(["action"])

const overflowOpen = ref(false)
const overflowId = `work-actions-overflow-${Math.random().toString(36).slice(2)}`

function handleAction(action) {
	if (action.disabled || action.loading) return
	action.handler?.()
	emit("action", action)
}

function toggleOverflow() {
	overflowOpen.value = !overflowOpen.value
}

function executeOverflow(action) {
	if (action.disabled) return
	action.handler?.()
	emit("action", action)
	overflowOpen.value = false
}

function handleClickOutside(e) {
	if (overflowOpen.value && !e.target.closest(".work-actions__overflow")) {
		overflowOpen.value = false
	}
}

onMounted(() => {
	document.addEventListener("click", handleClickOutside)
})

onUnmounted(() => {
	document.removeEventListener("click", handleClickOutside)
})
</script>

<style scoped>
/* ============================================================================
   WorkActions — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--dy-spacing-3, 12px);
}

.work-actions--start { justify-content: flex-start; }
.work-actions--center { justify-content: center; }
.work-actions--end { justify-content: flex-end; }
.work-actions--between { justify-content: space-between; }

.work-actions__primary { display: flex; flex-wrap: wrap; gap: var(--dy-spacing-2, 8px); }
.work-actions__secondary { display: flex; flex-wrap: wrap; gap: var(--dy-spacing-2, 8px); }

.work-actions__overflow { position: relative; }

.work-actions__overflow-trigger {
  width: 40px;
  height: 40px;
  padding: 0;
  justify-content: center;
}

.work-actions__dropdown {
  position: absolute;
  inset-inline-end: 0;
  top: calc(100% + 4px);
  z-index: var(--dy-zIndex-dropdown, 100);
  min-width: 180px;
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
  box-shadow: var(--dy-elevation-4, 0 10px 15px -3px rgba(15, 23, 42, 0.1));
  padding: var(--dy-spacing-1, 4px);
}

.work-actions__dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
  border: none;
  border-radius: var(--dy-radius-md, 6px);
  background: transparent;
  color: var(--dy-color-text-primary, #0f172a);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-medium, 500);
  text-align: start;
  cursor: pointer;
  transition: background-color var(--dy-motion-duration-fast, 100ms);
}
.work-actions__dropdown-item:hover:not(:disabled) { background: var(--dy-color-surface-overlay, #f8fafc); }
.work-actions__dropdown-item:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}
.work-actions__dropdown-item:disabled { opacity: 0.5; cursor: not-allowed; }

.work-actions__shortcut {
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
  color: var(--dy-color-text-muted, #64748b);
  font-family: var(--dy-font-family-mono, monospace);
  white-space: nowrap;
}

/* Transitions */
.work-actions-dropdown-enter-active,
.work-actions-dropdown-leave-active {
  transition: opacity var(--dy-motion-duration-fast, 100ms), transform var(--dy-motion-duration-fast, 100ms);
}
.work-actions-dropdown-enter-from,
.work-actions-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-actions__dropdown-item,
  .work-actions-dropdown-enter-active,
  .work-actions-dropdown-leave-active { transition: none; }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-actions__dropdown { border-color: CanvasText; background: Canvas; }
  .work-actions__dropdown-item { color: CanvasText; }
  .work-actions__dropdown-item:hover { background: Highlight; color: HighlightText; }
  .work-actions__shortcut { color: CanvasText; }
}
</style>