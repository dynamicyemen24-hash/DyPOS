<template>
  <span
    :class="[
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      statusClass,
    ]"
    :title="tooltip"
  >
    <span class="w-1.5 h-1.5 rounded-full mr-1.5" :class="dotClass" />
    {{ label }}
  </span>
</template>

<script setup>
import { computed } from "vue"

const props = defineProps({
	qty: { type: Number, required: true, default: 0 },
	reserved: { type: Number, default: 0 },
	reorderPoint: { type: Number, default: 0 },
})

const available = computed(() => Math.max(0, props.qty - (props.reserved || 0)))

const status = computed(() => {
	const q = available.value
	const rp = props.reorderPoint || 0
	if (q <= 0) return "out"
	if (rp > 0 && q <= rp) return "low"
	if (rp > 0 && q <= rp * 1.5) return "warning"
	return "normal"
})

const label = computed(() => {
	switch (status.value) {
		case "out":
			return "نفذ من المخزون"
		case "low":
			return "مخزون منخفض"
		case "warning":
			return "قريب من إعادة الطلب"
		default:
			return "متوفر"
	}
})

const statusClass = computed(() => {
	switch (status.value) {
		case "out":
			return "bg-red-100 text-red-800"
		case "low":
			return "bg-amber-100 text-amber-800"
		case "warning":
			return "bg-yellow-100 text-yellow-800"
		default:
			return "bg-green-100 text-green-800"
	}
})

const dotClass = computed(() => {
	switch (status.value) {
		case "out":
			return "bg-red-500"
		case "low":
			return "bg-amber-500"
		case "warning":
			return "bg-yellow-500"
		default:
			return "bg-green-500"
	}
})

const tooltip = computed(() => {
	const q = props.qty
	const r = props.reserved || 0
	const a = available.value
	const rp = props.reorderPoint || 0
	return `الكمية: ${q} | محجوز: ${r} | متاح: ${a}${rp ? ` | حد إعادة الطلب: ${rp}` : ""}`
})
</script>