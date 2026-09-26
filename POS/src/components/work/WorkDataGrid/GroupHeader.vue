/**
 * GroupHeader — صف رأس المجموعة مع التجميع والتوسيع.
 */
<template>
  <tr class="work-data-grid__group-header" :data-group-id="group.id" :style="{ '--group-level': group.level }">
    <td
      v-if="selectable"
      class="work-data-grid__td work-data-grid__td--selection"
      style="width: 48px;"
    />
    <td
      :colspan="columns.length"
      class="work-data-grid__group-cell"
      :style="{ paddingInlineStart: (group.level + 1) * 16 + 'px' }"
      @click="toggle"
    >
      <div class="work-data-grid__group-content">
        <button
          type="button"
          class="work-data-grid__group-toggle"
          @click.stop="toggle"
          :aria-expanded="expanded"
          :aria-label="expanded ? t('collapseGroup') : t('expandGroup')"
        >
          <FeatherIcon :name="expanded ? 'chevron-up' : 'chevron-down'" class="w-4 h-4" aria-hidden="true" />
        </button>
        <span class="work-data-grid__group-label">{{ t(group.label) }}</span>
        <span class="work-data-grid__group-count">({{ group.rows.length }})</span>
        <template v-for="agg in aggregates" :key="agg.column">
          <span class="work-data-grid__group-aggregate">
            <FeatherIcon :name="aggregateIcon(agg.fn)" class="w-3.5 h-3.5" aria-hidden="true" />
            <span>{{ formatAggregate(agg.fn, agg.column) }}</span>
          </span>
        </template>
      </div>
    </td>
    <td v-if="showActions" class="work-data-grid__td" />
  </tr>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import { formatCurrencySafe } from "@/utils/currency"

const props = defineProps({
	group: { type: Object, required: true },
	level: { type: Number, default: 0 },
	columns: { type: Array, required: true },
	expanded: { type: Boolean, default: false },
	selectable: { type: Boolean, default: false },
	aggregates: { type: Array, default: () => [] },
	showActions: { type: Boolean, default: false },
})

const emit = defineEmits(["toggle"])

function toggle() {
	emit("toggle")
}

function aggregateIcon(fn) {
	switch (fn) {
		case "sum":
			return "plus"
		case "avg":
			return "grid"
		case "min":
			return "minimize-2"
		case "max":
			return "maximize-2"
		case "count":
			return "hash"
		default:
			return "activity"
	}
}

function formatAggregate(fn, columnKey) {
	const col = props.columns.find((c) => c.key === columnKey)
	const value = props.group.aggregates?.[columnKey]
	if (value == null) return ""
	const label = col ? t(col.label) : columnKey
	const formatted =
		col?.format === "currency"
			? formatCurrency(value)
			: col?.format === "number"
				? formatNumber(value)
				: col?.format === "percent"
					? formatPercent(value)
					: value
	return `${label}: ${formatted}`
}

function formatCurrency(val) {
	return formatCurrencySafe(val)
}
function formatNumber(val) {
	return new Intl.NumberFormat("ar-SA").format(Number(val))
}
function formatPercent(val) {
	return new Intl.NumberFormat("ar-SA", { style: "percent" }).format(
		Number(val) / 100,
	)
}
</script>

<style scoped>
.work-data-grid__group-header {
  background: var(--dy-color-surface-overlay, #f8fafc);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}
.work-data-grid__group-cell {
  padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px) !important;
  border: none;
}
.work-data-grid__group-content {
  display: inline-flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
  cursor: pointer;
}
.work-data-grid__group-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--dy-radius-sm, 4px);
  background: transparent;
  color: var(--dy-color-text-muted, #64748b);
  cursor: pointer;
}
.work-data-grid__group-toggle:hover { background: var(--dy-color-surface-sunken, #f1f5f9); color: var(--dy-color-text-primary, #0f172a); }
.work-data-grid__group-label { font-weight: 600; color: var(--dy-color-text-primary, #0f172a); }
.work-data-grid__group-count { color: var(--dy-color-text-muted, #64748b); font-size: 0.75rem; }
.work-data-grid__group-aggregate {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--dy-color-brand-50, #ecfdf5);
  border-radius: var(--dy-radius-full, 9999px);
  font-size: 0.7rem;
  color: var(--dy-color-brand-700, #047857);
}
.work-data-grid__group-aggregate .feather-icon { color: var(--dy-color-brand-600, #059669); }

@media (forced-colors: active) {
  .work-data-grid__group-header { background: Canvas; border-color: CanvasText; }
  .work-data-grid__group-label { color: CanvasText; }
  .work-data-grid__group-aggregate { background: Highlight; color: HighlightText; }
}
</style>