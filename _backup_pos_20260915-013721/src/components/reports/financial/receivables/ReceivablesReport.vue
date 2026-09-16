<template>
	<div>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
			<KpiCard
				v-for="kpi in model.kpis"
				:key="kpi.id"
				:label="kpi.label"
				:value="display(kpi)"
				:status="kpi.status || 'neutral'"
				icon="credit-card"
			/>
		</div>

		<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Aging Summary") }}</h3>
		<ReportTable class="mb-6" :columns="agingColumns" :rows="agingRows" />

		<h3 class="text-sm font-semibold text-gray-700 mb-3">{{ __("Customers") }}</h3>
		<ReportTable :columns="partyColumns" :rows="model.parties" />
	</div>
</template>

<script setup>
import { computed } from "vue"
import KpiCard from "../../ui/cards/KpiCard.vue"
import ReportTable from "../../ui/tables/ReportTable.vue"
import {
	formatDate,
	formatMoney,
	formatNumber,
	formatPercent,
} from "../../core/formatters/reportFormatters"
import { buildReceivablesModel } from "./receivablesCalc"
import { exportRows } from "@/utils/exportData"

const props = defineProps({
	facts: { type: Object, default: () => ({}) },
})

const model = computed(() =>
	buildReceivablesModel(props.facts?.receivables || []),
)

const PERCENT_IDS = new Set(["overdue-share"])

function display(kpi) {
	if (PERCENT_IDS.has(kpi.id)) return formatPercent(kpi.value)
	if (kpi.id === "parties" || kpi.id === "overdue-invoices")
		return formatNumber(kpi.value)
	return formatMoney(kpi.value)
}

const agingColumns = [
	{ key: "label", label: "Bucket", format: "text" },
	{ key: "count", label: "Invoices", format: "number", sortable: true },
	{ key: "amount", label: "Amount", format: "currency", sortable: true },
]

const partyColumns = [
	{ key: "partyName", label: "Customer", format: "text", sortable: true },
	{ key: "invoiceCount", label: "Invoices", format: "number", sortable: true },
	{
		key: "outstanding",
		label: "Outstanding",
		format: "currency",
		sortable: true,
	},
	{
		key: "oldestDueDate",
		label: "Oldest Due Date",
		format: "date",
		sortable: true,
	},
	{
		key: "overdueDays",
		label: "Days Overdue",
		format: "number",
		sortable: true,
	},
	{ key: "status", label: "Status", format: "text", sortable: true },
]

const agingRows = computed(() =>
	model.value.aging.map((bucket) => ({
		label: __(bucket.label),
		count: bucket.count,
		amount: bucket.amount,
	})),
)

function exportReport(format) {
	exportRows(model.value.parties, {
		format,
		filename: "receivables-report",
		columns: partyColumns.map((column) => ({
			key: column.key,
			label: column.label,
		})),
	})
}

defineExpose({ exportReport })
</script>
