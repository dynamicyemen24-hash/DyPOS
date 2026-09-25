/**
 * WorkTabs — تبويبات موحدة (WCAG 2.2 AA).
 *
 * Features:
 *  - ARIA: tablist, tab, tabpanel
 *  - Keyboard navigation (Arrow keys, Home, End)
 *  - Lazy load panels (Suspense)
 *  - Variants: line, enclosed, soft, pills
 *  - RTL-aware, responsive (scrollable)
 */
<template>
  <div class="work-tabs" :class="`work-tabs--${variant}`">
    <!-- Tab List -->
    <div
      role="tablist"
      :aria-label="ariaLabel"
      class="work-tabs__list"
      ref="listRef"
      @keydown="handleKeydown"
    >
      <button
        v-for="(tab, index) in tabs"
        :key="tab.id"
        role="tab"
        :id="`${tabId}-tab-${tab.id}`"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`${tabId}-panel-${tab.id}`"
        :tabindex="activeTab === tab.id ? 0 : -1"
        :disabled="tab.disabled"
        class="work-tabs__tab"
        :class="[
          { 'work-tabs__tab--active': activeTab === tab.id },
          { 'work-tabs__tab--disabled': tab.disabled },
        ]"
        @click="activateTab(tab.id)"
      >
        <FeatherIcon v-if="tab.icon" :name="tab.icon" class="work-tabs__tab-icon" aria-hidden="true" />
        <span class="work-tabs__tab-label">{{ t(tab.label) }}</span>
        <span
          v-if="tab.badge != null"
          class="work-tabs__tab-badge"
          :class="`work-tabs__tab-badge--${tab.badgeVariant || 'neutral'}`"
          aria-label="Badge"
        >
          {{ tab.badge }}
        </span>
      </button>

      <!-- Active Indicator (line variant) -->
      <div
        v-if="variant === 'line' && activeTab"
        class="work-tabs__indicator"
        :style="indicatorStyle"
        aria-hidden="true"
      />
    </div>

    <!-- Tab Panels -->
    <div class="work-tabs__panels">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :id="`${tabId}-panel-${tab.id}`"
        role="tabpanel"
        :aria-labelledby="`${tabId}-tab-${tab.id}`"
        :hidden="activeTab !== tab.id"
        class="work-tabs__panel"
        tabindex="0"
      >
        <Suspense v-if="tab.component">
          <template #default>
            <component :is="tab.component" :key="tab.id" />
          </template>
          <template #fallback>
            <div class="work-tabs__panel-loading" role="status">
              <div class="work-tabs__spinner" aria-hidden="true" />
              <span class="sr-only">{{ t('loadingTab') }}</span>
            </div>
          </template>
        </Suspense>
        <slot v-else :name="tab.id" />
      </div>
    </div>
  </div>
</template>

<script setup>
import {
	ref,
	computed,
	watch,
	onMounted,
	nextTick,
	defineAsyncComponent,
} from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"

const props = defineProps({
	/** Tabs configuration */
	tabs: {
		type: Array,
		required: true,
		// [{ id, label, icon?, badge?, badgeVariant?, disabled?, component? }]
	},
	/** Active tab ID */
	modelValue: { type: String, required: true },
	/** Variant */
	variant: {
		type: String,
		default: "line",
		validator: (v) => ["line", "enclosed", "soft", "pills"].includes(v),
	},
	/** ARIA label */
	ariaLabel: { type: String, default: "Tabs" },
	/** Lazy load inactive panels */
	lazy: { type: Boolean, default: true },
})

const emit = defineEmits(["update:modelValue", "change"])

const listRef = ref(null)
const tabId = `work-tabs-${Math.random().toString(36).slice(2)}`

const activeTab = ref(props.modelValue)

watch(
	() => props.modelValue,
	(val) => {
		if (val !== activeTab.value) activateTab(val)
	},
)

function activateTab(id) {
	const tab = props.tabs.find((t) => t.id === id)
	if (!tab || tab.disabled) return
	if (activeTab.value === id) return
	activeTab.value = id
	emit("update:modelValue", id)
	emit("change", id)
	scrollToActive()
}

function scrollToActive() {
	nextTick(() => {
		const list = listRef.value
		const activeBtn = list?.querySelector(".work-tabs__tab--active")
		if (!list || !activeBtn) return
		const { scrollLeft, clientWidth } = list
		const { offsetLeft, offsetWidth } = activeBtn
		if (
			offsetLeft < scrollLeft ||
			offsetLeft + offsetWidth > scrollLeft + clientWidth
		) {
			activeBtn.scrollIntoView({ behavior: "smooth", inline: "center" })
		}
	})
}

function handleKeydown(e) {
	const enabledTabs = props.tabs.filter((t) => !t.disabled)
	const currentIndex = enabledTabs.findIndex((t) => t.id === activeTab.value)
	let newIndex = currentIndex

	switch (e.key) {
		case "ArrowRight":
			e.preventDefault()
			newIndex = (currentIndex + 1) % enabledTabs.length
			break
		case "ArrowLeft":
			e.preventDefault()
			newIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length
			break
		case "Home":
			e.preventDefault()
			newIndex = 0
			break
		case "End":
			e.preventDefault()
			newIndex = enabledTabs.length - 1
			break
		default:
			return
	}

	activateTab(enabledTabs[newIndex].id)
	enabledTabs[newIndex]?.id &&
		nextTick(() => {
			listRef.value?.querySelector(`[aria-selected="true"]`)?.focus()
		})
}

const indicatorStyle = computed(() => {
	if (variant !== "line" || !activeTab.value) return {}
	const list = listRef.value
	const activeBtn = list?.querySelector(".work-tabs__tab--active")
	if (!list || !activeBtn) return {}

	const { offsetLeft, offsetWidth } = activeBtn
	return {
		transform: `translateX(${offsetLeft}px)`,
		width: `${offsetWidth}px`,
	}
})

onMounted(() => {
	scrollToActive()
})
</script>

<style scoped>
/* ============================================================================
   WorkTabs — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-tabs { display: flex; flex-direction: column; }

/* Tab List */
.work-tabs__list {
  display: flex;
  align-items: flex-end;
  gap: var(--dy-spacing-1, 4px);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: var(--dy-spacing-1, 4px);
  margin-bottom: calc(var(--dy-spacing-1, 4px) * -1);
}

.work-tabs__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-4, 16px);
  border: none;
  border-radius: var(--dy-radius-lg, 8px) var(--dy-radius-lg, 8px) 0 0;
  background: transparent;
  color: var(--dy-color-text-muted, #64748b);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-medium, 500);
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--dy-motion-duration-fast, 100ms), background-color var(--dy-motion-duration-fast, 100ms);
}
.work-tabs__tab:hover:not(.work-tabs__tab--disabled):not(.work-tabs__tab--active) {
  color: var(--dy-color-text-primary, #0f172a);
  background: var(--dy-color-surface-overlay, #f8fafc);
}
.work-tabs__tab:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}
.work-tabs__tab--disabled { opacity: 0.4; cursor: not-allowed; }

.work-tabs__tab-icon { width: 16px; height: 16px; flex-shrink: 0; }
.work-tabs__tab-label { line-height: 1; }

.work-tabs__tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--dy-radius-full, 9999px);
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
  font-weight: var(--dy-font-weight-bold, 700);
}
.work-tabs__tab-badge--neutral { background: var(--dy-color-surface-sunken, #f1f5f9); color: var(--dy-color-text-muted, #64748b); }
.work-tabs__tab-badge--primary { background: var(--dy-color-brand-100, #d1fae5); color: var(--dy-color-brand-700, #047857); }
.work-tabs__tab-badge--success { background: var(--dy-color-status-success-weak, #dcfce7); color: var(--dy-color-status-success-text, #166534); }
.work-tabs__tab-badge--warning { background: var(--dy-color-status-warning-weak, #fef3c7); color: var(--dy-color-status-warning-text, #92400e); }
.work-tabs__tab-badge--danger { background: var(--dy-color-status-danger-weak, #fee2e2); color: var(--dy-color-status-danger-text, #991b1b); }

/* Active State - Line Variant */
.work-tabs--line .work-tabs__tab--active {
  color: var(--dy-color-brand-500, #10b981);
}
.work-tabs--line .work-tabs__indicator {
  position: absolute;
  bottom: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--dy-color-brand-500, #10b981);
  transition: transform var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out), width var(--dy-motion-duration-normal, 150ms) var(--dy-motion-easing-ease-out, ease-out);
}

/* Active State - Enclosed Variant */
.work-tabs--enclosed .work-tabs__tab {
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-bottom: none;
  margin-bottom: -1px;
  border-radius: var(--dy-radius-lg, 8px) var(--dy-radius-lg, 8px) 0 0;
}
.work-tabs--enclosed .work-tabs__tab--active {
  background: var(--dy-color-surface-base, #ffffff);
  color: var(--dy-color-brand-500, #10b981);
  border-color: var(--dy-color-brand-500, #10b981);
  border-bottom-color: var(--dy-color-surface-base, #ffffff);
  z-index: 1;
}

/* Active State - Soft Variant */
.work-tabs--soft .work-tabs__tab--active {
  background: var(--dy-color-brand-50, #ecfdf5);
  color: var(--dy-color-brand-700, #047857);
}

/* Active State - Pills Variant */
.work-tabs--pills .work-tabs__tab {
  border-radius: var(--dy-radius-full, 9999px);
  padding-block: var(--dy-spacing-2, 8px);
}
.work-tabs--pills .work-tabs__tab--active {
  background: var(--dy-color-brand-500, #10b981);
  color: #ffffff;
}
.work-tabs--pills .work-tabs__list { padding-bottom: 0; margin-bottom: 0; }

/* Panels */
.work-tabs__panels { flex: 1; }
.work-tabs__panel { animation: work-tabs-panel-fade 0.15s ease-out; }
@keyframes work-tabs-panel-fade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.work-tabs__panel:focus-visible { outline: none; }
.work-tabs__panel[hidden] { display: none; }

.work-tabs__panel-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--dy-spacing-10, 40px);
  color: var(--dy-color-text-muted, #64748b);
}
.work-tabs__spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--dy-color-surface-border, #e2e8f0);
  border-block-start-color: var(--dy-color-brand-500, #10b981);
  border-radius: 50%;
  animation: work-tabs-spin 1s linear infinite;
}
@keyframes work-tabs-spin { to { transform: rotate(360deg); } }

/* Responsive */
@media (max-width: 640px) {
  .work-tabs__tab { padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px); }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-tabs__tab,
  .work-tabs__indicator,
  .work-tabs__panel,
  .work-tabs__spinner {
    transition: none;
    animation: none;
  }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-tabs__tab { border-color: CanvasText; color: CanvasText; }
  .work-tabs__tab:hover { background: Highlight; color: HighlightText; }
  .work-tabs__tab--active { background: Highlight; color: HighlightText; border-color: Highlight; }
  .work-tabs__indicator { background: Highlight; }
  .work-tabs--pills .work-tabs__tab--active { background: Highlight; color: HighlightText; }
}
</style>