<template>
  <label :class="[type === 'checkbox' ? 'inline-flex items-center gap-2' : 'block']">
    <span
      v-if="label && type !== 'checkbox'"
      class="mb-1.5 block text-sm font-medium text-[var(--dy-text)]"
    >{{ label }}</span>

    <div class="relative flex items-center" :class="type === 'checkbox' ? '' : 'w-full'">
      <span
        v-if="iconLeft && type !== 'checkbox'"
        class="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-[var(--dy-text-muted)]"
      >
        <FeatherIcon :name="iconLeft" class="h-4 w-4" />
      </span>

      <input
        v-if="isNativeInput"
        ref="inputRef"
        v-bind="controlAttrs"
        :type="type"
        :value="passedValue"
        :disabled="disabled"
        :placeholder="placeholder"
        :class="inputClasses"
        @input="onInput"
        @change="onChange"
      />

      <textarea
        v-else-if="type === 'textarea'"
        ref="inputRef"
        v-bind="controlAttrs"
        :value="passedValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :rows="rows"
        :class="textareaClasses"
        @input="onInput"
        @change="onChange"
      />

      <SelectInput
        v-else-if="type === 'select'"
        ref="inputRef"
        v-bind="controlAttrs"
        :model-value="passedValue"
        :options="options"
        :disabled="disabled"
        @update:model-value="onSelect"
      />
    </div>

    <span
      v-if="label && type === 'checkbox'"
      class="text-sm text-[var(--dy-text)]"
    >{{ label }}</span>
  </label>
</template>

<script setup>
/**
 * DyPOS Input — the single-field control kept for compatibility with screens
 * that use its `label` / `iconLeft` / `options` / `getInputValue()` API.
 *
 * New code should prefer `FormControl` (label + control + description) or
 * `TextInput` (bare control).
 */
import { computed, ref, useAttrs } from "vue"
import FeatherIcon from "./FeatherIcon.vue"
import SelectInput from "./SelectInput.vue"
import { debounce } from "../utils/debounce.js"

defineOptions({ inheritAttrs: false })
defineExpose({ getInputValue, focus: () => inputRef.value?.focus() })

const props = defineProps({
	label: { type: String, default: "" },
	/** text | number | checkbox | textarea | select | email | password | date */
	type: { type: String, default: "text" },
	modelValue: {
		type: [String, Number, Boolean, Object, Array, null],
		default: "",
	},
	/** Extra classes for the control itself. */
	inputClass: { type: [String, Array, Object], default: "" },
	/** Debounce the emitted `input` value. */
	debounce: { type: Number, default: 0 },
	/** `['a','b']` or `[{ label, value, disabled }]` for `type="select"`. */
	options: { type: Array, default: () => [] },
	disabled: { type: Boolean, default: false },
	rows: { type: Number, default: 3 },
	placeholder: { type: String, default: undefined },
	iconLeft: { type: String, default: "" },
})

const emit = defineEmits(["input", "change", "update:modelValue"])
const attrs = useAttrs()
const inputRef = ref(/** @type {any} */ (null))

const controlAttrs = computed(() => {
	const rest = {}
	for (const key of Object.keys(attrs)) {
		if (key !== "class" && key !== "style") rest[key] = attrs[key]
	}
	return rest
})

const isNativeInput = computed(() =>
	[
		"text",
		"number",
		"checkbox",
		"email",
		"password",
		"date",
		"search",
		"tel",
	].includes(props.type),
)

const passedValue = computed(() => {
	if ("value" in attrs) return attrs.value
	return props.modelValue ?? ""
})

const baseClasses = computed(() => [
	"w-full rounded-lg border border-[var(--dy-border)] bg-[var(--dy-surface)] text-[var(--dy-text)]",
	"placeholder:text-[var(--dy-text-muted)] outline-none transition-colors",
	"focus-visible:border-[var(--dy-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dy-ring)]",
	"disabled:cursor-not-allowed disabled:bg-[var(--dy-disabled-soft)]",
	props.iconLeft ? "ps-8" : "ps-2.5",
	props.type === "checkbox"
		? "h-4 w-4 accent-[var(--dy-primary)]"
		: "h-8 text-sm",
])

const inputClasses = computed(() => [baseClasses.value, props.inputClass])
const textareaClasses = computed(() => [
	baseClasses.value,
	"h-auto py-1.5 pe-2.5",
	props.inputClass,
])

/**
 * @param {Event} [event]
 * @returns {string|number|boolean}
 */
function getInputValue(event) {
	const element = event ? event.target : inputRef.value?.$el || inputRef.value
	if (!element) return ""
	if (props.type === "checkbox") return Boolean(element.checked)
	return element.value
}

const emitValue = (value) => emit("input", value)
const emitInput = computed(() =>
	props.debounce ? debounce(emitValue, props.debounce) : emitValue,
)

function onInput(event) {
	const value = getInputValue(event)
	emitInput.value(value)
	emit("update:modelValue", value)
}

function onChange(event) {
	const value = getInputValue(event)
	emit("change", value)
	emit("update:modelValue", value)
}

function onSelect(value) {
	emit("input", value)
	emit("change", value)
	emit("update:modelValue", value)
}
</script>
