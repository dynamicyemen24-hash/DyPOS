<template>
  <WorkShell
    title="WorkDataGrid Demo"
    subtitle="Advanced Enterprise Data Grid — Odoo/SAP Parity"
    :nav-items="navItems"
    :breadcrumbs="breadcrumbs"
  >
    <template #toolbar>
      <WorkToolbar>
        <template #start>
          <WorkActions
            :primary-actions="demoActions"
            :overflow-actions="overflowActions"
            size="sm"
          />
        </template>
        <template #end>
          <DyButton variant="outline" size="sm" @click="loadSampleData('large')">
            <FeatherIcon name="database" class="w-4 h-4" /> {{ t('loadLargeDataset') }}
          </DyButton>
          <DyButton variant="ghost" size="sm" @click="exportGrid">
            <FeatherIcon name="download" class="w-4 h-4" /> {{ t('export') }}
          </DyButton>
        </template>
      </WorkToolbar>
    </template>

    <WorkCard variant="outlined">
      <template #header>
        <WorkPageHeader
          title="Interactive Data Grid"
          subtitle="Frozen columns, grouping, inline edit, virtual scroll, column resize/reorder"
        />
      </template>

      <WorkDataGrid
        ref="gridRef"
        :columns="columns"
        :rows="rows"
        row-key="id"
        :selectable="true"
        :selected-rows="selectedRows"
        @update:selected-rows="selectedRows = $event"
        :row-expandable="true"
        :row-detail="rowDetail"
        :default-sort="{ key: 'createdAt', asc: false }"
        :pagination="true"
        :current-page="currentPage"
        :page-size="pageSize"
        :total-items="totalItems"
        @update:current-page="currentPage = $event"
        @update:page-size="onPageSizeChange"
        :show-toolbar="true"
        :show-column-filters="true"
        :show-status-bar="true"
        :bulk-actions="bulkActions"
        :group-by="groupBy"
        :group-aggregates="groupAggregates"
        :virtual-scroll="virtualScroll"
        :virtual-item-height="48"
        :loading="loading"
        :striped="true"
        :hoverable="true"
        @row-click="onRowClick"
        @row-expand="onRowExpand"
        @cell-edit="onCellEdit"
        @bulk-action="onBulkAction"
        @column-resize="onColumnResize"
        @column-reorder="onColumnReorder"
        @filter-change="onFilterChange"
        @sort="onSort"
      />

      <template #detail="{ row, columns }">
        <div class="space-y-4 p-4">
          <h4 class="font-semibold text-lg">{{ t('recordDetails') }}: {{ row.name }}</h4>
          <WorkDataGrid
            :columns="detailColumns"
            :rows="getDetailRows(row)"
            row-key="id"
            :selectable="false"
            :pagination="false"
            :show-toolbar="false"
            :show-column-filters="false"
            :show-status-bar="false"
            :striped="true"
          />
        </div>
      </template>
    </WorkCard>

    <!-- Feature Toggle Panel -->
    <WorkCard variant="outlined" class="mt-6">
      <template #header>
        <WorkPageHeader title="Feature Toggles" subtitle="Enable/disable advanced features" />
      </template>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <DyCard variant="outlined" class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-medium">{{ t('virtualScroll') }}</h4>
              <p class="text-sm text-gray-500">{{ t('virtualScrollDesc') }}</p>
            </div>
            <DyButton
              :variant="virtualScroll ? 'primary' : 'ghost'"
              size="sm"
              @click="virtualScroll = !virtualScroll"
            >
              {{ virtualScroll ? t('enabled') : t('disabled') }}
            </DyButton>
          </div>
        </DyCard>

        <DyCard variant="outlined" class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-medium">{{ t('grouping') }}</h4>
              <p class="text-sm text-gray-500">{{ t('groupingDesc') }}</p>
            </div>
            <DyButton
              :variant="groupBy ? 'primary' : 'ghost'"
              size="sm"
              @click="toggleGrouping"
            >
              {{ groupBy ? t('enabled') : t('disabled') }}
            </DyButton>
          </div>
        </DyCard>

        <DyCard variant="outlined" class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-medium">{{ t('inlineEdit') }}</h4>
              <p class="text-sm text-gray-500">{{ t('inlineEditDesc') }}</p>
            </div>
            <DyButton
              variant="primary"
              size="sm"
              @click="enableInlineEdit"
            >
              {{ t('tryIt') }}
            </DyButton>
          </div>
        </DyCard>

        <DyCard variant="outlined" class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-medium">{{ t('density') }}</h4>
              <p class="text-sm text-gray-500">{{ t('densityDesc') }}</p>
            </div>
            <select v-model="density" class="border rounded px-2 py-1 text-sm" @change="onDensityChange">
              <option value="compact">{{ t('compact') }}</option>
              <option value="comfortable">{{ t('comfortable') }}</option>
              <option value="spacious">{{ t('spacious') }}</option>
            </select>
          </div>
        </DyCard>
      </div>
    </WorkCard>
  </WorkShell>
</template>

<script setup>
import { ref, computed, watch } from "vue"
import { t } from "@/utils/translation"
import { faker } from "@faker-js/faker"

import WorkShell from "@/components/work/WorkShell.vue"
import WorkToolbar from "@/components/work/WorkToolbar.vue"
import WorkActions from "@/components/work/WorkActions.vue"
import WorkCard from "@/components/ui/DyCard.vue"
import WorkDataGrid from "@/components/work/WorkDataGrid.vue"
import DyButton from "@/components/ui/DyButton.vue"
import DyBadge from "@/components/ui/DyBadge.vue"
import { FeatherIcon } from "frappe-ui"

const navItems = ref([
	{
		id: "datagrid",
		label: "DataGrid Demo",
		to: { name: "WorkDataGridDemo" },
		icon: "grid",
	},
	{
		id: "stock",
		label: "المخزون",
		to: { name: "StockManagement" },
		icon: "package",
	},
	{
		id: "reports",
		label: "التقارير",
		to: { name: "Reports" },
		icon: "bar-chart-2",
	},
])

const breadcrumbs = computed(() => [
	{ label: "الرئيسية", to: { name: "POSSale" } },
	{ label: "WorkDataGrid Demo", current: true },
])

const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(50)
const totalItems = ref(0)
const selectedRows = ref([])
const groupBy = ref("")
const virtualScroll = ref(false)
const density = ref("comfortable")

const detailColumns = ref([
	{ key: "field", label: "الحقل", width: 180 },
	{ key: "value", label: "القيمة", width: 200 },
	{ key: "oldValue", label: "القيمة السابقة", width: 150 },
	{ key: "changedAt", label: "تاريخ التغيير", width: 140, format: "date" },
	{ key: "changedBy", label: "تم بواسطة", width: 120 },
])

const categoryOptions = [
	{ value: "electronics", label: "إلكترونيات" },
	{ value: "clothing", label: "ملابس" },
	{ value: "home", label: "منزل" },
	{ value: "sports", label: "رياضة" },
	{ value: "books", label: "كتب" },
	{ value: "automotive", label: "سيارات" },
	{ value: "beauty", label: "جمال" },
]

const warehouseOptions = [
	{ value: "wh-main", label: "المستودع الرئيسي" },
	{ value: "wh-east", label: "المستودع الشرقي" },
	{ value: "wh-west", label: "المستودع الغربي" },
	{ value: "wh-north", label: "المستودع الشمالي" },
	{ value: "wh-south", label: "المستودع الجنوبي" },
]

const statusOptions = ["active", "low", "out", "discontinued", "pending"]

const columns = ref([
	{
		key: "id",
		label: "ID",
		width: 80,
		minWidth: 60,
		frozen: "left",
		sortable: true,
		align: "center",
	},
	{
		key: "code",
		label: "الكود",
		width: 120,
		minWidth: 100,
		frozen: "left",
		sortable: true,
		editable: true,
		editorType: "text",
	},
	{
		key: "name",
		label: "اسم المنتج",
		width: 220,
		minWidth: 180,
		frozen: "left",
		sortable: true,
		filterable: true,
		editable: true,
		editorType: "text",
	},
	{
		key: "category",
		label: "التصنيف",
		width: 140,
		minWidth: 120,
		sortable: true,
		filterable: true,
		editable: true,
		editorType: "select",
		editorOptions: categoryOptions,
	},
	{
		key: "warehouse",
		label: "المستودع",
		width: 140,
		minWidth: 120,
		sortable: true,
		filterable: true,
		editable: true,
		editorType: "select",
		editorOptions: warehouseOptions,
	},
	{
		key: "qty",
		label: "الكمية",
		width: 100,
		minWidth: 80,
		sortable: true,
		format: "number",
		align: "end",
		editable: true,
		editorType: "number",
		validation: { min: 0 },
	},
	{
		key: "reserved",
		label: "محجوز",
		width: 100,
		minWidth: 80,
		sortable: true,
		format: "number",
		align: "end",
	},
	{
		key: "available",
		label: "متاح",
		width: 100,
		minWidth: 80,
		sortable: true,
		format: "number",
		align: "end",
		compute: (r) => r.qty - r.reserved,
	},
	{
		key: "unitPrice",
		label: "سعر الوحدة",
		width: 120,
		minWidth: 100,
		sortable: true,
		format: "currency",
		align: "end",
		editable: true,
		editorType: "number",
		validation: { min: 0 },
	},
	{
		key: "totalValue",
		label: "القيمة الإجمالية",
		width: 140,
		minWidth: 120,
		sortable: true,
		format: "currency",
		align: "end",
		compute: (r) => r.qty * r.unitPrice,
	},
	{
		key: "reorderPoint",
		label: "حد إعادة الطلب",
		width: 120,
		minWidth: 100,
		sortable: true,
		format: "number",
		align: "end",
		editable: true,
		editorType: "number",
		validation: { min: 0 },
	},
	{
		key: "status",
		label: "الحالة",
		width: 120,
		minWidth: 100,
		sortable: true,
		filterable: true,
		type: "badge",
		badgeVariant: (r) => statusVariant(r),
		badgeLabel: (r) => t(r.status),
	},
	{
		key: "lastMovement",
		label: "آخر حركة",
		width: 140,
		minWidth: 120,
		sortable: true,
		format: "date",
		align: "center",
	},
	{
		key: "createdAt",
		label: "تاريخ الإنشاء",
		width: 140,
		minWidth: 120,
		sortable: true,
		format: "date",
		align: "center",
		frozen: "right",
	},
])

function statusVariant(row) {
	switch (row.status) {
		case "active":
			return "success"
		case "low":
			return "warning"
		case "out":
			return "danger"
		case "discontinued":
			return "neutral"
		default:
			return "info"
	}
}

const rows = ref([])
const demoActions = ref([
	{
		id: "new",
		label: "منتج جديد",
		icon: "plus",
		variant: "primary",
		handler: addProduct,
	},
	{
		id: "import",
		label: "استيراد",
		icon: "upload",
		variant: "secondary",
		handler: importProducts,
	},
])

const overflowActions = ref([
	{
		id: "export",
		label: "تصدير المحدد",
		icon: "download",
		handler: exportSelected,
	},
	{
		id: "delete",
		label: "حذف المحدد",
		icon: "trash-2",
		handler: deleteSelected,
	},
	{
		id: "reorder",
		label: "إعادة طلب",
		icon: "refresh-cw",
		handler: reorderSelected,
	},
	{ id: "duplicate", label: "تكرار", icon: "copy", handler: duplicateSelected },
])

const bulkActions = ref([
	{
		id: "export",
		label: "تصدير",
		icon: "download",
		variant: "primary",
		handler: () => onBulkAction({ action: "export", rows: selectedRows.value }),
	},
	{
		id: "delete",
		label: "حذف",
		icon: "trash-2",
		variant: "danger",
		handler: () => onBulkAction({ action: "delete", rows: selectedRows.value }),
	},
	{
		id: "reorder",
		label: "أمر شراء",
		icon: "shopping-cart",
		variant: "secondary",
		handler: () =>
			onBulkAction({ action: "reorder", rows: selectedRows.value }),
	},
])

const groupAggregates = computed(() => [
	{ column: "qty", fn: "sum" },
	{ column: "totalValue", fn: "sum" },
	{ column: "unitPrice", fn: "avg" },
])

function loadSampleData(size = "medium") {
	loading.value = true
	const count = size === "large" ? 10000 : size === "small" ? 50 : 500
	const data = []
	for (let i = 0; i < count; i++) {
		const cat = faker.helpers.arrayElement(categoryOptions).value
		const wh = faker.helpers.arrayElement(warehouseOptions).value
		const qty = faker.number.int({ min: 0, max: 500 })
		const reserved = faker.number.int({ min: 0, max: Math.min(50, qty) })
		const price = faker.number.float({ min: 10, max: 5000, fractionDigits: 2 })
		data.push({
			id: i + 1,
			code: `PRD-${String(i + 1).padStart(5, "0")}`,
			name: faker.commerce.productName(),
			category: cat,
			warehouse: wh,
			qty,
			reserved,
			unitPrice: price,
			reorderPoint: faker.number.int({ min: 5, max: 50 }),
			status: faker.helpers.arrayElement(statusOptions),
			lastMovement: faker.date.recent({ days: 30 }).toISOString().split("T")[0],
			createdAt: faker.date.past({ years: 2 }).toISOString().split("T")[0],
		})
	}
	rows.value = data
	totalItems.value = data.length
	loading.value = false
}

function getDetailRows(row) {
	return [
		{
			id: 1,
			field: "name",
			value: row.name,
			oldValue: "",
			changedAt: row.createdAt,
			changedBy: "system",
		},
		{
			id: 2,
			field: "qty",
			value: row.qty,
			oldValue: row.qty - 10,
			changedAt: row.lastMovement,
			changedBy: "warehouse",
		},
		{
			id: 3,
			field: "status",
			value: row.status,
			oldValue: "active",
			changedAt: row.lastMovement,
			changedBy: "manager",
		},
	]
}

function addProduct() {
	const newId = rows.value.length + 1
	rows.value.unshift({
		id: newId,
		code: `PRD-${String(newId).padStart(5, "0")}`,
		name: "منتج جديد",
		category: "electronics",
		warehouse: "wh-main",
		qty: 0,
		reserved: 0,
		unitPrice: 0,
		reorderPoint: 10,
		status: "pending",
		lastMovement: new Date().toISOString().split("T")[0],
		createdAt: new Date().toISOString().split("T")[0],
	})
	totalItems.value = rows.value.length
}

function importProducts() {
	alert(t("importFeature"))
}
function exportSelected() {
	alert(t("exportSelected", [selectedRows.value.length]))
}
function deleteSelected() {
	alert(t("deleteSelected", [selectedRows.value.length]))
}
function reorderSelected() {
	alert(t("reorderSelected", [selectedRows.value.length]))
}
function duplicateSelected() {
	alert(t("duplicateSelected", [selectedRows.value.length]))
}

function onRowClick(row) {}

function onRowExpand(rowKey, expanded) {}

function onCellEdit({ row, column, oldValue, newValue }) {}

function onBulkAction({ action, rows }) {}

function onColumnResize({ column, width }) {}

function onColumnReorder(columns) {}

function onFilterChange({ key, value }) {}

function onSort({ key, asc }) {}

function toggleGrouping() {
	groupBy.value = groupBy.value ? "" : "category"
}

function enableInlineEdit() {
	alert(t("clickCellToEdit"))
}

function onPageSizeChange(size) {
	pageSize.value = size
	currentPage.value = 1
}

function onDensityChange() {
	// Apply via CSS
	document.documentElement.style.setProperty("--grid-density", density.value)
}

function exportGrid() {
	alert(t("exportGrid"))
}

function rowDetail(row) {
	return `${row.code} - ${row.name}`
}

loadSampleData("medium")
</script>

<style scoped>
/* Grid density variants */
.work-data-grid--density-compact .work-data-grid__th,
.work-data-grid--density-compact .work-data-grid__td { padding: 6px 10px; font-size: 0.7rem; }
.work-data-grid--density-comfortable .work-data-grid__th,
.work-data-grid--density-comfortable .work-data-grid__td { padding: 8px 12px; font-size: 0.81rem; }
.work-data-grid--density-spacious .work-data-grid__th,
.work-data-grid--density-spacious .work-data-grid__td { padding: 12px 16px; font-size: 0.875rem; }
</style>