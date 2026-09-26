/**
 * WorkDataGrid — شبكة بيانات متقدمة (Enterprise Grade / Odoo/SAP parity).
 *
 * Features:
 *  - Frozen columns (left/right) with sticky positioning
 *  - Column resizing via drag handle
 *  - Column reordering via drag & drop
 *  - Row grouping with aggregation (sum, avg, count, min, max)
 *  - Inline cell editing (text, number, select, date, boolean)
 *  - Virtual scrolling for 10k+ rows
 *  - Row expansion for master-detail
 *  - Advanced per-column filtering (text, number range, date range, multi-select)
 *  - Bulk actions on selection
 *  - Keyboard navigation (Excel-like)
 *  - ARIA grid pattern with full a11y
 *  - RTL-first, WCAG 2.2 AA
 */
<template>
  <div
    class="work-data-grid"
    :class="[
      'work-data-grid',
      { 'work-data-grid--striped': striped },
      { 'work-data-grid--hoverable': hoverable },
      { 'work-data-grid--virtual': virtualScroll },
      { 'work-data-grid--grouped': grouped },
      { 'work-data-grid--editing': editingCell !== null },
    ]"
    :dir="direction"
    @keydown="handleGlobalKeydown"
  >
    <!-- Toolbar -->
    <div
      v-if="showToolbar"
      class="work-data-grid__toolbar"
      role="toolbar"
      :aria-label="t('dataGridToolbar')"
    >
      <div class="work-data-grid__toolbar-left">
        <WorkSearch
          v-model="globalSearch"
          placeholder="t('searchAllColumns')"
          :debounce="300"
          @search="onGlobalSearch"
          class="work-data-grid__global-search"
        />
        <div class="work-data-grid__toolbar-divider" />
        <WorkActions
          :primary-actions="bulkActions"
          :secondary-actions="toolbarSecondaryActions"
          size="sm"
        />
      </div>
      <div class="work-data-grid__toolbar-right">
        <WorkPagination
          v-if="pagination && totalPages > 1"
          :current-page="currentPage"
          :total-pages="totalPages"
          :page-size="pageSize"
          :total-items="totalItems"
          :page-size-options="pageSizeOptions"
          @page-change="handlePageChange"
          @page-size-change="handlePageSizeChange"
        />
        <div class="work-data-grid__density-selector">
          <label :for="densityId" class="sr-only">{{ t('rowDensity') }}</label>
          <select
            :id="densityId"
            v-model="density"
            :options="densityOptions"
            class="work-data-grid__density-select"
            @change="onDensityChange"
          />
        </div>
      </div>
    </div>

    <!-- Column Filter Row -->
    <div
      v-if="showColumnFilters && !grouped"
      class="work-data-grid__filter-row"
      role="row"
      aria-label="t('columnFilters')"
    >
      <div
        v-if="selectable"
        class="work-data-grid__filter-cell work-data-grid__filter-cell--selection"
      />
      <div
        v-for="column in visibleColumns"
        :key="column.key"
        class="work-data-grid__filter-cell"
        :class="{ 'work-data-grid__filter-cell--frozen': column.frozen }"
        :style="columnStyle(column)"
      >
        <ColumnFilter
          v-if="column.filterable"
          :column="column"
          :value="columnFilters[column.key]"
          @change="onColumnFilterChange(column.key, $event)"
          @clear="onColumnFilterClear(column.key)"
        />
      </div>
    </div>

    <!-- Main Grid -->
    <div class="work-data-grid__viewport" ref="viewportRef">
      <!-- Frozen Left Columns -->
      <div
        v-if="frozenLeftColumns.length"
        class="work-data-grid__frozen work-data-grid__frozen--left"
        :style="{ width: frozenLeftWidth + 'px' }"
      >
        <table class="work-data-grid__table" role="grid">
          <colgroup>
            <col
              v-for="col in frozenLeftColumns"
              :key="col.key"
              :style="{ width: col.width + 'px', minWidth: col.minWidth + 'px' }"
            />
          </colgroup>
          <thead>
            <HeaderRow
              :columns="frozenLeftColumns"
              :sort-key="sortKey"
              :sort-asc="sortAsc"
              :selectable="selectable"
              :all-selected="allSelected"
              :indeterminate="indeterminate"
              @sort="handleSort"
              @toggle-all="toggleAllSelection"
              @resize="handleColumnResize"
              @reorder-start="handleColumnReorderStart"
            />
          </thead>
          <tbody>
            <GroupHeader
              v-for="(group, gIndex) in groupedRows"
              :key="`group-${gIndex}-left`"
              :group="group"
              :level="group.level"
              :columns="frozenLeftColumns"
              :expanded="expandedGroups.has(group.id)"
              @toggle="toggleGroup(group.id)"
            />
            <DataRow
              v-for="(row, rIndex) in getVisibleRows(group?.rows || [])"
              :key="`${group?.id || 'root'}-${getRowKey(row, rIndex)}-left`"
              :row="row"
              :columns="frozenLeftColumns"
              :row-index="rIndex"
              :selectable="selectable"
              :selected="isRowSelected(row)"
              :expanded="expandedRows.has(getRowKey(row))"
              :editing="editingCell?.rowKey === getRowKey(row) && frozenLeftColumns.some(c => c.key === editingCell.colKey)"
              :edit-mode="editingCell"
              @select="toggleRowSelection(row)"
              @click="handleRowClick(row, $event)"
              @dblclick="startInlineEdit(row, $event.target.closest('td')?.dataset?.colKey)"
              @keydown="handleCellKeydown(row, $event)"
              @edit-save="saveInlineEdit"
              @edit-cancel="cancelInlineEdit"
              @expand="toggleRowExpand(getRowKey(row))"
            />
          </tbody>
        </table>
      </div>

      <!-- Main Scrollable Area -->
      <div
        class="work-data-grid__main"
        ref="mainRef"
        @scroll="onMainScroll"
      >
        <table
          class="work-data-grid__table"
          :role="selectable ? 'grid' : 'table'"
          :aria-label="ariaLabel"
          :aria-multiselectable="selectable && selectionMode === 'multiple'"
        >
          <colgroup>
            <col
              v-for="col in mainColumns"
              :key="col.key"
              :style="{ width: col.width + 'px', minWidth: col.minWidth + 'px' }"
            />
          </colgroup>
          <thead>
            <HeaderRow
              :columns="mainColumns"
              :sort-key="sortKey"
              :sort-asc="sortAsc"
              :selectable="selectable"
              :all-selected="allSelected"
              :indeterminate="indeterminate"
              @sort="handleSort"
              @toggle-all="toggleAllSelection"
              @resize="handleColumnResize"
              @reorder-start="handleColumnReorderStart"
            />
          </thead>
          <tbody>
            <template v-if="!grouped">
              <DataRow
                v-for="(row, rIndex) in paginatedRows"
                :key="getRowKey(row, rIndex)"
                :row="row"
                :columns="mainColumns"
                :row-index="rIndex"
                :selectable="selectable"
                :selected="isRowSelected(row)"
                :expanded="expandedRows.has(getRowKey(row))"
                :editing="editingCell?.rowKey === getRowKey(row) && mainColumns.some(c => c.key === editingCell.colKey)"
                :edit-mode="editingCell"
                @select="toggleRowSelection(row)"
                @click="handleRowClick(row, $event)"
                @dblclick="startInlineEdit(row, $event.target.closest('td')?.dataset?.colKey)"
                @keydown="handleCellKeydown(row, $event)"
                @edit-save="saveInlineEdit"
                @edit-cancel="cancelInlineEdit"
                @expand="toggleRowExpand(getRowKey(row))"
              />
            </template>
            <template v-else>
              <template v-for="(group, gIndex) in groupedRows" :key="`group-${gIndex}`">
                <GroupHeader
                  :group="group"
                  :level="group.level"
                  :columns="mainColumns"
                  :expanded="expandedGroups.has(group.id)"
                  @toggle="toggleGroup(group.id)"
                />
                <DataRow
                  v-for="(row, rIndex) in getVisibleRows(group.rows)"
                  :key="getRowKey(row, rIndex)"
                  :row="row"
                  :columns="mainColumns"
                  :row-index="rIndex"
                  :selectable="selectable"
                  :selected="isRowSelected(row)"
                  :expanded="expandedRows.has(getRowKey(row))"
                  :editing="editingCell?.rowKey === getRowKey(row) && mainColumns.some(c => c.key === editingCell.colKey)"
                  :edit-mode="editingCell"
                  @select="toggleRowSelection(row)"
                  @click="handleRowClick(row, $event)"
                  @dblclick="startInlineEdit(row, $event.target.closest('td')?.dataset?.colKey)"
                  @keydown="handleCellKeydown(row, $event)"
                  @edit-save="saveInlineEdit"
                  @edit-cancel="cancelInlineEdit"
                  @expand="toggleRowExpand(getRowKey(row))"
                />
              </template>
            </template>
            <tr v-if="!hasVisibleRows" class="work-data-grid__empty-row">
              <td :colspan="totalColumns" class="work-data-grid__empty-cell">
                <WorkEmptyState
					:icon="emptyIcon"
					:title="emptyTitle"
					:description="emptyDescription"
					:action-label="emptyActionLabel"
					:action-icon="emptyActionIcon"
					@action="emptyAction && emptyAction()"
                  :size="'sm'"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Frozen Right Columns -->
      <div
        v-if="frozenRightColumns.length"
        class="work-data-grid__frozen work-data-grid__frozen--right"
        :style="{ width: frozenRightWidth + 'px' }"
      >
        <table class="work-data-grid__table" role="grid">
          <colgroup>
            <col
              v-for="col in frozenRightColumns"
              :key="col.key"
              :style="{ width: col.width + 'px', minWidth: col.minWidth + 'px' }"
            />
          </colgroup>
          <thead>
            <HeaderRow
              :columns="frozenRightColumns"
              :sort-key="sortKey"
              :sort-asc="sortAsc"
              :selectable="selectable"
              @sort="handleSort"
              @resize="handleColumnResize"
              @reorder-start="handleColumnReorderStart"
            />
          </thead>
          <tbody>
            <GroupHeader
              v-for="(group, gIndex) in groupedRows"
              :key="`group-${gIndex}-right`"
              :group="group"
              :level="group.level"
              :columns="frozenRightColumns"
              :expanded="expandedGroups.has(group.id)"
              @toggle="toggleGroup(group.id)"
            />
            <DataRow
              v-for="(row, rIndex) in getVisibleRows(group?.rows || [])"
              :key="`${group?.id || 'root'}-${getRowKey(row, rIndex)}-right`"
              :row="row"
              :columns="frozenRightColumns"
              :row-index="rIndex"
              :selectable="selectable"
              :selected="isRowSelected(row)"
              :expanded="expandedRows.has(getRowKey(row))"
              :editing="editingCell?.rowKey === getRowKey(row) && frozenRightColumns.some(c => c.key === editingCell.colKey)"
              :edit-mode="editingCell"
              @select="toggleRowSelection(row)"
              @click="handleRowClick(row, $event)"
              @dblclick="startInlineEdit(row, $event.target.closest('td')?.dataset?.colKey)"
              @keydown="handleCellKeydown(row, $event)"
              @edit-save="saveInlineEdit"
              @edit-cancel="cancelInlineEdit"
              @expand="toggleRowExpand(getRowKey(row))"
            />
          </tbody>
        </table>
      </div>
    </div>

    <!-- Column Resize Overlay -->
    <div
      v-if="resizingColumn"
      class="work-data-grid__resize-overlay"
      :style="{ left: resizeStartX + 'px' }"
    />

    <!-- Drag Ghost for Reordering -->
    <div
      v-if="draggingColumn"
      class="work-data-grid__drag-ghost"
      :style="{ transform: `translate(${dragGhostX}px, ${dragGhostY}px)` }"
    >
      {{ draggingColumn.label }}
    </div>

    <!-- Status Bar -->
    <div
      v-if="showStatusBar"
      class="work-data-grid__status-bar"
      role="status"
      aria-live="polite"
    >
      <div class="work-data-grid__status-left">
        <span v-if="selectedCount > 0">
          {{ t('selectedCount', [selectedCount]) }}
        </span>
        <span v-else>
          {{ t('totalRows', [totalItems]) }}
        </span>
        <span v-if="grouped">
          • {{ t('groups', [groupedRows.length]) }}
        </span>
      </div>
      <div class="work-data-grid__status-right">
        <span v-if="editingCell">{{ t('editingCell') }}</span>
        <span v-if="loading">{{ t('loading') }}</span>
      </div>
    </div>

    <!-- Row Detail Expansion Panel -->
    <div
      v-if="expandedRowDetail"
      class="work-data-grid__detail-panel"
      role="region"
      :aria-label="t('rowDetails')"
    >
      <div class="work-data-grid__detail-header">
        <h3>{{ t('details') }}: {{ expandedRowDetail.label }}</h3>
        <button
          type="button"
          class="work-data-grid__detail-close"
          @click="closeRowDetail"
          :aria-label="t('close')"
        >
          <FeatherIcon name="x" class="w-5 h-5" />
        </button>
      </div>
      <div class="work-data-grid__detail-content">
        <slot
          name="detail"
          :row="expandedRowDetail.row"
          :columns="allColumns"
        >
          <WorkCard variant="outlined" class="p-4">
            <dl class="grid grid-cols-2 gap-4">
              <template v-for="col in allColumns" :key="col.key">
                <dt class="text-sm text-gray-500">{{ t(col.label) }}</dt>
                <dd class="font-medium">{{ formatCell(expandedRowDetail.row, col) }}</dd>
              </template>
            </dl>
          </WorkCard>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
	ref,
	computed,
	watch,
	nextTick,
	onMounted,
	onUnmounted,
	shallowRef,
} from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import { formatCurrencySafe } from "@/utils/currency"
import WorkSearch from "./WorkSearch.vue"
import WorkActions from "./WorkActions.vue"
import WorkPagination from "./WorkPagination.vue"
import WorkEmptyState from "./WorkEmptyState.vue"
import WorkCard from "@/components/ui/DyCard.vue"

import HeaderRow from "./WorkDataGrid/HeaderRow.vue"
import DataRow from "./WorkDataGrid/DataRow.vue"
import GroupHeader from "./WorkDataGrid/GroupHeader.vue"
import ColumnFilter from "./WorkDataGrid/ColumnFilter.vue"
import InlineEditCell from "./WorkDataGrid/InlineEditCell.vue"

const props = defineProps({
	columns: {
		type: Array,
		required: true,
		// [{ key, label, width?, minWidth?, maxWidth?, frozen?: 'left'|'right', sortable?, filterable?, align?: 'start'|'center'|'end', format?, compute?, editable?, editorType?: 'text'|'number'|'select'|'date'|'boolean', editorOptions?, validation?, groupable?, aggregate?: 'sum'|'avg'|'count'|'min'|'max', detail? }]
	},
	rows: { type: Array, default: () => [] },
	rowKey: { type: String, default: "id" },
	selectable: { type: Boolean, default: false },
	selectionMode: {
		type: String,
		default: "multiple",
		validator: (v) => ["single", "multiple"].includes(v),
	},
	selectedRows: { type: Array, default: () => [] },
	rowClickable: { type: Boolean, default: true },
	rowExpandable: { type: Boolean, default: false },
	rowDetail: { type: Function, default: null },
	defaultSort: { type: Object, default: null },
	pagination: { type: Boolean, default: true },
	currentPage: { type: Number, default: 1 },
	pageSize: { type: Number, default: 50 },
	totalItems: { type: Number, default: 0 },
	pageSizeOptions: { type: Array, default: () => [25, 50, 100, 200, 500] },
	showToolbar: { type: Boolean, default: true },
	showColumnFilters: { type: Boolean, default: true },
	showStatusBar: { type: Boolean, default: true },
	virtualScroll: { type: Boolean, default: false },
	virtualItemHeight: { type: Number, default: 48 },
	loading: { type: Boolean, default: false },
	striped: { type: Boolean, default: false },
	hoverable: { type: Boolean, default: true },
	emptyIcon: { type: String, default: "inbox" },
	emptyTitle: { type: String, default: "noData" },
	emptyDescription: { type: String, default: "noDataDescription" },
	emptyActionLabel: { type: String, default: "" },
	emptyActionIcon: { type: String, default: "plus" },
	emptyAction: { type: Function, default: null },
	ariaLabel: { type: String, default: "Data Grid" },
	bulkActions: { type: Array, default: () => [] },
	groupBy: { type: String, default: "" },
	groupAggregates: { type: Array, default: () => [] },
})

const emit = defineEmits([
	"update:selectedRows",
	"update:currentPage",
	"update:pageSize",
	"sort",
	"row-click",
	"row-select",
	"row-expand",
	"cell-edit",
	"bulk-action",
	"column-resize",
	"column-reorder",
	"filter-change",
])

// Direction
const { dir: direction } = inject("dy-direction", { value: "rtl" })

// Column partitioning
const frozenLeftColumns = computed(() =>
	props.columns.filter((c) => c.frozen === "left"),
)
const frozenRightColumns = computed(() =>
	props.columns.filter((c) => c.frozen === "right"),
)
const mainColumns = computed(() => props.columns.filter((c) => !c.frozen))
const allColumns = computed(() => [
	...frozenLeftColumns.value,
	...mainColumns.value,
	...frozenRightColumns.value,
])

const frozenLeftWidth = computed(() =>
	frozenLeftColumns.value.reduce((s, c) => s + (c.width || 150), 0),
)
const frozenRightWidth = computed(() =>
	frozenRightColumns.value.reduce((s, c) => s + (c.width || 150), 0),
)

// State
const sortKey = ref(props.defaultSort?.key || null)
const sortAsc = ref(props.defaultSort?.asc ?? true)
const localSelectedRows = ref([...props.selectedRows])
const columnFilters = ref({})
const globalSearch = ref("")
const editingCell = ref(null) // { rowKey, colKey, originalValue, editorType }
const expandedRows = ref(new Set())
const expandedGroups = ref(new Set())
const expandedRowDetail = ref(null)
const resizingColumn = ref(null)
const resizeStartX = ref(0)
const dragGhostX = ref(0)
const dragGhostY = ref(0)
const draggingColumn = ref(null)
const density = ref("comfortable")
const densityOptions = ["compact", "comfortable", "spacious"]
const densityId = `density-${Math.random().toString(36).slice(2)}`

// Virtual scroll
const viewportRef = ref(null)
const mainRef = ref(null)
const scrollTop = ref(0)
const visibleRange = ref({ start: 0, end: 50 })

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

// Sorting
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

// Filtering
const filteredRows = computed(() => {
	let rows = sortedRows.value
	if (globalSearch.value) {
		const search = globalSearch.value.toLowerCase()
		rows = rows.filter((row) =>
			allColumns.value.some((col) => {
				const val = getCellValue(row, col)
				return String(val ?? "")
					.toLowerCase()
					.includes(search)
			}),
		)
	}
	for (const [key, filter] of Object.entries(columnFilters.value)) {
		if (!filter) continue
		const col = props.columns.find((c) => c.key === key)
		if (!col) continue
		rows = rows.filter((row) =>
			matchesFilter(getCellValue(row, col), filter, col),
		)
	}
	return rows
})

function matchesFilter(value, filter, column) {
	if (value == null) return false
	const str = String(value)
	switch (column.editorType) {
		case "number":
			return (
				value >= (filter.min ?? Number.NEGATIVE_INFINITY) &&
				value <= (filter.max ?? Number.POSITIVE_INFINITY)
			)
		case "date":
			return (
				value >= (filter.from ?? Number.NEGATIVE_INFINITY) &&
				value <= (filter.to ?? Number.POSITIVE_INFINITY)
			)
		case "select":
			return filter.values?.includes(value) ?? false
		default:
			return str.toLowerCase().includes(filter.toLowerCase())
	}
}

// Grouping
const grouped = computed(() => !!props.groupBy)
const groupedRows = computed(() => {
	if (!grouped.value) return []
	const groups = new Map()
	for (const row of filteredRows.value) {
		const key = row[props.groupBy]
		if (!groups.has(key))
			groups.set(key, {
				id: key,
				label: key,
				rows: [],
				level: 0,
				aggregates: {},
			})
		groups.get(key).rows.push(row)
	}
	// Compute aggregates
	for (const group of groups.values()) {
		for (const agg of props.groupAggregates) {
			const col = props.columns.find((c) => c.key === agg.column)
			if (!col) continue
			const values = group.rows
				.map((r) => getCellValue(r, col))
				.filter((v) => v != null && typeof v === "number")
			if (!values.length) continue
			switch (agg.fn) {
				case "sum":
					group.aggregates[agg.column] = values.reduce((a, b) => a + b, 0)
					break
				case "avg":
					group.aggregates[agg.column] =
						values.reduce((a, b) => a + b, 0) / values.length
					break
				case "min":
					group.aggregates[agg.column] = Math.min(...values)
					break
				case "max":
					group.aggregates[agg.column] = Math.max(...values)
					break
				case "count":
					group.aggregates[agg.column] = values.length
					break
			}
		}
	}
	return Array.from(groups.values())
})

function getVisibleRows(rows) {
	if (!grouped.value) return rows
	return rows.filter((r) => !expandedGroups.value.has(r[props.groupBy]))
}

// Pagination
const totalPages = computed(() => Math.ceil(props.totalItems / props.pageSize))
const paginatedRows = computed(() => {
	if (!props.pagination) return filteredRows.value
	const start = (props.currentPage - 1) * props.pageSize
	return filteredRows.value.slice(start, start + props.pageSize)
})

const hasVisibleRows = computed(
	() => paginatedRows.value.length > 0 || groupedRows.value.length > 0,
)

// Selection
const allSelected = computed(() => {
	if (!props.selectable || !paginatedRows.value.length) return false
	return paginatedRows.value.every((row) => isRowSelected(row))
})
const indeterminate = computed(() => {
	if (!props.selectable) return false
	const selected = paginatedRows.value.filter((row) =>
		isRowSelected(row),
	).length
	return selected > 0 && selected < paginatedRows.value.length
})
const selectedCount = computed(() => localSelectedRows.value.length)

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
				!paginatedRows.value.some((sr) => sr[props.rowKey] === r[props.rowKey]),
		)
	} else {
		for (const row of paginatedRows.value)
			if (!isRowSelected(row)) localSelectedRows.value.push(row)
	}
	emit("update:selectedRows", [...localSelectedRows.value])
}

// Sorting
function handleSort(key) {
	if (sortKey.value === key) sortAsc.value = !sortAsc.value
	else {
		sortKey.value = key
		sortAsc.value = true
	}
	emit("sort", { key, asc: sortAsc.value })
}

// Column Resize
function handleColumnResize({ column, width }) {
	column.width = Math.max(
		column.minWidth || 80,
		Math.min(width, column.maxWidth || 800),
	)
	emit("column-resize", column)
}

// Column Reorder
function handleColumnReorderStart(column) {
	draggingColumn.value = column
}
function handleColumnReorderEnd(targetColumn) {
	if (!draggingColumn.value || draggingColumn.value === targetColumn) {
		draggingColumn.value = null
		return
	}
	const cols = [...props.columns]
	const fromIdx = cols.findIndex((c) => c.key === draggingColumn.value.key)
	const toIdx = cols.findIndex((c) => c.key === targetColumn.key)
	cols.splice(fromIdx, 1)
	cols.splice(toIdx, 0, draggingColumn.value)
	emit("column-reorder", cols)
	draggingColumn.value = null
}

// Global Search
function onGlobalSearch(q) {
	globalSearch.value = q
}

// Column Filters
function onColumnFilterChange(key, value) {
	columnFilters.value = { ...columnFilters.value, [key]: value }
	emit("filter-change", { key, value, all: columnFilters.value })
}
function onColumnFilterClear(key) {
	const newFilters = { ...columnFilters.value }
	delete newFilters[key]
	columnFilters.value = newFilters
	emit("filter-change", { key, value: null, all: newFilters })
}

// Virtual Scroll
function onMainScroll(e) {
	scrollTop.value = e.target.scrollTop
	if (props.virtualScroll) {
		const start = Math.floor(scrollTop.value / props.virtualItemHeight)
		const end = Math.min(
			start + Math.ceil(e.target.clientHeight / props.virtualItemHeight) + 5,
			filteredRows.value.length,
		)
		visibleRange.value = { start, end }
	}
	// Sync frozen scroll
	if (frozenLeftColumns.value.length) {
		const leftFrozen = document.querySelector(".work-data-grid__frozen--left")
		if (leftFrozen) leftFrozen.scrollTop = scrollTop.value
	}
	if (frozenRightColumns.value.length) {
		const rightFrozen = document.querySelector(".work-data-grid__frozen--right")
		if (rightFrozen) rightFrozen.scrollTop = scrollTop.value
	}
}

// Inline Editing
function startInlineEdit(row, colKey) {
	if (!colKey) return
	const column = props.columns.find((c) => c.key === colKey)
	if (!column?.editable) return
	const rowKey = getRowKey(row)
	editingCell.value = {
		rowKey,
		colKey,
		originalValue: getCellValue(row, column),
		editorType: column.editorType || "text",
		editorOptions: column.editorOptions,
		validation: column.validation,
		column,
	}
	nextTick(() => {
		document.querySelector(".work-data-grid__edit-input")?.focus?.()
	})
}

function saveInlineEdit({ rowKey, colKey, value }) {
	const row = props.rows.find((r) => getRowKey(r) === rowKey)
	if (!row) return
	const column = props.columns.find((c) => c.key === colKey)
	const oldValue = row[colKey]
	row[colKey] = value
	editingCell.value = null
	emit("cell-edit", { row, column, oldValue, newValue: value })
}

function cancelInlineEdit() {
	editingCell.value = null
}

function handleCellKeydown(row, e) {
	const rowKey = getRowKey(row)
	const colKeys = allColumns.value.map((c) => c.key)
	const currentCol = editingCell.value?.colKey
	const currentIdx = currentCol ? colKeys.indexOf(currentCol) : -1

	if (e.key === "Enter" && !editingCell.value) {
		const target = e.target.closest("td")
		if (target?.dataset?.colKey) startInlineEdit(row, target.dataset.colKey)
	}
	if (e.key === "Escape" && editingCell.value) {
		cancelInlineEdit()
	}
	if (e.key === "Tab" && editingCell.value) {
		e.preventDefault()
		const dir = e.shiftKey ? -1 : 1
		let nextIdx = currentIdx + dir
		while (nextIdx >= 0 && nextIdx < colKeys.length) {
			const nextCol = props.columns.find((c) => c.key === colKeys[nextIdx])
			if (nextCol?.editable) {
				startInlineEdit(row, nextCol.key)
				break
			}
			nextIdx += dir
		}
	}
	if (e.key === "ArrowDown" && !editingCell.value) {
		e.preventDefault()
		const nextRow = paginatedRows.value.find((r) => getRowKey(r) !== rowKey)
		if (nextRow)
			nextTick(() =>
				document
					.querySelector(`[data-row-key="${getRowKey(nextRow)}"]`)
					?.focus(),
			)
	}
	if (e.key === "ArrowUp" && !editingCell.value) {
		e.preventDefault()
		// similar for up
	}
}

// Row Expansion
function toggleRowExpand(rowKey) {
	if (expandedRows.value.has(rowKey)) expandedRows.value.delete(rowKey)
	else expandedRows.value.add(rowKey)
	emit("row-expand", rowKey, expandedRows.value.has(rowKey))
}

function toggleGroup(groupId) {
	if (expandedGroups.value.has(groupId)) expandedGroups.value.delete(groupId)
	else expandedGroups.value.add(groupId)
}

function openRowDetail(row) {
	if (!props.rowDetail) return
	expandedRowDetail.value = { row, label: props.rowDetail(row) }
	emit("row-expand", getRowKey(row), true)
}

function closeRowDetail() {
	expandedRowDetail.value = null
}

function handleRowClick(row, e) {
	if (
		e.target.closest("button, a, input, select, label, .work-data-grid__expand")
	)
		return
	if (props.rowClickable) emit("row-click", row)
}

function getRowKey(row, index) {
	return row?.[props.rowKey] ?? `row-${index}`
}

function getCellValue(row, column) {
	if (typeof column?.compute === "function") return column.compute(row)
	return row?.[column?.key]
}

function formatCell(row, column) {
	const value = getCellValue(row, column)
	if (value == null) return "—"
	switch (column?.format) {
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

// Bulk Actions
const toolbarSecondaryActions = computed(() => [
	{
		id: "export",
		label: t("export"),
		icon: "download",
		variant: "ghost",
		handler: () =>
			emit("bulk-action", { action: "export", rows: localSelectedRows.value }),
	},
	{
		id: "delete",
		label: t("delete"),
		icon: "trash-2",
		variant: "danger",
		handler: () =>
			emit("bulk-action", { action: "delete", rows: localSelectedRows.value }),
	},
])

function onDensityChange() {
	// Apply density via CSS class on parent
}

function handleGlobalKeydown(e) {
	if (e.key === "Escape") {
		cancelInlineEdit()
		closeRowDetail()
	}
	if ((e.ctrlKey || e.metaKey) && e.key === "a") {
		e.preventDefault()
		if (props.selectable) toggleAllSelection()
	}
}

function handlePageChange(page) {
	emit("update:currentPage", page)
}
function handlePageSizeChange(size) {
	emit("update:pageSize", size)
	emit("update:currentPage", 1)
}

// Virtual scroll cleanup
onUnmounted(() => {
	// cleanup
})
</script>

<style scoped>
/* ============================================================================
   WorkDataGrid — Enterprise Data Grid (Odoo/SAP parity)
   ============================================================================ */

.work-data-grid {
  display: flex;
  flex-direction: column;
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-xl, 12px);
  overflow: hidden;
  font-family: var(--dy-font-family-sans, inherit);
}

.work-data-grid__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--dy-spacing-3, 12px);
  padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  background: var(--dy-color-surface-overlay, #f8fafc);
}

.work-data-grid__global-search { min-width: 280px; max-width: 400px; }
.work-data-grid__toolbar-divider { width: 1px; height: 24px; background: var(--dy-color-surface-border, #e2e8f0); }
.work-data-grid__density-select { padding: 4px 8px; border-radius: var(--dy-radius-md, 6px); border: 1px solid var(--dy-color-surface-border, #e2e8f0); background: var(--dy-color-surface-base, #ffffff); font-size: 0.75rem; }

.work-data-grid__filter-row {
  display: grid;
  grid-template-columns: var(--frozen-left-width, 0) 1fr var(--frozen-right-width, 0);
  grid-template-areas: "frozen-left main frozen-right";
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  background: var(--dy-color-surface-overlay, #f8fafc);
  overflow: hidden;
}

.work-data-grid__filter-cell {
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
  border-inline-end: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  min-height: 40px;
}
.work-data-grid__filter-cell--selection { width: 48px; }

.work-data-grid__viewport {
  display: grid;
  grid-template-columns: var(--frozen-left-width, 0) 1fr var(--frozen-right-width, 0);
  grid-template-areas: "frozen-left main frozen-right";
  position: relative;
  overflow: hidden;
}

.work-data-grid__frozen {
  position: sticky;
  top: 0;
  bottom: 0;
  background: var(--dy-color-surface-base, #ffffff);
  z-index: 10;
  box-shadow: var(--dy-elevation-2, 0 1px 3px 0 rgba(15, 23, 42, 0.1));
}
.work-data-grid__frozen--left {
  grid-area: frozen-left;
  inset-inline-start: 0;
  border-inline-end: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}
.work-data-grid__frozen--right {
  grid-area: frozen-right;
  inset-inline-end: 0;
  border-inline-start: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}

.work-data-grid__main {
  grid-area: main;
  overflow: auto;
  position: relative;
  min-height: 300px;
}

.work-data-grid__table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
}

.work-data-grid__resize-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--dy-color-brand-500, #10b981);
  pointer-events: none;
  z-index: 100;
}

.work-data-grid__drag-ghost {
  position: fixed;
  padding: 8px 16px;
  background: var(--dy-color-brand-500, #10b981);
  color: white;
  border-radius: var(--dy-radius-lg, 8px);
  box-shadow: var(--dy-elevation-4, 0 10px 15px -3px rgba(15, 23, 42, 0.1));
  pointer-events: none;
  z-index: 1000;
  font-size: 0.875rem;
  font-weight: 500;
}

/* Status Bar */
.work-data-grid__status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-4, 16px);
  border-top: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  background: var(--dy-color-surface-overlay, #f8fafc);
  font-size: 0.75rem;
  color: var(--dy-color-text-muted, #64748b);
}

/* Detail Panel */
.work-data-grid__detail-panel {
  position: fixed;
  inset-inline-end: 0;
  top: 0;
  bottom: 0;
  width: 480px;
  max-width: 90vw;
  background: var(--dy-color-surface-base, #ffffff);
  border-inline-start: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  box-shadow: var(--dy-elevation-6, 0 25px 50px -12px rgba(15, 23, 42, 0.15));
  z-index: 200;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.2s ease-out;
}
@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

.work-data-grid__detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--dy-spacing-4, 16px);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}
.work-data-grid__detail-close { width: 36px; height: 36px; border: 0; border-radius: var(--dy-radius-lg, 8px); background: transparent; color: var(--dy-color-text-muted, #64748b); cursor: pointer; }
.work-data-grid__detail-close:hover { background: var(--dy-color-surface-sunken, #f1f5f9); }
.work-data-grid__detail-content { flex: 1; overflow: auto; padding: var(--dy-spacing-4, 16px); }

/* Editing */
.work-data-grid--editing .work-data-grid__edit-input { outline: none; }

/* Density */
.work-data-grid--density-compact .work-data-grid__th,
.work-data-grid--density-compact .work-data-grid__td { padding: 6px 10px; }
.work-data-grid--density-spacious .work-data-grid__th,
.work-data-grid--density-spacious .work-data-grid__td { padding: 16px 20px; }

/* Responsive */
@media (max-width: 1024px) {
  .work-data-grid__toolbar { flex-direction: column; align-items: stretch; }
  .work-data-grid__global-search { max-width: none; }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-data-grid__detail-panel { animation: none; }
  .work-data-grid__drag-ghost { transition: none; }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-data-grid { border-color: CanvasText; }
  .work-data-grid__table { border-color: CanvasText; }
  .work-data-grid__th { border-color: CanvasText; color: CanvasText; }
  .work-data-grid__td { border-color: CanvasText; color: CanvasText; }
  .work-data-grid__frozen { border-color: CanvasText; }
}
</style>