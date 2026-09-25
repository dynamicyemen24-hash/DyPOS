<template>
  <div class="step-card">
    <div class="step-card-header">
      <div class="step-number" :class="numberColor">{{ number }}</div>
      <FeatherIcon :name="icon" class="step-icon" :class="iconColor" />
      <h3 class="step-title">{{ title }}</h3>
    </div>
    <div class="step-content">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "frappe-ui"

const props = defineProps({
	number: { type: Number, required: true },
	title: { type: String, required: true },
	icon: { type: String, required: true },
	color: {
		type: String,
		default: "blue",
		validator: (v) => ["blue", "green", "purple", "orange", "red"].includes(v),
	},
})

const slots = useSlots()

const numberColor = computed(() => `step-card-${props.color}`)
const iconColor = computed(() => `step-card-${props.color}`)
</script>

<style scoped>
.step-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.step-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.step-number {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
  color: white;
}

.step-icon {
  width: 24px;
  height: 24px;
  color: white;
}

.step-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
}

.step-content {
  padding: 16px;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  transition: background 0.2s;
}

.step-item:hover {
  background: #f3f4f6;
}

.step-number {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.875rem;
  color: white;
  flex-shrink: 0;
}

.step-text {
  flex: 1;
  line-height: 1.6;
}

/* Color variants */
.step-card-blue .step-number { background: #3b82f6; }
.step-card-blue .step-icon { color: #3b82f6; }
.step-card-blue .step-number-bg { background: #dbeafe; }

.step-card-green .step-number { background: #10b981; }
.step-card-green .step-icon { color: #10b981; }

.step-card-purple .step-number { background: #8b5cf6; }
.step-card-purple .step-icon { color: #8b5cf6; }

.step-card-orange .step-number { background: #f59e0b; }
.step-card-orange .step-icon { color: #f59e0b; }

.step-card-red .step-number { background: #ef4444; }
.step-card-red .step-icon { color: #ef4444; }
</style>