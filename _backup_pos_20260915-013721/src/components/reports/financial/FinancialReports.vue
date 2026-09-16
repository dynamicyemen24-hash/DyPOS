<template>
	<div class="report-container p-4">
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-xl font-bold text-gray-800">{{ __("Financial Reports") }}</h2>
			<div v-if="activeReport" class="flex gap-2">
				<Button variant="subtle" :disabled="!hasData" @click="activeReport.exportReport('csv')">
					{{ __("Export CSV") }}
				</Button>
				<Button variant="subtle" :disabled="!hasData" @click="activeReport.exportReport('excel')">
					{{ __("Export Excel") }}
				</Button>
			</div>
		</div>

		<DateRangeFilter
			v-model:from="from"
			v-model:to="to"
			:loading="loading"
			@refresh="load"
		/>

		<div class="flex flex-wrap gap-1 mt-4 mb-6 border-b border-gray-200">
			<button
				v-for="report in FINANCIAL_REPORTS"
				:key="report.id"
				class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
				:class="
					activeId === report.id
						? 'text-indigo-700 bg-indigo-50 border-b-2 border-indigo-600'
						: 'text-gray-500 hover:text-gray-700'
				"
				@click="activeId = report.id"
			>
				{{ __(report.name) }}
			</button>
		</div>

		<div v-if="error" class="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
			{{ error }}
		</div>
		<div
			v-else-if="warnings.length"
			class="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
		>
			{{ __("Some secondary data could not be loaded; affected sections are marked inside each report.") }}
		</div>

		<div v-if="loading" class="py-16 text-center text-sm text-gray-400">
			{{ __("Loading financial data...") }}
		</div>

		<component
			:is="activeComponent"
			v-else-if="activeComponent"
			ref="reportRef"
			:facts="facts"
		/>
	</div>
</template>

<script setup>
import { Button } from "frappe-ui"
import { computed, onMounted, ref } from "vue"
import DateRangeFilter from "../ui/filters/DateRangeFilter.vue"
import { loadFinancialData } from "../../core/data/financialData"
import { usePOSShiftStore } from "@/stores/posShift"
import { FINANCIAL_REPORTS } from "./index"

const shiftStore = usePOSShiftStore()

const activeId = ref(FINANCIAL_REPORTS[0].id)
const facts = ref({})
const warnings = ref([])
const loading = ref(false)
const error = ref("")
const reportRef = ref(null)

const now = new Date()
const from = ref(
	new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10),
)
const to = ref(now.toISOString().slice(0, 10))

const activeReport = computed(() =>
	FINANCIAL_REPORTS.find((report) => report.id === activeId.value),
)
const activeComponent = computed(() => activeReport.value?.component || null)
const hasData = computed(() => Object.keys(facts.value).length > 0)

async function load() {
	loading.value = true
	error.value = ""
	try {
		const result = await loadFinancialData({
			from: from.value ? new Date(from.value) : undefined,
			to: to.value ? new Date(to.value) : undefined,
			company: shiftStore.profileCompany || undefined,
			posProfile: shiftStore.profileName || undefined,
		})
		facts.value = result.facts
		warnings.value = result.warnings
	} catch (err) {
		facts.value = {}
		warnings.value = []
		if (err?.code === "NO_FRAPPE") {
			error.value = __(
				"Frappe API is not available. Financial reports require an active connection.",
			)
		} else {
			error.value = __("Failed to load financial data. Please try again.")
		}
	} finally {
		loading.value = false
	}
}

onMounted(load)
</script>

<style scoped>
.report-container {
	max-width: 1400px;
	margin: 0 auto;
}
</style>
