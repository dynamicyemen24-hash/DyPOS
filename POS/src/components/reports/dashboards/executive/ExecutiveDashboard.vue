<template>
	<DashboardLayout
		title="لوحة التنفيذيين"
		subtitle="نظرة عامة على الذكاء التجاري"
		:loading="loading"
		:error="error"
		:has-data="isLoaded"
		:is-stale="isStale"
		:last-loaded="lastLoaded"
		:realtime-mode="rtMode"
		:realtime="rtMode === 'socket'"
		:auto-refresh="autoRefresh"
		showBack
		exportable
		@refresh="refresh({ force: true })"
		@export="exportReport"
		@toggle-auto-refresh="toggleAutoRefresh"
		@back="goBack"
		@print="handlePrint"
	>
		<KPISummary
			class="mb-6"
			:kpis="models.kpis"
			:currency-ids="CURRENCY_IDS"
			:percent-ids="PERCENT_IDS"
			:columns="4"
		/>

		<div v-if="models.alerts.length" class="mb-6">
			<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Alerts") }}</h3>
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				<div
					v-for="alert in models.alerts"
					:key="alert.id"
					class="rounded-lg p-4 border-l-4"
					:class="alertClass(alert.status)"
				>
					<p class="font-medium text-sm">{{ __(alert.label) }}</p>
					<p class="text-xs mt-1 opacity-75">{{ alert.detail }}</p>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
			<ChartCard title="نظرة عامة على الإيرادات" icon="trending-up" :loading="loading" :error="error" :is-empty="!models.dailyTrend.current.length" aspectRatio="3/2">
				<Line :data="revenueTrendData" :options="lineOptions" />
			</ChartCard>

			<ChartCard title="نظرة عامة على المعاملات" icon="hash" :loading="loading" :error="error" :is-empty="!models.dailyTrend.current.length" aspectRatio="3/2">
				<Bar :data="transactionData" :options="barOptions" />
			</ChartCard>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
			<ChartCard title="أداء التصنيفات" icon="bar-chart" :loading="loading" :error="error" :is-empty="!models.categoryPerformance.length" aspectRatio="3/2">
				<Bar :data="categoryData" :options="categoryOptions" />
			</ChartCard>

			<ChartCard title="صحة الأعمال" icon="heart" :loading="loading" :error="error" aspectRatio="3/2">
				<Radar :data="healthData" :options="radarOptions" />
			</ChartCard>
		</div>
	</DashboardLayout>
</template>

<script setup>
import { computed } from "vue"
import { Line, Bar, Radar } from "vue-chartjs"
import DashboardLayout from "../core/DashboardLayout.vue"
import ChartCard from "../core/ChartCard.vue"
import KPISummary from "../core/KPISummary.vue"
import { COLORS, PALETTE, currencyTick, shortDate } from "../core/chartConfig"
import { useDashboardSource } from "../core/useDashboardSource"
import { loadExecutiveData, buildExecutiveModels } from "./executiveData"
import { useDashboardExport } from "../core/useDashboardExport"

const CURRENCY_IDS = new Set([
	"revenue",
	"profit",
	"average",
	"receivable",
	"payable",
])
const PERCENT_IDS = new Set(["margin"])

const {
	facts,
	loading,
	error,
	lastLoaded,
	isLoaded,
	isStale,
	rtMode,
	autoRefresh,
	refresh,
	toggleAutoRefresh,
} = useDashboardSource({
	fetch: (filter) => loadExecutiveData(filter),
	scope: "executive-dashboard",
	doctypes: ["Sales Invoice", "Payment Entry", "Purchase Invoice"],
	pollInterval: 30000,
})

const models = computed(() => buildExecutiveModels(facts.value))

const { exportDashboard } = useDashboardExport({
	models,
	dashboardName: "executive-dashboard",
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

function alertClass(status) {
	const map = {
		danger: "bg-red-50 border-red-400 text-red-700",
		warning: "bg-amber-50 border-amber-400 text-amber-700",
		neutral: "bg-gray-50 border-gray-400 text-gray-700",
	}
	return map[status] || map.neutral
}

const revenueTrendData = computed(() => ({
	labels: models.value.dailyTrend.current.map((d) => shortDate(d.date)),
	datasets: [
		{
			label: "Current Period",
			data: models.value.dailyTrend.current.map((d) => d.revenue),
			borderColor: COLORS.primary,
			backgroundColor: COLORS.primaryLight,
			fill: true,
			tension: 0.4,
		},
		{
			label: "Previous Period",
			data: models.value.dailyTrend.previous.map((d) => d.revenue),
			borderColor: COLORS.gray,
			backgroundColor: "transparent",
			borderDash: [5, 5],
			tension: 0.4,
		},
	],
}))

const transactionData = computed(() => ({
	labels: models.value.dailyTrend.current.map((d) => shortDate(d.date)),
	datasets: [
		{
			label: "Transactions",
			data: models.value.dailyTrend.current.map((d) => d.transactions),
			backgroundColor: COLORS.primary,
			borderRadius: 4,
		},
	],
}))

const categoryData = computed(() => ({
	labels: models.value.categoryPerformance.map((c) => c.category),
	datasets: [
		{
			label: "Revenue",
			data: models.value.categoryPerformance.map((c) => c.revenue),
			backgroundColor: COLORS.primary,
			borderRadius: 4,
		},
		{
			label: "Quantity",
			data: models.value.categoryPerformance.map((c) => c.quantity),
			backgroundColor: COLORS.secondary,
			borderRadius: 4,
		},
	],
}))

const healthData = computed(() => {
	const kpis = models.value.kpis
	const getVal = (id) => {
		const k = kpis.find((k) => k.id === id)
		if (!k) return 0
		if (k.previousValue) return Math.min(100, Math.abs(k.changePercent || 0))
		return k.status === "good" ? 80 : k.status === "warning" ? 50 : 30
	}
	return {
		labels: ["Revenue", "Profit", "Margin", "Transactions", "Avg Ticket"],
		datasets: [
			{
				label: "Performance",
				data: [
					getVal("revenue"),
					getVal("profit"),
					getVal("margin"),
					getVal("transactions"),
					getVal("average"),
				],
				backgroundColor: COLORS.primaryLight,
				borderColor: COLORS.primary,
				pointBackgroundColor: COLORS.primary,
			},
		],
	}
})

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

const categoryOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { position: "top" } },
	scales: { y: { beginAtZero: true, ticks: { callback: currencyTick } } },
}

const radarOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { display: false } },
	scales: {
		r: {
			beginAtZero: true,
			max: 100,
			ticks: { stepSize: 20 },
			pointLabels: { font: { size: 11 } },
		},
	},
}

defineExpose({ exportReport })
</script>

