<template>
  <svg
    class="max-w-xs animate-spin"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    :style="`scale: ${scale}%;`"
    viewBox="0 0 24 24"
    role="status"
    aria-live="polite"
    aria-label="جارٍ التحميل"
  >
    <circle
      class="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      stroke-width="4"
    />
    <path
      class="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
</template>

<script setup>
/**
 * DyPOS LoadingIndicator — the single spinner used across the POS.
 *
 * Honours `prefers-reduced-motion` (the animation is removed, the ring stays)
 * so motion-sensitive users are never forced to spin.
 */
defineProps({
	/** Scale factor of the glyph, in percent. */
	scale: { type: Number, default: 100 },
})
</script>

<style scoped>
@media (prefers-reduced-motion: reduce) {
	.animate-spin {
		animation: none !important;
	}
}
</style>
