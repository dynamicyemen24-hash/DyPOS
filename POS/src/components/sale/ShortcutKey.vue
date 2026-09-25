<template>
  <div class="shortcut-key">
    <kbd>{{ key }}</kbd>
    <span>{{ desc }}</span>
  </div>
</template>

<script setup>
import { t } from "@/utils/translation"

const props = defineProps({
	key: { type: String, required: true },
	desc: { type: String, required: true },
})
</script>

<style scoped>
.shortcut-key {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: white;
  border: 1px solid #e0e7ff;
  border-radius: 8px;
  color: #4f46e5;
  font-family: monospace;
  font-size: 0.75rem;
}

.shortcut-key kbd {
  background: #eef2ff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
}
</style>