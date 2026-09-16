<template>
	<DashboardLayout
		title="لوحة المالية"
		subtitle="التدفق النقدي، والمستحقات، والصحة المالية"
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
			<ChartCard title="اتجاه التدفق النقدي" icon="activity" :loading="loading" :error="error" :is-empty="!models.cashflowTrend.length" aspectRatio="3/2">
				<Line :data="cashflowData" :options="cashflowOptions" />
			</ChartCard>

			<ChartCard title="اتجاه الربحية" icon="trending-up" :loading="loading" :error="error" :is-empty="!models.profitTrend.length" aspectRatio="3/2">
				<Line :data="profitData" :options="profitOptions" />
			</ChartCard>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
			<ChartCard title="تقادم المستحقات" icon="clock" :loading="loading" :error="error" :is-empty="!models.receivablesAging.length" aspectRatio="3/2">
				<Bar :data="receivablesAgingData" :options="agingOptions" />
			</ChartCard>

			<ChartCard title="تقادم الدائن" icon="clock" :loading="loading" :error="error" :is-empty="!models.payablesAging.length" aspectRatio="3/2">
				<Bar :data="payablesAgingData" :options="agingOptions" />
			</ChartCard>

			<ChartCard title="توزيع الدفعات" icon="credit-card" :loading="loading" :error="error" :is-empty="!models.paymentDistribution.length" aspectRatio="3/2">
				<Doughnut :data="paymentDistData" :options="doughnutOptions" />
			</ChartCard>
		</div>
	</DashboardLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { Line, Bar, Doughnut } from "vue-chartjs"
import DashboardLayout from "../core/DashboardLayout.vue"
import ChartCard from "../core/ChartCard.vue"
import KPISummary from "../core/KPISummary.vue"
import DateRangeFilter from "../../ui/filters/DateRangeFilter.vue"
import { COLORS, PALETTE, currencyTick, shortDate } from "../core/chartConfig"
import { useDashboardData } from "../core/useDashboardData"
import { useRealtimeRefresh } from "../core/realtime-refresh"
import { loadFinanceData, buildFinanceModels } from "./financeData"
import { useDashboardExport } from "../core/useDashboardExport"
import { useDashboardCache } from "../core/useDashboardCache"

const CURRENCY_IDS = new Set([
	"revenue",
	"inflow",
	"outflow",
	"net",
	"receivable",
	"payable",
])
const PERCENT_IDS = new Set(["collection-rate", "profit"])

const today = new Date()
const filterFrom = ref(
	new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
)
const filterTo = ref(today.toISOString().slice(0, 10))
const autoRefresh = ref(false)

const { facts, loading, error, lastLoaded, isLoaded, load } = useDashboardData(
	(filter) => loadFinanceData(filter),
)

const {
	mode: rtMode,
	start,
	stop,
} = useRealtimeRefresh({
	onRefresh: () => refresh(),
	pollInterval: 30000,
	doctypes: ["Sales Invoice", "Payment Entry", "Purchase Invoice"],
})

const { load: loadCache, save: saveCache } = useDashboardCache({
	defaultTTL: 5,
})

const models = computed(() => buildFinanceModels(facts.value))

const { exportDashboard } = useDashboardExport({
	models,
	dashboardName: "finance-dashboard",
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

const cashflowData = computed(() => ({
	labels: models.value.cashflowTrend.map((d) => shortDate(d.date)),
	datasets: [
		{
			label: "Inflow",
			data: models.value.cashflowTrend.map((d) => d.inflow),
			borderColor: COLORS.success,
			backgroundColor: COLORS.successLight,
			fill: true,
			tension: 0.4,
		},
		{
			label: "Outflow",
			data: models.value.cashflowTrend.map((d) => d.outflow),
			borderColor: COLORS.danger,
			backgroundColor: COLORS.dangerLight,
			fill: true,
			tension: 0.4,
		},
		{
			label: "Balance",
			data: models.value.cashflowTrend.map((d) => d.balance),
			borderColor: COLORS.primary,
			backgroundColor: "transparent",
			borderDash: [5, 5],
			tension: 0.4,
		},
	],
}))

const profitData = computed(() => ({
	labels: models.value.profitTrend.map((d) => shortDate(d.date)),
	datasets: [
		{
			label: "Revenue",
			data: models.value.profitTrend.map((d) => d.revenue),
			borderColor: COLORS.primary,
			backgroundColor: COLORS.primaryLight,
			fill: true,
			tension: 0.4,
		},
		{
			label: "Profit",
			data: models.value.profitTrend.map((d) => d.profit),
			borderColor: COLORS.success,
			backgroundColor: COLORS.successLight,
			fill: true,
			tension: 0.4,
		},
	],
}))

const receivablesAgingData = computed(() => ({
	labels: models.value.receivablesAging.map((a) => a.label),
	datasets: [
		{
			label: "Amount",
			data: models.value.receivablesAging.map((a) => a.amount),
			backgroundColor: [
				COLORS.success,
				COLORS.warning,
				COLORS.secondary,
				COLORS.danger,
			],
			borderRadius: 4,
		},
	],
}))

const payablesAgingData = computed(() => ({
	labels: models.value.payablesAging.map((a) => a.label),
	datasets: [
		{
			label: "Amount",
			data: models.value.payablesAging.map((a) => a.amount),
			backgroundColor: [
				COLORS.success,
				COLORS.warning,
				COLORS.secondary,
				COLORS.danger,
			],
			borderRadius: 4,
		},
	],
}))

const paymentDistData = computed(() => ({
	labels: models.value.paymentDistribution.map((p) => p.mode),
	datasets: [
		{
			data: models.value.paymentDistribution.map((p) => p.amount),
			backgroundColor: PALETTE.slice(
				0,
				models.value.paymentDistribution.length,
			),
			borderWidth: 0,
		},
	],
}))

const cashflowOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { position: "top" } },
	scales: { y: { beginAtZero: true, ticks: { callback: currencyTick } } },
	interaction: { intersect: false, mode: "index" },
}

const profitOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { position: "top" } },
	scales: { y: { beginAtZero: true, ticks: { callback: currencyTick } } },
	interaction: { intersect: false, mode: "index" },
}

const agingOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { display: false } },
	scales: { y: { beginAtZero: true, ticks: { callback: currencyTick } } },
}

const doughnutOptions = {
	maintainAspectRatio: true,
	plugins: {
		legend: { position: "right", labels: { boxWidth: 12 } },
		cutout: "60%",
	},
}

defineExpose({ exportReport })
</script>

