/**
 * WorkForm — نموذج متقدم مع حقول ديناميكية، تبعيات، ومصفوفات حقول.
 *
 * Features:
 *  - Schema-driven form definition
 *  - Dependent fields (show/hide based on other field values)
 *  - Dynamic field arrays (add/remove/reorder items)
 *  - Field-level validation with async support
 *  - Layout: vertical, horizontal, grid, accordion
 *  - Auto-save drafts
 *  - Dirty tracking and unsaved changes warning
 *  - RTL-first, WCAG 2.2 AA
 */
<template>
  <form
    class="work-form"
    :class="[
      `work-form--${layout}`,
      { 'work-form--dirty': dirty },
      { 'work-form--submitting': submitting },
    ]"
    @submit.prevent="handleSubmit"
    novalidate
  >
    <!-- Error Summary -->
    <div
      v-if="errorSummary.length"
      class="work-form__error-summary"
      role="alert"
      :aria-label="t('formErrors')"
    >
      <h4 class="work-form__error-title">{{ t('fixErrors') }}</h4>
      <ul class="work-form__error-list">
        <li v-for="err in errorSummary" :key="err.field">
          <a :href="`#${err.field}`" @click.prevent="focusField(err.field)">
            {{ t(err.message) }}
          </a>
        </li>
      </ul>
    </div>

    <!-- Layout: Grid -->
    <div
      v-if="layout === 'grid'"
      class="work-form__grid"
      :style="{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }"
    >
      <WorkFormField
        v-for="field in visibleFields"
        :key="field.path"
        :field="field"
        :model="getModelValue(field.path)"
        :errors="getFieldErrors(field.path)"
        :disabled="disabled || submitting"
        @update:modelValue="(val) => setModelValue(field.path, val)"
        @blur="markFieldTouched(field.path)"
        @change="markFieldDirty(field.path)"
      />
    </div>

    <!-- Layout: Vertical / Horizontal -->
    <div v-else class="work-form__fields">
      <template v-for="field in visibleFields" :key="field.path">
        <WorkFormField
          :field="field"
          :model="getModelValue(field.path)"
          :errors="getFieldErrors(field.path)"
          :disabled="disabled || submitting"
          :layout="layout"
          :label-width="labelWidth"
          @update:modelValue="(val) => setModelValue(field.path, val)"
          @blur="markFieldTouched(field.path)"
          @change="markFieldDirty(field.path)"
        />
      </template>

      <!-- Field Array Sections -->
      <template v-for="arrayDef in fieldArrays" :key="arrayDef.key">
        <FieldArraySection
          :key="arrayDef.key"
          :definition="arrayDef"
          :model="getModelValue(arrayDef.key)"
          :disabled="disabled || submitting"
          @update:modelValue="(val) => setModelValue(arrayDef.key, val)"
        />
      </template>
    </div>

    <!-- Actions -->
    <div v-if="$slots.actions || actions.length" class="work-form__actions">
      <slot name="actions">
        <WorkActions
          :primary-actions="primaryActions"
          :secondary-actions="secondaryActions"
        />
      </slot>
    </div>

    <!-- Auto-save indicator -->
    <div
      v-if="autoSave && lastSaved"
      class="work-form__autosave"
      :class="{ 'work-form__autosave--saving': saving }"
    >
      <FeatherIcon
        :name="saving ? 'loader' : 'save'"
        :class="['w-4 h-4', saving ? 'animate-spin text-blue-600' : 'text-green-600']"
        aria-hidden="true"
      />
      <span v-if="saving">{{ t('saving') }}</span>
      <span v-else>{{ t('savedAt', [formatTime(lastSaved)]) }}</span>
    </div>
  </form>
</template>

<script setup>
import {
	ref,
	computed,
	watch,
	onMounted,
	onBeforeUnmount,
	nextTick,
	inject,
	provide,
} from "vue"
import { t } from "@/utils/translation"
import WorkActions from "./WorkActions.vue"

import WorkFormField from "./WorkFormField.vue"
import FieldArraySection from "./WorkFormFieldArray.vue"

const props = defineProps({
	/** Form schema definition */
	schema: {
		type: Object,
		required: true,
		// {
		//   fields: [{ key, label, type, required?, validation?, dependsOn?, visibleIf?, options?, placeholder?, help?, gridSpan? }],
		//   fieldArrays: [{ key, label, itemSchema, minItems?, maxItems?, addLabel? }],
		//   layout: 'vertical'|'horizontal'|'grid',
		//   gridColumns: 2,
		//   labelWidth: '160px',
		// }
	},
	/** Initial model data */
	modelValue: { type: Object, default: () => ({}) },
	/** Layout: vertical | horizontal | grid */
	layout: {
		type: String,
		default: "vertical",
		validator: (v) => ["vertical", "horizontal", "grid"].includes(v),
	},
	/** Grid columns (for grid layout) */
	gridColumns: { type: Number, default: 2 },
	/** Label width (horizontal layout) */
	labelWidth: { type: String, default: "160px" },
	/** Disabled state */
	disabled: { type: Boolean, default: false },
	/** Auto-save to localStorage */
	autoSave: { type: Boolean, default: true },
	/** Auto-save key */
	autoSaveKey: { type: String, default: "" },
	/** Auto-save interval (ms) */
	autoSaveInterval: { type: Number, default: 5000 },
	/** Show dirty indicator */
	showDirty: { type: Boolean, default: true },
	/** Custom actions */
	actions: { type: Array, default: () => [] },
})

const emit = defineEmits([
	"update:modelValue",
	"submit",
	"cancel",
	"change",
	"dirty-change",
	"save-draft",
	"draft-saved",
])

const localModel = ref({ ...props.modelValue })
const dirty = ref(false)
const submitting = ref(false)
const saving = ref(false)
const lastSaved = ref(null)
const touchedFields = ref(new Set())
const fieldErrors = ref({})
const fieldArrayModels = ref({})

const autosaveTimer = ref(null)

const visibleFields = computed(() => {
	const fields = props.schema.fields || []
	return fields.filter((field) => {
		if (!field.visibleIf) return true
		const condition = field.visibleIf
		const model = localModel.value
		if (typeof condition === "function") return condition(model)
		if (typeof condition === "object") {
			return Object.entries(condition).every(([key, value]) => {
				const modelVal = getNestedValue(model, key)
				return Array.isArray(value)
					? value.includes(modelVal)
					: modelVal === value
			})
		}
		return true
	})
})

const fieldArrays = computed(() => props.schema.fieldArrays || [])

const primaryActions = computed(() => [
	{
		id: "submit",
		label: t("submit"),
		icon: "save",
		variant: "primary",
		handler: handleSubmit,
		disabled: submitting,
	},
	{
		id: "save",
		label: t("saveDraft"),
		icon: "save",
		variant: "secondary",
		handler: saveDraft,
		disabled: submitting || !dirty.value,
	},
])

const secondaryActions = computed(() => [
	{
		id: "cancel",
		label: t("cancel"),
		icon: "x",
		variant: "ghost",
		handler: handleCancel,
		disabled: submitting,
	},
	{
		id: "reset",
		label: t("reset"),
		icon: "refresh-ccw",
		variant: "ghost",
		handler: resetForm,
		disabled: submitting || !dirty.value,
	},
])

const { autoSave } = inject("formAutoSave", {
	autoSave: computed(() => props.autoSave),
})

function getNestedValue(obj, path) {
	return path.split(".").reduce((o, k) => o?.[k], obj)
}

function setNestedValue(obj, path, value) {
	const keys = path.split(".")
	const last = keys.pop()
	const target = keys.reduce((o, k) => {
		if (!o[k]) o[k] = {}
		return o[k]
	}, obj)
	target[last] = value
}

function getModelValue(path) {
	const keys = path.split(".")
	let current = localModel.value
	for (const key of keys) {
		if (current === undefined || current === null) return undefined
		current = current[key]
	}
	return current
}

function setModelValue(path, value) {
	setNestedValue(localModel.value, path, value)
	localModel.value = { ...localModel.value }
	dirty.value = true
	emit("update:modelValue", { ...localModel.value })
	emit("change", path, value)
}

function getFieldErrors(path) {
	return fieldErrors.value[path] || []
}

function markFieldTouched(path) {
	touchedFields.value.add(path)
}

function markFieldDirty(path) {
	dirty.value = true
}

function validateField(path) {
	const field = findField(path)
	if (!field || !field.validation) return true

	const value = getModelValue(path)
	const errors = []

	if (field.validation.required && (value == null || value === "")) {
		errors.push(t("fieldRequired", [t(field.label)]))
	}

	if (
		field.validation.minLength &&
		value &&
		value.length < field.validation.minLength
	) {
		errors.push(t("minLength", [t(field.label), field.validation.minLength]))
	}

	if (
		field.validation.maxLength &&
		value &&
		value.length > field.validation.maxLength
	) {
		errors.push(t("maxLength", [t(field.label), field.validation.maxLength]))
	}

	if (
		field.validation.pattern &&
		value &&
		!new RegExp(field.validation.pattern).test(value)
	) {
		errors.push(t("invalidFormat", [t(field.label)]))
	}

	if (
		field.validation.custom &&
		typeof field.validation.custom === "function"
	) {
		const customError = field.validation.custom(
			getModelValue(path),
			localModel.value,
		)
		if (customError) errors.push(t(customError))
	}

	if (field.validation.async && typeof field.validation.async === "function") {
		field.validation.async(value, localModel.value).then((err) => {
			if (err) {
				fieldErrors.value = { ...fieldErrors.value, [path]: [t(err)] }
			} else {
				const current = fieldErrors.value[path] || []
				fieldErrors.value = {
					...fieldErrors.value,
					[path]: current.filter((e) => !e.includes("async")),
				}
			}
		})
	}

	fieldErrors.value = { ...fieldErrors.value, [path]: errors }
	return errors.length === 0
}

function findField(path) {
	const findInFields = (fields) => {
		for (const field of fields) {
			if (field.key === path) return field
			if (field.fields) {
				const found = findInFields(field.fields)
				if (found) return found
			}
		}
		return null
	}

	return findInFields(props.schema.fields || [])
}

function validateAll() {
	let valid = true
	for (const field of props.schema.fields || []) {
		if (!validateField(field.key)) valid = false
	}
	for (const array of props.schema.fieldArrays || []) {
		const items = getModelValue(array.key) || []
		for (let i = 0; i < items.length; i++) {
			for (const field of array.itemSchema.fields || []) {
				if (!validateField(`${array.key}.${i}.${field.key}`)) valid = false
			}
		}
	}

	const summary = []
	for (const [path, errors] of Object.entries(fieldErrors.value)) {
		for (const error of errors) {
			summary.push({ field: path, message: error })
		}
	}

	return { valid, errors: fieldErrors.value, summary }
}

async function handleSubmit(e) {
	e.preventDefault()
	if (submitting.value) return

	const validation = validateAll()
	if (!validation.valid) {
		// Focus first error
		const firstError = Object.keys(fieldErrors.value)[0]
		if (firstError) focusField(firstError)
		return
	}

	submitting.value = true
	try {
		await emit("submit", { ...localModel.value })
		dirty.value = false
		clearAutoSave()
	} catch (e) {
		console.error("Submit error:", e)
	} finally {
		submitting.value = false
	}
}

function handleCancel() {
	if (dirty.value && !confirm(t("confirmCancel"))) return
	emit("cancel")
}

function resetForm() {
	if (!confirm(t("confirmReset"))) return
	localModel.value = { ...props.modelValue }
	dirty.value = false
	fieldErrors.value = {}
	touchedFields.value.clear()
	clearAutoSave()
	emit("update:modelValue", { ...localModel.value })
}

function focusField(path) {
	const field = findField(path)
	if (field) {
		nextTick(() => {
			const el = document.querySelector(
				`[data-field-path="${path}"] input, [data-field-path="${path}"] select, [data-field-path="${path}"] textarea`,
			)
			el?.focus()
		})
	}
}

function formatTime(ts) {
	return new Date(ts).toLocaleTimeString("ar-SA", {
		hour: "2-digit",
		minute: "2-digit",
	})
}

// Auto-save
function setupAutoSave() {
	if (!props.autoSave || !props.autoSaveKey) return

	autosaveTimer.value = setInterval(() => {
		if (dirty.value && !submitting.value && !saving.value) {
			saveDraft()
		}
	}, props.autoSaveInterval)

	// Load draft
	try {
		const saved = localStorage.getItem(props.autoSaveKey)
		if (saved) {
			const data = JSON.parse(saved)
			if (data.model && Object.keys(data.model).length > 0) {
				localModel.value = { ...props.modelValue, ...data.model }
				emit("update:modelValue", { ...localModel.value })
			}
			if (data.lastSaved) lastSaved.value = data.lastSaved
		}
	} catch (e) {
		/* ignore */
	}
}

function saveDraft() {
	if (!props.autoSaveKey) return
	saving.value = true
	try {
		const data = { model: localModel.value, lastSaved: Date.now() }
		localStorage.setItem(props.autoSaveKey, JSON.stringify(data))
		lastSaved.value = Date.now()
		emit("draft-saved")
	} catch (e) {
		console.error("Draft save failed:", e)
	} finally {
		saving.value = false
	}
}

function clearAutoSave() {
	if (!props.autoSaveKey) return
	localStorage.removeItem(props.autoSaveKey)
	lastSaved.value = null
}

function setupBeforeUnload() {
	window.addEventListener("beforeunload", handleBeforeUnload)
}

function handleBeforeUnload(e) {
	if (dirty.value && props.showDirty) {
		e.preventDefault()
		e.returnValue = t("unsavedChanges")
		return t("unsavedChanges")
	}
}

onMounted(() => {
	setupAutoSave()
	setupBeforeUnload()

	// Initialize model with defaults
	for (const field of props.schema.fields || []) {
		if (field.default !== undefined && getModelValue(field.key) === undefined) {
			setNestedValue(localModel.value, field.key, field.default)
		}
	}
	for (const array of props.schema.fieldArrays || []) {
		if (getModelValue(array.key) === undefined) {
			setNestedValue(localModel.value, array.key, array.defaultValue || [])
		}
	}
	localModel.value = { ...localModel.value }
})

onBeforeUnmount(() => {
	if (autosaveTimer.value) clearInterval(autosaveTimer.value)
	window.removeEventListener("beforeunload", handleBeforeUnload)
})

// Expose form API
provide("formApi", {
	validate: validateAll,
	validateField,
	getModel: () => localModel.value,
	setModel: (model) => {
		localModel.value = { ...model }
		dirty.value = true
		emit("update:modelValue", { ...localModel.value })
	},
	getErrors: () => fieldErrors.value,
	isDirty: () => dirty.value,
	reset: resetForm,
	submit: handleSubmit,
})
</script>

<style scoped>
/* ============================================================================
   WorkForm — Advanced Schema-Driven Form
   ============================================================================ */

.work-form {
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-6, 24px);
}

.work-form--dirty .work-form__autosave { display: flex; }

/* Error Summary */
.work-form__error-summary {
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-2, 8px);
  padding: var(--dy-spacing-4, 16px);
  background: var(--dy-color-status-danger-weak, #fee2e2);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-status-danger-border, #fecaca);
  border-radius: var(--dy-radius-lg, 8px);
  color: var(--dy-color-status-danger-text, #991b1b);
}

.work-form__error-title {
  margin: 0;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-semibold, 600);
}

.work-form__error-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-1, 4px);
}
.work-form__error-list a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.work-form__error-list a:hover { color: var(--dy-color-status-danger-icon, #ef4444); }
.work-form__error-list a:focus-visible {
  outline: none;
  box-shadow: 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669), 0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
  border-radius: 2px;
}

/* Grid Layout */
.work-form__grid {
  display: grid;
  gap: var(--dy-spacing-5, 20px);
  align-items: start;
}

/* Fields */
.work-form__fields {
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-5, 20px);
}

.work-form--horizontal .work-form__fields {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-end;
}

/* Actions */
.work-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--dy-spacing-3, 12px);
  padding-top: var(--dy-spacing-4, 16px);
  border-top: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}
.work-form--inline .work-form__actions { justify-content: stretch; }
.work-form--inline .work-form__actions .dy-btn { flex: 1; }

/* Auto-save */
.work-form__autosave {
  display: none;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
  background: var(--dy-color-status-success-weak, #dcfce7);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-status-success-border, #bbf7d0);
  border-radius: var(--dy-radius-lg, 8px);
  color: var(--dy-color-status-success-text, #166534);
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
  font-weight: 500;
}

.work-form__autosave--saving {
  background: var(--dy-color-status-info-weak, #dbeafe);
  border-color: var(--dy-color-status-info-border, #bfdbfe);
  color: var(--dy-color-status-info-text, #1e40af);
}

/* Responsive */
@media (max-width: 768px) {
  .work-form--horizontal .work-form__fields { flex-direction: column; align-items: stretch; }
  .work-form--horizontal .work-form__fields > * { width: 100%; }
  .work-form--inline { flex-direction: column; align-items: stretch; }
  .work-form--inline .work-form__fields { flex-direction: column; }
  .work-form--inline .work-form__actions { justify-content: stretch; }
  .work-form--inline .work-form__actions .dy-btn { flex: 1; }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-form__autosave { transition: none; }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-form__error-summary { border-color: CanvasText; background: Canvas; color: CanvasText; }
  .work-form__actions { border-color: CanvasText; }
}
</style>