<template>
	<DashboardLayout
		title="لوحة المخزون"
		subtitle="مستويات المخزون، والحركة، وتحليل ABC"
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
			<ChartCard title="حركة المخزون" icon="activity" :loading="loading" :error="error" :is-empty="!models.movementTrend.length" aspectRatio="3/2">
				<Line :data="movementData" :options="movementOptions" />
			</ChartCard>

			<ChartCard title="تحليل ABC" icon="pie-chart" :loading="loading" :error="error" :is-empty="!models.abcAnalysis.length" aspectRatio="3/2">
				<Doughnut :data="abcData" :options="doughnutOptions" />
			</ChartCard>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
			<ChartCard title="توزيع المستودعات" icon="map" :loading="loading" :error="error" :is-empty="!models.warehouseDistribution.length" aspectRatio="3/2">
				<Bar :data="warehouseData" :options="warehouseOptions" />
			</ChartCard>

			<ChartCard title="قيمة المخزون بالصنف" icon="package" :loading="loading" :error="error" :is-empty="!models.stockLevels.length" aspectRatio="3/2">
				<Bar :data="stockValueData" :options="stockValueOptions" />
			</ChartCard>
		</div>

		<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Low Stock Alerts") }}</h3>
		<ReportTable :columns="alertColumns" :rows="models.lowStockItems" />
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
import { loadInventoryData, buildInventoryModels } from "./inventoryData"
import { useDashboardExport } from "../core/useDashboardExport"
import { useDashboardCache } from "../core/useDashboardCache"

const CURRENCY_IDS = new Set(["stock-value"])

const today = new Date()
const filterFrom = ref(
	new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
)
const filterTo = ref(today.toISOString().slice(0, 10))
const autoRefresh = ref(false)

const { facts, loading, error, lastLoaded, isLoaded, load } = useDashboardData(
	(filter) => loadInventoryData(filter),
)

const models = computed(() => buildInventoryModels(facts.value))

const { exportDashboard } = useDashboardExport({
	models,
	dashboardName: "inventory-dashboard",
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

const movementData = computed(() => ({
	labels: models.value.movementTrend.map((d) => shortDate(d.date)),
	datasets: [
		{
			label: "Inward",
			data: models.value.movementTrend.map((d) => d.inward),
			borderColor: COLORS.success,
			backgroundColor: COLORS.successLight,
			fill: true,
			tension: 0.4,
		},
		{
			label: "Outward",
			data: models.value.movementTrend.map((d) => d.outward),
			borderColor: COLORS.danger,
			backgroundColor: COLORS.dangerLight,
			fill: true,
			tension: 0.4,
		},
		{
			label: "Net",
			data: models.value.movementTrend.map((d) => d.net),
			borderColor: COLORS.primary,
			backgroundColor: "transparent",
			borderDash: [5, 5],
			tension: 0.4,
		},
	],
}))

const abcData = computed(() => ({
	labels: models.value.abcAnalysis.map((a) => a.category),
	datasets: [
		{
			data: models.value.abcAnalysis.map((a) => a.count),
			backgroundColor: models.value.abcAnalysis.map((a) => a.color),
			borderWidth: 0,
		},
	],
}))

const warehouseData = computed(() => ({
	labels: models.value.warehouseDistribution.map((w) => w.warehouse),
	datasets: [
		{
			label: "Value",
			data: models.value.warehouseDistribution.map((w) => w.value),
			backgroundColor: COLORS.primary,
			borderRadius: 4,
		},
	],
}))

const stockValueData = computed(() => ({
	labels: models.value.stockLevels.slice(0, 10).map((s) => s.itemCode),
	datasets: [
		{
			label: "Value",
			data: models.value.stockLevels.slice(0, 10).map((s) => s.value),
			backgroundColor: PALETTE.slice(0, 10),
			borderRadius: 4,
		},
	],
}))

const movementOptions = {
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

const warehouseOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { display: false } },
	scales: { y: { beginAtZero: true, ticks: { callback: currencyTick } } },
}

const stockValueOptions = {
	maintainAspectRatio: true,
	indexAxis: "y",
	plugins: { legend: { display: false } },
	scales: { x: { beginAtZero: true, ticks: { callback: currencyTick } } },
}

const alertColumns = [
	{ key: "itemCode", label: "Item Code", format: "text", sortable: true },
	{ key: "itemName", label: "Item Name", format: "text", sortable: true },
	{ key: "quantity", label: "Qty", format: "number", sortable: true },
	{ key: "warehouse", label: "Warehouse", format: "text", sortable: true },
	{ key: "status", label: "Status", format: "text", sortable: true },
]

defineExpose({ exportReport })
</script>

