<template>
  <DyCard
    variant="outlined"
    :accent="true"
    :accent-color="color"
    class="p-4"
  >
    <div class="flex items-center justify-between">
      <div>
        <p class="text-xs text-gray-500 font-medium">{{ label }}</p>
        <p class="text-2xl font-bold text-gray-900 mt-1">{{ value }}</p>
      </div>
      <div
        class="w-10 h-10 rounded-lg flex items-center justify-center"
        :class="iconColor"
      >
        <FeatherIcon :name="icon" class="w-5 h-5" />
      </div>
    </div>
  </DyCard>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "frappe-ui"
import DyCard from "@/components/ui/DyCard.vue"

const props = defineProps({
	label: { type: String, required: true },
	value: { type: [String, Number], required: true },
	icon: { type: String, default: "package" },
	color: {
		type: String,
		default: "primary",
		validator: (v) =>
			["primary", "success", "warning", "danger", "info"].includes(v),
	},
})

const iconColor = computed(() => ({
	"bg-blue-100 text-blue-600": props.color === "blue",
	"bg-green-100 text-green-600": props.color === "green",
	"bg-purple-100 text-purple-600": props.color === "purple",
	"bg-orange-100 text-orange-600": props.color === "orange",
	"bg-red-100 text-red-600": props.color === "red",
}))
</script>

<style scoped>
/* SummaryCard specific styles if needed */
</style>