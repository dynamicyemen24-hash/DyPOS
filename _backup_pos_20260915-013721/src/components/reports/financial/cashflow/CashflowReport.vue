<template>
	<div>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
			<KpiCard
				v-for="kpi in model.kpis"
				:key="kpi.id"
				:label="kpi.label"
				:value="display(kpi)"
				:status="kpi.status || 'neutral'"
				icon="dollar-sign"
			/>
		</div>

		<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Daily Cash Flow") }}</h3>
		<ReportTable class="mb-6" :columns="dailyColumns" :rows="model.daily" />

		<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("By Mode of Payment") }}</h3>
		<ReportTable :columns="modeColumns" :rows="model.byMode" />
	</div>
</template>

<script setup>
import { computed } from "vue"
import KpiCard from "../../ui/cards/KpiCard.vue"
import ReportTable from "../../ui/tables/ReportTable.vue"
import {
	formatMoney,
	formatNumber,
} from "../../core/formatters/reportFormatters"
import { buildCashflowModel } from "./cashflowCalc"
import { exportRows } from "@/utils/exportData"

const props = defineProps({
	facts: { type: Object, default: () => ({}) },
})

const model = computed(() => buildCashflowModel(props.facts?.payments || []))

function display(kpi) {
	if (kpi.id === "payments") return formatNumber(kpi.value)
	return formatMoney(kpi.value)
}

const dailyColumns = [
	{ key: "date", label: "Date", format: "date", sortable: true },
	{ key: "inflow", label: "Inflow", format: "currency", sortable: true },
	{ key: "outflow", label: "Outflow", format: "currency", sortable: true },
	{ key: "net", label: "Net", format: "currency", sortable: true },
	{
		key: "balance",
		label: "Running Balance",
		format: "currency",
		sortable: true,
	},
]

const modeColumns = [
	{ key: "mode", label: "Mode of Payment", format: "text", sortable: true },
	{ key: "inflow", label: "Inflow", format: "currency", sortable: true },
	{ key: "outflow", label: "Outflow", format: "currency", sortable: true },
	{ key: "net", label: "Net", format: "currency", sortable: true },
	{ key: "sharePercent", label: "Share", format: "percent", sortable: true },
]

function exportReport(format) {
	exportRows(model.value.daily, {
		format,
		filename: "cashflow-report",
		columns: dailyColumns.map((column) => ({
			key: column.key,
			label: column.label,
		})),
	})
}

defineExpose({ exportReport })
</script>
