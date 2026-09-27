<template>
  <textarea
    ref="textareaRef"
    v-bind="$attrs"
    :value="modelValue ?? ''"
    :placeholder="placeholder"
    :disabled="disabled"
    :rows="rows"
    :class="classes"
    @input="onInput"
  />
</template>

<script setup>
/**
 * DyPOS Textarea — multi-line text control.
 */
import { computed, ref } from "vue"

defineOptions({ inheritAttrs: false })

const props = defineProps({
	modelValue: { type: [String, Number], default: "" },
	placeholder: { type: String, default: undefined },
	disabled: { type: Boolean, default: false },
	rows: { type: Number, default: 3 },
	/** sm | md | lg */
	size: { type: String, default: "sm" },
})
const emit = defineEmits(["update:modelValue"])
const textareaRef = ref(/** @type {HTMLTextAreaElement|null} */ (null))

defineExpose({ el: textareaRef, focus: () => textareaRef.value?.focus() })

const SIZE = { sm: "text-sm", md: "text-base", lg: "text-lg" }

const classes = computed(() => [
	"w-full resize-y rounded-lg border border-[var(--dy-border)] bg-[var(--dy-surface)] p-2.5",
	"text-[var(--dy-text)] placeholder:text-[var(--dy-text-muted)] outline-none transition-colors",
	"focus-visible:border-[var(--dy-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dy-ring)]",
	"disabled:cursor-not-allowed disabled:bg-[var(--dy-disabled-soft)]",
	SIZE[/** @type {keyof typeof SIZE} */ (props.size)] || SIZE.sm,
])

function onInput(event) {
	emit(
		"update:modelValue",
		/** @type {HTMLTextAreaElement} */ (event.target).value,
	)
}
</script>
