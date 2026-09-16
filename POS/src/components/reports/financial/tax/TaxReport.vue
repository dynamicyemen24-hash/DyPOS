<template>
	<div>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
			<KpiCard
				v-for="kpi in model.kpis"
				:key="kpi.id"
				:label="kpi.label"
				:value="display(kpi)"
				:status="kpi.status || 'neutral'"
				icon="percent"
			/>
		</div>

		<template v-if="model.breakdownAvailable">
			<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Tax By Account") }}</h3>
			<ReportTable class="mb-6" :columns="accountColumns" :rows="model.byAccount" />
		</template>
		<div v-else class="mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
			{{ __("Per-account tax breakdown is not available; totals below use invoice-level tax amounts.") }}
		</div>

		<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Daily Tax") }}</h3>
		<ReportTable :columns="dailyColumns" :rows="model.daily" />
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
import { buildTaxModel } from "./taxCalc"
import { exportRows } from "@/utils/exportData"

const props = defineProps({
	facts: { type: Object, default: () => ({}) },
})

const model = computed(() =>
	buildTaxModel(props.facts?.invoices || [], props.facts?.taxLines || []),
)

const CURRENCY_IDS = new Set(["taxable-amount", "total-tax"])

function display(kpi) {
	if (kpi.id === "effective-rate") return formatPercent(kpi.value)
	if (CURRENCY_IDS.has(kpi.id)) return formatMoney(kpi.value)
	return formatNumber(kpi.value)
}

const accountColumns = [
	{ key: "accountHead", label: "Account", format: "text", sortable: true },
	{ key: "description", label: "Description", format: "text" },
	{ key: "rate", label: "Rate", format: "percent", sortable: true },
	{ key: "amount", label: "Tax Amount", format: "currency", sortable: true },
	{ key: "sharePercent", label: "Share", format: "percent", sortable: true },
]

const dailyColumns = [
	{ key: "date", label: "Date", format: "date", sortable: true },
	{
		key: "taxableAmount",
		label: "Taxable Amount",
		format: "currency",
		sortable: true,
	},
	{ key: "taxAmount", label: "Tax Amount", format: "currency", sortable: true },
	{
		key: "transactions",
		label: "Transactions",
		format: "number",
		sortable: true,
	},
]

function exportReport(format) {
	const rows = model.value.breakdownAvailable
		? model.value.byAccount
		: model.value.daily
	exportRows(rows, {
		format,
		filename: "tax-report",
		columns: (model.value.breakdownAvailable
			? accountColumns
			: dailyColumns
		).map((column) => ({
			key: column.key,
			label: column.label,
		})),
	})
}

defineExpose({ exportReport })
</script>
