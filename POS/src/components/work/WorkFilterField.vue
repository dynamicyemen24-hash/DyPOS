/**
 * WorkFilterField — حقل فلتر موحد (WCAG 2.2 AA).
 *
 * Supports:
 *  - text, select, multiselect, date, daterange, number, checkbox
 *  - Label + help text + error state
 *  - RTL-aware, accessible labeling
 *  - Design token theming
 */
<template>
  <div
    class="work-filter-field"
    :class="[
      `work-filter-field--${field.type}`,
      { 'work-filter-field--disabled': disabled },
      { 'work-filter-field--error': errorMessage },
    ]"
  >
    <label
      v-if="field.label"
      :for="inputId"
      class="work-filter-field__label"
    >
      {{ t(field.label) }}
      <span
        v-if="field.required"
        class="work-filter-field__required"
        aria-hidden="true"
      >*</span>
    </label>

    <div class="work-filter-field__control" :role="field.type === 'checkbox' ? 'group' : undefined">
      <!-- Text Input -->
      <input
        v-if="field.type === 'text'"
        :id="inputId"
        :type="field.inputType || 'text'"
        :value="modelValue"
        :placeholder="t(field.placeholder || '')"
        :disabled="disabled"
        :aria-describedby="describedByIds"
        :aria-invalid="!!errorMessage"
        class="work-filter-field__input"
        @blur="handleBlur"
        @input="$emit('update:modelValue', $event.target.value)"
      />

      <!-- Number Input -->
      <input
        v-else-if="field.type === 'number'"
        :id="inputId"
        type="number"
        :value="modelValue"
        :placeholder="t(field.placeholder || '')"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :disabled="disabled"
        :aria-describedby="describedByIds"
        :aria-invalid="!!errorMessage"
        class="work-filter-field__input"
        @blur="handleBlur"
        @input="$emit('update:modelValue', Number($event.target.value) || null)"
      />

      <!-- Select (single) -->
      <select
        v-else-if="field.type === 'select'"
        :id="inputId"
        :value="modelValue"
        :disabled="disabled"
        :aria-describedby="describedByIds"
        :aria-invalid="!!errorMessage"
        class="work-filter-field__select"
        @change="handleChange"
      >
        <option value="">{{ t(field.placeholder || 'selectOption') }}</option>
        <option
          v-for="opt in field.options"
          :key="opt.value"
          :value="opt.value"
        >
          {{ t(opt.label) }}
        </option>
      </select>

      <!-- Multi Select -->
      <div v-else-if="field.type === 'multiselect'" class="work-filter-field__multiselect">
        <DyButton
          type="button"
          variant="ghost"
          size="sm"
          class="work-filter-field__multiselect-trigger"
          :aria-expanded="multiselectOpen"
          :aria-controls="multiselectId"
          :aria-haspopup="listbox"
          @click="toggleMultiselect"
        >
          <span class="work-filter-field__multiselect-label">
            <span v-if="modelValue && modelValue.length">
              {{ modelValue.length }} {{ t('selected') }}
            </span>
            <span v-else>{{ t(field.placeholder || 'selectOptions') }}</span>
          </span>
          <template #suffix>
            <FeatherIcon
              :name="multiselectOpen ? 'chevron-up' : 'chevron-down'"
              class="w-4 h-4"
              aria-hidden="true"
            />
          </template>
        </DyButton>

        <Transition name="work-filter-fade">
          <div
            v-show="multiselectOpen"
            :id="multiselectId"
            class="work-filter-field__multiselect-menu"
            role="listbox"
            :aria-label="t(field.label)"
          >
            <label
              v-for="opt in field.options"
              :key="opt.value"
              class="work-filter-field__multiselect-option"
              role="option"
              :aria-selected="isSelected(opt.value)"
            >
              <input
                type="checkbox"
                :value="opt.value"
                :checked="isSelected(opt.value)"
                @change="toggleMultiselectOption(opt.value)"
                class="work-filter-field__multiselect-checkbox"
                aria-hidden="true"
              />
              <span>{{ t(opt.label) }}</span>
            </label>
          </div>
        </Transition>
      </div>

      <!-- Date Input -->
      <input
        v-else-if="field.type === 'date'"
        :id="inputId"
        type="date"
        :value="modelValue"
        :disabled="disabled"
        :aria-describedby="describedByIds"
        :aria-invalid="!!errorMessage"
        class="work-filter-field__input"
        @blur="handleBlur"
        @input="$emit('update:modelValue', $event.target.value)"
      />

      <!-- Date Range -->
      <div v-else-if="field.type === 'daterange'" class="work-filter-field__daterange">
        <input
          :id="`${inputId}-from`"
          type="date"
          :value="modelValue?.from"
          :disabled="disabled"
          :aria-label="t('fromDate')"
          class="work-filter-field__input"
          @blur="handleBlur"
          @input="$emit('update:modelValue', { ...modelValue, from: $event.target.value })"
        />
        <span class="work-filter-field__daterange-separator" aria-hidden="true">–</span>
        <input
          :id="`${inputId}-to`"
          type="date"
          :value="modelValue?.to"
          :disabled="disabled"
          :aria-label="t('toDate')"
          class="work-filter-field__input"
          @blur="handleBlur"
          @input="$emit('update:modelValue', { ...modelValue, to: $event.target.value })"
        />
      </div>

      <!-- Checkbox -->
      <label v-else-if="field.type === 'checkbox'" class="work-filter-field__checkbox-label">
        <input
          :id="inputId"
          type="checkbox"
          :checked="modelValue"
          :disabled="disabled"
          :aria-describedby="describedByIds"
          class="work-filter-field__checkbox"
          @change="$emit('update:modelValue', $event.target.checked)"
        />
        <span class="work-filter-field__checkbox-text">{{ t(field.label) }}</span>
      </label>
    </div>

    <!-- Help Text -->
    <p
      v-if="field.help && !errorMessage"
      :id="helpId"
      class="work-filter-field__help"
    >
      {{ t(field.help) }}
    </p>

    <!-- Error Message -->
    <p
      v-if="errorMessage"
      :id="errorId"
      class="work-filter-field__error"
      role="alert"
    >
      {{ t(errorMessage) }}
    </p>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue"
import { t } from "@/utils/translation"
import DyButton from "@/components/ui/DyButton.vue"

const props = defineProps({
	modelValue: { type: [String, Number, Boolean, Array, Object], default: null },
	field: {
		type: Object,
		required: true,
		// { key, label, type, placeholder, options, help, required, min, max, step, inputType }
	},
	disabled: { type: Boolean, default: false },
	errorMessage: { type: String, default: "" },
})

const emit = defineEmits(["update:modelValue", "change", "blur"])

const inputId = `work-filter-${Math.random().toString(36).slice(2)}`
const helpId = `${inputId}-help`
const errorId = `${inputId}-error`
const multiselectId = `${inputId}-multiselect`

const multiselectOpen = ref(false)

const describedByIds = computed(() => {
	const ids = []
	if (props.field.help && !props.errorMessage) ids.push(helpId)
	if (props.errorMessage) ids.push(errorId)
	return ids.join(" ") || undefined
})

function isSelected(value) {
	const val = props.modelValue
	return Array.isArray(val) && val.includes(value)
}

function toggleMultiselect() {
	if (!props.disabled) multiselectOpen.value = !multiselectOpen.value
}

function toggleMultiselectOption(value) {
	const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
	const index = current.indexOf(value)
	if (index >= 0) current.splice(index, 1)
	else current.push(value)
	emit("update:modelValue", current)
}

function handleChange(e) {
	emit("update:modelValue", e.target.value)
	emit("change", e.target.value)
}

function handleBlur(e) {
	emit("blur", e)
}

// Close multiselect on outside click
function handleClickOutside(e) {
	if (
		multiselectOpen.value &&
		!e.target.closest(".work-filter-field__multiselect")
	) {
		multiselectOpen.value = false
	}
}

onMounted(() => {
	document.addEventListener("click", handleClickOutside)
})

onUnmounted(() => {
	document.removeEventListener("click", handleClickOutside)
})
</script>

<style scoped>
/* ============================================================================
   WorkFilterField — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-filter-field {
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-1, 4px);
}

.work-filter-field--disabled {
  opacity: 0.6;
}

/* Label */
.work-filter-field__label {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-1, 4px);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-medium, 500);
  color: var(--dy-color-text-secondary, #334155);
}

.work-filter-field__required {
  color: var(--dy-color-status-danger-icon, #ef4444);
}

/* Control */
.work-filter-field__control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
}

/* Inputs */
.work-filter-field__input,
.work-filter-field__select {
  width: 100%;
  min-width: 180px;
  height: var(--dy-components-input-height-md, 40px);
  padding: 0 var(--dy-components-input-padding, 12px);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
  background: var(--dy-color-surface-base, #ffffff);
  color: var(--dy-color-text-primary, #0f172a);
  font-family: var(--dy-font-family-sans, inherit);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  line-height: 1.5;
  transition:
    border-color var(--dy-motion-duration-fast, 100ms),
    box-shadow var(--dy-motion-duration-fast, 100ms),
    background-color var(--dy-motion-duration-fast, 100ms);
}

.work-filter-field__input::placeholder,
.work-filter-field__select:invalid {
  color: var(--dy-color-text-disabled, #94a3b8);
}

.work-filter-field__input:hover,
.work-filter-field__select:hover {
  border-color: var(--dy-color-surface-border-strong, #cbd5e1);
}

.work-filter-field__input:focus,
.work-filter-field__select:focus {
  outline: none;
  border-color: var(--dy-color-brand-500, #10b981);
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

.work-filter-field__input:disabled,
.work-filter-field__select:disabled {
  background: var(--dy-color-surface-overlay, #f8fafc);
  color: var(--dy-color-text-disabled, #94a3b8);
  cursor: not-allowed;
}

/* Error state */
.work-filter-field--error .work-filter-field__input,
.work-filter-field--error .work-filter-field__select {
  border-color: var(--dy-color-status-danger-icon, #ef4444);
}
.work-filter-field--error .work-filter-field__input:focus,
.work-filter-field--error .work-filter-field__select:focus {
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-color-status-danger-icon, #ef4444),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

/* Select */
.work-filter-field__select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}
:dir(rtl) .work-filter-field__select {
  background-position: left 12px center;
  padding-right: 12px;
  padding-left: 36px;
}

/* Multiselect */
.work-filter-field__multiselect {
  width: 100%;
  min-width: 180px;
  position: relative;
}

.work-filter-field__multiselect-trigger {
  width: 100%;
  justify-content: space-between;
  text-align: start;
}

.work-filter-field__multiselect-label {
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-filter-field__multiselect-menu {
  position: absolute;
  top: calc(100% + 4px);
  inset-inline-start: 0;
  inset-inline-end: 0;
  z-index: var(--dy-zIndex-dropdown, 100);
  max-height: 240px;
  overflow-y: auto;
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
  box-shadow: var(--dy-elevation-4, 0 10px 15px -3px rgba(15, 23, 42, 0.1));
  padding: var(--dy-spacing-1, 4px);
}

.work-filter-field__multiselect-option {
  display: flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
  border-radius: var(--dy-radius-md, 6px);
  cursor: pointer;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  color: var(--dy-color-text-primary, #0f172a);
  transition: background-color var(--dy-motion-duration-fast, 100ms);
}
.work-filter-field__multiselect-option:hover {
  background: var(--dy-color-surface-overlay, #f8fafc);
}
.work-filter-field__multiselect-option[aria-selected="true"] {
  background: var(--dy-color-brand-50, #ecfdf5);
  color: var(--dy-color-brand-700, #047857);
}
.work-filter-field__multiselect-option:focus-visible {
  outline: none;
  box-shadow:
    inset 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}

.work-filter-field__multiselect-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--dy-color-brand-500, #10b981);
  flex-shrink: 0;
}

/* Date Range */
.work-filter-field__daterange {
  display: flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  width: 100%;
}
.work-filter-field__daterange .work-filter-field__input {
  flex: 1;
  min-width: 140px;
}
.work-filter-field__daterange-separator {
  color: var(--dy-color-text-muted, #94a3b8);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  white-space: nowrap;
}

/* Checkbox */
.work-filter-field__checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  cursor: pointer;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  color: var(--dy-color-text-secondary, #334155);
}
.work-filter-field__checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--dy-color-brand-500, #10b981);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border-strong, #cbd5e1);
  border-radius: var(--dy-radius-sm, 4px);
  flex-shrink: 0;
}
.work-filter-field__checkbox:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}
.work-filter-field__checkbox-text {
  user-select: none;
}

/* Help / Error */
.work-filter-field__help,
.work-filter-field__error {
  margin: 0;
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
  line-height: var(--dy-typography-lineHeight-normal, 1.6);
}
.work-filter-field__help {
  color: var(--dy-color-text-muted, #64748b);
}
.work-filter-field__error {
  color: var(--dy-color-status-danger-text, #991b1b);
}

/* Transitions */
.work-filter-fade-enter-active,
.work-filter-fade-leave-active {
  transition: opacity var(--dy-motion-duration-fast, 100ms), transform var(--dy-motion-duration-fast, 100ms);
}
.work-filter-fade-enter-from,
.work-filter-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-filter-field__input,
  .work-filter-field__select,
  .work-filter-field__multiselect-option,
  .work-filter-fade-enter-active,
  .work-filter-fade-leave-active {
    transition: none;
  }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-filter-field__input,
  .work-filter-field__select,
  .work-filter-field__multiselect-menu,
  .work-filter-field__checkbox {
    border-color: CanvasText;
    background: Canvas;
    color: CanvasText;
  }
  .work-filter-field__input:focus,
  .work-filter-field__select:focus,
  .work-filter-field__checkbox:focus-visible {
    outline-color: Highlight;
  }
  .work-filter-field__multiselect-option[aria-selected="true"] {
    background: Highlight;
    color: HighlightText;
  }
}
</style>