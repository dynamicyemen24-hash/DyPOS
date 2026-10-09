<template>
	<FormField
		:label="label"
		:description="description"
		:error="error"
		:required="required"
		:disabled="disabled"
		v-slot="{ fieldId, describedBy, invalid, required: fieldRequired, disabled: fieldDisabled }"
	>
		<input
			:id="fieldId"
			type="number"
			:value="modelValue"
			:min="min"
			:max="max"
			:step="step"
			:required="fieldRequired"
			:disabled="fieldDisabled"
			:aria-invalid="invalid ? 'true' : undefined"
			:aria-describedby="describedBy"
			@input="$emit('update:modelValue', parseFloat($event.target.value) || 0)"
			class="w-full min-h-11 px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent bg-white disabled:cursor-not-allowed disabled:opacity-60"
		/>
	</FormField>
</template>

<script setup>
import FormField from "@/components/ui/FormField.vue"

defineProps({
	modelValue: { type: Number, default: 0 },
	label: { type: String, required: true },
	description: { type: String, default: "" },
	error: { type: String, default: "" },
	required: { type: Boolean, default: false },
	disabled: { type: Boolean, default: false },
	min: { type: Number, default: undefined },
	max: { type: Number, default: undefined },
	step: { type: Number, default: 1 },
})

defineEmits(["update:modelValue"])
</script>
