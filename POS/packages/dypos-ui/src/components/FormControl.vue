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
      :barcode="barcode"
      @update:model-value="onUpdate"
      @change="emit('change', $event)"
      @enter="emit('enter', $event)"
    >
      <template v-if="$slots.prefix" #prefix><slot name="prefix" /></template>
      <template v-if="$slots.suffix" #suffix><slot name="suffix" /></template>
    </TextInput>

    <slot name="description">
      <p v-if="description" :id="descriptionId" class="text-xs text-[var(--dy-text-muted)]">
        {{ description }}
      </p>
    </slot>

    <!-- الخطأ مرئي ومقروء (role=alert) ومربوط بالمُتحكّم عبر aria-describedby. -->
    <ErrorMessage v-if="error" :id="errorId" :message="error" />
  </div>

  <div v-else class="flex flex-col gap-1.5" :class="$attrs.class" :style="$attrs.style">
    <Checkbox
      v-bind="controlAttrs"
      :id="id"
      :model-value="modelValue === true"
      :label="label"
      :disabled="disabled"
      @update:model-value="onUpdate"
    />
    <ErrorMessage v-if="error" :id="errorId" :message="error" />
  </div>
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
import ErrorMessage from "./ErrorMessage.vue"
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
	/**
	 * رسالة الخطأ: تُرسم (role=alert) وتربط المُتحكّم عبر
	 * `aria-invalid` + `aria-describedby` — لا "حقل أحمر بلا نص".
	 */
	error: { type: String, default: "" },
	/**
	 * وضع الباركود: `enterkeyhint=go` + `autocomplete=off` + بثّ حدث `enter`
	 * عند الضغط على Enter (نقطة تسليم الرمز لقارئ الباركود/الكاشير).
	 */
	barcode: { type: Boolean, default: false },
})

const emit = defineEmits(["update:modelValue", "change", "enter"])
const attrs = useAttrs()
const id = useId("dypos-field")
const descriptionId = `${id}-description`
const errorId = `${id}-error`

const controlAttrs = computed(() => {
	const rest = {}
	for (const key of Object.keys(attrs)) {
		if (key !== "class" && key !== "style") rest[key] = attrs[key]
	}
	if (props.error) rest["aria-invalid"] = "true"
	const described = []
	if (props.description) described.push(descriptionId)
	if (props.error) described.push(errorId)
	if (described.length) rest["aria-describedby"] = described.join(" ")
	if (props.barcode) {
		rest.enterkeyhint = rest.enterkeyhint ?? "go"
		rest.autocomplete = rest.autocomplete ?? "off"
	}
	return rest
})

function onUpdate(value) {
	emit("update:modelValue", value)
}
</script>
