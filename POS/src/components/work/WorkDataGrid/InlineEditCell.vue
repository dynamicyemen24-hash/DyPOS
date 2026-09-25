/**
 * InlineEditCell — محرر خلية مباشر مع دعم أنواع متعددة.
 */
<template>
  <div
    class="work-data-grid__edit-wrapper"
    :class="`work-data-grid__edit--${column.editorType || 'text'}`"
    ref="wrapperRef"
  >
    <input
      v-if="column.editorType === 'text' || !column.editorType"
      ref="inputRef"
      type="text"
      v-model="localValue"
      @blur="handleBlur"
      @keydown.enter="handleEnter"
      @keydown.esc="handleEscape"
      class="work-data-grid__edit-input"
      aria-label="t('editing')"
    />
    <input
      v-else-if="column.editorType === 'number'"
      ref="inputRef"
      type="number"
      v-model.number="localValue"
      :min="column.validation?.min"
      :max="column.validation?.max"
      :step="column.validation?.step || 'any'"
      @blur="handleBlur"
      @keydown.enter="handleEnter"
      @keydown.esc="handleEscape"
      class="work-data-grid__edit-input"
      aria-label="t('editingNumber')"
    />
    <input
      v-else-if="column.editorType === 'date'"
      ref="inputRef"
      type="date"
      v-model="localValue"
      @blur="handleBlur"
      @keydown.enter="handleEnter"
      @keydown.esc="handleEscape"
      class="work-data-grid__edit-input"
      aria-label="t('editingDate')"
    />
    <select
      v-else-if="column.editorType === 'select'"
      ref="inputRef"
      v-model="localValue"
      @blur="handleBlur"
      @keydown.enter="handleEnter"
      @keydown.esc="handleEscape"
      class="work-data-grid__edit-select"
      aria-label="t('editingSelect')"
    >
      <option v-for="opt in column.editorOptions" :key="opt.value" :value="opt.value">{{ t(opt.label) }}</option>
    </select>
    <label
      v-else-if="column.editorType === 'boolean'"
      class="work-data-grid__edit-boolean"
    >
      <input
        ref="inputRef"
        type="checkbox"
        v-model="localValue"
        @blur="handleBlur"
        @change="handleEnter"
        class="work-data-grid__edit-checkbox"
      />
      <span class="work-data-grid__edit-boolean-label">{{ t(localValue ? 'yes' : 'no') }}</span>
    </label>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from "vue"

const props = defineProps({
	column: { type: Object, required: true },
	value: { type: [String, Number, Boolean, Date], default: null },
	options: { type: Array, default: () => [] },
})

const emit = defineEmits(["save", "cancel"])

const inputRef = ref(null)
const wrapperRef = ref(null)
const localValue = ref(props.value)

watch(
	() => props.value,
	(val) => {
		localValue.value = val
	},
)

onMounted(() => {
	nextTick(() => {
		inputRef.value?.focus?.()
		inputRef.value?.select?.()
	})
})

function handleEnter() {
	if (isValid()) {
		emit("save", localValue.value)
	}
}

function handleEscape() {
	emit("cancel")
}

function handleBlur() {
	// Delay to allow click on save/cancel
	setTimeout(() => {
		if (isValid()) emit("save", localValue.value)
		else emit("cancel")
	}, 100)
}

function isValid() {
	if (!props.column.validation) return true
	const { required, min, max, pattern } = props.column.validation
	const val = localValue.value
	if (required && (val == null || val === "")) return false
	if (typeof val === "number") {
		if (min != null && val < min) return false
		if (max != null && val > max) return false
	}
	if (pattern && typeof val === "string" && !new RegExp(pattern).test(val))
		return false
	return true
}
</script>

<style scoped>
.work-data-grid__edit-wrapper {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 4px 8px;
}

.work-data-grid__edit-input,
.work-data-grid__edit-select {
  width: 100%;
  height: 100%;
  padding: 4px 8px;
  border: 2px solid var(--dy-color-brand-500, #10b981);
  border-radius: var(--dy-radius-sm, 4px);
  background: var(--dy-color-surface-base, #ffffff);
  color: var(--dy-color-text-primary, #0f172a);
  font-family: inherit;
  font-size: 0.81rem;
  box-sizing: border-box;
}
.work-data-grid__edit-input:focus,
.work-data-grid__edit-select:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--dy-color-brand-100, #d1fae5);
}

.work-data-grid__edit-boolean {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 100%;
}
.work-data-grid__edit-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--dy-color-brand-500, #10b981);
}
.work-data-grid__edit-boolean-label {
  font-size: 0.75rem;
  color: var(--dy-color-text-secondary, #334155);
}

@media (forced-colors: active) {
  .work-data-grid__edit-input,
  .work-data-grid__edit-select { border-color: Highlight; background: Canvas; color: CanvasText; }
}
</style>