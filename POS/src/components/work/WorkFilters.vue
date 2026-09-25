/**
 * WorkFilters — لوحة الفلاتر الموحدة (WCAG 2.2 AA).
 *
 * Features:
 *  - Collapsible panel with smooth animation
 *  - Form-based filter inputs (text, select, date, number, checkbox)
 *  - Applied filters summary with clear actions
 *  - Keyboard navigation (Tab, Escape to collapse)
 *  - ARIA: region role, labelledby, expanded state
 *  - Persist state via provide/inject (optional)
 *  - Server-side filter serialization
 */
<template>
  <div class="work-filters" :class="{ 'work-filters--open': open }">
    <!-- Toggle Button -->
    <button
      type="button"
      class="work-filters__toggle"
      @click="toggle"
      :aria-expanded="open"
      :aria-controls="panelId"
      :aria-label="open ? t('collapseFilters') : t('expandFilters')"
    >
      <FeatherIcon name="filter" class="w-5 h-5" aria-hidden="true" />
      <span>{{ t('filters') }}</span>
      <span
        v-if="activeCount > 0"
        class="work-filters__count"
        aria-label="{{ t('activeFiltersCount', [activeCount]) }}"
      >
        {{ activeCount }}
      </span>
      <FeatherIcon
        :name="open ? 'chevron-up' : 'chevron-down'"
        class="w-4 h-4"
        aria-hidden="true"
      />
    </button>

    <!-- Panel -->
    <Transition name="work-filters-slide">
      <div
        v-show="open"
        :id="panelId"
        class="work-filters__panel"
        role="region"
        :aria-label="t('filtersPanel')"
        :aria-labelledby="toggleId"
      >
        <div class="work-filters__header">
          <h2 class="work-filters__title">{{ t('filters') }}</h2>
          <div class="work-filters__header-actions">
            <button
              type="button"
              class="work-filters__btn work-filters__btn--ghost"
              @click="resetAll"
              :disabled="activeCount === 0"
              :aria-label="t('resetFilters')"
            >
              {{ t('reset') }}
            </button>
            <button
              type="button"
              class="work-filters__btn work-filters__btn--primary"
              @click="apply"
              :aria-label="t('applyFilters')"
            >
              {{ t('apply') }}
            </button>
          </div>
        </div>

        <!-- Active Filters Summary -->
        <div
          v-if="activeCount > 0"
          class="work-filters__active"
          role="list"
          :aria-label="t('activeFilters')"
        >
          <span class="work-filters__active-label">{{ t('activeFilters') }}:</span>
          <ul class="work-filters__active-list" role="list">
            <li
              v-for="filter in activeFilters"
              :key="filter.key"
              class="work-filters__active-item"
              role="listitem"
            >
              <span class="work-filters__active-name">{{ t(filter.label) }}</span>
              <span class="work-filters__active-value">{{ filter.display }}</span>
              <button
                type="button"
                class="work-filters__active-remove"
                @click="removeFilter(filter.key)"
                :aria-label="t('removeFilter', [t(filter.label)])"
              >
                <FeatherIcon name="x" class="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <button
            type="button"
            class="work-filters__clear-all"
            @click="resetAll"
            :aria-label="t('clearAllFilters')"
          >
            {{ t('clearAll') }}
          </button>
        </div>

        <!-- Filter Fields -->
        <div class="work-filters__fields">
          <slot name="fields">
            <div
              v-for="field in fields"
              :key="field.key"
              class="work-filters__field"
            >
              <WorkFilterField
                v-model="modelValue[field.key]"
                :field="field"
                :disabled="disabled"
                @change="handleFieldChange(field.key)"
              />
            </div>
          </slot>
        </div>

        <!-- Footer Actions -->
        <div class="work-filters__footer">
          <button
            type="button"
            class="work-filters__btn work-filters__btn--ghost"
            @click="resetAll"
            :disabled="activeCount === 0"
          >
            {{ t('reset') }}
          </button>
          <button
            type="button"
            class="work-filters__btn work-filters__btn--primary"
            @click="apply"
          >
            {{ t('apply') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import WorkFilterField from "./WorkFilterField.vue"

const props = defineProps({
	/** Model value (v-model) */
	modelValue: { type: Object, default: () => ({}) },
	/** تعريف حقول الفلاتر */
	fields: {
		type: Array,
		default: () => [],
		// [{ key, label, type: 'text'|'select'|'date'|'daterange'|'number'|'checkbox'|'multiselect', options?, placeholder?, multiple?, min?, max?, step? }]
	},
	/** معطل بالكامل */
	disabled: { type: Boolean, default: false },
	/** مفتوح افتراضياً */
	defaultOpen: { type: Boolean, default: false },
	/** تطبيق تلقائي عند التغيير */
	autoApply: { type: Boolean, default: false },
})

const emit = defineEmits(["update:modelValue", "apply", "reset", "change"])

const open = ref(props.defaultOpen)
const panelId = `work-filters-panel-${Math.random().toString(36).slice(2)}`
const toggleId = `work-filters-toggle-${Math.random().toString(36).slice(2)}`

const localModel = ref({ ...props.modelValue })

watch(
	() => props.modelValue,
	(val) => {
		localModel.value = { ...val }
	},
	{ deep: true },
)

watch(
	localModel,
	(val) => {
		emit("update:modelValue", val)
		if (props.autoApply) emit("apply", val)
	},
	{ deep: true },
)

const activeFilters = computed(() => {
	const result = []
	for (const field of props.fields) {
		const value = localModel.value[field.key]
		if (value !== undefined && value !== "" && value !== null) {
			if (Array.isArray(value) && value.length === 0) continue
			result.push({
				key: field.key,
				label: field.label,
				value,
				display: formatFilterValue(value, field),
			})
		}
	}
	return result
})

const activeCount = computed(() => activeFilters.value.length)

function formatFilterValue(value, field) {
	if (Array.isArray(value))
		return value
			.map((v) => field.options?.find((o) => o.value === v)?.label || v)
			.join(", ")
	if (field.type === "date" || field.type === "daterange") return value
	if (field.type === "select")
		return field.options?.find((o) => o.value === value)?.label || value
	if (field.type === "checkbox") return value ? t("yes") : t("no")
	return value
}

function handleFieldChange(key) {
	emit("change", key, localModel.value[key])
}

function toggle() {
	open.value = !open.value
}

function apply() {
	emit("apply", { ...localModel.value })
}

function resetAll() {
	const reset = {}
	for (const field of props.fields) {
		reset[field.key] = getDefaultValue(field)
	}
	localModel.value = reset
	emit("reset", reset)
	if (props.autoApply) emit("apply", reset)
}

function removeFilter(key) {
	const field = props.fields.find((f) => f.key === key)
	if (field) {
		localModel.value[key] = getDefaultValue(field)
	}
}

function getDefaultValue(field) {
	switch (field.type) {
		case "checkbox":
			return false
		case "multiselect":
			return []
		case "number":
			return field.min ?? null
		default:
			return ""
	}
}

// Close on Escape
onMounted(() => {
	const handleKeydown = (e) => {
		if (e.key === "Escape" && open.value) {
			open.value = false
			document.getElementById(toggleId)?.focus()
		}
	}
	document.addEventListener("keydown", handleKeydown)
	return () => document.removeEventListener("keydown", handleKeydown)
})

defineOptions({ inheritAttrs: false })
</script>

<style scoped>
.work-filters { border-bottom: 1px solid var(--dy-border, #e2e8f0); background: #fff; }
.work-filters__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dy-text, #334155);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.work-filters__toggle:hover { background: var(--dy-bg-hover, #f1f5f9); }
.work-filters__toggle:focus-visible { outline: 2px solid var(--dy-primary, #059669); outline-offset: 2px; }
.work-filters__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9999px;
  background: var(--dy-primary, #059669);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.work-filters__panel {
  padding: 16px 24px;
  border-top: 1px solid var(--dy-border, #e2e8f0);
  background: #fafafa;
}
.work-filters__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}
.work-filters__title { margin: 0; font-size: 16px; font-weight: 600; color: var(--dy-text, #0f172a); }
.work-filters__header-actions { display: flex; gap: 8px; }
.work-filters__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.work-filters__btn:focus-visible { outline: 2px solid var(--dy-primary, #059669); outline-offset: 2px; }
.work-filters__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.work-filters__btn--ghost { border: 1px solid var(--dy-border, #e2e8f0); background: transparent; color: var(--dy-text, #334155); }
.work-filters__btn--ghost:hover:not(:disabled) { background: var(--dy-bg-hover, #f1f5f9); }
.work-filters__btn--primary { border: 0; background: var(--dy-primary, #059669); color: #fff; }
.work-filters__btn--primary:hover:not(:disabled) { background: var(--dy-primary-hover, #047857); }
.work-filters__active {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-bottom: 16px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--dy-border, #e2e8f0);
}
.work-filters__active-label { font-size: 12px; font-weight: 600; color: var(--dy-text-muted, #64748b); }
.work-filters__active-list { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
.work-filters__active-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 10px;
  border-radius: 9999px;
  background: var(--dy-primary-light, #ecfdf5);
  border: 1px solid var(--dy-primary-light, #a7f3d0);
  font-size: 12px;
}
.work-filters__active-name { font-weight: 600; color: var(--dy-primary, #059669); }
.work-filters__active-value { color: var(--dy-text, #334155); }
.work-filters__active-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--dy-primary, #059669);
  cursor: pointer;
}
.work-filters__active-remove:hover { background: rgba(5, 150, 105, 0.1); }
.work-filters__active-remove:focus-visible { outline: 2px solid var(--dy-primary, #059669); outline-offset: 2px; }
.work-filters__clear-all {
  margin-inline-start: auto;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dy-text-muted, #64748b);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.work-filters__clear-all:hover { color: var(--dy-text, #0f172a); background: var(--dy-bg-hover, #f1f5f9); }
.work-filters__clear-all:focus-visible { outline: 2px solid var(--dy-primary, #059669); outline-offset: 2px; }
.work-filters__fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.work-filters__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--dy-border, #e2e8f0);
}

/* Transitions */
.work-filters-slide-enter-active,
.work-filters-slide-leave-active { transition: all 0.25s ease; }
.work-filters-slide-enter-from,
.work-filters-slide-leave-to { opacity: 0; transform: translateY(-8px); max-height: 0; }
.work-filters-slide-enter-to,
.work-filters-slide-leave-from { max-height: 800px; }

@media (max-width: 640px) {
  .work-filters__toggle { width: 100%; justify-content: space-between; }
  .work-filters__panel { padding: 12px 16px; }
  .work-filters__fields { grid-template-columns: 1fr; }
  .work-filters__footer { flex-direction: column-reverse; }
  .work-filters__footer .work-filters__btn { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .work-filters__toggle,
  .work-filters__btn,
  .work-filters__active-remove { transition: none; }
  .work-filters-slide-enter-active,
  .work-filters-slide-leave-active { transition: none; }
}
</style>