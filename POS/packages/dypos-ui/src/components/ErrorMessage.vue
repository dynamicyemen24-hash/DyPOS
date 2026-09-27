<template>
  <div
    v-if="text"
    role="alert"
    class="whitespace-pre-line text-sm text-[var(--dy-danger)]"
  >
    {{ text }}
  </div>
</template>

<script setup>
/**
 * DyPOS ErrorMessage — renders a server error for humans.
 *
 * Accepts a plain string, an `Error`, or the enriched errors produced by the
 * UI kit transport (`error.messages[]`). Text is rendered as TEXT, never with
 * `v-html`: the previous implementation piped server strings straight into
 * `innerHTML`, which is an XSS sink for any endpoint that echoes user input.
 */
import { computed } from "vue"

const props = defineProps({
	/** String | Error | { messages?: string[] } */
	message: { type: [String, Object], default: "" },
})

const text = computed(() => {
	const value = props.message
	if (!value) return ""
	if (typeof value === "string") return value
	if (Array.isArray(/** @type {any} */ (value).messages)) {
		return /** @type {any} */ (value).messages
			.filter(Boolean)
			.join("\n")
	}
	return /** @type {any} */ (value).message || ""
})
</script>
