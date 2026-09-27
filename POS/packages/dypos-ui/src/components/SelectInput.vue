<template>
  <div class="relative flex w-full items-center" :class="$attrs.class" :style="$attrs.style">
    <span
      v-if="$slots.prefix"
      class="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2 text-[var(--dy-text-muted)]"
    >
      <slot name="prefix" />
    </span>
    <select
      ref="selectRef"
      v-bind="controlAttrs"
      :value="modelValue ?? ''"
      :disabled="disabled"
      :class="selectClasses"
      @change="onChange"
    >
      <option
        v-for="option in normalized"
        :key="String(option.value)"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <span
      v-if="$slots.suffix"
      class="absolute inset-y-0 end-0 flex items-center pe-2 text-[var(--dy-text-muted)]"
    >
      <slot name="suffix" />
    </span>
  </div>
</template>

<script setup>
/**
 * DyPOS Select — a native `<select>`.
 *
 * Native on purpose: on a cashier terminal it gives the OS pickers, full
 * keyboard support and correct RTL behaviour with zero JS, and it keeps working
 * when the app is installed offline. A custom listbox would add ~15 KB and
 * break platform accessibility for no gain.
 */
import { computed, ref, useAttrs, useSlots } from "vue"

defineOptions({ inheritAttrs: false })

const props = defineProps({
	modelValue: { type: [String, Number, Boolean, null], default: "" },
	/** `[{ label, value, disabled }]` or `['a', 'b']`. */
	options: { type: Array, default: () => [] },
	disabled: { type: Boolean, default: false },
	/** sm | md | lg */
	size: { type: String, default: "sm" },
})

const emit = defineEmits(["update:modelValue", "change"])
const attrs = useAttrs()
const slots = useSlots()
const selectRef = ref(/** @type {HTMLSelectElement|null} */ (null))

defineExpose({ el: selectRef, focus: () => selectRef.value?.focus() })

const controlAttrs = computed(() => {
	const rest = {}
	for (const key of Object.keys(attrs)) {
		if (key !== "class" && key !== "style") rest[key] = attrs[key]
	}
	return rest
})

const normalized = computed(() =>
	props.options.map((option) =>
		typeof option === "object" && option !== null
			? {
					label: /** @type {any} */ (option).label ?? String(option),
					value: /** @type {any} */ (option).value ?? option,
					disabled: Boolean(/** @type {any} */ (option).disabled),
				}
			: { label: String(option), value: option, disabled: false },
	),
)

const SIZE = { sm: "h-8 text-sm", md: "h-10 text-base", lg: "h-12 text-lg" }

const selectClasses = computed(() => [
	"w-full cursor-pointer appearance-none rounded-lg border border-[var(--dy-border)]",
	"bg-[var(--dy-surface)] text-[var(--dy-text)] outline-none transition-colors",
	"focus-visible:border-[var(--dy-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dy-ring)]",
	"disabled:cursor-not-allowed disabled:bg-[var(--dy-disabled-soft)]",
	SIZE[/** @type {keyof typeof SIZE} */ (props.size)] || SIZE.sm,
	slots.prefix ? "ps-8" : "ps-3",
	slots.suffix ? "pe-8" : "pe-3",
])

function onChange(event) {
	const value = /** @type {HTMLSelectElement} */ (event.target).value
	emit("update:modelValue", value)
	emit("change", event)
}
</script>

<style scoped>
select {
	background-image: url("data:image/svg+xml;utf8,<svg fill='none' width='12' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");
	background-repeat: no-repeat;
	background-position: left 0.5rem center;
	background-size: 1rem;
	padding-inline-end: 2rem;
}
</style>
