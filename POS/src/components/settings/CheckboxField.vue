<template>
	<div class="flex items-start gap-2.5 p-2 rounded hover:bg-gray-50 transition-colors">
		<div class="flex items-center min-h-11">
			<input
				:id="fieldId"
				type="checkbox"
				:checked="modelValue"
				@change="$emit('update:modelValue', $event.target.checked ? 1 : 0)"
				class="w-5 h-5 text-indigo-600 bg-white border-gray-300 rounded focus:ring-indigo-500 focus:ring-1 cursor-pointer"
			/>
		</div>
		<div class="flex-1 min-w-0">
			<label :for="fieldId" class="block text-sm font-medium text-gray-900 cursor-pointer">
				{{ label }}
			</label>
			<p v-if="description" :id="descriptionId" class="text-xs text-gray-500 mt-0.5 leading-tight">
				{{ description }}
			</p>
		</div>
	</div>
</template>

<script setup>
import { computed, useId } from "vue"

const props = defineProps({
	modelValue: { type: [Number, Boolean], default: 0 },
	label: { type: String, required: true },
	description: { type: String, default: "" },
})

defineEmits(["update:modelValue"])

const generatedId = useId()
const fieldId = computed(() => `checkbox-${generatedId}`)
const descriptionId = computed(() => `${fieldId.value}-description`)
</script>
