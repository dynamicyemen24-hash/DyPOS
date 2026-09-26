/**
 * DataRow — صف بيانات مع دعم التحديد، التحرير المباشر، التوسيع، والإجراءات.
 */
<template>
  <tr
    :data-row-key="rowKey"
    class="work-data-grid__row"
    :class="[
      'work-data-grid__row',
      { 'work-data-grid__row--selected': selected },
      { 'work-data-grid__row--expanded': expanded },
      { 'work-data-grid__row--clickable': rowClickable },
      { 'work-data-grid__row--editing': editing && editing.rowKey === rowKey && columns.some(c => c.key === editing.colKey) },
      rowClass ? rowClass(row) : '',
    ]"
    :role="selectable ? 'row' : undefined"
    :aria-selected="selectable ? selected : undefined"
    :aria-expanded="expandable ? expanded : undefined"
    @click="rowClickable && $emit('click', row, $event)"
    @dblclick="rowClickable && $emit('dblclick', row, $event)"
    @keydown="handleKeydown"
    tabindex="rowClickable ? 0 : -1"
  >
    <td
      v-if="selectable"
      class="work-data-grid__td work-data-grid__td--selection"
      style="width: 48px; min-width: 48px; max-width: 48px;"
    >
      <input
        type="checkbox"
        :checked="selected"
        @change="toggle"
        @click.stop
        class="work-data-grid__row-select"
        :aria-label="t('selectRow', [rowLabel])"
      />
    </td>
    <td
      v-for="column in columns"
      :key="column.key"
      :class="[
        'work-data-grid__td',
        column.align ? `work-data-grid__td--${column.align}` : '',
        column.frozen ? 'work-data-grid__td--frozen' : '',
      ]"
      :style="{
        width: column.width + 'px',
        minWidth: column.minWidth + 'px',
      }"
      :role="selectable ? 'gridcell' : undefined"
      :data-col-key="column.key"
      :data-row-key="rowKey"
    >
      <InlineEditCell
        v-if="editing && editing.rowKey === rowKey && editing.colKey === column.key"
        :column="column"
        :value="editing.originalValue"
        :options="editing.editorOptions"
        @save="value => $emit('edit-save', { rowKey, colKey: column.key, value })"
        @cancel="$emit('edit-cancel')"
      />
      <template v-else>
        <slot
          :name="`cell-${column.key}`"
          :row="row"
          :value="getCellValue(row, column)"
          :column="column"
          :row-index="rowIndex"
        >
          <span v-if="column.type === 'boolean'" class="work-data-grid__boolean">
            <FeatherIcon
              :name="value ? 'check-circle' : 'x-circle'"
              :class="['w-5 h-5', value ? 'text-green-600' : 'text-gray-400']"
            />
          </span>
          <span v-else-if="column.type === 'badge'" class="work-data-grid__badge">
            <DyBadge :variant="column.badgeVariant?.(row) || 'neutral'" :label="column.badgeLabel?.(row) || value" />
          </span>
          <span v-else-if="column.type === 'progress'" class="work-data-grid__progress">
            <div class="work-data-grid__progress-bar" :style="{ width: value + '%' }" />
          </span>
          <span v-else>{{ formatCell(row, column) }}</span>
        </slot>
      </template>
    </td>
    <td
      v-if="expandable"
      class="work-data-grid__td work-data-grid__td--expand"
      style="width: 40px; min-width: 40px; max-width: 40px;"
    >
      <button
        type="button"
        class="work-data-grid__expand-btn"
        @click.stop="$emit('expand', rowKey)"
        :aria-label="expanded ? t('collapseRow') : t('expandRow')"
        :aria-expanded="expanded"
      >
        <FeatherIcon :name="expanded ? 'chevron-up' : 'chevron-down'" class="w-5 h-5" aria-hidden="true" />
      </button>
    </td>
    <td
      v-if="showDetail"
      class="work-data-grid__td work-data-grid__td--detail"
      style="width: 40px; min-width: 40px; max-width: 40px;"
    >
      <button
        type="button"
        class="work-data-grid__detail-btn"
        @click.stop="$emit('detail', row)"
        :aria-label="t('viewDetails')"
      >
        <FeatherIcon name="eye" class="w-5 h-5" aria-hidden="true" />
      </button>
    </td>
  </tr>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import { formatCurrencySafe } from "@/utils/currency"
import DyBadge from "@/components/ui/DyBadge.vue"
import InlineEditCell from "./InlineEditCell.vue"

const props = defineProps({
	row: { type: Object, required: true },
	columns: { type: Array, required: true },
	rowIndex: { type: Number, required: true },
	rowKey: { type: String, required: true },
	selectable: { type: Boolean, default: false },
	selected: { type: Boolean, default: false },
	expanded: { type: Boolean, default: false },
	expandable: { type: Boolean, default: false },
	showDetail: { type: Boolean, default: false },
	editing: { type: Object, default: null },
	rowClass: { type: Function, default: null },
	rowClickable: { type: Boolean, default: true },
})

const emit = defineEmits([
	"click",
	"dblclick",
	"expand",
	"detail",
	"toggle",
	"keydown",
])

const rowLabel = computed(() => {
	const r = props.row
	return r?.name || r?.code || r?.id || ""
})

function getCellValue(row, column) {
	if (typeof column.compute === "function") return column.compute(row)
	return row?.[column.key]
}

function formatCell(row, column) {
	const value = getCellValue(row, column)
	if (value == null) return "—"
	switch (column.format) {
		case "currency":
			return formatCurrency(value)
		case "number":
			return formatNumber(value)
		case "percent":
			return formatPercent(value)
		case "date":
			return formatDate(value)
		default:
			return String(value)
	}
}

function formatCurrency(val) {
	return formatCurrencySafe(val)
}
function formatNumber(val) {
	return new Intl.NumberFormat("ar-SA").format(Number(val))
}
function formatPercent(val) {
	return new Intl.NumberFormat("ar-SA", { style: "percent" }).format(
		Number(val) / 100,
	)
}
function formatDate(val) {
	return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(
		new Date(val),
	)
}

function toggle() {
	emit("toggle")
}

function handleKeydown(e) {
	emit("keydown", e)
}
</script>

<style scoped>
.work-data-grid__row {
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  transition: background-color var(--dy-motion-duration-fast, 100ms);
}
.work-data-grid__row:last-child { border-bottom: none; }

.work-data-grid__row--selected {
  background: var(--dy-color-brand-50, #ecfdf5) !important;
}
.work-data-grid__row--clickable { cursor: pointer; }
.work-data-grid__row--clickable:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}
.work-data-grid__row--editing { background: var(--dy-color-brand-50, #ecfdf5); }

.work-data-grid__td {
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
  color: var(--dy-color-text-primary, #0f172a);
  vertical-align: middle;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.work-data-grid__td--start { text-align: start; }
.work-data-grid__td--center { text-align: center; }
.work-data-grid__td--end { text-align: end; }
.work-data-grid__td--frozen { background: var(--dy-color-surface-base, #ffffff); }
.work-data-grid__td--selection,
.work-data-grid__td--expand,
.work-data-grid__td--detail { text-align: center; padding: var(--dy-spacing-2, 8px); }

.work-data-grid__row-select {
  width: 16px;
  height: 16px;
  accent-color: var(--dy-color-brand-500, #10b981);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border-strong, #cbd5e1);
  border-radius: var(--dy-radius-sm, 4px);
  cursor: pointer;
}

.work-data-grid__expand-btn,
.work-data-grid__detail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--dy-radius-md, 6px);
  background: transparent;
  color: var(--dy-color-text-muted, #64748b);
  cursor: pointer;
  transition: background-color var(--dy-motion-duration-fast, 100ms), color var(--dy-motion-duration-fast, 100ms);
}
.work-data-grid__expand-btn:hover,
.work-data-grid__detail-btn:hover {
  background: var(--dy-color-surface-sunken, #f1f5f9);
  color: var(--dy-color-text-primary, #0f172a);
}
.work-data-grid__expand-btn:focus-visible,
.work-data-grid__detail-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}

.work-data-grid__boolean { display: inline-flex; }
.work-data-grid__progress { display: inline-block; width: 100%; height: 6px; background: var(--dy-color-surface-sunken, #f1f5f9); border-radius: 3px; overflow: hidden; }
.work-data-grid__progress-bar { height: 100%; background: var(--dy-color-brand-500, #10b981); border-radius: 3px; transition: width 0.3s ease; }

@media (forced-colors: active) {
  .work-data-grid__row { border-color: CanvasText; }
  .work-data-grid__row--selected { background: Highlight !important; color: HighlightText !important; }
  .work-data-grid__td { color: CanvasText; border-color: CanvasText; }
  .work-data-grid__row-select { border-color: CanvasText; }
}
</style>