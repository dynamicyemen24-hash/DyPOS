<template>
  <div v-if="type !== 'checkbox'" class="flex flex-col gap-1.5" :class="$attrs.class" :style="$attrs.style">
    <FormLabel :id="id" :label="label" :required="required" />

    <SelectInput
      v-if="type === 'select'"
      v-bind="controlAttrs"
      :id="id"
      :model-value="modelValue ?? ''"
      :options="options"
      :disabled="disabled"
      :size="size"
      @update:model-value="onUpdate"
      @change="emit('change', $event)"
    >
      <template v-if="$slots.prefix" #prefix><slot name="prefix" /></template>
      <template v-if="$slots.suffix" #suffix><slot name="suffix" /></template>
    </SelectInput>

    <Textarea
      v-else-if="type === 'textarea'"
      v-bind="controlAttrs"
      :id="id"
      :model-value="modelValue ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :rows="rows"
      :size="size"
      @update:model-value="onUpdate"
    />

    <TextInput
      v-else
      v-bind="controlAttrs"
      :id="id"
      :type="type"
      :model-value="modelValue ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :size="size"
      :variant="variant"
      @update:model-value="onUpdate"
      @change="emit('change', $event)"
    >
      <template v-if="$slots.prefix" #prefix><slot name="prefix" /></template>
      <template v-if="$slots.suffix" #suffix><slot name="suffix" /></template>
    </TextInput>

    <slot name="description">
      <p v-if="description" class="text-xs text-[var(--dy-text-muted)]">
        {{ description }}
      </p>
    </slot>
  </div>

  <Checkbox
    v-else
    v-bind="controlAttrs"
    :id="id"
    :model-value="modelValue === true"
    :label="label"
    :disabled="disabled"
    @update:model-value="onUpdate"
  />
</template>

<script setup>
/**
 * DyPOS FormControl — label + control + description, one element.
 *
 * The POS only uses `text | number | date | select | textarea | checkbox`, so
 * this dispatches to native controls instead of pulling in a headless form
 * library. Everything is a real `<label for>` / `<input id>` pair, which is
 * what makes the forms usable with a screen reader and with the on-screen
 * keyboard on a POS terminal.
 */
import { computed, useAttrs } from "vue"
import Checkbox from "./Checkbox.vue"
import FormLabel from "./FormLabel.vue"
import SelectInput from "./SelectInput.vue"
import Textarea from "./Textarea.vue"
import TextInput from "./TextInput.vue"
import { useId } from "../utils/useId.js"

defineOptions({ inheritAttrs: false })

const props = defineProps({
	/** text | number | date | select | textarea | checkbox | email | password */
	type: { type: String, default: "text" },
	/** Visible label (rendered as a real `<label for>`). */
	label: { type: String, default: "" },
	/** Helper text under the control. */
	description: { type: String, default: "" },
	placeholder: { type: String, default: undefined },
	modelValue: { type: [String, Number, Boolean, null], default: "" },
	/** Options for `type="select"`. */
	options: { type: Array, default: () => [] },
	disabled: { type: Boolean, default: false },
	required: { type: Boolean, default: false },
	rows: { type: Number, default: 3 },
	/** sm | md | lg */
	size: { type: String, default: "sm" },
	/** subtle | outline | ghost */
	variant: { type: String, default: "subtle" },
})

const emit = defineEmits(["update:modelValue", "change"])
const attrs = useAttrs()
const id = useId("dypos-field")

const controlAttrs = computed(() => {
	const rest = {}
	for (const key of Object.keys(attrs)) {
		if (key !== "class" && key !== "style") rest[key] = attrs[key]
	}
	return rest
})

function onUpdate(value) {
	emit("update:modelValue", value)
}
</script>
