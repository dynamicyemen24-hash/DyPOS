/**
 * WorkToolbar — شريط الأدوات الموحد (WCAG 2.2 AA).
 *
 * Slots:
 *  - default: محتوى حر (أزرار، قوائم، بحث)
 *  - start: إجراءات بداية الشريط
 *  - center: محتوى مركزي (بحث رئيسي)
 *  - end: إجراءات نهاية الشريط (تصدير، طباعة، إعدادات)
 *
 * Features:
 *  - Responsive: يتحول لصفين على الشاشات الصغيرة
 *  - Keyboard navigation: Tab order منطقي
 *  - ARIA: role="toolbar" مع aria-label
 *  - Reduced motion support
 */
<template>
  <div
    class="work-toolbar"
    :class="{ 'work-toolbar--compact': compact, 'work-toolbar--dense': dense }"
    role="toolbar"
    :aria-label="ariaLabel"
  >
    <div class="work-toolbar__row work-toolbar__row--start">
      <slot name="start">
        <slot name="default" />
      </slot>
    </div>

    <div class="work-toolbar__row work-toolbar__row--center">
      <slot name="center" />
    </div>

    <div class="work-toolbar__row work-toolbar__row--end">
      <slot name="end" />
    </div>

    <!-- Overflow menu for small screens -->
    <div v-if="overflowActions.length" class="work-toolbar__overflow">
      <button
        ref="overflowTrigger"
        type="button"
        class="work-toolbar__overflow-btn"
        @click="toggleOverflow"
        :aria-expanded="overflowOpen"
        :aria-label="t('moreActions')"
        :aria-controls="overflowId"
      >
        <FeatherIcon name="more-horizontal" class="w-5 h-5" aria-hidden="true" />
      </button>
      <Transition name="work-toolbar-fade">
        <div
          v-if="overflowOpen"
          :id="overflowId"
          ref="overflowMenu"
          class="work-toolbar__overflow-menu"
          role="menu"
          :aria-label="t('moreActions')"
          @keydown="handleMenuKeydown"
        >
          <button
            v-for="action in overflowActions"
            :key="action.id"
            type="button"
            class="work-toolbar__overflow-item"
            role="menuitem"
            :disabled="action.disabled"
            :aria-label="t(action.label)"
            @click="executeOverflow(action)"
          >
            <FeatherIcon v-if="action.icon" :name="action.icon" class="w-4 h-4" aria-hidden="true" />
            {{ t(action.label) }}
          </button>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, useId } from "vue"
import { FeatherIcon } from "dypos-ui"
import { t } from "@/utils/translation"

const props = defineProps({
	/** وضع مضغوط (أقل padding) */
	compact: { type: Boolean, default: false },
	/** وضع كثيف (أقل gap، للأدوات الكثيرة) */
	dense: { type: Boolean, default: false },
	/** aria-label للشريط */
	ariaLabel: { type: String, default: "Toolbar" },
	/** إجراءات تذهب لـ overflow menu على الموبايل */
	overflowActions: {
		type: Array,
		default: () => [],
		// [{ id, label, icon, disabled, handler }]
	},
})

const overflowOpen = ref(false)
const generatedId = useId()
const overflowId = `work-toolbar-overflow-${generatedId}`
const overflowTrigger = ref(null)
const overflowMenu = ref(null)

const overflowActions = computed(() => props.overflowActions)

async function toggleOverflow() {
	if (overflowOpen.value) {
		closeOverflow({ restoreFocus: true })
		return
	}
	overflowOpen.value = true
	await nextTick()
	overflowMenu.value?.querySelector("button:not(:disabled)")?.focus()
}

function closeOverflow({ restoreFocus = false } = {}) {
	overflowOpen.value = false
	if (restoreFocus) overflowTrigger.value?.focus()
}

function handleMenuKeydown(event) {
	if (event.key === "Escape") {
		event.preventDefault()
		event.stopPropagation()
		closeOverflow({ restoreFocus: true })
		return
	}
	const items = [...(overflowMenu.value?.querySelectorAll("button:not(:disabled)") || [])]
	if (!items.length) return
	const currentIndex = items.indexOf(document.activeElement)
	let nextIndex = null
	if (event.key === "ArrowDown") nextIndex = (currentIndex + 1 + items.length) % items.length
	if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length
	if (event.key === "Home") nextIndex = 0
	if (event.key === "End") nextIndex = items.length - 1
	if (nextIndex !== null) {
		event.preventDefault()
		items[nextIndex].focus()
	}
}

function executeOverflow(action) {
	if (action.disabled) return
	action.handler?.()
	closeOverflow({ restoreFocus: true })
}

// Close on outside click
function handleClickOutside(e) {
	if (overflowOpen.value && e.target instanceof Element && !e.target.closest(".work-toolbar__overflow")) {
		closeOverflow()
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
/* SAP Fiori-inspired workbench: quiet surfaces, clear hierarchy, minimal chrome. */
.work-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, min(34vw, 440px)) minmax(0, 1fr);
  grid-template-areas: "start center end";
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 24px;
  border-block-end: 1px solid var(--dy-border, #d9d9d9);
  background: var(--dy-surface, #fff);
  color: var(--dy-text, #1d2d3e);
}
.work-toolbar--compact { padding: 8px 16px; gap: 8px; }
.work-toolbar--dense { gap: 8px; }
.work-toolbar__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.work-toolbar__row--start { grid-area: start; justify-content: flex-start; }
.work-toolbar__row--center { grid-area: center; justify-content: center; }
.work-toolbar__row--end { grid-area: end; justify-content: flex-end; }
.work-toolbar__overflow { display: none; position: relative; justify-self: end; }
.work-toolbar :deep(:is(button, [role="button"], input, select, a):focus-visible) {
  outline: 2px solid var(--dy-color-fiori-blue, #0066c4);
  outline-offset: 2px;
}
.work-toolbar :deep(:is(button, input, select)) { max-width: 100%; }

/* Overflow button */
.work-toolbar__overflow-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  min-width: 44px;
  height: 44px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--dy-text-muted, #526579);
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease;
}
.work-toolbar__overflow-btn:hover { background: var(--dy-bg-hover, #f2f4f5); border-color: var(--dy-border, #d9d9d9); }
.work-toolbar__overflow-btn:focus-visible { outline: 2px solid var(--dy-color-fiori-blue, #0066c4); outline-offset: 2px; }

/* Menu surface and menu items */
.work-toolbar__overflow-menu {
  position: absolute;
  inset-inline-end: 0;
  top: calc(100% + 4px);
  z-index: 50;
  min-width: 200px;
  max-width: min(320px, calc(100vw - 32px));
  padding: 4px;
  border: 1px solid var(--dy-border, #d9d9d9);
  border-radius: 6px;
  background: var(--dy-surface, #fff);
  box-shadow: 0 4px 16px rgb(29 45 62 / 16%);
}
.work-toolbar__overflow-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--dy-text, #1d2d3e);
  font-size: 13px;
  font-weight: 500;
  text-align: start;
  cursor: pointer;
}
.work-toolbar__overflow-item:hover:not(:disabled) { background: var(--dy-bg-hover, #f2f4f5); }
.work-toolbar__overflow-item:focus-visible { outline: 2px solid var(--dy-color-fiori-blue, #0066c4); outline-offset: -2px; }
.work-toolbar__overflow-item:disabled { opacity: 0.5; cursor: not-allowed; }

/* Motion is decorative only and may be disabled by the user. */
.work-toolbar-fade-enter-active,
.work-toolbar-fade-leave-active { transition: opacity 120ms ease, transform 120ms ease; }
.work-toolbar-fade-enter-from,
.work-toolbar-fade-leave-to { opacity: 0; transform: translateY(-3px); }

@media (max-width: 768px) {
  .work-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "start overflow" "center center" "end end";
    gap: 8px;
    padding: 10px 16px;
  }
  .work-toolbar__row--center { width: 100%; justify-content: stretch; }
  .work-toolbar__row--end { justify-content: flex-start; }
  .work-toolbar__overflow { display: flex; grid-area: overflow; }
}
@media (max-width: 640px) {
  .work-toolbar { padding: 8px 12px; }
  .work-toolbar__row { gap: 6px; }
  .work-toolbar__row--start,
  .work-toolbar__row--end { align-items: stretch; }
}
@media (prefers-reduced-motion: reduce) {
  .work-toolbar__overflow-btn,
  .work-toolbar__overflow-item,
  .work-toolbar-fade-enter-active,
  .work-toolbar-fade-leave-active { transition: none; }
}
@media (forced-colors: active) {
  .work-toolbar,
  .work-toolbar__overflow-menu,
  .work-toolbar__overflow-item { border-color: CanvasText; }
  .work-toolbar__overflow-btn:focus-visible,
  .work-toolbar__overflow-item:focus-visible { outline-color: Highlight; }
}
</style>