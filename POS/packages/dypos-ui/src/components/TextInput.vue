<template>
  <div class="relative flex w-full items-center" :class="wrapperClass">
    <span
      v-if="$slots.prefix"
      class="pointer-events-none absolute inset-y-0 start-0 flex items-center text-[var(--dy-text-muted)]"
      :class="insetPadding"
    >
      <slot name="prefix" />
    </span>
    <input
      ref="inputRef"
      v-bind="controlAttrs"
      :type="type"
      :value="modelValue ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :class="inputClasses"
      @input="onInput"
      @change="onInput"
    />
    <span
      v-if="$slots.suffix"
      class="absolute inset-y-0 end-0 flex items-center text-[var(--dy-text-muted)]"
      :class="insetPadding"
    >
      <slot name="suffix" />
    </span>
  </div>
</template>

<script setup>
/**
 * DyPOS TextInput — the text control used by every form in the POS.
 *
 * Improvements over the previous kit:
 *  - `v-model` is driven by a real `value` binding (no `:value`+`null` dance);
 *  - `autocomplete` is forwarded so browser autofill works for cashier logins;
 *  - the focus ring comes from the design tokens (accessible in high-contrast
 *    mode) instead of hard-coded rgba;
 *  - the control is `readonly`-safe for read-only offline receipts.
 */
import { computed, ref, useAttrs, useSlots } from "vue"
import { debounce } from "../utils/debounce.js"

defineOptions({ inheritAttrs: false })

const props = defineProps({
	modelValue: { type: [String, Number], default: "" },
	/** text | email | password | number | date | search | tel */
	type: { type: String, default: "text" },
	placeholder: { type: String, default: undefined },
	disabled: { type: Boolean, default: false },
	required: { type: Boolean, default: false },
	/** sm | md | lg */
	size: { type: String, default: "sm" },
	/** subtle | outline | ghost */
	variant: { type: String, default: "subtle" },
	/** Debounce the emitted value (search boxes). */
	debounce: { type: Number, default: 0 },
})

const emit = defineEmits(["update:modelValue", "change"])
const attrs = useAttrs()
const slots = useSlots()
const inputRef = ref(/** @type {HTMLInputElement|null} */ (null))

defineExpose({ el: inputRef, focus: () => inputRef.value?.focus() })

const controlAttrs = computed(() => {
	const rest = {}
	for (const key of Object.keys(attrs)) {
		if (key !== "class" && key !== "style") rest[key] = attrs[key]
	}
	return rest
})

const SIZE = {
	xs: "h-7 text-xs",
	sm: "h-8 text-sm",
	md: "h-10 text-base",
	lg: "h-12 text-lg",
}

const insetPadding = computed(() => {
	const map = {
		xs: "ps-1.5 pe-1.5",
		sm: "ps-2 pe-2",
		md: "ps-3 pe-3",
		lg: "ps-3 pe-3",
	}
	return map[/** @type {keyof typeof map} */ (props.size)] || map.sm
})

const inputClasses = computed(() => {
	const base = [
		"w-full rounded-lg border bg-[var(--dy-surface)] text-[var(--dy-text)]",
		"placeholder:text-[var(--dy-text-muted)]",
		"transition-colors outline-none",
		"focus-visible:border-[var(--dy-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dy-ring)]",
		"disabled:cursor-not-allowed disabled:bg-[var(--dy-disabled-soft)] disabled:text-[var(--dy-text-muted)]",
		SIZE[/** @type {keyof typeof SIZE} */ (props.size)] || SIZE.sm,
	]
	if (props.variant === "ghost") {
		base.push("border-transparent bg-transparent")
	} else if (props.variant === "outline") {
		base.push("border-[var(--dy-border-strong)]")
	} else {
		base.push(
			"border-[var(--dy-border)] hover:border-[var(--dy-border-strong)]",
		)
	}
	base.push(slots.prefix ? "ps-8" : "ps-3")
	base.push(slots.suffix ? "pe-8" : "pe-3")
	return base
})

const emitValue = (value) => emit("update:modelValue", value)
const emitChange = computed(() =>
	props.debounce ? debounce(emitValue, props.debounce) : emitValue,
)

function onInput(event) {
	const target = /** @type {HTMLInputElement} */ (event.target)
	const value = props.type === "number" ? target.valueAsNumber : target.value
	emitChange.value(Number.isNaN(value) && props.type === "number" ? "" : value)
	emit("change", event)
}
</script>
