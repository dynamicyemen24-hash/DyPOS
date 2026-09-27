<template>
  <div class="flex items-center gap-2 text-sm text-[var(--dy-text-secondary)]">
    <LoadingIndicator class="h-4 w-4" />
    <span>{{ label || "جارٍ التحميل…" }}</span>
  </div>
</template>

<script setup>
import LoadingIndicator from "./LoadingIndicator.vue"

defineProps({
	/** Optional Arabic override for the default label. */
	label: { type: String, default: "" },
})
</script>
