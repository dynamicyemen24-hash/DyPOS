<template>
	<FormField :label="label" :description="description" v-slot="{ fieldId, describedBy }">
		<select
			:id="fieldId"
			:value="modelValue"
			:aria-describedby="describedBy"
			@change="$emit('update:modelValue', $event.target.value)"
			class="w-full min-h-11 px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent bg-white cursor-pointer"
		>
			<option value="">{{ __("-- Select --") }}</option>
			<option v-for="option in options" :key="option.value" :value="option.value">
				{{ option.label }}
			</option>
		</select>
	</FormField>
</template>

<script setup>
import FormField from "@/components/ui/FormField.vue"
import { __ } from "@/utils/translation"

defineProps({
	modelValue: { type: [String, Number], default: "" },
	label: { type: String, required: true },
	description: { type: String, default: "" },
	options: { type: Array, default: () => [] },
})

defineEmits(["update:modelValue"])
</script>
