/**
 * WorkTable — جدول البيانات الموحد (WCAG 2.2 AA).
 *
 * Features:
 *  - Column sorting (keyboard accessible)
 *  - Row selection (single/multi)
 *  - Custom cell rendering via slots
 *  - Responsive: horizontal scroll + column hiding
 *  - ARIA: grid role, columnheader, rowheader
 *  - Reduced motion, high contrast
 */
<template>
  <div class="work-table" :class="{ 'work-table--striped': striped, 'work-table--hoverable': hoverable }">
    <div class="work-table__wrapper" ref="wrapperRef">
      <table
        class="work-table__table"
        :role="selectable ? 'grid' : 'table'"
        :aria-label="ariaLabel"
        :aria-multiselectable="selectable && selectionMode === 'multiple'"
      >
        <thead class="work-table__head">
          <tr role="row">
            <th
              v-if="selectable"
              class="work-table__th work-table__th--selection"
              scope="col"
              style="width: 48px"
            >
              <input
                type="checkbox"
                :checked="allSelected"
                :indeterminate="indeterminate"
                @change="toggleAllSelection"
                class="work-table__select-all"
                :aria-label="t('selectAllRows')"
              />
            </th>
            <th
              v-for="column in columns"
              :key="column.key"
              :class="[
                'work-table__th',
                column.sortable ? 'work-table__th--sortable' : '',
                column.align ? `work-table__th--${column.align}` : '',
              ]"
              :scope="column.key === rowKey ? 'col' : 'col'"
              :style="column.width ? { width: column.width } : undefined"
              @click="column.sortable && handleSort(column.key)"
              @keydown.enter="column.sortable && handleSort(column.key)"
              @keydown.space.prevent="column.sortable && handleSort(column.key)"
              tabindex="column.sortable ? 0 : -1"
              aria-sort="getSortAria(column.key)"
            >
              <div class="work-table__th-content">
                <span>{{ t(column.label) }}</span>
                <FeatherIcon
                  v-if="column.sortable"
                  :name="sortKey === column.key ? (sortAsc ? 'chevron-up' : 'chevron-down') : 'arrow-up-down'"
                  :class="[
                    'work-table__sort-icon',
                    { 'work-table__sort-icon--active': sortKey === column.key },
                  ]"
                  aria-hidden="true"
                />
              </div>
            </th>
            <th
              v-if="actionsColumn"
              class="work-table__th work-table__th--actions"
              scope="col"
              :style="{ width: actionsWidth }"
            >
              {{ t(actionsColumn.label || 'actions') }}
            </th>
          </tr>
        </thead>

        <tbody class="work-table__body">
          <tr
            v-for="(row, rowIndex) in sortedRows"
            :key="getRowKey(row, rowIndex)"
            class="work-table__row"
            :class="[
              { 'work-table__row--selected': isRowSelected(row) },
              { 'work-table__row--clickable': rowClickable },
              rowClass ? rowClass(row) : '',
            ]"
            :role="selectable ? 'row' : undefined"
            :aria-selected="selectable ? isRowSelected(row) : undefined"
            @click="rowClickable && handleRowClick(row, $event)"
            @keydown.enter.space="rowClickable && handleRowClick(row, $event)"
            tabindex="rowClickable ? 0 : -1"
          >
            <td
              v-if="selectable"
              class="work-table__td work-table__td--selection"
            >
              <input
                type="checkbox"
                :checked="isRowSelected(row)"
                @change="toggleRowSelection(row)"
                @click.stop
                class="work-table__row-select"
                :aria-label="t('selectRow', [getRowLabel(row)])"
              />
            </td>
            <td
              v-for="column in columns"
              :key="column.key"
              :class="[
                'work-table__td',
                column.align ? `work-table__td--${column.align}` : '',
              ]"
              :role="selectable ? 'gridcell' : undefined"
            >
              <slot
                :name="`cell-${column.key}`"
                :row="row"
                :value="getCellValue(row, column)"
                :column="column"
                :row-index="rowIndex"
              >
                {{ formatCell(row, column) }}
              </slot>
            </td>
            <td
              v-if="actionsColumn"
              class="work-table__td work-table__td--actions"
            >
              <div class="work-table__actions" role="group" :aria-label="t('rowActions', [getRowLabel(row)])">
                <slot
                  :name="actions"
                  :row="row"
                  :index="rowIndex"
                >
                  <button
                    v-for="action in actionsColumn.actions"
                    :key="action.id"
                    type="button"
                    :class="['work-table__action', `work-table__action--${action.variant || 'ghost'}`]"
                    :disabled="action.disabled?.(row)"
                    :aria-label="t(action.label)"
                    @click.stop="action.handler(row)"
                  >
                    <FeatherIcon
                      v-if="action.icon"
                      :name="action.icon"
                      class="w-4 h-4"
                      aria-hidden="true"
                    />
                  </button>
                </slot>
              </div>
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-if="!sortedRows.length" class="work-table__empty-row">
            <td :colspan="totalColumns" class="work-table__empty-cell">
              <WorkEmptyState
                :icon="emptyIcon"
                :title="emptyTitle"
                :description="emptyDescription"
                :size="'sm'"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <WorkPagination
      v-if="pagination && totalPages > 1"
      :current-page="currentPage"
      :total-pages="totalPages"
      :page-size="pageSize"
      :total-items="totalItems"
      @page-change="handlePageChange"
      @page-size-change="handlePageSizeChange"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import WorkEmptyState from "./WorkEmptyState.vue"
import WorkPagination from "./WorkPagination.vue"

const props = defineProps({
	/** Column definitions */
	columns: {
		type: Array,
		required: true,
		// [{ key, label, sortable, align: 'start'|'center'|'end', width, format, compute }]
	},
	/** Data rows */
	rows: { type: Array, default: () => [] },
	/** Unique row key */
	rowKey: { type: String, default: "id" },
	/** Row clickable */
	rowClickable: { type: Boolean, default: false },
	/** Custom row class function */
	rowClass: { type: Function, default: null },
	/** Selection */
	selectable: { type: Boolean, default: false },
	selectionMode: {
		type: String,
		default: "multiple",
		validator: (v) => ["single", "multiple"].includes(v),
	},
	selectedRows: { type: Array, default: () => [] },
	/** Actions column */
	actionsColumn: { type: Object, default: null },
	actionsWidth: { type: String, default: "120px" },
	/** Sorting */
	defaultSort: { type: Object, default: null },
	/** Pagination */
	pagination: { type: Boolean, default: true },
	currentPage: { type: Number, default: 1 },
	pageSize: { type: Number, default: 20 },
	totalItems: { type: Number, default: 0 },
	/** Styling */
	striped: { type: Boolean, default: false },
	hoverable: { type: Boolean, default: true },
	/** Empty state */
	emptyIcon: { type: String, default: "inbox" },
	emptyTitle: { type: String, default: "noData" },
	emptyDescription: { type: String, default: "noDataDescription" },
	/** Accessibility */
	ariaLabel: { type: String, default: "Data Table" },
})

const emit = defineEmits([
	"update:selectedRows",
	"update:currentPage",
	"update:pageSize",
	"sort",
	"row-click",
	"row-select",
])

const sortKey = ref(props.defaultSort?.key || null)
const sortAsc = ref(props.defaultSort?.asc ?? true)
const localSelectedRows = ref([...props.selectedRows])
const wrapperRef = ref(null)

watch(
	() => props.selectedRows,
	(val) => {
		localSelectedRows.value = [...val]
	},
)
watch(
	() => props.defaultSort?.key,
	(val) => {
		if (val) sortKey.value = val
	},
)
watch(
	() => props.defaultSort?.asc,
	(val) => {
		if (val !== undefined) sortAsc.value = val
	},
)

const sortedRows = computed(() => {
	const rows = [...props.rows]
	if (!sortKey.value) return rows
	const column = props.columns.find((c) => c.key === sortKey.value)
	const direction = sortAsc.value ? 1 : -1
	return rows.sort((a, b) => {
		const av = getCellValue(a, column)
		const bv = getCellValue(b, column)
		if (typeof av === "number" && typeof bv === "number")
			return (av - bv) * direction
		return String(av ?? "").localeCompare(String(bv ?? "")) * direction
	})
})

const totalColumns = computed(() => {
	let count = props.columns.length
	if (props.selectable) count++
	if (props.actionsColumn) count++
	return count
})

const allSelected = computed(() => {
	if (!props.selectable || !sortedRows.value.length) return false
	return sortedRows.value.every((row) => isRowSelected(row))
})

const indeterminate = computed(() => {
	if (!props.selectable) return false
	const selected = sortedRows.value.filter((row) => isRowSelected(row)).length
	return selected > 0 && selected < sortedRows.value.length
})

const totalPages = computed(() => Math.ceil(props.totalItems / props.pageSize))

function getCellValue(row, column) {
	if (typeof column.compute === "function") return column.compute(row)
	return row?.[column.key]
}

function getRowKey(row, index) {
	return row?.[props.rowKey] ?? `row-${index}`
}

function getRowLabel(row) {
	return row?.name || row?.code || row?.id || ""
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

function isRowSelected(row) {
	return localSelectedRows.value.some(
		(r) => r[props.rowKey] === row[props.rowKey],
	)
}

function toggleRowSelection(row) {
	const key = row[props.rowKey]
	const idx = localSelectedRows.value.findIndex((r) => r[props.rowKey] === key)
	if (idx >= 0) localSelectedRows.value.splice(idx, 1)
	else {
		if (props.selectionMode === "single") localSelectedRows.value = []
		localSelectedRows.value.push(row)
	}
	emit("update:selectedRows", [...localSelectedRows.value])
	emit("row-select", row, localSelectedRows.value)
}

function toggleAllSelection() {
	if (allSelected.value) {
		localSelectedRows.value = localSelectedRows.value.filter(
			(r) =>
				!sortedRows.value.some((sr) => sr[props.rowKey] === r[props.rowKey]),
		)
	} else {
		for (const row of sortedRows.value) {
			if (!isRowSelected(row)) localSelectedRows.value.push(row)
		}
	}
	emit("update:selectedRows", [...localSelectedRows.value])
}

function handleSort(key) {
	if (sortKey.value === key) sortAsc.value = !sortAsc.value
	else {
		sortKey.value = key
		sortAsc.value = true
	}
	emit("sort", { key, asc: sortAsc.value })
}

function getSortAria(key) {
	if (sortKey.value !== key) return "none"
	return sortAsc.value ? "ascending" : "descending"
}

function handleRowClick(row, e) {
	if (e.target.closest("button, a, input, select, label")) return
	emit("row-click", row)
}

function handlePageChange(page) {
	emit("update:currentPage", page)
}

function handlePageSizeChange(size) {
	emit("update:pageSize", size)
	emit("update:currentPage", 1)
}

function formatCurrency(val) {
	return new Intl.NumberFormat("ar-SA", {
		style: "currency",
		currency: "SAR",
	}).format(Number(val))
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
</script>

<style scoped>
/* ============================================================================
   WorkTable — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-table {
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-xl, 12px);
  overflow: hidden;
}

.work-table__wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.work-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
}

/* Header */
.work-table__head {
  background: var(--dy-color-surface-overlay, #f8fafc);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}

.work-table__th {
  padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
  text-align: start;
  font-weight: var(--dy-font-weight-semibold, 600);
  color: var(--dy-color-text-secondary, #334155);
  white-space: nowrap;
  user-select: none;
}

.work-table__th--sortable {
  cursor: pointer;
}
.work-table__th--sortable:hover {
  background: var(--dy-color-surface-sunken, #f1f5f9);
}
.work-table__th--sortable:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}

.work-table__th-content {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-1, 4px);
}

.work-table__sort-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--dy-color-text-muted, #94a3b8);
  transition: transform var(--dy-motion-duration-fast, 100ms);
}
.work-table__sort-icon--active {
  color: var(--dy-color-brand-500, #10b981);
}

.work-table__th--start { text-align: start; }
.work-table__th--center { text-align: center; }
.work-table__th--end { text-align: end; }

.work-table__th--selection,
.work-table__th--actions { text-align: center; }

/* Body */
.work-table__body { background: var(--dy-color-surface-base, #ffffff); }

.work-table__row {
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  transition: background-color var(--dy-motion-duration-fast, 100ms);
}
.work-table__row:last-child { border-bottom: none; }

.work-table--hoverable .work-table__row--clickable:hover,
.work-table--hoverable .work-table__row:hover {
  background: var(--dy-color-surface-overlay, #f8fafc);
}
.work-table--striped .work-table__row:nth-child(even) {
  background: var(--dy-color-surface-overlay, #f8fafc);
}

.work-table__row--selected {
  background: var(--dy-color-brand-50, #ecfdf5) !important;
}

.work-table__row--clickable {
  cursor: pointer;
}
.work-table__row--clickable:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}

/* Cells */
.work-table__td {
  padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
  color: var(--dy-color-text-primary, #0f172a);
  vertical-align: middle;
}

.work-table__td--start { text-align: start; }
.work-table__td--center { text-align: center; }
.work-table__td--end { text-align: end; }

.work-table__td--selection,
.work-table__td--actions { text-align: center; }

.work-table__select-all,
.work-table__row-select {
  width: 18px;
  height: 18px;
  accent-color: var(--dy-color-brand-500, #10b981);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border-strong, #cbd5e1);
  border-radius: var(--dy-radius-sm, 4px);
  cursor: pointer;
}
.work-table__select-all:focus-visible,
.work-table__row-select:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

/* Actions */
.work-table__actions {
  display: inline-flex;
  gap: var(--dy-spacing-1, 4px);
}

.work-table__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--dy-radius-md, 6px);
  background: transparent;
  color: var(--dy-color-text-muted, #64748b);
  cursor: pointer;
  transition: background-color var(--dy-motion-duration-fast, 100ms), color var(--dy-motion-duration-fast, 100ms);
}
.work-table__action:hover:not(:disabled) {
  background: var(--dy-color-surface-sunken, #f1f5f9);
  color: var(--dy-color-text-primary, #0f172a);
}
.work-table__action:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}
.work-table__action:disabled { opacity: 0.5; cursor: not-allowed; }
.work-table__action--primary { color: var(--dy-color-brand-500, #10b981); }
.work-table__action--primary:hover:not(:disabled) { background: var(--dy-color-brand-50, #ecfdf5); }
.work-table__action--danger { color: var(--dy-color-status-danger-icon, #ef4444); }
.work-table__action--danger:hover:not(:disabled) { background: var(--dy-color-status-danger-weak, #fee2e2); }

/* Empty Row */
.work-table__empty-row { background: transparent; }
.work-table__empty-cell {
  padding: var(--dy-spacing-10, 40px) var(--dy-spacing-4, 16px) !important;
  border: none !important;
}

/* Responsive */
@media (max-width: 768px) {
  .work-table__th,
  .work-table__td { padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px); }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-table__row,
  .work-table__action,
  .work-table__th--sortable,
  .work-table__sort-icon {
    transition: none;
  }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-table { border-color: CanvasText; }
  .work-table__head { border-color: CanvasText; background: Canvas; }
  .work-table__th { color: CanvasText; border-color: CanvasText; }
  .work-table__row { border-color: CanvasText; }
  .work-table__row--selected { background: Highlight !important; color: HighlightText !important; }
  .work-table__td { color: CanvasText; }
  .work-table__action { color: CanvasText; }
  .work-table__action:hover { background: Highlight; color: HighlightText; }
  .work-table__select-all,
  .work-table__row-select { border-color: CanvasText; }
}
</style>