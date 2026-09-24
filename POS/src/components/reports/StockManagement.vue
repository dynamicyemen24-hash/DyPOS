<template>
  <DashboardLayout
    title="إدارة المخزون"
    subtitle="إدارة الأصناف، المخزون، التحويلات، والتسوية"
    :loading="loading"
    :error="error"
    :has-data="isLoaded"
    :last-loaded="lastLoaded"
    :auto-refresh="autoRefresh"
    showBack
    exportable
    @refresh="refresh"
    @export="exportReport"
    @toggle-auto-refresh="autoRefresh = !autoRefresh"
    @back="goBack"
  >
    <template #filters>
      <div class="flex flex-wrap items-end gap-4">
        <div class="flex-1 min-w-[200px]">
          <FormControl
            type="text"
            v-model="searchQuery"
            :placeholder="__('Search products...')"
            @keydown.enter="loadProducts"
          >
            <template #prefix>
              <FeatherIcon name="search" class="w-4 h-4 text-gray-500" />
            </template>
          </FormControl>
        </div>
        <SelectInput
          v-model="filterWarehouse"
          :options="warehouseOptions"
          :placeholder="__('All Warehouses')"
          class="w-48"
        />
        <SelectInput
          v-model="filterCategory"
          :options="categoryOptions"
          :placeholder="__('All Categories')"
          class="w-48"
        />
        <SelectInput
          v-model="filterStockStatus"
          :options="stockStatusOptions"
          :placeholder="__('Stock Status')"
          class="w-40"
        />
        <Button @click="loadProducts" variant="outline" :loading="loading">
          <template #prefix>
            <FeatherIcon name="refresh-cw" class="w-4 h-4" />
          </template>
          {{ __("Refresh") }}
        </Button>
        <Button @click="openImportExport" variant="outline">
          <template #prefix>
            <FeatherIcon name="file-text" class="w-4 h-4" />
          </template>
          {{ __("Import/Export") }}
        </Button>
        <Button @click="openStockTake" variant="outline">
          <template #prefix>
            <FeatherIcon name="clipboard" class="w-4 h-4" />
          </template>
          {{ __("Stock Take") }}
        </Button>
        <Button @click="openReorderManagement" variant="solid" theme="blue">
          <template #prefix>
            <FeatherIcon name="alert-triangle" class="w-4 h-4" />
          </template>
          {{ __("Reorder Alerts") }}
        </Button>
      </div>
    </template>

    <KPISummary
      class="mb-6"
      :kpis="kpis"
      :currency-ids="CURRENCY_IDS"
    />

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <ChartCard title="اتجاه قيمة المخزون" icon="trending-up" :loading="loading" :error="error" :is-empty="!stockValueTrend.length" aspectRatio="3/2">
        <Line :data="stockValueChartData" :options="lineOptions" />
      </ChartCard>

      <ChartCard title="المخزون حسب التصنيف" icon="pie-chart" :loading="loading" :error="error" :is-empty="!categoryDistribution.length" aspectRatio="3/2">
        <Doughnut :data="categoryChartData" :options="doughnutOptions" />
      </ChartCard>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <ChartCard title="أعلى 10 بالقيمة" icon="dollar-sign" :loading="loading" :error="error" :is-empty="!topByValue.length" aspectRatio="3/2">
        <Bar :data="topValueChartData" :options="barOptions" />
      </ChartCard>

      <ChartCard title="أعلى 10 بالكمية" icon="package" :loading="loading" :error="error" :is-empty="!topByQty.length" aspectRatio="3/2">
        <Bar :data="topQtyChartData" :options="barOptions" />
      </ChartCard>

      <ChartCard title="اتجاه المخزون المنخفض" icon="alert-triangle" :loading="loading" :error="error" :is-empty="!lowStockTrend.length" aspectRatio="3/2">
        <Line :data="lowStockChartData" :options="lineOptions" />
      </ChartCard>
    </div>

    <h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Products") }}</h3>
    <div class="overflow-x-auto">
      <ReportTable
        :columns="productColumns"
        :rows="paginatedProducts"
        :row-clickable="true"
        @row-click="openProductDetails"
      >
        <template #col-status="{ row }">
          <StockStatusBadge :qty="row.qty" :reserved="row.reserved_qty" :reorderPoint="row.reorder_point" />
        </template>
        <template #col-qty="{ row }">
          <div class="flex items-center gap-2">
            <span>{{ row.qty }}</span>
            <span v-if="row.reserved_qty > 0" class="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">R: {{ row.reserved_qty }}</span>
          </div>
        </template>
        <template #col-actions="{ row }">
          <div class="flex items-center gap-1">
            <Button size="sm" variant="ghost" @click.stop="openAdjustment(row)" :aria-label="__('Adjust Stock')">
              <FeatherIcon name="edit-2" class="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" @click.stop="openTransfer(row)" :aria-label="__('Transfer Stock')">
              <FeatherIcon name="move" class="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" @click.stop="openHistory(row)" :aria-label="__('View History')">
              <FeatherIcon name="clock" class="w-4 h-4" />
            </Button>
          </div>
        </template>
      </ReportTable>
    </div>

    <Pagination
      v-if="totalPages > 1"
      :current-page="currentPage"
      :total-pages="totalPages"
      @page-change="currentPage = $event"
    />

    <StockAdjustmentDialog
      v-if="selectedProduct"
      v-model="showAdjustmentDialog"
      :product="selectedProduct"
      :warehouses="models.warehouses"
      @saved="refresh"
    />
    <StockTransferDialog
      v-if="selectedProduct"
      v-model="showTransferDialog"
      :product="selectedProduct"
      :warehouses="models.warehouses"
      @saved="refresh"
    />
    <StockImportExportDialog
      v-model="showImportExportDialog"
      :warehouses="models.warehouses"
      :categories="models.categories"
    />
    <StockTakeDialog
      v-model="showStockTakeDialog"
      :warehouses="models.warehouses"
      :categories="models.categories"
      @saved="refresh"
    />
    <ReorderManagementDialog
      v-model="showReorderDialog"
      :warehouses="models.warehouses"
      :categories="models.categories"
      @saved="refresh"
    />
    <StockHistoryDialog
      v-if="selectedProduct"
      v-model="showHistoryDialog"
      :product="selectedProduct"
      :warehouses="models.warehouses"
    />
  </DashboardLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { Line, Bar, Doughnut } from "vue-chartjs"
import { Button, FeatherIcon, FormControl } from "frappe-ui"
import DashboardLayout from "./dashboards/core/DashboardLayout.vue"
import ChartCard from "./dashboards/core/ChartCard.vue"
import KPISummary from "./dashboards/core/KPISummary.vue"
import ReportTable from "./ui/tables/ReportTable.vue"
import Pagination from "../ui/Pagination.vue"
import StockStatusBadge from "../ui/StockStatusBadge.vue"
import SelectInput from "@/components/common/SelectInput.vue"
import StockAdjustmentDialog from "../sale/StockAdjustmentDialog.vue"
import StockTransferDialog from "../sale/StockTransferDialog.vue"
import StockImportExportDialog from "../sale/StockImportExportDialog.vue"
import StockTakeDialog from "../sale/StockTakeDialog.vue"
import ReorderManagementDialog from "../sale/ReorderManagementDialog.vue"
import StockHistoryDialog from "../sale/StockHistoryDialog.vue"
import {
	COLORS,
	PALETTE,
	currencyTick,
	shortDate,
} from "./dashboards/core/chartConfig"
import { useDashboardData } from "./dashboards/core/useDashboardData"
import {
	loadStockManagementData,
	buildStockManagementModels,
	clearStockManagementCache,
} from "./dashboards/inventory/stockManagementData"
import { useDashboardExport } from "./dashboards/core/useDashboardExport"
import { useDashboardCache } from "./dashboards/core/useDashboardCache"

const CURRENCY_IDS = new Set(["stock-value"])

const today = new Date()
const filterFrom = ref(
	new Date(today.getFullYear(), today.getMonth() - 11, 1)
		.toISOString()
		.slice(0, 10),
)
const filterTo = ref(today.toISOString().slice(0, 10))
const autoRefresh = ref(false)

const searchQuery = ref("")
const filterWarehouse = ref("")
const filterCategory = ref("")
const filterStockStatus = ref("")

const pageSize = ref(50)
const currentPage = ref(1)

const selectedProduct = ref(null)
const showAdjustmentDialog = ref(false)
const showTransferDialog = ref(false)
const showImportExportDialog = ref(false)
const showStockTakeDialog = ref(false)
const showReorderDialog = ref(false)
const showHistoryDialog = ref(false)

const { facts, loading, error, lastLoaded, isLoaded, load } = useDashboardData(
	(filter) => loadStockManagementData(filter),
)

const models = computed(() => buildStockManagementModels(facts.value))

const kpis = computed(() => [
	{
		id: "total-items",
		label: "إجمالي الأصناف",
		value: models.value.summary.totalItems || 0,
		status: "neutral",
	},
	{
		id: "stock-value",
		label: "قيمة المخزون الإجمالية",
		value: models.value.summary.totalValue || 0,
		status: "neutral",
	},
	{
		id: "low-stock",
		label: "أصناف منخفضة المخزون",
		value: models.value.summary.lowStockCount || 0,
		status: "warning",
	},
	{
		id: "out-of-stock",
		label: "نفذ من المخزون",
		value: models.value.summary.outOfStockCount || 0,
		status: "danger",
	},
	{
		id: "warehouses",
		label: "المستودعات",
		value: models.value.summary.warehouseCount || 0,
		status: "good",
	},
])

const productColumns = [
	{ key: "code", label: "الكود", sortable: true },
	{ key: "name", label: "الاسم", sortable: true },
	{ key: "category", label: "التصنيف", sortable: true },
	{ key: "warehouse", label: "المستودع", sortable: true },
	{ key: "qty", label: "الكمية", sortable: true, format: "number" },
	{ key: "reserved_qty", label: "محجوز", sortable: true, format: "number" },
	{
		key: "available",
		label: "متاح",
		sortable: true,
		format: "number",
		compute: (r) => r.qty - (r.reserved_qty || 0),
	},
	{
		key: "reorder_point",
		label: "حد إعادة الطلب",
		sortable: true,
		format: "number",
	},
	{
		key: "stock_value",
		label: "قيمة المخزون",
		sortable: true,
		format: "currency",
	},
	{ key: "status", label: "الحالة" },
	{ key: "actions", label: "إجراءات", width: 120 },
]

const paginatedProducts = computed(() => {
	const start = (currentPage.value - 1) * pageSize.value
	return models.value?.products?.slice(start, start + pageSize.value) || []
})

const totalProducts = computed(() => models.value?.products?.length || 0)
const totalPages = computed(() =>
	Math.ceil(totalProducts.value / pageSize.value),
)

const { exportDashboard } = useDashboardExport({
	models,
	dashboardName: "stock-management",
})

const { load: loadCache, save: saveCache } = useDashboardCache({
	defaultTTL: 5,
})

function exportReport(format) {
	exportDashboard(format)
}

function goBack() {
	window.history.back()
}

function refresh() {
	clearStockManagementCache()
	const cacheResult = loadCache({ from: filterFrom.value, to: filterTo.value })
	if (!cacheResult.fromCache) {
		load({ from: filterFrom.value, to: filterTo.value }).finally(() => {
			saveCache({ from: filterFrom.value, to: filterTo.value }, facts.value)
		})
	}
}

const debouncedRefresh = debounce(refresh, 300)
watch([filterFrom, filterTo], debouncedRefresh)
onMounted(refresh)

function debounce(fn, ms) {
	let timer
	return (...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => fn(...args), ms)
	}
}

const stockValueTrend = computed(() => models.value?.stockValueTrend || [])
const categoryDistribution = computed(
	() => models.value?.categoryDistribution || [],
)
const topByValue = computed(() => models.value?.topByValue || [])
const topByQty = computed(() => models.value?.topByQty || [])
const lowStockTrend = computed(() => models.value?.lowStockTrend || [])

const stockValueChartData = computed(() => ({
	labels: stockValueTrend.value.map((d) => shortDate(d.date)),
	datasets: [
		{
			label: __("Stock Value"),
			data: stockValueTrend.value.map((d) => d.value),
			borderColor: COLORS.primary,
			backgroundColor: COLORS.primaryLight,
			fill: true,
			tension: 0.4,
		},
	],
}))

const categoryChartData = computed(() => ({
	labels: categoryDistribution.value.map((c) => c.category),
	datasets: [
		{
			data: categoryDistribution.value.map((c) => c.value),
			backgroundColor: PALETTE.slice(0, categoryDistribution.value.length),
			borderWidth: 0,
		},
	],
}))

const topValueChartData = computed(() => ({
	labels: topByValue.value.map((t) => t.code),
	datasets: [
		{
			label: __("Value"),
			data: topByValue.value.map((t) => t.value),
			backgroundColor: COLORS.primary,
			borderRadius: 4,
			indexAxis: "y",
		},
	],
}))

const topQtyChartData = computed(() => ({
	labels: topByQty.value.map((t) => t.code),
	datasets: [
		{
			label: __("Qty"),
			data: topByQty.value.map((t) => t.qty),
			backgroundColor: COLORS.success,
			borderRadius: 4,
			indexAxis: "y",
		},
	],
}))

const lowStockChartData = computed(() => ({
	labels: lowStockTrend.value.map((d) => shortDate(d.date)),
	datasets: [
		{
			label: __("Low Stock Count"),
			data: lowStockTrend.value.map((d) => d.count),
			borderColor: COLORS.danger,
			backgroundColor: COLORS.dangerLight,
			fill: true,
			tension: 0.4,
		},
	],
}))

const lineOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { position: "top" } },
	scales: { y: { beginAtZero: true } },
	interaction: { intersect: false, mode: "index" },
}

const doughnutOptions = {
	maintainAspectRatio: true,
	plugins: {
		legend: { position: "right", labels: { boxWidth: 12 } },
		cutout: "55%",
	},
}

const barOptions = {
	maintainAspectRatio: true,
	indexAxis: "y",
	plugins: { legend: { display: false } },
	scales: { x: { beginAtZero: true, ticks: { callback: currencyTick } } },
}

const warehouseOptions = computed(
	() =>
		models.value?.warehouses?.map((w) => ({ value: w.id, label: w.name })) ||
		[],
)
const categoryOptions = computed(
	() => models.value?.categories?.map((c) => ({ value: c, label: c })) || [],
)
const stockStatusOptions = [
	{ value: "", label: "الكل" },
	{ value: "normal", label: "طبيعي" },
	{ value: "low", label: "منخفض" },
	{ value: "out", label: "نفذ" },
	{ value: "overstocked", label: "زائد" },
]

function loadProducts() {
	load({
		from: filterFrom.value,
		to: filterTo.value,
		warehouse: filterWarehouse.value,
		category: filterCategory.value,
		stockStatus: filterStockStatus.value,
		search: searchQuery.value,
	})
}

function openAdjustment(product) {
	selectedProduct.value = product
	showAdjustmentDialog.value = true
}

function openTransfer(product) {
	selectedProduct.value = product
	showTransferDialog.value = true
}

function openImportExport() {
	showImportExportDialog.value = true
}

function openStockTake() {
	showStockTakeDialog.value = true
}

function openReorderManagement() {
	showReorderDialog.value = true
}

function openHistory(product) {
	selectedProduct.value = product
	showHistoryDialog.value = true
}

function openProductDetails(row) {
	selectedProduct.value = row
}
</script>