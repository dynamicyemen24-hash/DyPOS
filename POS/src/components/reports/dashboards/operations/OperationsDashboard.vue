<template>
	<DashboardLayout
		title="لوحة العمليات"
		subtitle="أداء المعاملات، والفترات، وتحليل الدفعات"
		:loading="loading"
		:error="error"
		:has-data="isLoaded"
		:is-stale="isStale"
		:last-loaded="lastLoaded"
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
		/>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
			<ChartCard title="حجم المعاملات الساعي" icon="clock" :loading="loading" :error="error" :is-empty="!models.hourlyVolume.length" aspectRatio="3/2">
				<Bar :data="hourlyData" :options="hourlyOptions" />
			</ChartCard>

			<ChartCard title="طرق الدفع" icon="credit-card" :loading="loading" :error="error" :is-empty="!models.paymentMethods.length" aspectRatio="3/2">
				<Doughnut :data="paymentData" :options="doughnutOptions" />
			</ChartCard>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
			<ChartCard title="الأداء اليومي" icon="calendar" :loading="loading" :error="error" :is-empty="!models.dailyPerformance.length" aspectRatio="3/2">
				<Bar :data="dailyPerfData" :options="dailyPerfOptions" />
			</ChartCard>

			<ChartCard title="حالة المعاملة" icon="check-circle" :loading="loading" :error="error" :is-empty="!models.statusDistribution.length" aspectRatio="3/2">
				<Pie :data="statusData" :options="pieOptions" />
			</ChartCard>
		</div>

		<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Shift Analysis") }}</h3>
		<ReportTable :columns="shiftColumns" :rows="models.shiftAnalysis" />
	</DashboardLayout>
</template>

<script setup>
import { computed } from "vue"
import { Bar, Doughnut, Pie } from "vue-chartjs"
import DashboardLayout from "../core/DashboardLayout.vue"
import ChartCard from "../core/ChartCard.vue"
import KPISummary from "../core/KPISummary.vue"
import ReportTable from "../../ui/tables/ReportTable.vue"
import { COLORS, PALETTE, currencyTick, shortDate } from "../core/chartConfig"
import { useDashboardSource } from "../core/useDashboardSource"
import { loadOperationsData, buildOperationsModels } from "./operationsData"
import { useDashboardExport } from "../core/useDashboardExport"

const CURRENCY_IDS = new Set(["revenue"])

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
	fetch: (filter) => loadOperationsData(filter),
	scope: "operations-dashboard",
	doctypes: ["Sales Invoice", "Payment Entry"],
	pollInterval: 30000,
})

const models = computed(() => buildOperationsModels(facts.value))

const { exportDashboard } = useDashboardExport({
	models,
	dashboardName: "operations-dashboard",
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

const hourlyData = computed(() => ({
	labels: models.value.hourlyVolume.map((h) => h.hour),
	datasets: [
		{
			label: "Transactions",
			data: models.value.hourlyVolume.map((h) => h.transactions),
			backgroundColor: COLORS.primary,
			borderRadius: 3,
			yAxisID: "y",
		},
		{
			label: "Revenue",
			data: models.value.hourlyVolume.map((h) => h.revenue),
			type: "line",
			borderColor: COLORS.success,
			backgroundColor: "transparent",
			tension: 0.4,
			yAxisID: "y1",
		},
	],
}))

const paymentData = computed(() => ({
	labels: models.value.paymentMethods.map((m) => m.method),
	datasets: [
		{
			data: models.value.paymentMethods.map((m) => m.amount),
			backgroundColor: PALETTE.slice(0, models.value.paymentMethods.length),
			borderWidth: 0,
		},
	],
}))

const dailyPerfData = computed(() => ({
	labels: models.value.dailyPerformance.map((d) => shortDate(d.date)),
	datasets: [
		{
			label: "Revenue",
			data: models.value.dailyPerformance.map((d) => d.revenue),
			backgroundColor: COLORS.primary,
			borderRadius: 4,
			yAxisID: "y",
		},
		{
			label: "Avg Ticket",
			data: models.value.dailyPerformance.map((d) => d.avgTicket),
			type: "line",
			borderColor: COLORS.secondary,
			backgroundColor: "transparent",
			tension: 0.4,
			yAxisID: "y1",
		},
	],
}))

const statusData = computed(() => ({
	labels: models.value.statusDistribution.map((s) => s.status),
	datasets: [
		{
			data: models.value.statusDistribution.map((s) => s.count),
			backgroundColor: [
				COLORS.success,
				COLORS.warning,
				COLORS.danger,
				COLORS.gray,
				COLORS.info,
			],
			borderWidth: 0,
		},
	],
}))

const hourlyOptions = {
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
}

const doughnutOptions = {
	maintainAspectRatio: true,
	plugins: {
		legend: { position: "right", labels: { boxWidth: 12 } },
		cutout: "60%",
	},
}

const dailyPerfOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { position: "top" } },
	scales: {
		y: {
			beginAtZero: true,
			position: "left",
			ticks: { callback: currencyTick },
		},
		y1: {
			beginAtZero: true,
			position: "right",
			grid: { drawOnChartArea: false },
			ticks: { callback: currencyTick },
		},
	},
}

const pieOptions = {
	maintainAspectRatio: true,
	plugins: { legend: { position: "right", labels: { boxWidth: 12 } } },
}

const shiftColumns = [
	{ key: "date", label: "Date", format: "date", sortable: true },
	{ key: "shift", label: "Shift", format: "text", sortable: true },
	{
		key: "transactions",
		label: "Transactions",
		format: "number",
		sortable: true,
	},
	{ key: "revenue", label: "Revenue", format: "currency", sortable: true },
]

defineExpose({ exportReport })
</script>

