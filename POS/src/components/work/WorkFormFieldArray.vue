/**
 * FieldArraySection — قسم مصفوفة حقول ديناميكية (إضافة/حذف/ترتيب/نسخ).
 */
<template>
  <div class="work-form-field-array" :data-array-key="definition.key">
    <div class="work-form-field-array__header">
      <h3 class="work-form-field-array__title">{{ t(definition.label) }}</h3>
      <div class="work-form-field-array__meta">
        <span v-if="minItems || maxItems" class="work-form-field-array__count">
          {{ model?.length || 0 }} / {{ maxItems || '∞' }}
        </span>
      </div>
    </div>

    <div class="work-form-field-array__items">
      <template v-for="(item, index) in model" :key="`${definition.key}-${index}`">
        <div class="work-form-field-array__item" :data-index="index">
          <div class="work-form-field-array__item-header">
            <span class="work-form-field-array__item-number">{{ index + 1 }}</span>
            <h4 class="work-form-field-array__item-title">
              {{ itemLabel(index) }}
            </h4>
            <div class="work-form-field-array__item-actions">
              <button
                type="button"
                class="work-form-field-array__action"
                @click="duplicateItem(index)"
                :disabled="disabled || (maxItems && model.length >= maxItems)"
                :aria-label="t('duplicateItem')"
              >
                <FeatherIcon name="copy" class="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="work-form-field-array__action"
                @click="moveItem(index, -1)"
                :disabled="disabled || index === 0"
                :aria-label="t('moveUp')"
              >
                <FeatherIcon name="chevron-up" class="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="work-form-field-array__action"
                @click="moveItem(index, 1)"
                :disabled="disabled || index === model.length - 1"
                :aria-label="t('moveDown')"
              >
                <FeatherIcon name="chevron-down" class="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="work-form-field-array__action work-form-field-array__action--danger"
                @click="removeItem(index)"
                :disabled="disabled || model.length <= (minItems || 0)"
                :aria-label="t('removeItem')"
              >
                <FeatherIcon name="trash-2" class="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div class="work-form-field-array__item-fields">
            <WorkFormField
              v-for="field in definition.itemSchema.fields"
              :key="field.key"
              :field="field"
              :model="getItemValue(index, field.key)"
              :errors="getItemErrors(index, field.key)"
              :disabled="disabled"
              @update:modelValue="(val) => setItemValue(index, field.key, val)"
              @blur="markItemTouched(index, field.key)"
              @change="markItemDirty(index, field.key)"
            />
          </div>
        </div>
      </template>

      <div v-if="!model.length" class="work-form-field-array__empty">
        <p>{{ t('noItems') }}</p>
        <button
          type="button"
          class="work-form-field-array__add-first"
          @click="addItem"
          :disabled="disabled"
        >
          <FeatherIcon name="plus" class="w-4 h-4" aria-hidden="true" />
          {{ t(definition.addLabel || 'addFirstItem') }}
        </button>
      </div>
    </div>

    <div v-if="model.length && (maxItems === undefined || model.length < maxItems)" class="work-form-field-array__footer">
      <button
        type="button"
        class="work-form-field-array__add"
        @click="addItem"
        :disabled="disabled"
      >
        <FeatherIcon name="plus" class="w-4 h-4" aria-hidden="true" />
        {{ t(definition.addLabel || 'addItem') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from "vue"
import { t } from "@/utils/translation"
import { FeatherIcon } from "frappe-ui"
import WorkFormField from "./WorkFormField.vue"

const props = defineProps({
	definition: {
		type: Object,
		required: true,
		// { key, label, itemSchema: { fields: [] }, minItems?, maxItems?, addLabel?, defaultValue? }
	},
	modelValue: { type: Array, default: () => [] },
	disabled: { type: Boolean, default: false },
})

const emit = defineEmits(["update:modelValue", "change"])

const localModel = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
})

const minItems = computed(() => props.definition.minItems || 0)
const maxItems = computed(() => props.definition.maxItems)
const itemSchema = computed(() => props.definition.itemSchema)

function addItem() {
	if (disabled || (maxItems.value && localModel.value.length >= maxItems.value))
		return
	const newItem = props.definition.defaultValue
		? { ...props.definition.defaultValue }
		: {}
	// Add defaults from schema
	for (const field of itemSchema.value?.fields || []) {
		if (field.default !== undefined && !(field.key in newItem)) {
			newItem[field.key] = field.default
		}
	}
	localModel.value = [...localModel.value, newItem]
	emit("change", { type: "add", index: localModel.value.length - 1 })
}

function removeItem(index) {
	if (disabled || localModel.value.length <= (minItems.value || 0)) return
	if (!confirm(t("confirmRemoveItem"))) return
	localModel.value = localModel.value.filter((_, i) => i !== index)
	emit("change", { type: "remove", index })
}

function moveItem(index, direction) {
	const newIndex = index + direction
	if (newIndex < 0 || newIndex >= localModel.value.length) return
	const newModel = [...localModel.value]
	const [item] = newModel.splice(index, 1)
	newModel.splice(newIndex, 0, item)
	localModel.value = newModel
	emit("change", { type: "move", from: index, to: newIndex })
}

function duplicateItem(index) {
	if (disabled || (maxItems.value && localModel.value.length >= maxItems.value))
		return
	const item = { ...localModel.value[index] }
	localModel.value = [
		...localModel.value.slice(0, index + 1),
		item,
		...localModel.value.slice(index + 1),
	]
	emit("change", { type: "duplicate", index })
}

function getItemValue(itemIndex, fieldKey) {
	const item = localModel.value[itemIndex]
	return item?.[fieldKey]
}

function setItemValue(itemIndex, fieldKey, value) {
	const newModel = [...localModel.value]
	newModel[itemIndex] = { ...newModel[itemIndex], [fieldKey]: value }
	localModel.value = newModel
}

function getItemErrors(itemIndex, fieldKey) {
	// Errors would come from parent form validation
	return []
}

function markItemTouched(index, fieldKey) {
	// Handled by parent
}

function markItemDirty(index, fieldKey) {
	// Handled by parent
}

function itemLabel(index) {
	const item = localModel.value[index]
	if (!item) return t("item", [index + 1])
	// Try to find a good label field
	const labelFields = ["name", "label", "title", "code", "sku", "product"]
	for (const field of labelFields) {
		if (item[field]) return `${index + 1}. ${item[field]}`
	}
	return t("item", [index + 1])
}
</script>

<style scoped>
/* ============================================================================
   FieldArraySection — Dynamic Field Array Section
   ============================================================================ */

.work-form-field-array {
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
  background: var(--dy-color-surface-base, #ffffff);
  overflow: hidden;
}

.work-form-field-array__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  background: var(--dy-color-surface-overlay, #f8fafc);
}

.work-form-field-array__title {
  margin: 0;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-semibold, 600);
  color: var(--dy-color-text-primary, #0f172a);
}

.work-form-field-array__meta {
  display: flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
  color: var(--dy-color-text-muted, #64748b);
}

.work-form-field-array__items { padding: var(--dy-spacing-4, 16px); }

.work-form-field-array__item {
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
  background: var(--dy-color-surface-base, #ffffff);
  margin-bottom: var(--dy-spacing-3, 12px);
  overflow: hidden;
}
.work-form-field-array__item:last-child { margin-bottom: 0; }

.work-form-field-array__item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  background: var(--dy-color-surface-overlay, #f8fafc);
}

.work-form-field-array__item-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--dy-radius-full, 9999px);
  background: var(--dy-color-brand-100, #d1fae5);
  color: var(--dy-color-brand-700, #047857);
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
  font-weight: 700;
}

.work-form-field-array__item-title {
  margin: 0;
  flex: 1;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: 500;
  color: var(--dy-color-text-primary, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-form-field-array__item-actions {
  display: flex;
  gap: var(--dy-spacing-1, 4px);
}

.work-form-field-array__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--dy-radius-md, 6px);
  background: transparent;
  color: var(--dy-color-text-muted, #64748b);
  cursor: pointer;
  transition: all var(--dy-motion-duration-fast, 100ms);
}
.work-form-field-array__action:hover:not(:disabled) {
  background: var(--dy-color-surface-sunken, #f1f5f9);
  color: var(--dy-color-text-primary, #0f172a);
}
.work-form-field-array__action:disabled { opacity: 0.4; cursor: not-allowed; }
.work-form-field-array__action:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669);
}
.work-form-field-array__action--danger { color: var(--dy-color-status-danger-icon, #ef4444); }
.work-form-field-array__action--danger:hover:not(:disabled) { background: var(--dy-color-status-danger-weak, #fee2e2); }

.work-form-field-array__item-fields { padding: var(--dy-spacing-3, 12px); }

.work-form-field-array__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--dy-spacing-10, 40px);
  text-align: center;
  color: var(--dy-color-text-muted, #64748b);
  gap: var(--dy-spacing-3, 12px);
}

.work-form-field-array__empty p { margin: 0; font-size: 0.875rem; }

.work-form-field-array__add-first {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-4, 16px);
  border: var(--dy-border-width-thin, 1px) dashed var(--dy-color-brand-500, #10b981);
  border-radius: var(--dy-radius-lg, 8px);
  background: var(--dy-color-brand-50, #ecfdf5);
  color: var(--dy-color-brand-700, #047857);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--dy-motion-duration-fast, 100ms);
}
.work-form-field-array__add-first:hover:not(:disabled) { background: var(--dy-color-brand-100, #d1fae5); }
.work-form-field-array__add-first:disabled { opacity: 0.5; cursor: not-allowed; }
.work-form-field-array__add-first:focus-visible {
  outline: none;
  box-shadow: 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669), 0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

.work-form-field-array__footer {
  display: flex;
  justify-content: center;
  padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
  border-top: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  background: var(--dy-color-surface-overlay, #f8fafc);
}

.work-form-field-array__add {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-4, 16px);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-brand-500, #10b981);
  border-radius: var(--dy-radius-lg, 8px);
  background: var(--dy-color-brand-50, #ecfdf5);
  color: var(--dy-color-brand-700, #047857);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--dy-motion-duration-fast, 100ms);
}
.work-form-field-array__add:hover:not(:disabled) { background: var(--dy-color-brand-100, #d1fae5); }
.work-form-field-array__add:disabled { opacity: 0.5; cursor: not-allowed; }
.work-form-field-array__add:focus-visible {
  outline: none;
  box-shadow: 0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669), 0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-form-field-array__action { transition: none; }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-form-field-array { border-color: CanvasText; }
  .work-form-field-array__header { border-color: CanvasText; background: Canvas; }
  .work-form-field-array__item { border-color: CanvasText; }
  .work-form-field-array__item-header { border-color: CanvasText; background: Canvas; }
  .work-form-field-array__action { border-color: CanvasText; color: CanvasText; }
  .work-form-field-array__action:hover { background: Highlight; color: HighlightText; }
  .work-form-field-array__add { border-color: CanvasText; background: Canvas; color: CanvasText; }
}
</style>