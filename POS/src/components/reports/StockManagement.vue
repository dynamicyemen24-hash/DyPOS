<template>
  <WorkShell
    title="إدارة المخزون"
    subtitle="إدارة الأصناف، المخزون، التحويلات، والتسوية"
    :nav-items="navItems"
    :breadcrumbs="breadcrumbs"
    :loading="loading"
    :error="error"
    :empty="!isLoaded && !loading"
    :empty-title="'لا توجد منتجات'"
    :empty-description="'لم يتم العثور على منتجات مطابقة للفلاتر'"
    :has-data="isLoaded"
    :last-loaded="lastLoaded"
    @refresh="refresh"
  >
    <template #toolbar>
      <WorkToolbar>
        <template #start>
          <WorkSearch
            v-model="searchQuery"
            placeholder="ابحث بالاسم أو الكود..."
            :suggestions="searchSuggestions"
            @search="onSearch"
            @select="onSearchSelect"
          />
        </template>
        <template #end>
          <WorkActions
            :primary-actions="primaryActions"
            :secondary-actions="secondaryActions"
            :overflow-actions="overflowActions"
          />
        </template>
      </WorkToolbar>

      <WorkFilters
        v-model="filterModel"
        :fields="filterFields"
        :auto-apply="true"
        @apply="onFiltersApply"
        @reset="onFiltersReset"
      />
    </template>

    <!-- KPI Summary -->
    <WorkCard variant="outlined" class="mb-6">
      <KPISummary :kpis="kpis" :currency-ids="CURRENCY_IDS" />
    </WorkCard>

    <!-- Charts Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <WorkChart
        type="line"
        :data="stockValueChartData"
        :options="lineOptions"
        title="اتجاه قيمة المخزون"
        aspect-ratio="3/2"
        :loading="loading"
        :is-empty="!stockValueTrend.length"
      />
      <WorkChart
        type="doughnut"
        :data="categoryChartData"
        :options="doughnutOptions"
        title="المخزون حسب التصنيف"
        aspect-ratio="3/2"
        :loading="loading"
        :is-empty="!categoryDistribution.length"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <WorkChart
        type="bar"
        :data="topValueChartData"
        :options="barOptions"
        title="أعلى 10 بالقيمة"
        aspect-ratio="3/2"
        :loading="loading"
        :is-empty="!topByValue.length"
      />
      <WorkChart
        type="bar"
        :data="topQtyChartData"
        :options="barOptions"
        title="أعلى 10 بالكمية"
        aspect-ratio="3/2"
        :loading="loading"
        :is-empty="!topByQty.length"
      />
      <WorkChart
        type="line"
        :data="lowStockChartData"
        :options="lineOptions"
        title="اتجاه المخزون المنخفض"
        aspect-ratio="3/2"
        :loading="loading"
        :is-empty="!lowStockTrend.length"
      />
    </div>

    <!-- Products Table -->
    <WorkCard variant="outlined">
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900">المنتجات</h3>
      </template>
      <WorkTable
        :columns="productColumns"
        :rows="paginatedProducts"
        row-key="id"
        row-clickable
        selectable
        :selected-rows="selectedRows"
        @update:selected-rows="selectedRows = $event"
        @row-click="openProductDetails"
        :actions-column="actionsColumn"
      />
      <template #footer>
        <WorkPagination
          v-if="totalPages > 1"
          :current-page="currentPage"
          :total-pages="totalPages"
          :page-size="pageSize"
          :total-items="totalProducts"
          @page-change="currentPage = $event"
          @page-size-change="onPageSizeChange"
        />
      </template>
    </WorkCard>

    <!-- Dialogs -->
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
  </WorkShell>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue"
import { Line, Bar, Doughnut } from "vue-chartjs"
import { Button, FeatherIcon, FormControl } from "frappe-ui"
import { t } from "@/utils/translation"
import {
	COLORS,
	PALETTE,
	currencyTick,
	shortDate,
} from "@/components/reports/dashboards/core/chartConfig"
import { useDashboardData } from "@/components/reports/dashboards/core/useDashboardData"
import {
	loadStockManagementData,
	buildStockManagementModels,
	clearStockManagementCache,
} from "@/components/reports/dashboards/inventory/stockManagementData"
import { useDashboardExport } from "@/components/reports/dashboards/core/useDashboardExport"
import { useDashboardCache } from "@/components/reports/dashboards/core/useDashboardCache"
import { debounce } from "@/utils/helpers"

import WorkShell from "@/components/work/WorkShell.vue"
import WorkToolbar from "@/components/work/WorkToolbar.vue"
import WorkSearch from "@/components/work/WorkSearch.vue"
import WorkActions from "@/components/work/WorkActions.vue"
import WorkFilters from "@/components/work/WorkFilters.vue"
import WorkFilterField from "@/components/work/WorkFilterField.vue"
import WorkChart from "@/components/work/WorkChart.vue"
import WorkTable from "@/components/work/WorkTable.vue"
import WorkPagination from "@/components/work/WorkPagination.vue"
import WorkCard from "@/components/ui/DyCard.vue"
import WorkKPISummary from "@/components/reports/dashboards/core/KPISummary.vue"

import StockStatusBadge from "@/components/ui/StockStatusBadge.vue"
import StockAdjustmentDialog from "@/components/sale/StockAdjustmentDialog.vue"
import StockTransferDialog from "@/components/sale/StockTransferDialog.vue"
import StockImportExportDialog from "@/components/sale/StockImportExportDialog.vue"
import StockTakeDialog from "@/components/sale/StockTakeDialog.vue"
import ReorderManagementDialog from "@/components/sale/ReorderManagementDialog.vue"
import StockHistoryDialog from "@/components/sale/StockHistoryDialog.vue"

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
const searchSuggestions = ref([])
const filterModel = reactive({
	search: "",
	warehouse: "",
	category: "",
	stockStatus: "",
})
const filterFields = ref([
	{
		key: "search",
		label: "البحث",
		type: "text",
		placeholder: "ابحث بالاسم أو الكود",
	},
	{
		key: "warehouse",
		label: "المستودع",
		type: "select",
		placeholder: "كل المستودعات",
		options: [],
	},
	{
		key: "category",
		label: "التصنيف",
		type: "select",
		placeholder: "كل التصنيفات",
		options: [],
	},
	{
		key: "stockStatus",
		label: "حالة المخزون",
		type: "select",
		placeholder: "كل الحالات",
		options: [],
	},
])

const pageSize = ref(50)
const currentPage = ref(1)

const selectedProduct = ref(null)
const selectedRows = ref([])
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
			label: t("Stock Value"),
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
			label: t("Value"),
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
			label: t("Qty"),
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
			label: t("Low Stock Count"),
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

function onSearch(q) {
	filterModel.search = q
}

function onSearchSelect(s) {
	searchQuery.value = s.label
}

function loadProducts() {
	load({
		from: filterFrom.value,
		to: filterTo.value,
		warehouse: filterModel.warehouse,
		category: filterModel.category,
		stockStatus: filterModel.stockStatus,
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

function onFiltersApply(f) {
	filterModel.warehouse = f.warehouse || ""
	filterModel.category = f.category || ""
	filterModel.stockStatus = f.stockStatus || ""
	loadProducts()
}

function onFiltersReset() {
	filterModel.warehouse = ""
	filterModel.category = ""
	filterModel.stockStatus = ""
	loadProducts()
}

const navItems = ref([
	{
		id: "pos",
		label: "نقطة البيع",
		to: { name: "POSSale" },
		icon: "shopping-cart",
	},
	{
		id: "invoices",
		label: "الفواتير",
		to: { name: "WorkScreens", query: { screen: "invoices" } },
		icon: "file-text",
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
	{ label: "إدارة المخزون", current: true },
])

const primaryActions = ref([
	{
		id: "adjustment",
		label: "تسوية",
		icon: "edit-2",
		variant: "primary",
		handler: () => {},
	},
])

const secondaryActions = ref([
	{
		id: "import-export",
		label: "استيراد/تصدير",
		icon: "file-text",
		variant: "ghost",
		handler: openImportExport,
	},
	{
		id: "stock-take",
		label: "جرد المخزون",
		icon: "clipboard",
		variant: "ghost",
		handler: openStockTake,
	},
])

const overflowActions = ref([
	{
		id: "reorder",
		label: "تنبيهات إعادة الطلب",
		icon: "alert-triangle",
		handler: openReorderManagement,
	},
])

const actionsColumn = {
	actions: [
		{
			id: "adjust",
			icon: "edit-2",
			variant: "ghost",
			handler: openAdjustment,
			label: "تسوية",
		},
		{
			id: "transfer",
			icon: "move",
			variant: "ghost",
			handler: openTransfer,
			label: "نقل",
		},
		{
			id: "history",
			icon: "clock",
			variant: "ghost",
			handler: openHistory,
			label: "سجل",
		},
	],
}

function onPageSizeChange(size) {
	pageSize.value = size
	currentPage.value = 1
}
</script>