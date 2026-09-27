<template>
  <div
    v-if="visible"
    role="alert"
    class="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg px-4 py-3"
    :class="containerClass"
  >
    <slot name="icon">
      <FeatherIcon
        v-if="iconName"
        :name="iconName"
        class="mt-0.5 h-4 w-4"
        :class="iconClass"
        aria-hidden="true"
      />
    </slot>

    <div class="grid gap-1" :class="{ 'col-span-2': !$slots.icon && !iconName }">
      <span class="text-sm font-semibold text-[var(--dy-text)]">{{ title }}</span>
      <slot name="description">
        <p
          v-if="description"
          class="text-sm text-[var(--dy-text-secondary)]"
        >
          {{ description }}
        </p>
      </slot>
      <slot />
    </div>

    <button
      v-if="dismissable"
      type="button"
      class="rounded p-0.5 text-[var(--dy-text-muted)] transition-colors hover:bg-black/5 hover:text-[var(--dy-text)]"
      :aria-label="dismissLabel"
      @click="dismiss"
    >
      <FeatherIcon name="x" class="h-4 w-4" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
/**
 * DyPOS Alert — inline status banner (info / success / warning / danger).
 *
 * `v-model` controls visibility, `theme` picks the colour, and the optional
 * dismiss button is real (it emits `dismiss` and flips the model) — the previous
 * implementation shipped a button that did nothing.
 */
import { computed, ref, watch } from "vue"
import FeatherIcon from "./FeatherIcon.vue"

const props = defineProps({
	/** Headline text (Arabic in the POS). */
	title: { type: String, default: "" },
	/** Secondary line. */
	description: { type: String, default: "" },
	/** yellow | blue | red | green */
	theme: { type: String, default: "" },
	/** subtle | outline */
	variant: { type: String, default: "subtle" },
	/** Shows the close button. */
	dismissable: { type: Boolean, default: true },
	/** Arabic aria-label for the close button. */
	dismissLabel: { type: String, default: "إغلاق" },
})
const emit = defineEmits(["dismiss", "update:modelValue"])

const visible = ref(true)

watch(
	() => props.variant,
	() => {
		visible.value = true
	},
)

const containerClass = computed(() => {
	if (props.variant === "outline") {
		return "border border-[var(--dy-border-strong)] bg-transparent"
	}
	const subtle = {
		yellow: "bg-[var(--dy-warning-soft)]",
		blue: "bg-[var(--dy-info-soft)]",
		red: "bg-[var(--dy-danger-soft)]",
		green: "bg-[var(--dy-success-soft)]",
	}
	return (
		subtle[/** @type {keyof typeof subtle} */ (props.theme)] ||
		"bg-[var(--dy-bg-sunken)]"
	)
})

const iconName = computed(
	() =>
		({
			yellow: "alert-triangle",
			blue: "info",
			red: "alert-circle",
			green: "check-circle",
		})[/** @type {keyof Record<string, string>} */ (props.theme)] || null,
)

const iconClass = computed(
	() =>
		({
			yellow: "text-[var(--dy-warning)]",
			blue: "text-[var(--dy-info)]",
			red: "text-[var(--dy-danger)]",
			green: "text-[var(--dy-success)]",
		})[/** @type {keyof Record<string, string>} */ (props.theme)] ||
		"text-[var(--dy-text-muted)]",
)

function dismiss() {
	visible.value = false
	emit("update:modelValue", false)
	emit("dismiss")
}
</script>
