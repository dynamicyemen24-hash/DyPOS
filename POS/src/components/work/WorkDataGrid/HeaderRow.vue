/**
 * HeaderRow — صف الرأس لشبكة البيانات مع دعم الفرز، تغيير الحجم، إعادة الترتيب.
 */
<template>
  <tr role="row">
    <th
      v-if="selectable"
      class="work-data-grid__th work-data-grid__th--selection"
      scope="col"
      style="width: 48px; min-width: 48px; max-width: 48px;"
    >
      <input
        type="checkbox"
        :checked="allSelected"
        :indeterminate="indeterminate"
        @change="toggleAll"
        class="work-data-grid__select-all"
        :aria-label="t('selectAllRows')"
      />
    </th>
    <th
      v-for="column in columns"
      :key="column.key"
      :class="[
        'work-data-grid__th',
        column.sortable ? 'work-data-grid__th--sortable' : '',
        column.align ? `work-data-grid__th--${column.align}` : '',
        column.frozen ? 'work-data-grid__th--frozen' : '',
        resizingColumn?.key === column.key ? 'work-data-grid__th--resizing' : '',
      ]"
      scope="col"
      :style="{
        width: column.width + 'px',
        minWidth: column.minWidth + 'px',
        maxWidth: column.maxWidth + 'px',
      }"
      @click="column.sortable && $emit('sort', column.key)"
      @keydown.enter="column.sortable && $emit('sort', column.key)"
      @keydown.space.prevent="column.sortable && $emit('sort', column.key)"
      tabindex="column.sortable ? 0 : -1"
      aria-sort="getSortAria(column.key)"
    >
      <div class="work-data-grid__th-content">
        <span class="work-data-grid__th-label">{{ t(column.label) }}</span>
        <FeatherIcon
          v-if="column.sortable"
          :name="sortKey === column.key ? (sortAsc ? 'chevron-up' : 'chevron-down') : 'arrow-up-down'"
          :class="[
            'work-data-grid__sort-icon',
            { 'work-data-grid__sort-icon--active': sortKey === column.key },
          ]"
          aria-hidden="true"
        />
        <FeatherIcon
          v-if="columnFilters[column.key]"
          name="filter"
          class="work-data-grid__filter-icon"
          aria-hidden="true"
        />
      </div>
      <div
        v-if="column.resizable !== false"
        class="work-data-grid__resize-handle"
        @mousedown="startResize(column, $event)"
        @touchstart="startResize(column, $event)"
        :aria-label="t('resizeColumn', [t(column.label)])"
        role="separator"
        tabindex="0"
        @keydown.enter="startResizeKeyboard(column)"
      />
      <div
        v-if="draggableColumns"
        class="work-data-grid__drag-handle"
        @mousedown="startDrag(column, $event)"
        @touchstart="startDrag(column, $event)"
        :aria-label="t('reorderColumn', [t(column.label)])"
        draggable="true"
        @dragstart="onDragStart"
        @dragend="onDragEnd"
      >
        <FeatherIcon name="grip-horizontal" class="w-4 h-4" aria-hidden="true" />
      </div>
    </th>
  </tr>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"

const props = defineProps({
	columns: { type: Array, required: true },
	sortKey: { type: String, default: null },
	sortAsc: { type: Boolean, default: true },
	selectable: { type: Boolean, default: false },
	allSelected: { type: Boolean, default: false },
	indeterminate: { type: Boolean, default: false },
	columnFilters: { type: Object, default: () => ({}) },
	draggableColumns: { type: Boolean, default: true },
	resizingColumn: { type: Object, default: null },
})

const emit = defineEmits(["sort", "toggle-all", "resize", "reorder-start"])

function getSortAria(key) {
	if (props.sortKey !== key) return "none"
	return props.sortAsc ? "ascending" : "descending"
}

let resizeStartX = 0
let resizeStartWidth = 0

function startResize(column, e) {
	if (e.type === "touchstart") {
		resizeStartX = e.touches[0].clientX
	} else {
		resizeStartX = e.clientX
		e.preventDefault()
	}
	resizeStartWidth = column.width
	document.addEventListener("mousemove", onResizeMove)
	document.addEventListener("mouseup", onResizeEnd)
	document.addEventListener("touchmove", onResizeMove, { passive: true })
	document.addEventListener("touchend", onResizeEnd)
}

function onResizeMove(e) {
	const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX
	const delta = clientX - resizeStartX
	const newWidth = Math.max(column.minWidth || 80, resizeStartWidth + delta)
	emit("resize", { column, width: newWidth })
}

function onResizeEnd() {
	document.removeEventListener("mousemove", onResizeMove)
	document.removeEventListener("mouseup", onResizeEnd)
	document.removeEventListener("touchmove", onResizeMove)
	document.removeEventListener("touchend", onResizeEnd)
}

function startResizeKeyboard(column) {
	// For keyboard accessibility - could open a dialog for exact width
	emit("resize", { column, width: column.width })
}

let dragStartX = 0
let dragStartY = 0

function startDrag(column, e) {
	if (e.type === "touchstart") {
		dragStartX = e.touches[0].clientX
		dragStartY = e.touches[0].clientY
	} else {
		dragStartX = e.clientX
		dragStartY = e.clientY
	}
	emit("reorder-start", column)
}

function onDragStart(e) {
	e.dataTransfer.effectAllowed = "move"
	e.dataTransfer.setData("text/plain", "")
}

function onDragEnd() {
	// Handled by parent
}
</script>

<style scoped>
.work-data-grid__th {
  position: relative;
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
  text-align: start;
  font-weight: var(--dy-font-weight-semibold, 600);
  color: var(--dy-color-text-secondary, #334155);
  white-space: nowrap;
  user-select: none;
  background: var(--dy-color-surface-overlay, #f8fafc);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  vertical-align: middle;
}
.work-data-grid__th--sortable { cursor: pointer; }
.work-data-grid__th--sortable:hover { background: var(--dy-color-surface-sunken, #f1f5f9); }
.work-data-grid__th--sortable:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}
.work-data-grid__th--resizing { background: var(--dy-color-brand-50, #ecfdf5); }
.work-data-grid__th--frozen { z-index: 5; }

.work-data-grid__th-content {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-1, 4px);
  width: 100%;
}
.work-data-grid__th-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.work-data-grid__sort-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--dy-color-text-muted, #94a3b8);
  transition: transform var(--dy-motion-duration-fast, 100ms);
}
.work-data-grid__sort-icon--active { color: var(--dy-color-brand-500, #10b981); }
.work-data-grid__filter-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--dy-color-brand-500, #10b981);
}

.work-data-grid__resize-handle {
  position: absolute;
  inset-inline-end: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  background: transparent;
  transition: background var(--dy-motion-duration-fast, 100ms);
}
.work-data-grid__resize-handle:hover,
.work-data-grid__resize-handle:focus-visible {
  background: var(--dy-color-brand-500, #10b981);
}
.work-data-grid__resize-handle:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}

.work-data-grid__drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-inline-start: var(--dy-spacing-2, 8px);
  border-radius: var(--dy-radius-md, 6px);
  color: var(--dy-color-text-muted, #94a3b8);
  cursor: grab;
  opacity: 0;
  transition: opacity var(--dy-motion-duration-fast, 100ms);
}
.work-data-grid__th:hover .work-data-grid__drag-handle { opacity: 1; }
.work-data-grid__drag-handle:active { cursor: grabbing; }

.work-data-grid__th--start { text-align: start; }
.work-data-grid__th--center { text-align: center; }
.work-data-grid__th--end { text-align: end; }

.work-data-grid__select-all,
.work-data-grid__row-select {
  width: 16px;
  height: 16px;
  accent-color: var(--dy-color-brand-500, #10b981);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border-strong, #cbd5e1);
  border-radius: var(--dy-radius-sm, 4px);
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .work-data-grid__resize-handle { transition: none; }
}

@media (forced-colors: active) {
  .work-data-grid__th { border-color: CanvasText; color: CanvasText; background: Canvas; }
  .work-data-grid__resize-handle:hover { background: Highlight; }
  .work-data-grid__drag-handle { color: CanvasText; }
}
</style>