<template>
	<div class="grid gap-4" :class="gridClass" role="group" aria-label="Key Performance Indicators">
		<div
			v-for="kpi in kpis"
			:key="kpi.id"
			class="bg-white rounded-lg shadow-sm p-4 border-l-4 hover:shadow-md transition-shadow"
			:class="borderClass(kpi.status)"
		>
			<div class="flex items-start justify-between">
				<div class="min-w-0">
					<p class="text-xs text-gray-500 truncate">{{ __(kpi.label) }}</p>
					<p class="text-xl font-bold mt-1" :class="valueClass(kpi.status)" aria-live="polite" aria-atomic="true">
						{{ formatValue(kpi) }}
					</p>
					<p v-if="kpi.changePercent != null" class="text-xs mt-1" :class="changeClass(kpi.trend)">
						<FeatherIcon :name="kpi.trend === 'up' ? 'trending-up' : kpi.trend === 'down' ? 'trending-down' : 'minus'" class="w-3 h-3 inline" />
						{{ Math.abs(kpi.changePercent).toFixed(1) }}%
					</p>
				</div>
				<FeatherIcon :name="iconFor(kpi.id)" class="w-5 h-5 flex-shrink-0" :class="iconClass(kpi.status)" />
			</div>
			<p v-if="kpi.target != null" class="text-[10px] text-gray-400 mt-2">
				{{ __("Target") }}: {{ formatTarget(kpi) }}
			</p>
		</div>
	</div>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
import { computed } from "vue"
import {
	formatMoney,
	formatNumber,
	formatPercent,
} from "../../core/formatters/reportFormatters"

const props = defineProps({
	kpis: { type: Array, default: () => [] },
	columns: { type: Number, default: 4 },
	currencyIds: { type: Set, default: () => new Set() },
	percentIds: { type: Set, default: () => new Set() },
})

const gridClass = computed(() => {
	const cols = props.columns
	if (cols === 2) return "grid-cols-1 sm:grid-cols-2"
	if (cols === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
	return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
})

const BORDER = {
	good: "border-green-500",
	warning: "border-amber-500",
	danger: "border-red-500",
	neutral: "border-indigo-500",
}

const VALUE = {
	good: "text-green-600",
	warning: "text-amber-600",
	danger: "text-red-600",
	neutral: "text-indigo-600",
}

const ICON = {
	good: "text-green-500",
	warning: "text-amber-500",
	danger: "text-red-500",
	neutral: "text-indigo-500",
}

const CHANGE = {
	up: "text-green-600",
	down: "text-red-600",
	flat: "text-gray-400",
}

const ICON_MAP = {
	revenue: "dollar-sign",
	sales: "shopping-cart",
	transactions: "hash",
	profit: "trending-up",
	margin: "percent",
	average: "clock",
	stock: "package",
	customer: "users",
	receivable: "arrow-up-right",
	payable: "arrow-down-right",
	inflow: "arrow-down-left",
	outflow: "arrow-up-right",
	default: "bar-chart-2",
}

function borderClass(status) {
	return BORDER[status] || BORDER.neutral
}
function valueClass(status) {
	return VALUE[status] || VALUE.neutral
}
function iconClass(status) {
	return ICON[status] || ICON.neutral
}
function changeClass(trend) {
	return CHANGE[trend] || CHANGE.flat
}

function formatValue(kpi) {
	if (props.currencyIds.has(kpi.id)) return formatMoney(kpi.value)
	if (props.percentIds.has(kpi.id)) return formatPercent(kpi.value)
	return formatNumber(kpi.value)
}

function formatTarget(kpi) {
	if (props.currencyIds.has(kpi.id)) return formatMoney(kpi.target)
	if (props.percentIds.has(kpi.id)) return formatPercent(kpi.target)
	return formatNumber(kpi.target)
}

function iconFor(id) {
	for (const key of Object.keys(ICON_MAP)) {
		if (id?.includes(key)) return ICON_MAP[key]
	}
	return ICON_MAP.default
}
</script>
