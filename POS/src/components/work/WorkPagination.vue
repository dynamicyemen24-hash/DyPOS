/**
 * WorkPagination — ترقيم الصفحات الموحد (WCAG 2.2 AA).
 *
 * Features:
 *  - Page numbers with ellipsis
 *  - Page size selector
 *  - Keyboard navigation
 *  - ARIA: nav role, aria-label, aria-current
 *  - RTL-aware
 */
<template>
  <nav
    class="work-pagination"
    :class="{ 'work-pagination--compact': compact }"
    role="navigation"
    :aria-label="t('pagination')"
  >
    <div class="work-pagination__info" aria-live="polite">
      {{ paginationText }}
    </div>

    <div class="work-pagination__controls">
      <!-- Page Size -->
      <div v-if="showPageSize" class="work-pagination__page-size">
        <label :for="pageSizeId" class="work-pagination__label">
          {{ t('rowsPerPage') }}
        </label>
        <select
          :id="pageSizeId"
          v-model="localPageSize"
          @change="handlePageSizeChange"
          class="work-pagination__select"
          :aria-label="t('rowsPerPage')"
        >
          <option v-for="size in pageSizeOptions" :key="size" :value="size">
            {{ size }}
          </option>
        </select>
      </div>

      <!-- Page Numbers -->
      <ul class="work-pagination__list" role="list" aria-label="Pages">
        <!-- First -->
        <li>
          <button
            type="button"
            class="work-pagination__btn work-pagination__btn--first"
            :disabled="currentPage === 1"
            @click="goToPage(1)"
            :aria-label="t('firstPage')"
            :aria-disabled="currentPage === 1"
          >
            <FeatherIcon :name="direction === 'rtl' ? 'skip-forward' : 'skip-back'" class="w-4 h-4" aria-hidden="true" />
          </button>
        </li>

        <!-- Previous -->
        <li>
          <button
            type="button"
            class="work-pagination__btn work-pagination__btn--prev"
            :disabled="currentPage === 1"
            @click="goToPage(currentPage - 1)"
            :aria-label="t('previousPage')"
            :aria-disabled="currentPage === 1"
          >
            <FeatherIcon :name="direction === 'rtl' ? 'chevron-right' : 'chevron-left'" class="w-4 h-4" aria-hidden="true" />
          </button>
        </li>

        <!-- Page numbers -->
        <li v-for="page in visiblePages" :key="page" class="work-pagination__item">
          <button
            v-if="page === '...'"
            type="button"
            class="work-pagination__ellipsis"
            disabled
            aria-hidden="true"
          >
            …
          </button>
          <button
            v-else
            type="button"
            :class="[
              'work-pagination__btn work-pagination__btn--page',
              { 'work-pagination__btn--active': page === currentPage },
            ]"
            :aria-label="t('page', [page])"
            :aria-current="page === currentPage ? 'page' : undefined"
            @click="goToPage(page)"
          >
            {{ page }}
          </button>
        </li>

        <!-- Next -->
        <li>
          <button
            type="button"
            class="work-pagination__btn work-pagination__btn--next"
            :disabled="currentPage === totalPages"
            @click="goToPage(currentPage + 1)"
            :aria-label="t('nextPage')"
            :aria-disabled="currentPage === totalPages"
          >
            <FeatherIcon :name="direction === 'rtl' ? 'chevron-left' : 'chevron-right'" class="w-4 h-4" aria-hidden="true" />
          </button>
        </li>

        <!-- Last -->
        <li>
          <button
            type="button"
            class="work-pagination__btn work-pagination__btn--last"
            :disabled="currentPage === totalPages"
            @click="goToPage(totalPages)"
            :aria-label="t('lastPage')"
            :aria-disabled="currentPage === totalPages"
          >
            <FeatherIcon :name="direction === 'rtl' ? 'skip-back' : 'skip-forward'" class="w-4 h-4" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>
  </nav>
</template>

<script setup>
import { computed } from "vue"
import { useLocale } from "@/composables/useLocale"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"

const props = defineProps({
	currentPage: { type: Number, required: true },
	totalPages: { type: Number, required: true },
	pageSize: { type: Number, required: true },
	totalItems: { type: Number, default: 0 },
	pageSizeOptions: { type: Array, default: () => [10, 20, 50, 100] },
	showPageSize: { type: Boolean, default: true },
	compact: { type: Boolean, default: false },
	maxVisiblePages: { type: Number, default: 5 },
})

const emit = defineEmits(["page-change", "page-size-change"])

const { direction } = useLocale()
const localPageSize = ref(props.pageSize)

watch(
	() => props.pageSize,
	(val) => {
		localPageSize.value = val
	},
)

const visiblePages = computed(() => {
	const { currentPage, totalPages, maxVisiblePages } = props
	if (totalPages <= maxVisiblePages) {
		return Array.from({ length: totalPages }, (_, i) => i + 1)
	}

	const half = Math.floor(maxVisiblePages / 2)
	let start = Math.max(1, currentPage - half)
	const end = Math.min(totalPages, start + maxVisiblePages - 1)

	if (end - start + 1 < maxVisiblePages) {
		start = Math.max(1, end - maxVisiblePages + 1)
	}

	const pages = []
	if (start > 1) {
		pages.push(1)
		if (start > 2) pages.push("...")
	}
	for (let i = start; i <= end; i++) pages.push(i)
	if (end < totalPages) {
		if (end < totalPages - 1) pages.push("...")
		pages.push(totalPages)
	}
	return pages
})

const paginationText = computed(() => {
	const { currentPage, pageSize, totalItems } = props
	const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
	const end = Math.min(currentPage * pageSize, totalItems)
	return t("showingResults", [start, end, totalItems])
})

const pageSizeId = `work-pagination-size-${Math.random().toString(36).slice(2)}`

function goToPage(page) {
	if (page < 1 || page > props.totalPages || page === props.currentPage) return
	emit("page-change", page)
}

function handlePageSizeChange() {
	emit("page-size-change", localPageSize.value)
}
</script>

<style scoped>
/* ============================================================================
   WorkPagination — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--dy-spacing-4, 16px);
  padding: var(--dy-spacing-4, 16px) var(--dy-spacing-6, 24px);
  border-top: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  background: var(--dy-color-surface-overlay, #f8fafc);
}

.work-pagination--compact {
  padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
  gap: var(--dy-spacing-3, 12px);
}

.work-pagination__info {
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  color: var(--dy-color-text-muted, #64748b);
  white-space: nowrap;
}

.work-pagination__controls {
  display: flex;
  align-items: center;
  gap: var(--dy-spacing-4, 16px);
  flex-wrap: wrap;
}

/* Page Size */
.work-pagination__page-size {
  display: flex;
  align-items: center;
  gap: var(--dy-spacing-2, 8px);
}

.work-pagination__label {
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-medium, 500);
  color: var(--dy-color-text-secondary, #334155);
  white-space: nowrap;
}

.work-pagination__select {
  height: 32px;
  padding: 0 var(--dy-spacing-3, 12px) 0 var(--dy-spacing-2, 8px);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-md, 6px);
  background: var(--dy-color-surface-base, #ffffff);
  color: var(--dy-color-text-primary, #0f172a);
  font-family: var(--dy-font-family-sans, inherit);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 28px;
}
:dir(rtl) .work-pagination__select {
  background-position: left 8px center;
  padding-right: 8px;
  padding-left: 28px;
}
.work-pagination__select:focus-visible {
  outline: none;
  border-color: var(--dy-color-brand-500, #10b981);
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

/* Page List */
.work-pagination__list {
  display: flex;
  align-items: center;
  gap: var(--dy-spacing-1, 4px);
  list-style: none;
  margin: 0;
  padding: 0;
}

.work-pagination__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 var(--dy-spacing-3, 12px);
  border: var(--dy-border-width-thin, 1px) solid transparent;
  border-radius: var(--dy-radius-md, 6px);
  background: var(--dy-color-surface-base, #ffffff);
  color: var(--dy-color-text-secondary, #334155);
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-medium, 500);
  cursor: pointer;
  transition:
    background-color var(--dy-motion-duration-fast, 100ms),
    border-color var(--dy-motion-duration-fast, 100ms),
    color var(--dy-motion-duration-fast, 100ms);
}
.work-pagination__btn:hover:not(:disabled) {
  background: var(--dy-color-surface-sunken, #f1f5f9);
  border-color: var(--dy-color-surface-border-strong, #cbd5e1);
}
.work-pagination__btn:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}
.work-pagination__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.work-pagination__btn--page {
  min-width: 36px;
}
.work-pagination__btn--active {
  background: var(--dy-color-brand-500, #10b981);
  border-color: var(--dy-color-brand-500, #10b981);
  color: #ffffff;
}
.work-pagination__btn--active:hover {
  background: var(--dy-color-brand-600, #059669);
  border-color: var(--dy-color-brand-600, #059669);
}

.work-pagination__ellipsis {
  color: var(--dy-color-text-muted, #94a3b8);
  pointer-events: none;
}

.work-pagination__btn--first,
.work-pagination__btn--last {
  min-width: 36px;
}

/* Responsive */
@media (max-width: 640px) {
  .work-pagination { justify-content: center; }
  .work-pagination__info { order: -1; width: 100%; text-align: center; }
  .work-pagination__controls { width: 100%; justify-content: center; }
  .work-pagination__page-size { display: none; }
  .work-pagination__btn--first,
  .work-pagination__btn--last { display: none; }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-pagination__btn { transition: none; }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-pagination { border-color: CanvasText; }
  .work-pagination__btn { border-color: CanvasText; background: Canvas; color: CanvasText; }
  .work-pagination__btn:hover { background: Highlight; color: HighlightText; }
  .work-pagination__btn--active { background: Highlight; color: HighlightText; border-color: Highlight; }
  .work-pagination__select { border-color: CanvasText; background: Canvas; color: CanvasText; }
}
</style>