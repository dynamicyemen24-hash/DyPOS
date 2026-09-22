<template>
	<Dialog v-model="open" :options="{ title: __('Print Monitor'), size: '4xl' }">
		<template #body-content>
			<div class="flex flex-col gap-4">
				<!-- Live counters -->
				<div class="grid grid-cols-2 md:grid-cols-4 gap-2">
					<div class="text-start bg-gray-50 border border-gray-200 rounded-lg p-3">
						<div class="text-gray-500 text-xs font-medium mb-0.5">
							{{ __("Queued") }}
						</div>
						<div class="text-xl font-bold text-gray-800">
							{{ queued }}
						</div>
					</div>
					<div class="text-start bg-indigo-50 border border-indigo-200 rounded-lg p-3">
						<div class="text-indigo-600 text-xs font-medium mb-0.5">
							{{ __("Printing") }}
						</div>
						<div class="text-xl font-bold text-indigo-800">
							{{ processing }}
						</div>
					</div>
					<div class="text-start bg-green-50 border border-green-200 rounded-lg p-3">
						<div class="text-green-600 text-xs font-medium mb-0.5">
							{{ __("Completed today") }}
						</div>
						<div class="text-xl font-bold text-green-800">
							{{ completedToday }}
						</div>
					</div>
					<div class="text-start bg-red-50 border border-red-200 rounded-lg p-3">
						<div class="text-red-600 text-xs font-medium mb-0.5">
							{{ __("Failed") }}
						</div>
						<div class="text-xl font-bold text-red-800">
							{{ failed }}
						</div>
					</div>
				</div>

				<!-- Filter tabs -->
				<div class="flex flex-wrap items-center gap-2">
					<button
						v-for="tab in filters"
						:key="tab.value"
						class="px-3 py-1 rounded-full text-xs font-medium transition-colors"
						:class="
							filter === tab.value
								? 'bg-indigo-600 text-white'
								: 'bg-gray-100 text-gray-600 hover:bg-gray-200'
						"
						@click="filter = tab.value"
					>
						{{ tab.label }}
					</button>
				</div>

				<!-- Job table -->
				<div
					v-if="visibleJobs.length"
					class="overflow-x-auto border border-gray-200 rounded-lg"
				>
					<table class="w-full text-sm">
						<thead>
							<tr class="bg-gray-50 text-gray-600 text-start">
								<th class="text-start px-3 py-2 font-medium hidden sm:table-cell">
									{{ __("Spool") }}
								</th>
								<th class="text-start px-3 py-2 font-medium">
									{{ __("Document") }}
								</th>
								<th class="text-start px-3 py-2 font-medium">
									{{ __("Device") }}
								</th>
								<th class="text-start px-3 py-2 font-medium">
									{{ __("Copies") }}
								</th>
								<th class="text-start px-3 py-2 font-medium">
									{{ __("Status") }}
								</th>
								<th class="text-end px-3 py-2 font-medium">
									{{ __("Actions") }}
								</th>
							</tr>
						</thead>
						<tbody>
							<tr
								v-for="job in visibleJobs"
								:key="job.id"
								class="border-t border-gray-100"
							>
								<td class="px-3 py-2 text-gray-500 hidden sm:table-cell">
									{{ job.spoolNo || "—" }}
								</td>
								<td class="px-3 py-2">
									<div class="font-medium text-gray-800">
										{{ job.title || job.docId || "—" }}
									</div>
									<div class="text-xs text-gray-500">{{ job.docType }}</div>
								</td>
								<td class="px-3 py-2 text-gray-600">
									{{ job.qzPrinter || job.deviceId }}
								</td>
								<td class="px-3 py-2 text-gray-600">{{ job.copies }}</td>
								<td class="px-3 py-2">
									<span
										class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
										:class="statusClass(job.status)"
									>
										{{ statusLabel(job.status) }}
									</span>
									<div
										v-if="job.lastError"
										class="text-xs text-red-600 mt-1 max-w-[180px] truncate"
										:title="job.lastError"
									>
										{{ job.lastError }}
									</div>
								</td>
								<td class="px-3 py-2 text-end whitespace-nowrap">
									<button
										v-if="
											['FAILED', 'CANCELLED', 'PARTIAL'].includes(job.status)
										"
										class="text-xs px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded transition-colors"
										@click="retry(job.id)"
									>
										{{ __("Retry") }}
									</button>
									<button
										v-if="job.status === 'QUEUED'"
										class="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors ms-1"
										@click="cancel(job.id)"
									>
										{{ __("Cancel") }}
									</button>
									<button
										v-if="
											['COMPLETED', 'FAILED', 'PARTIAL', 'CANCELLED'].includes(job.status)
										"
										class="text-xs px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors ms-1"
										@click="reprint(job.id)"
									>
										{{ __("Reprint") }}
									</button>
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<div v-else class="text-center py-10 text-gray-500 text-sm">
					{{ __("No print jobs in the current view.") }}
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { Dialog } from "frappe-ui"
import { computed, onBeforeUnmount, ref, watch } from "vue"

import { listPrintHistory, listPrintJobs } from "@/print/index"

const open = ref(false)

const filter = ref("all")
const filters = [
	{ value: "all", label: __("All") },
	{ value: "active", label: __("Active") },
	{ value: "failed", label: __("Failed") },
	{ value: "done", label: __("Completed") },
]

const activeJobs = ref([])
const historyJobs = ref([])

// Poll while the dialog is open so statuses track the dispatcher in real
// time; the snapshot is also refreshed on every open.
let pollTimer = null

watch(open, (isOpen) => {
	if (isOpen) {
		refresh()
		pollTimer = setInterval(refresh, 2000)
	} else if (pollTimer) {
		clearInterval(pollTimer)
		pollTimer = null
	}
})

onBeforeUnmount(() => {
	if (pollTimer) clearInterval(pollTimer)
})

const ALL = ["QUEUED", "PROCESSING"]
const DONE = ["COMPLETED"]

const queued = computed(() => activeJobs.value.filter((j) => j.status === "QUEUED").length)
const processing = computed(
	() => activeJobs.value.filter((j) => j.status === "PROCESSING").length,
)
const failed = computed(
	() => activeJobs.value.filter((j) => j.status === "FAILED").length,
)
const completedToday = computed(() => {
	const startOfToday = new Date()
	startOfToday.setHours(0, 0, 0, 0)
	return historyJobs.value.filter(
		(h) => h.status === "COMPLETED" && h.finishedAt >= startOfToday.getTime(),
	).length
})

const visibleJobs = computed(() => {
	const byFilter = (job) => {
		if (filter.value === "all") return true
		if (filter.value === "active") return ALL.includes(job.status)
		if (filter.value === "failed") return job.status === "FAILED"
		if (filter.value === "done") return DONE.includes(job.status)
		return true
	}
	return activeJobs.value
		.filter(byFilter)
		.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
})

function refresh() {
	activeJobs.value = listPrintJobs() || []
	historyJobs.value = listPrintHistory() || []
}

async function retry(jobId) {
	const { retryPrintJob } = await import("@/print/index")
	await retryPrintJob(jobId)
	refresh()
}

async function cancel(jobId) {
	const { cancelPrintJob } = await import("@/print/index")
	await cancelPrintJob(jobId)
	refresh()
}

async function reprint(jobId) {
	const { reprintPrintJob } = await import("@/print/index")
	await reprintPrintJob(jobId)
	refresh()
}

function statusLabel(status) {
	return __(status)
}

function statusClass(status) {
	const map = {
		QUEUED: "bg-gray-100 text-gray-700",
		PROCESSING: "bg-indigo-100 text-indigo-700",
		COMPLETED: "bg-green-100 text-green-700",
		FAILED: "bg-red-100 text-red-700",
		PARTIAL: "bg-amber-100 text-amber-700",
		CANCELLED: "bg-gray-100 text-gray-500",
	}
	return map[status] || "bg-gray-100 text-gray-600"
}

defineExpose({
	open: () => {
		open.value = true
	},
})
</script>