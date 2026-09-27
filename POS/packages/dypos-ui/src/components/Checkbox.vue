<template>
  <label class="inline-flex items-center gap-2 text-sm text-[var(--dy-text)]">
    <input
      :id="id"
      type="checkbox"
      :checked="modelValue === true"
      :disabled="disabled"
      class="h-4 w-4 cursor-pointer rounded border-[var(--dy-border-strong)] accent-[var(--dy-primary)]"
      :class="{ 'cursor-not-allowed opacity-60': disabled }"
      @change="onChange"
    />
    <span v-if="label">{{ label }}</span>
  </label>
</template>

<script setup>
/**
 * DyPOS Checkbox — native input (keyboard + screen-reader correct by default).
 */
import { useId } from "../utils/useId.js"

defineProps({
	modelValue: { type: Boolean, default: false },
	label: { type: String, default: "" },
	disabled: { type: Boolean, default: false },
})
const emit = defineEmits(["update:modelValue"])
const id = useId()

function onChange(event) {
	emit(
		"update:modelValue",
		/** @type {HTMLInputElement} */ (event.target).checked,
	)
}
</script>
