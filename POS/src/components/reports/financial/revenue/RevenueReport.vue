<template>
	<div>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
			<KpiCard
				v-for="kpi in model.kpis"
				:key="kpi.id"
				:label="kpi.label"
				:value="display(kpi)"
				:status="kpi.status || 'neutral'"
				:icon="kpi.id === 'transactions' ? 'shopping-cart' : 'bar-chart-2'"
			/>
		</div>

		<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Daily Revenue") }}</h3>
		<ReportTable class="mb-6" :columns="dailyColumns" :rows="model.daily" />

		<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Top Customers") }}</h3>
		<ReportTable :columns="customerColumns" :rows="model.topCustomers" />
	</div>
</template>

<script setup>
import { computed } from "vue"
import KpiCard from "../../ui/cards/KpiCard.vue"
import ReportTable from "../../ui/tables/ReportTable.vue"
import {
	formatMoney,
	formatNumber,
	formatPercent,
} from "../../core/formatters/reportFormatters"
import { buildRevenueModel } from "./revenueCalc"
import { exportRows } from "@/utils/exportData"

const props = defineProps({
	facts: { type: Object, default: () => ({}) },
})

const model = computed(() => buildRevenueModel(props.facts?.invoices || []))

const CURRENCY_IDS = new Set([
	"gross-sales",
	"net-sales",
	"taxes-collected",
	"discounts",
	"average-ticket",
])

const PERCENT_IDS = new Set(["collection-rate"])

function display(kpi) {
	if (PERCENT_IDS.has(kpi.id)) return formatPercent(kpi.value)
	if (CURRENCY_IDS.has(kpi.id)) return formatMoney(kpi.value)
	return formatNumber(kpi.value)
}

const dailyColumns = [
	{ key: "date", label: "Date", format: "date", sortable: true },
	{
		key: "grossSales",
		label: "Gross Sales",
		format: "currency",
		sortable: true,
	},
	{ key: "netSales", label: "Net Sales", format: "currency", sortable: true },
	{ key: "taxes", label: "Taxes", format: "currency", sortable: true },
	{ key: "discount", label: "Discounts", format: "currency", sortable: true },
	{
		key: "transactions",
		label: "Transactions",
		format: "number",
		sortable: true,
	},
	{ key: "returns", label: "Returns", format: "number", sortable: true },
]

const customerColumns = [
	{ key: "customerName", label: "Customer", format: "text", sortable: true },
	{ key: "invoices", label: "Invoices", format: "number", sortable: true },
	{ key: "netSales", label: "Net Sales", format: "currency", sortable: true },
	{ key: "sharePercent", label: "Share", format: "percent", sortable: true },
]

function exportReport(format) {
	exportRows(model.value.daily, {
		format,
		filename: "revenue-report",
		columns: dailyColumns.map((column) => ({
			key: column.key,
			label: column.label,
		})),
	})
}

defineExpose({ exportReport })
</script>
