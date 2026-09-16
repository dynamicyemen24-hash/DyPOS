<template>
	<ErrorBoundary>
		<DashboardLayout
			title="لوحة المبيعات"
			subtitle="نظرة عامة على أداء المبيعات في الوقت الحقيقي"
			:loading="loading"
			:error="error"
			:has-data="isLoaded"
			:last-loaded="lastLoaded"
			:realtime-mode="rtMode"
			:realtime="rtMode === 'socket'"
			:auto-refresh="autoRefresh"
			showBack
			exportable
			@refresh="refresh"
			@export="exportReport"
			@toggle-auto-refresh="autoRefresh = !autoRefresh"
			@back="goBack"
			@print="handlePrint"
		>
			<template #filters>
				<DateRangeFilter
					v-model:from="filterFrom"
					v-model:to="filterTo"
					:loading="loading"
					@refresh="refresh"
				/>
			</template>

			<KPISummary
				class="mb-6"
				:kpis="models.kpis"
				:currency-ids="CURRENCY_IDS"
				:percent-ids="PERCENT_IDS"
			/>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<ChartCard title="اتجاه المبيعات" icon="trending-up" :loading="loading" :error="error" :is-empty="!models.dailyTrend.current.length">
					<Line :data="salesTrendData" :options="lineOptions" />
				</ChartCard>

				<ChartCard title="اتجاه المعاملات" icon="hash" :loading="loading" :error="error" :is-empty="!models.dailyTrend.current.length">
					<Bar :data="transactionTrendData" :options="barOptions" />
				</ChartCard>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
				<ChartCard title="تحليل التصنيفات" icon="pie-chart" :loading="loading" :error="error" :is-empty="!models.categoryBreakdown.length" aspectRatio="3/2">
					<Doughnut :data="categoryData" :options="doughnutOptions" />
				</ChartCard>

				<ChartCard title="طرق الدفع" icon="credit-card" :loading="loading" :error="error" :is-empty="!models.paymentMethods.length" aspectRatio="3/2">
					<Pie :data="paymentData" :options="pieOptions" />
				</ChartCard>

				<ChartCard title="النمط الساعي" icon="clock" :loading="loading" :error="error" :is-empty="!models.hourlyPattern.length" aspectRatio="3/2">
					<Bar :data="hourlyData" :options="hourlyOptions" />
				</ChartCard>
			</div>

			<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Top Products") }}</h3>
			<ReportTable class="mb-6" :columns="productColumns" :rows="models.topProducts" />
		</DashboardLayout>
	</ErrorBoundary>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { Line, Bar, Doughnut, Pie } from "vue-chartjs"
import DashboardLayout from "../core/DashboardLayout.vue"
import ChartCard from "../core/ChartCard.vue"
import KPISummary from "../core/KPISummary.vue"
import DateRangeFilter from "../../ui/filters/DateRangeFilter.vue"
import ReportTable from "../../ui/tables/ReportTable.vue"
import {
	COLORS,
	PALETTE,
	PALETTE_LIGHT,
	currencyTick,
	shortDate,
} from "../core/chartConfig"
import { useDashboardData } from "../core/useDashboardData"
import { useRealtimeRefresh } from "../core/realtime-refresh"
import { loadSalesData, buildSalesModels } from "./salesData"
import { useDashboardExport } from "../core/useDashboardExport"
import { useDashboardCache } from "../core/useDashboardCache"

const CURRENCY_IDS = new Set([
	"net-sales",
	"average-ticket",
	"gross-sales",
	"discounts",
	"revenue",
])
const PERCENT_IDS = new Set(["collection-rate"])

const today = new Date()
const filterFrom = ref(
	new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
)
const filterTo = ref(today.toISOString().slice(0, 10))
const autoRefresh = ref(false)

const { facts, loading, error, lastLoaded, isLoaded, load } = useDashboardData(
	(filter) => loadSalesData(filter),
)

const {
	mode: rtMode,
	start,
	stop,
} = useRealtimeRefresh({
	onRefresh: () => refresh(),
	pollInterval: 30000,
	doctypes: ["Sales Invoice", "Payment Entry"],
})

const { load: loadCache, save: saveCache } = useDashboardCache({ defaultTTL: 5 })

const models = computed(() => buildSalesModels(facts.value))

const { exportDashboard } = useDashboardExport({
	models,
	dashboardName: "sales-dashboard",
})

function exportReport(format) {
	exportDashboard(format)
}

function goBack() {
	window.history.back()
}

function handlePrint() {
	window.print()
}

function refresh() {
	const cacheResult = loadCache({ from: filterFrom.value, to: filterTo.value })
	if (!cacheResult.fromCache) {
		load({ from: filterFrom.value, to: filterTo.value }).finally(() => {
			saveCache({ from: filterFrom.value, to: filterTo.value }, facts.value)
		})
	}
}

const debouncedRefresh = debounce(refresh, 300)
watch([filterFrom, filterTo], debouncedRefresh)
onMounted(() => {
	refresh()
	start()
})

function debounce(fn, ms) {
	let timer
	return (...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => fn(...args), ms)
	}
}

const salesTrendData = computed(() => ({
	labels: models.value.dailyTrend?.current?.map((d) => shortDate(d.date)) || [],
	datasets: [
		{
			label: "Current Period",
			data: models.value.dailyTrend?.current?.map((d) => d.net) || [],
			borderColor: COLORS.primary,
			backgroundColor: COLORS.primaryLight,
			fill: true,
			tension: 0.4,
		},
		{
			label: "Previous Period",
			data: models.value.dailyTrend?.previous?.map((d) => d.sales) || [],
			borderColor: COLORS.gray,
			backgroundColor: "transparent",
			borderDash: [5, 5],
			tension: 0.4,
		},
	],
}))

const transactionTrendData = computed(() => ({
	labels: models.value.dailyTrend?.current?.map((d) => shortDate(d.date)) || [],
	datasets: [
		{
			label: "Transactions",
			data: models.value.dailyTrend?.current?.map((d) => d.transactions) || [],
			backgroundColor: COLORS.primary,
			borderRadius: 4,
		},
		{
			label: "Returns",
			data: models.value.dailyTrend?.current?.map((d) => d.returns) || [],
			backgroundColor: COLORS.danger,
			borderRadius: 4,
		},
	],
}))

const categoryData = computed(() => ({
	labels: models.value.categoryBreakdown?.map((c) => c.category) || [],
	datasets: [
		{
			data: models.value.categoryBreakdown?.map((c) => c.revenue) || [],
			backgroundColor: PALETTE.slice(0, models.value.categoryBreakdown?.length || 0),
			borderWidth: 0,
		},
	],
}))

const paymentData = computed(() => ({
	labels: models.value.paymentMethods?.map((m) => m.method) || [],
	datasets: [
		{
			data: models.value.paymentMethods?.map((m) => m.amount) || [],
			backgroundColor: PALETTE.slice(0, models.value.paymentMethods?.length || 0),
			borderWidth: 0,
		},
	],
}))

const hourlyData = computed(() => ({
	labels: models.value.hourlyPattern?.map((h) => h.hour) || [],
	datasets: [
		{
			label: "Transactions",
			data: models.value.hourlyPattern?.map((h) => h.transactions) || [],
			backgroundColor: COLORS.primaryLight,
			borderColor: COLORS.primary,
			borderWidth: 1,
			borderRadius: 2,
		},
	],
}))

const lineOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { position: "top" } },
	scales: { y: { beginAtZero: true, ticks: { callback: currencyTick } } },
	interaction: { intersect: false, mode: "index" },
}

const barOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { position: "top" } },
	scales: { y: { beginAtZero: true } },
}

const doughnutOptions = {
	maintainAspectRatio: true,
	plugins: {
		legend: { position: "right", labels: { boxWidth: 12 } },
		cutout: "60%",
	},
}

const pieOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { position: "right", labels: { boxWidth: 12 } } },
}

const hourlyOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { display: false } },
	scales: { y: { beginAtZero: true } },
}

const productColumns = [
	{ key: "itemCode", label: "Item Code", format: "text", sortable: true },
	{ key: "itemName", label: "Item Name", format: "text", sortable: true },
	{ key: "quantity", label: "Qty Sold", format: "number", sortable: true },
	{ key: "revenue", label: "Revenue", format: "currency", sortable: true },
]

defineExpose({ exportReport })
</script>

