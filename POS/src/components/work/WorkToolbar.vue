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
          class="work-toolbar__overflow-menu"
          role="menu"
          :aria-label="t('moreActions')"
        >
          <button
            v-for="action in overflowActions"
            :key="action.id"
            type="button"
            class="work-toolbar__overflow-item"
            role="menuitem"
            :disabled="action.disabled"
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
import { ref, computed, onUnmounted } from "vue"
import { FeatherIcon } from "frappe-ui"
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
const overflowId = `work-toolbar-overflow-${Math.random().toString(36).slice(2)}`

const overflowActions = computed(() => props.overflowActions)

function toggleOverflow() {
	overflowOpen.value = !overflowOpen.value
}

function executeOverflow(action) {
	if (action.disabled) return
	action.handler?.()
	overflowOpen.value = false
}

// Close on outside click
function handleClickOutside(e) {
	if (overflowOpen.value && !e.target.closest(".work-toolbar__overflow")) {
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
.work-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--dy-border, #e2e8f0);
  background: #fff;
}
.work-toolbar--compact { padding: 8px 16px; gap: 8px; }
.work-toolbar--dense { gap: 8px; }
.work-toolbar__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.work-toolbar__row--start { justify-content: flex-start; }
.work-toolbar__row--center { justify-content: center; }
.work-toolbar__row--end { justify-content: flex-end; }
.work-toolbar__overflow { display: none; position: relative; }

/* Overflow button */
.work-toolbar__overflow-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--dy-text-muted, #64748b);
}
.work-toolbar__overflow-btn:hover { background: var(--dy-bg-hover, #f1f5f9); color: var(--dy-text, #0f172a); }
.work-toolbar__overflow-btn:focus-visible { outline: 2px solid var(--dy-primary, #059669); outline-offset: 2px; }

/* Overflow menu */
.work-toolbar__overflow-menu {
  position: absolute;
  inset-inline-end: 0;
  top: calc(100% + 4px);
  z-index: 50;
  min-width: 180px;
  padding: 4px;
  border: 1px solid var(--dy-border, #e2e8f0);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}
.work-toolbar__overflow-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dy-text, #334155);
  font-size: 13px;
  font-weight: 500;
  text-align: start;
  cursor: pointer;
}
.work-toolbar__overflow-item:hover:not(:disabled) { background: var(--dy-bg-hover, #f1f5f9); }
.work-toolbar__overflow-item:focus-visible { outline: 2px solid var(--dy-primary, #059669); outline-offset: -2px; }
.work-toolbar__overflow-item:disabled { opacity: 0.5; cursor: not-allowed; }

/* Transitions */
.work-toolbar-fade-enter-active,
.work-toolbar-fade-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.work-toolbar-fade-enter-from,
.work-toolbar-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* Responsive: stacked on mobile */
@media (max-width: 768px) {
  .work-toolbar__row--center { order: 3; width: 100%; }
  .work-toolbar__overflow { display: flex; }
}
@media (max-width: 640px) {
  .work-toolbar { padding: 8px 16px; }
  .work-toolbar__row { gap: 6px; }
}
@media (prefers-reduced-motion: reduce) {
  .work-toolbar__overflow-btn,
  .work-toolbar__overflow-item { transition: none; }
  .work-toolbar-fade-enter-active,
  .work-toolbar-fade-leave-active { transition: none; }
}
</style>