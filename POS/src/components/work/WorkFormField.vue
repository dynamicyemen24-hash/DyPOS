/**
 * WorkFormField — حقل نموذج موحد مع جميع أنواع المدخلات.
 *
 * Supports: text, email, password, number, tel, url, textarea, select, multiselect,
 * date, datetime, time, checkbox, radio, switch, file, color, rating, slider, autocomplete
 */
<template>
  <div
    class="work-form-field"
    :class="[
      `work-form-field--${field.type}`,
      { 'work-form-field--required': field.required },
      { 'work-form-field--error': errors.length > 0 && (touched || showErrors) },
      { 'work-form-field--disabled': disabled },
      { 'work-form-field--touched': touched },
      { 'work-form-field--grid': gridSpan > 1 },
    ]"
    :style="gridSpan > 1 ? { gridColumn: `span ${gridSpan}` } : undefined"
  >
    <label
      v-if="field.label && type !== 'checkbox' && type !== 'switch' && type !== 'radio'"
      :for="inputId"
      class="work-form-field__label"
    >
      {{ t(field.label) }}
      <span v-if="field.required" class="work-form-field__required" aria-hidden="true">*</span>
    </label>

    <div class="work-form-field__control" :role="type === 'radio' ? 'radiogroup' : undefined">
      <!-- Text / Email / Password / Number / Tel / URL -->
      <input
        v-if="isTextType"
        :id="inputId"
        :type="type"
        v-model="localValue"
        :placeholder="t(field.placeholder || '')"
        :disabled="disabled"
        :aria-invalid="errors.length > 0"
        :aria-describedby="describedByIds"
        :aria-required="field.required"
        :autocomplete="field.autocomplete"
        :maxlength="field.maxLength"
        :minlength="field.minLength"
        :step="field.step"
        :min="field.min"
        :max="field.max"
        class="work-form-field__input"
        @blur="handleBlur"
        @focus="handleFocus"
        @input="handleInput"
      />

      <!-- Textarea -->
      <textarea
        v-else-if="type === 'textarea'"
        :id="inputId"
        v-model="localValue"
        :placeholder="t(field.placeholder || '')"
        :disabled="disabled"
        :aria-invalid="errors.length > 0"
        :aria-describedby="describedByIds"
        :aria-required="field.required"
        :rows="field.rows || 4"
        :maxlength="field.maxLength"
        class="work-form-field__textarea"
        @blur="handleBlur"
        @focus="handleFocus"
        @input="handleInput"
      />

      <!-- Select (single) -->
      <select
        v-else-if="type === 'select'"
        :id="inputId"
        v-model="localValue"
        :disabled="disabled"
        :aria-invalid="errors.length > 0"
        :aria-describedby="describedByIds"
        :aria-required="field.required"
        class="work-form-field__select"
        @change="handleChange"
        @blur="handleBlur"
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
      <div v-else-if="type === 'multiselect'" class="work-form-field__multiselect">
        <WorkSelect
          :model-value="localValue"
          :options="field.options"
          :placeholder="t(field.placeholder || 'selectOptions')"
          :disabled="disabled"
          :multiple="true"
          :searchable="field.searchable !== false"
          @update:modelValue="handleChange"
          @blur="handleBlur"
        />

      <!-- Date / DateTime / Time -->
      <input
        v-else-if="['date', 'datetime', 'time', 'month', 'week'].includes(type)"
        :id="inputId"
        :type="type"
        v-model="localValue"
        :disabled="disabled"
        :aria-invalid="errors.length > 0"
        :aria-describedby="describedByIds"
        :aria-required="field.required"
        :min="field.min"
        :max="field.max"
        class="work-form-field__input"
        @blur="handleBlur"
        @focus="handleFocus"
        @change="handleChange"
      />

      <!-- Checkbox -->
      <label v-else-if="type === 'checkbox'" class="work-form-field__checkbox-label">
        <input
          :id="inputId"
          type="checkbox"
          v-model="localValue"
          :disabled="disabled"
          :aria-invalid="errors.length > 0"
          :aria-describedby="describedByIds"
          :aria-required="field.required"
          class="work-form-field__checkbox"
          @blur="handleBlur"
          @change="handleChange"
        />
        <span class="work-form-field__checkbox-text">{{ t(field.label) }}</span>
      </label>

      <!-- Switch -->
      <label v-else-if="type === 'switch'" class="work-form-field__switch-label">
        <div class="work-form-field__switch-wrapper">
          <input
            :id="inputId"
            type="checkbox"
            v-model="localValue"
            :disabled="disabled"
            :aria-invalid="errors.length > 0"
            :aria-describedby="describedByIds"
            :aria-required="field.required"
            class="work-form-field__switch-input"
            @blur="handleBlur"
            @change="handleChange"
          />
          <span class="work-form-field__switch-track" aria-hidden="true">
            <span class="work-form-field__switch-thumb" />
          </span>
        </div>
        <span class="work-form-field__switch-text">{{ t(field.label) }}</span>
      </label>

      <!-- Radio Group -->
      <fieldset v-else-if="type === 'radio'" class="work-form-field__radio-group" :aria-label="t(field.label)">
        <legend class="sr-only">{{ t(field.label) }}</legend>
        <div class="work-form-field__radio-options">
          <label
            v-for="opt in field.options"
            :key="opt.value"
            class="work-form-field__radio-option"
          >
            <input
              type="radio"
              :value="opt.value"
              v-model="localValue"
              :disabled="disabled"
              :name="inputId"
              class="work-form-field__radio-input"
              @change="handleChange"
            />
            <span class="work-form-field__radio-text">{{ t(opt.label) }}</span>
          </label>
        </div>
      </fieldset>

      <!-- File Upload -->
      <div v-else-if="type === 'file'" class="work-form-field__file-upload">
        <input
          :id="inputId"
          type="file"
          :disabled="disabled"
          :accept="field.accept"
          :multiple="field.multiple"
          :aria-invalid="errors.length > 0"
          :aria-describedby="describedByIds"
          :aria-required="field.required"
          class="work-form-field__file-input"
          @change="handleFileChange"
          hidden
          ref="fileInput"
        />
        <label :for="inputId" class="work-form-field__file-label" @click.stop="fileInput?.click()">
          <FeatherIcon name="upload" class="w-5 h-5" aria-hidden="true" />
          <span>{{ localValue?.length ? t('filesSelected', [localValue.length]) : t(field.placeholder || 'chooseFile') }}</span>
        </label>
        <div v-if="localValue?.length" class="work-form-field__file-list">
          <span
            v-for="(file, i) in localValue"
            :key="i"
            class="work-form-field__file-item"
          >
            <FeatherIcon :name="fileIcon(file)" class="w-4 h-4" aria-hidden="true" />
            <span>{{ file.name }}</span>
            <span class="work-form-field__file-size">{{ formatFileSize(file.size) }}</span>
            <button type="button" class="work-form-field__file-remove" @click="removeFile(i)" :aria-label="t('removeFile', [file.name])">
              <FeatherIcon name="x" class="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      </div>

      <!-- Color Picker -->
      <input
        v-else-if="type === 'color'"
        :id="inputId"
        type="color"
        v-model="localValue"
        :disabled="disabled"
        :aria-invalid="errors.length > 0"
        :aria-describedby="describedByIds"
        class="work-form-field__color-input"
        @change="handleChange"
      />

      <!-- Rating -->
      <div v-else-if="type === 'rating'" class="work-form-field__rating" role="radiogroup" :aria-label="t(field.label)">
        <label v-for="i in field.max || 5" :key="i" class="work-form-field__rating-star">
          <input
            type="radio"
            :value="i"
            v-model="localValue"
            :name="inputId"
            :disabled="disabled"
            class="work-form-field__rating-input"
            @change="handleChange"
          />
          <FeatherIcon
            :name="localValue >= i ? 'star' : 'star'"
            :class="['w-6 h-6', localValue >= i ? 'text-yellow-500' : 'text-gray-300']"
            aria-hidden="true"
          />
        </label>
      </div>

      <!-- Slider -->
      <div v-else-if="type === 'slider'" class="work-form-field__slider">
        <input
          :id="inputId"
          type="range"
          v-model="localValue"
          :min="field.min || 0"
          :max="field.max || 100"
          :step="field.step || 1"
          :disabled="disabled"
          :aria-invalid="errors.length > 0"
          :aria-describedby="describedByIds"
          class="work-form-field__slider-input"
          @input="handleInput"
          @change="handleChange"
        />
        <output class="work-form-field__slider-value">{{ localValue }}</output>
      </div>

      <!-- Autocomplete -->
      <WorkSearch
        v-else-if="type === 'autocomplete'"
        v-model="localValue"
        :placeholder="t(field.placeholder || 'search')"
        :suggestions="field.suggestions || []"
        :loading="field.loading"
        :disabled="disabled"
        :debounce="field.debounce || 300"
        @search="field.onSearch"
        @select="handleChange"
        @blur="handleBlur"
      />

      <!-- Hidden -->
      <input v-else-if="type === 'hidden'" type="hidden" v-model="localValue" />

      <!-- Custom Component Slot -->
      <slot v-else :name="field.key" :field="field" :model="localValue" :errors="errors" :disabled="disabled" />

      <!-- Help Text -->
      <p
        v-if="field.help && !errors.length"
        :id="helpId"
        class="work-form-field__help"
      >
        {{ t(field.help) }}
      </p>

      <!-- Error Messages -->
      <ul
        v-if="errors.length"
        :id="errorId"
        class="work-form-field__errors"
        role="alert"
      >
        <li v-for="(error, i) in errors" :key="i">{{ t(error) }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue"
import { t } from "@/utils/translation"
import { FeatherIcon } from "frappe-ui"
import WorkSearch from "./WorkSearch.vue"

const props = defineProps({
	field: {
		type: Object,
		required: true,
		// { key, label, type, required, placeholder, help, options, validation, autocomplete, rows, min, max, step, minLength, maxLength, accept, multiple, searchable, max, min, maxLength, minLength, pattern, custom, async, dependsOn, visibleIf, gridSpan, default }
	},
	modelValue: {
		type: [String, Number, Boolean, Array, Object, Date, File, FileList],
		default: null,
	},
	errors: { type: Array, default: () => [] },
	disabled: { type: Boolean, default: false },
	layout: {
		type: String,
		default: "vertical",
		validator: (v) => ["vertical", "horizontal"].includes(v),
	},
	labelWidth: { type: String, default: "160px" },
	showErrors: { type: Boolean, default: true },
})

const emit = defineEmits(["update:modelValue", "blur", "focus", "change"])

const inputId = `work-field-${Math.random().toString(36).slice(2)}`
const helpId = `${inputId}-help`
const errorId = `${inputId}-error`

const touched = ref(false)
const focused = ref(false)

const localValue = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
})

const type = computed(() => props.field.type || "text")

const isTextType = computed(() =>
	["text", "email", "password", "number", "tel", "url", "search"].includes(
		type.value,
	),
)

const gridSpan = computed(() => props.field.gridSpan || 1)

const describedByIds = computed(() => {
	const ids = []
	if (props.field.help && !props.errors.length) ids.push(helpId)
	if (props.errors.length) ids.push(errorId)
	return ids.join(" ") || undefined
})

function handleBlur(e) {
	touched.value = true
	focused.value = false
	emit("blur", e)
}

function handleFocus(e) {
	focused.value = true
	emit("focus", e)
}

function handleInput(e) {
	emit("update:modelValue", e.target.value)
}

function handleChange(e) {
	const val =
		e.target.type === "checkbox"
			? e.target.checked
			: e.target.type === "select-multiple"
				? Array.from(e.target.selectedOptions).map((o) => o.value)
				: e.target.files
					? Array.from(e.target.files)
					: e.target.value
	emit("update:modelValue", val)
	emit("change", val)
}

function handleFileChange(e) {
	const files = e.target.files ? Array.from(e.target.files) : []
	emit("update:modelValue", files)
	emit("change", files)
}

function removeFile(index) {
	const files = Array.isArray(localValue.value) ? [...localValue.value] : []
	files.splice(index, 1)
	emit("update:modelValue", files)
	emit("change", files)
}

function fileIcon(file) {
	if (file.type.startsWith("image/")) return "image"
	if (file.type.startsWith("video/")) return "video"
	if (file.type.startsWith("audio/")) return "music"
	if (file.type === "application/pdf") return "file-text"
	if (file.type.includes("spreadsheet") || file.type.includes("excel"))
		return "table"
	if (file.type.includes("word") || file.type.includes("document"))
		return "file-text"
	if (file.type.includes("zip") || file.type.includes("rar")) return "archive"
	return "file"
}

function formatFileSize(bytes) {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<style scoped>
/* ============================================================================
   WorkFormField — Unified Form Field (All Types)
   ============================================================================ */

.work-form-field {
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-1, 4px);
  width: 100%;
}

.work-form-field--grid { width: 100%; }

.work-form-field--horizontal {
  display: grid;
  grid-template-columns: var(--label-width, 160px) 1fr;
  align-items: center;
  gap: var(--dy-spacing-4, 16px);
}

.work-form-field--horizontal .work-form-field__control { width: 100%; }
.work-form-field--horizontal .work-form-field__label { margin-bottom: 0; }

/* Label */
.work-form-field__label {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-1, 4px);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-medium, 500);
  color: var(--dy-color-text-secondary, #334155);
}

.work-form-field__required {
  color: var(--dy-color-status-danger-icon, #ef4444);
}

/* Control */
.work-form-field__control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  width: 100%;
}

/* Inputs */
.work-form-field__input,
.work-form-field__textarea,
.work-form-field__select {
  width: 100%;
  height: var(--dy-components-input-height-md, 40px);
  padding: 0 var(--dy-components-input-padding, 12px);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
  background: var(--dy-color-surface-base, #ffffff);
  color: var(--dy-color-text-primary, #0f172a);
  font-family: var(--dy-font-family-sans, inherit);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  line-height: 1.5;
  transition: border-color var(--dy-motion-duration-fast, 100ms), box-shadow var(--dy-motion-duration-fast, 100ms);
}

.work-form-field__textarea {
  height: auto;
  min-height: 100px;
  padding: var(--dy-spacing-2, 8px) var(--dy-components-input-padding, 12px);
  resize: vertical;
}

.work-form-field__input::placeholder,
.work-form-field__textarea::placeholder,
.work-form-field__select:invalid {
  color: var(--dy-color-text-disabled, #94a3b8);
}

.work-form-field__input:hover,
.work-form-field__textarea:hover,
.work-form-field__select:hover {
  border-color: var(--dy-color-surface-border-strong, #cbd5e1);
}

.work-form-field__input:focus,
.work-form-field__textarea:focus,
.work-form-field__select:focus {
  outline: none;
  border-color: var(--dy-color-brand-500, #10b981);
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

.work-form-field__input:disabled,
.work-form-field__textarea:disabled,
.work-form-field__select:disabled {
  background: var(--dy-color-surface-overlay, #f8fafc);
  color: var(--dy-color-text-disabled, #94a3b8);
  cursor: not-allowed;
}

.work-form-field--error .work-form-field__input,
.work-form-field--error .work-form-field__textarea,
.work-form-field--error .work-form-field__select {
  border-color: var(--dy-color-status-danger-icon, #ef4444);
}

.work-form-field--error .work-form-field__input:focus,
.work-form-field--error .work-form-field__textarea:focus,
.work-form-field--error .work-form-field__select:focus {
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-color-status-danger-icon, #ef4444),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

/* Select */
.work-form-field__select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}
:dir(rtl) .work-form-field__select {
  background-position: left 12px center;
  padding-right: 12px;
  padding-left: 36px;
}

/* Textarea */
.work-form-field__textarea { font-family: inherit; }

/* Checkbox */
.work-form-field__checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  cursor: pointer;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  color: var(--dy-color-text-secondary, #334155);
}

.work-form-field__checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--dy-color-brand-500, #10b981);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border-strong, #cbd5e1);
  border-radius: var(--dy-radius-sm, 4px);
  flex-shrink: 0;
}

.work-form-field__checkbox:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

.work-form-field__checkbox-text { user-select: none; }

/* Switch */
.work-form-field__switch-label {
  display: flex;
  align-items: center;
  gap: var(--dy-spacing-3, 12px);
  cursor: pointer;
}

.work-form-field__switch-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.work-form-field__switch-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.work-form-field__switch-track {
  display: inline-block;
  width: 44px;
  height: 24px;
  border-radius: var(--dy-radius-full, 9999px);
  background: var(--dy-color-surface-border, #e2e8f0);
  transition: background-color var(--dy-motion-duration-fast, 100ms);
}

.work-form-field__switch-input:checked + .work-form-field__switch-track {
  background: var(--dy-color-brand-500, #10b981);
}

.work-form-field__switch-thumb {
  position: absolute;
  top: 2px;
  inset-inline-start: 2px;
  width: 20px;
  height: 20px;
  border-radius: var(--dy-radius-full, 9999px);
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  transition: transform var(--dy-motion-duration-fast, 100ms);
}

.work-form-field__switch-input:checked + .work-form-field__switch-track .work-form-field__switch-thumb {
  transform: translateX(20px);
}

.work-form-field__switch-input:focus-visible + .work-form-field__switch-track {
  outline: none;
  box-shadow: 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669), 0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

.work-form-field__switch-text { font-size: 0.875rem; color: var(--dy-color-text-secondary, #334155); }

/* Radio Group */
.work-form-field__radio-group { display: flex; flex-direction: column; gap: var(--dy-spacing-2, 8px); }
.work-form-field__radio-options { display: flex; flex-wrap: wrap; gap: var(--dy-spacing-3, 12px); }

.work-form-field__radio-option {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  cursor: pointer;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  color: var(--dy-color-text-secondary, #334155);
}

.work-form-field__radio-input {
  width: 18px;
  height: 18px;
  accent-color: var(--dy-color-brand-500, #10b981);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border-strong, #cbd5e1);
  border-radius: var(--dy-radius-full, 9999px);
  flex-shrink: 0;
}

.work-form-field__radio-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669), 0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

.work-form-field__radio-text { user-select: none; }

/* File Upload */
.work-form-field__file-upload { width: 100%; }
.work-form-field__file-input { display: none; }
.work-form-field__file-label {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-4, 16px);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
  background: var(--dy-color-surface-base, #ffffff);
  color: var(--dy-color-text-secondary, #334155);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  cursor: pointer;
  transition: all var(--dy-motion-duration-fast, 100ms);
}
.work-form-field__file-label:hover { background: var(--dy-color-surface-sunken, #f1f5f9); border-color: var(--dy-color-brand-500, #10b981); }
.work-form-field__file-label:focus-visible { outline: none; box-shadow: 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669), 0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff); }

.work-form-field__file-list { display: flex; flex-wrap: wrap; gap: var(--dy-spacing-2, 8px); margin-top: var(--dy-spacing-2, 8px); }
.work-form-field__file-item {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-1, 4px);
  padding: var(--dy-spacing-1, 4px) var(--dy-spacing-2, 8px);
  background: var(--dy-color-surface-overlay, #f8fafc);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-md, 6px);
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
}
.work-form-field__file-size { color: var(--dy-color-text-muted, #64748b); }
.work-form-field__file-remove { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: 0; border-radius: var(--dy-radius-sm, 4px); background: transparent; color: var(--dy-color-text-muted, #64748b); cursor: pointer; }
.work-form-field__file-remove:hover { background: var(--dy-color-status-danger-weak, #fee2e2); color: var(--dy-color-status-danger-icon, #ef4444); }

/* Color Input */
.work-form-field__color-input {
  width: 60px;
  height: 40px;
  border: none;
  border-radius: var(--dy-radius-md, 6px);
  cursor: pointer;
  padding: 2px;
}

/* Rating */
.work-form-field__rating { display: inline-flex; gap: 4px; direction: ltr; }
.work-form-field__rating-star { display: inline-flex; align-items: center; cursor: pointer; }
.work-form-field__rating-input { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
.work-form-field__rating-star .feather-icon { transition: color 0.15s ease; }
.work-form-field__rating-star:hover .feather-icon { transform: scale(1.1); }

/* Slider */
.work-form-field__slider { display: flex; align-items: center; gap: var(--dy-spacing-3, 12px); width: 100%; }
.work-form-field__slider-input { flex: 1; accent-color: var(--dy-color-brand-500, #10b981); }
.work-form-field__slider-value { min-width: 40px; text-align: end; font-size: 0.75rem; color: var(--dy-color-text-muted, #64748b); font-variant-numeric: tabular-nums; }

/* Help / Errors */
.work-form-field__help,
.work-form-field__errors {
  margin: 0;
  padding: 0;
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
  line-height: var(--dy-typography-lineHeight-normal, 1.6);
}

.work-form-field__help { color: var(--dy-color-text-muted, #64748b); }
.work-form-field__errors { color: var(--dy-color-status-danger-text, #991b1b); list-style: none; display: flex; flex-direction: column; gap: 2px; }

/* RTL */
:dir(rtl) .work-form-field__multiselect { direction: rtl; }
:dir(rtl) .work-form-field__slider { direction: rtl; }

/* High Contrast */
@media (forced-colors: active) {
  .work-form-field__input, .work-form-field__textarea, .work-form-field__select, .work-form-field__checkbox, .work-form-field__radio-input {
    border-color: CanvasText;
    background: Canvas;
    color: CanvasText;
  }
  .work-form-field__input:focus, .work-form-field__textarea:focus, .work-form-field__select:focus, .work-form-field__checkbox:focus-visible, .work-form-field__radio-input:focus-visible {
    outline-color: Highlight;
  }
  .work-form-field__switch-track { background: Canvas; border: 1px solid CanvasText; }
  .work-form-field__switch-input:checked + .work-form-field__switch-track { background: Highlight; }
  .work-form-field__switch-thumb { background: CanvasText; }
  .work-form-field__file-label { border-color: CanvasText; background: Canvas; color: CanvasText; }
}
</style>