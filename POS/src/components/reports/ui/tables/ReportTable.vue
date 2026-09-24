<template>
	<div class="bg-white rounded-lg shadow-sm overflow-hidden">
		<div class="overflow-x-auto">
			<table class="min-w-full">
				<thead>
					<tr class="bg-gray-50">
						<th
							v-for="column in columns"
							:key="column.key"
							class="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider"
							:class="column.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''"
							@click="column.sortable && toggleSort(column.key)"
						>
							<span class="inline-flex items-center gap-1">
								{{ __(column.label) }}
								<span v-if="sortKey === column.key" class="text-[10px]">
									{{ sortAsc ? "▲" : "▼" }}
								</span>
							</span>
						</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="(row, index) in sortedRows"
						:key="index"
						class="border-t border-gray-100 hover:bg-gray-50"
						:class="rowClickable ? 'cursor-pointer' : ''"
						@click="rowClickable && $emit('row-click', row)"
					>
						<td
							v-for="column in columns"
							:key="column.key"
							class="px-6 py-3 text-sm whitespace-nowrap"
							:class="cellClass(column)"
						>
							<slot :name="`col-${column.key}`" :row="row" :value="row[column.key]">
								{{ formatCell(row, column) }}
							</slot>
						</td>
					</tr>
					<tr v-if="!sortedRows.length">
						<td :colspan="columns.length" class="px-6 py-8 text-center text-sm text-gray-400">
							{{ __("No Data") }}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<script setup>
import { computed, ref } from "vue"
import {
	formatDate,
	formatMoney,
	formatNumber,
	formatPercent,
} from "../../core/formatters/reportFormatters"

const props = defineProps({
	/** [{ key, label, format: "text"|"number"|"currency"|"percent"|"date", sortable?, compute? }] */
	columns: { type: Array, required: true },
	rows: { type: Array, default: () => [] },
	rowClickable: { type: Boolean, default: false },
})

defineEmits(["row-click"])

const sortKey = ref(null)
const sortAsc = ref(true)

const FORMATTERS = {
	text: (value) => (value == null ? "-" : String(value)),
	number: formatNumber,
	currency: formatMoney,
	percent: formatPercent,
	date: formatDate,
}

function toggleSort(key) {
	if (sortKey.value === key) {
		sortAsc.value = !sortAsc.value
	} else {
		sortKey.value = key
		sortAsc.value = true
	}
}

function cellValue(row, column) {
	if (typeof column.compute === "function") return column.compute(row)
	return row?.[column.key]
}

const sortedRows = computed(() => {
	const rows = [...props.rows]
	if (!sortKey.value) return rows
	const key = sortKey.value
	const column = props.columns.find((c) => c.key === key)
	const direction = sortAsc.value ? 1 : -1
	return rows.sort((a, b) => {
		const left = cellValue(a, column || { key })
		const right = cellValue(b, column || { key })
		if (typeof left === "number" && typeof right === "number")
			return (left - right) * direction
		return String(left ?? "").localeCompare(String(right ?? "")) * direction
	})
})

function formatCell(row, column) {
	const value = cellValue(row, column)
	const formatter = FORMATTERS[column.format] || FORMATTERS.text
	return formatter(value)
}

function cellClass(column) {
	if (
		column.format === "currency" ||
		column.format === "number" ||
		column.format === "percent"
	) {
		return "text-gray-800"
	}
	return "text-gray-600"
}
</script>
