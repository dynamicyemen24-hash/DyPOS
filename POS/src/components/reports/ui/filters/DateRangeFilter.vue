<template>
	<div class="flex flex-wrap items-end gap-3">
		<div>
			<label class="block text-xs font-medium text-gray-500 mb-1">{{ __("From") }}</label>
			<input
				v-model="fromModel"
				type="date"
				class="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
			/>
		</div>
		<div>
			<label class="block text-xs font-medium text-gray-500 mb-1">{{ __("To") }}</label>
			<input
				v-model="toModel"
				type="date"
				class="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
			/>
		</div>

		<div class="flex flex-wrap gap-1">
			<Button v-for="range in quickRanges" :key="range.id" variant="subtle" @click="applyRange(range)">
				{{ __(range.label) }}
			</Button>
		</div>

		<Button variant="solid" :loading="loading" @click="$emit('refresh')">
			{{ __("Refresh") }}
		</Button>
	</div>
</template>

<script setup>
import { Button } from "frappe-ui"
import { computed } from "vue"

const props = defineProps({
	from: { type: String, default: "" },
	to: { type: String, default: "" },
	loading: { type: Boolean, default: false },
})

const emit = defineEmits(["update:from", "update:to", "refresh"])

const fromModel = computed({
	get: () => props.from,
	set: (value) => emit("update:from", value),
})
const toModel = computed({
	get: () => props.to,
	set: (value) => emit("update:to", value),
})

function toISO(date) {
	return date.toISOString().slice(0, 10)
}

const quickRanges = computed(() => {
	const today = new Date()
	return [
		{
			id: "today",
			label: "Today",
			from: toISO(today),
			to: toISO(today),
		},
		{
			id: "last7",
			label: "Last 7 Days",
			from: toISO(new Date(today.getTime() - 6 * 86400000)),
			to: toISO(today),
		},
		{
			id: "last30",
			label: "Last 30 Days",
			from: toISO(new Date(today.getTime() - 29 * 86400000)),
			to: toISO(today),
		},
		{
			id: "thisMonth",
			label: "This Month",
			from: toISO(new Date(today.getFullYear(), today.getMonth(), 1)),
			to: toISO(today),
		},
	]
})

function applyRange(range) {
	emit("update:from", range.from)
	emit("update:to", range.to)
	emit("refresh")
}
</script>
