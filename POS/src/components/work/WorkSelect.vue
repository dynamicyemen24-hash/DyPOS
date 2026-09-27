<!--
	WorkSelect — the kit's select control.

	Why it exists: `WorkFormField` rendered `<WorkSelect>` for its multiselect
	branch, but no such component existed anywhere in the repo — an unresolved
	element that Vue compiles to a bare tag and renders as nothing. The field was
	unreachable, so nothing caught it. This adapter binds the field's contract to
	the app's existing, working select (components/common/SelectInput.vue) so the
	branch renders a real control.

	Honest limitation: `multiple` is accepted (the field passes it) but the
	underlying control is single-select. Drop the prop from the field's definition
	when a real multi-select lands — do not pretend it filters.
-->
<template>
	<SelectInput
		:model-value="modelValue"
		:options="normalizedOptions"
		:placeholder="placeholder"
		:disabled="disabled"
		:searchable="searchable"
		@update:model-value="$emit('update:modelValue', $event)"
		@change="$emit('change', $event)"
		@blur="$emit('blur')"
	/>
</template>

<script setup>
import { computed } from "vue"

import SelectInput from "@/components/common/SelectInput.vue"

defineEmits(["update:modelValue", "change", "blur"])

const props = defineProps({
	/** Scalar for now — see the note above about `multiple`. */
	modelValue: { type: [String, Number, Boolean, null], default: "" },
	/** `["a"]` or `[{ value, label, subtitle? }]` — both shapes are accepted. */
	options: { type: Array, default: () => [] },
	placeholder: { type: String, default: "" },
	disabled: { type: Boolean, default: false },
	searchable: { type: Boolean, default: false },
	/** Accepted for the field contract; the control is single-select. */
	multiple: { type: Boolean, default: false },
})

const normalizedOptions = computed(() =>
	props.options.map((option) =>
		option && typeof option === "object"
			? option
			: { value: option, label: String(option) },
	),
)
</script>
