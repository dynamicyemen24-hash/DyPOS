/**
 * ColumnFilter — فلتر لكل عمود مع أنواع متعددة.
 */
<template>
  <div
    class="work-data-grid__column-filter"
    :class="[
      'work-data-grid__column-filter',
      `work-data-grid__column-filter--${column.editorType || 'text'}`,
      { 'work-data-grid__column-filter--active': hasValue },
    ]"
  >
    <input
      v-if="column.editorType === 'text'"
      type="text"
      :value="value"
      :placeholder="t('filter')"
      @input="$emit('change', $event.target.value)"
      class="work-data-grid__filter-input"
      @click.stop
    />
    <input
      v-else-if="column.editorType === 'number'"
      type="number"
      :value="value?.min ?? ''"
      :placeholder="t('min')"
      @input="$emit('change', { ...value, min: Number($event.target.value) || undefined })"
      class="work-data-grid__filter-input work-data-grid__filter-input--small"
      @click.stop
    />
    <input
      v-else-if="column.editorType === 'number'"
      type="number"
      :value="value?.max ?? ''"
      :placeholder="t('max')"
      @input="$emit('change', { ...value, max: Number($event.target.value) || undefined })"
      class="work-data-grid__filter-input work-data-grid__filter-input--small"
      @click.stop
    />
    <input
      v-else-if="column.editorType === 'date'"
      type="date"
      :value="value?.from"
      @change="$emit('change', { ...value, from: $event.target.value || undefined })"
      class="work-data-grid__filter-input"
      @click.stop
    />
    <input
      v-else-if="column.editorType === 'date'"
      type="date"
      :value="value?.to"
      @change="$emit('change', { ...value, to: $event.target.value || undefined })"
      class="work-data-grid__filter-input"
      @click.stop
    />
    <select
      v-else-if="column.editorType === 'select'"
      :value="value?.values?.join(',') || ''"
      @change="$emit('change', { values: $event.target.value ? $event.target.value.split(',') : [] })"
      class="work-data-grid__filter-select"
      @click.stop
      multiple
    >
      <option v-for="opt in column.editorOptions" :key="opt.value" :value="opt.value">{{ t(opt.label) }}</option>
    </select>
    <button
      v-if="hasValue"
      type="button"
      class="work-data-grid__filter-clear"
      @click="$emit('clear')"
      :aria-label="t('clearFilter')"
    >
      <FeatherIcon name="x" class="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"

const props = defineProps({
	column: { type: Object, required: true },
	value: { type: [String, Number, Object, Array], default: null },
})

const emit = defineEmits(["change", "clear"])

const hasValue = computed(() => {
	if (props.value == null) return false
	if (typeof props.value === "object" && !Array.isArray(props.value)) {
		return Object.values(props.value).some((v) => v != null && v !== "")
	}
	if (Array.isArray(props.value)) return props.value.length > 0
	return props.value !== ""
})
</script>

<style scoped>
.work-data-grid__column-filter {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 4px;
}
.work-data-grid__column-filter--active { background: var(--dy-color-brand-50, #ecfdf5); border-radius: var(--dy-radius-sm, 4px); }

.work-data-grid__filter-input,
.work-data-grid__filter-select {
  flex: 1;
  padding: 4px 8px;
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-sm, 4px);
  background: var(--dy-color-surface-base, #ffffff);
  color: var(--dy-color-text-primary, #0f172a);
  font-size: 0.7rem;
  font-family: inherit;
}
.work-data-grid__filter-input--small { width: 45%; }
.work-data-grid__filter-input:focus,
.work-data-grid__filter-select:focus {
  outline: none;
  border-color: var(--dy-color-brand-500, #10b981);
  box-shadow: 0 0 0 2px var(--dy-color-brand-100, #d1fae5);
}

.work-data-grid__filter-select { cursor: pointer; }

.work-data-grid__filter-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: var(--dy-radius-sm, 4px);
  background: transparent;
  color: var(--dy-color-text-muted, #64748b);
  cursor: pointer;
}
.work-data-grid__filter-clear:hover { background: var(--dy-color-surface-sunken, #f1f5f9); color: var(--dy-color-status-danger-icon, #ef4444); }

@media (forced-colors: active) {
  .work-data-grid__filter-input,
  .work-data-grid__filter-select { border-color: CanvasText; background: Canvas; color: CanvasText; }
}
</style>