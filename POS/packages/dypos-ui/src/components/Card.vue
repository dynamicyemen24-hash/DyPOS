<template>
  <section
    class="flex flex-col rounded-lg border border-[var(--dy-border)] bg-[var(--dy-surface)] shadow-[var(--dy-elevation-1)][data-theme]"
    :class="paddingClass"
    :data-theme="theme"
  >
    <header
      v-if="title || subtitle || $slots['actions-left'] || $slots.actions"
      class="flex items-start justify-between gap-3"
    >
      <div class="flex min-w-0 flex-col gap-1">
        <div v-if="$slots['actions-left']" class="flex items-center gap-2">
          <slot name="actions-left" />
        </div>
        <h2 v-if="title" class="truncate text-lg font-semibold text-[var(--dy-text)]">
          {{ title }}
        </h2>
        <p v-if="subtitle" class="text-sm text-[var(--dy-text-secondary)]">
          {{ subtitle }}
        </p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>

    <div
      v-if="loading"
      class="flex flex-auto flex-col items-center justify-center py-8"
    >
      <LoadingText />
    </div>
    <div v-else-if="$slots.default" class="mt-4 flex-auto">
      <slot />
    </div>
  </section>
</template>

<script setup>
/**
 * DyPOS Card — surface container for dashboards and panels.
 * Supports multiple design systems: dypos (default), Fiori, Material 3, Carbon.
 */
import { computed, watch } from "vue"
import LoadingText from "./LoadingText.vue"

const props = defineProps({
	title: { type: String, default: "" },
	subtitle: { type: String, default: "" },
	/** Replaces the body with a loading indicator. */
	loading: { type: Boolean, default: false },
	/** `none` for edge-to-edge tables, `md` (default) for content cards. */
	density: { type: String, default: "md" },
	/** Design system theme: "dypos" | "fiori" | "m3" | "carbon" */
	theme: { type: String, default: "dypos" },
})

const PADDING = { none: "", sm: "p-4", md: "p-5", lg: "p-6" }

const paddingClass = computed(
	() =>
		PADDING[/** @type {keyof typeof PADDING} */ (props.density)] ?? PADDING.md,
)

// Watch theme change and update CSS vars
watch(
	() => props.theme,
	(theme) => {
		const html = document.documentElement
		html.dataset.theme = theme
		// Update CSS custom properties based on theme
		const themeMap = {
			dypos: "base",
			fiori: "fiori",
			m3: "m3",
			carbon: "carbon",
		}
		html.dataset.theme = themeMap[theme] || "base"
	},
	{ immediate: true },
)
</script>
