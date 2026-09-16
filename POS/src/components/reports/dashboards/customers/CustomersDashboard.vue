<template>
	<DashboardLayout
		title="لوحة العملاء"
		subtitle="تحليلات العملاء، والتجزئة، والاحتفاظ بهم"
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
		/>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
			<ChartCard title="اتجاه العملاء" icon="users" :loading="loading" :error="error" :is-empty="!models.customerTrend.length" aspectRatio="3/2">
				<Line :data="trendData" :options="trendOptions" />
			</ChartCard>

			<ChartCard title="تجزئة العملاء" icon="pie-chart" :loading="loading" :error="error" :is-empty="!models.segmentation.length" aspectRatio="3/2">
				<Doughnut :data="segmentData" :options="doughnutOptions" />
			</ChartCard>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
			<ChartCard title="توزيع الإيرادات" icon="bar-chart" :loading="loading" :error="error" :is-empty="!models.topCustomers.length" aspectRatio="3/2">
				<Bar :data="revenueDistData" :options="revenueOptions" />
			</ChartCard>

			<ChartCard title="قيمة العميل مدى الحياة" icon="star" :loading="loading" :error="error" :is-empty="!models.lifetimeValue.length" aspectRatio="3/2">
				<Bar :data="ltvData" :options="ltvOptions" />
			</ChartCard>
		</div>

		<div v-if="models.retention.length" class="mb-6">
			<ChartCard title="احتفاظ العملاء" icon="repeat" :loading="loading" :error="error" aspectRatio="3/2">
				<Line :data="retentionData" :options="retentionOptions" />
			</ChartCard>
		</div>

		<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Top Customers") }}</h3>
		<ReportTable :columns="customerColumns" :rows="models.topCustomers" />
	</DashboardLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { Line, Bar, Doughnut } from "vue-chartjs"
import DashboardLayout from "../core/DashboardLayout.vue"
import ChartCard from "../core/ChartCard.vue"
import KPISummary from "../core/KPISummary.vue"
import DateRangeFilter from "../../ui/filters/DateRangeFilter.vue"
import ReportTable from "../../ui/tables/ReportTable.vue"
import { COLORS, PALETTE, currencyTick, shortDate } from "../core/chartConfig"
import { useDashboardData } from "../core/useDashboardData"
import { loadCustomersData, buildCustomerModels } from "./customersData"
import { useDashboardExport } from "../core/useDashboardExport"
import { useDashboardCache } from "../core/useDashboardCache"

const CURRENCY_IDS = new Set(["revenue", "average"])

const today = new Date()
const filterFrom = ref(
	new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
)
const filterTo = ref(today.toISOString().slice(0, 10))
const autoRefresh = ref(false)

const { facts, loading, error, lastLoaded, isLoaded, load } = useDashboardData(
	(filter) => loadCustomersData(filter),
)

const models = computed(() => buildCustomerModels(facts.value))

const { exportDashboard } = useDashboardExport({
	models,
	dashboardName: "customers-dashboard",
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
onMounted(refresh)

function debounce(fn, ms) {
	let timer
	return (...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => fn(...args), ms)
	}
}

const trendData = computed(() => ({
	labels: models.value.customerTrend.map((d) => shortDate(d.date)),
	datasets: [
		{
			label: "Customers",
			data: models.value.customerTrend.map((d) => d.customers),
			borderColor: COLORS.primary,
			backgroundColor: COLORS.primaryLight,
			fill: true,
			tension: 0.4,
			yAxisID: "y",
		},
		{
			label: "Revenue",
			data: models.value.customerTrend.map((d) => d.revenue),
			borderColor: COLORS.success,
			backgroundColor: "transparent",
			tension: 0.4,
			yAxisID: "y1",
		},
	],
}))

const segmentData = computed(() => ({
	labels: models.value.segmentation.map((s) => s.label),
	datasets: [
		{
			data: models.value.segmentation.map((s) => s.count),
			backgroundColor: [
				COLORS.primary,
				COLORS.success,
				COLORS.warning,
				COLORS.gray,
			],
			borderWidth: 0,
		},
	],
}))

const revenueDistData = computed(() => ({
	labels: models.value.topCustomers.slice(0, 8).map((c) => c.name),
	datasets: [
		{
			label: "Revenue",
			data: models.value.topCustomers.slice(0, 8).map((c) => c.revenue),
			backgroundColor: PALETTE.slice(0, 8),
			borderRadius: 4,
		},
	],
}))

const ltvData = computed(() => ({
	labels: models.value.lifetimeValue.slice(0, 8).map((c) => c.name),
	datasets: [
		{
			label: "Lifetime Value",
			data: models.value.lifetimeValue.slice(0, 8).map((c) => c.total),
			backgroundColor: COLORS.primary,
			borderRadius: 4,
		},
		{
			label: "Avg Order",
			data: models.value.lifetimeValue.slice(0, 8).map((c) => c.avgOrder),
			backgroundColor: COLORS.secondary,
			borderRadius: 4,
		},
	],
}))

const retentionData = computed(() => ({
	labels: models.value.retention.map((r) => r.month),
	datasets: [
		{
			label: "Retention %",
			data: models.value.retention.map((r) => r.retention),
			borderColor: COLORS.primary,
			backgroundColor: COLORS.primaryLight,
			fill: true,
			tension: 0.4,
		},
	],
}))

const trendOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { position: "top" } },
	scales: {
		y: { beginAtZero: true, position: "left" },
		y1: {
			beginAtZero: true,
			position: "right",
			grid: { drawOnChartArea: false },
			ticks: { callback: currencyTick },
		},
	},
	interaction: { intersect: false, mode: "index" },
}

const doughnutOptions = {
	maintainAspectRatio: true,
	plugins: {
		legend: { position: "right", labels: { boxWidth: 12 } },
		cutout: "55%",
	},
}

const revenueOptions = {
	maintainAspectRatio: true,
	indexAxis: "y",
	plugins: { legend: { display: false } },
	scales: { x: { beginAtZero: true, ticks: { callback: currencyTick } } },
}

const ltvOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { position: "top" } },
	scales: { y: { beginAtZero: true, ticks: { callback: currencyTick } } },
}

const retentionOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { display: false } },
	scales: {
		y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } },
	},
}

const customerColumns = [
	{ key: "name", label: "Customer", format: "text", sortable: true },
	{ key: "invoices", label: "Invoices", format: "number", sortable: true },
	{ key: "revenue", label: "Revenue", format: "currency", sortable: true },
	{ key: "sharePercent", label: "Share", format: "percent", sortable: true },
	{ key: "lastDate", label: "Last Purchase", format: "date", sortable: true },
]

defineExpose({ exportReport })
</script>

