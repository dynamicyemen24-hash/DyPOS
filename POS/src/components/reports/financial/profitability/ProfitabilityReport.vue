<template>
	<div>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
			<KpiCard
				v-for="kpi in model.kpis"
				:key="kpi.id"
				:label="kpi.label"
				:value="display(kpi)"
				:status="kpi.status || 'neutral'"
				icon="trending-up"
			/>
		</div>

		<div
			v-if="!model.costDataAvailable"
			class="mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
		>
			{{ __("Item cost data is not available; gross profit and margin are hidden until cost data can be read.") }}
		</div>

		<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Items by Revenue") }}</h3>
		<ReportTable :columns="itemColumns" :rows="model.items" />
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
import { buildProfitabilityModel } from "./profitabilityCalc"
import { exportRows } from "@/utils/exportData"

const props = defineProps({
	facts: { type: Object, default: () => ({}) },
})

const model = computed(() =>
	buildProfitabilityModel(
		props.facts?.invoices || [],
		props.facts?.items || [],
	),
)

const CURRENCY_IDS = new Set([
	"net-sales",
	"cogs",
	"gross-profit",
	"discounts",
	"taxes",
])

function display(kpi) {
	if (kpi.id === "gross-margin") return formatPercent(kpi.value)
	if (CURRENCY_IDS.has(kpi.id)) return formatMoney(kpi.value)
	return formatNumber(kpi.value)
}

const itemColumns = computed(() => {
	const columns = [
		{ key: "itemName", label: "Item", format: "text", sortable: true },
		{ key: "qty", label: "Quantity", format: "number", sortable: true },
		{ key: "revenue", label: "Revenue", format: "currency", sortable: true },
	]
	if (model.value.costDataAvailable) {
		columns.push(
			{ key: "cost", label: "Cost", format: "currency", sortable: true },
			{ key: "profit", label: "Profit", format: "currency", sortable: true },
			{
				key: "marginPercent",
				label: "Margin",
				format: "percent",
				sortable: true,
			},
		)
	}
	return columns
})

function exportReport(format) {
	exportRows(model.value.items, {
		format,
		filename: "profitability-report",
		columns: itemColumns.value.map((column) => ({
			key: column.key,
			label: column.label,
		})),
	})
}

defineExpose({ exportReport })
</script>
