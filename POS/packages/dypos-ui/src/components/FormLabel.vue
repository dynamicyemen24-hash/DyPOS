<template>
  <label
    v-if="label"
    :for="id"
    class="flex items-center gap-1 text-sm font-medium text-[var(--dy-text)]"
  >
    <span>{{ label }}</span>
    <span
      v-if="required"
      class="text-[var(--dy-danger)]"
      aria-hidden="true"
    >*</span>
  </label>
</template>

<script setup>
defineProps({
	id: { type: String, default: undefined },
	label: { type: String, default: "" },
	required: { type: Boolean, default: false },
})
</script>
