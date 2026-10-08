<script setup>
import { computed, useId } from "vue"

const props = defineProps({
	label: { type: String, required: true },
	description: { type: String, default: "" },
	error: { type: String, default: "" },
	required: { type: Boolean, default: false },
	disabled: { type: Boolean, default: false },
	id: { type: String, default: "" },
})

const generatedId = useId()
const fieldId = computed(() => props.id || `dy-field-${generatedId}`)
const descriptionId = computed(() => `${fieldId.value}-description`)
const errorId = computed(() => `${fieldId.value}-error`)
const describedBy = computed(() => {
	const ids = []
	if (props.description && !props.error) ids.push(descriptionId.value)
	if (props.error) ids.push(errorId.value)
	return ids.length ? ids.join(" ") : undefined
})
</script>

<template>
	<div class="dy-form-field p-2 rounded hover:bg-gray-50 transition-colors" :class="{ 'opacity-70': disabled }">
		<label :for="fieldId" class="block text-sm font-medium text-gray-900 mb-1">
			{{ label }}
			<span v-if="required" aria-hidden="true" class="text-[var(--dy-danger,#dc2626)]"> *</span>
		</label>
		<div class="dy-form-field__control">
			<slot :field-id="fieldId" :described-by="describedBy" :error-id="error ? errorId : undefined" :invalid="Boolean(error)" />
		</div>
		<p v-if="description && !error" :id="descriptionId" class="text-xs text-gray-500 mt-0.5 leading-tight">
			{{ description }}
		</p>
		<p v-if="error" :id="errorId" class="text-xs text-[var(--dy-danger,#dc2626)] mt-1 leading-tight" role="alert">
			{{ error }}
		</p>
	</div>
</template>
