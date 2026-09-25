/**
 * WorkLoadingSkeleton — شاشة هيكلية للتحميل (WCAG 2.2 AA).
 *
 * Features:
 *  - Configurable KPI cards and chart skeletons
 *  - RTL-aware animation direction
 *  - Respects prefers-reduced-motion
 *  - ARIA live region for loading announcement
 *  - CSS custom properties for theming
 */
<template>
  <div
    class="work-loading-skeleton"
    :class="{ 'work-loading-skeleton--reduced': prefersReducedMotion }"
    role="status"
    :aria-label="ariaLabel"
    :aria-busy="true"
  >
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {{ t('loadingContent') }}
    </div>

    <!-- KPI Row -->
    <div
      v-if="kpiCount > 0"
      class="work-loading-skeleton__kpis"
      :style="{ '--kpi-count': kpiCount }"
    >
      <div
        v-for="i in kpiCount"
        :key="i"
        class="work-loading-skeleton__kpi"
      >
        <div class="work-loading-skeleton__line work-loading-skeleton__line--label" />
        <div class="work-loading-skeleton__line work-loading-skeleton__line--value" />
        <div class="work-loading-skeleton__line work-loading-skeleton__line--trend" />
      </div>
    </div>

    <!-- Chart Grid -->
    <div
      v-if="chartCount > 0"
      class="work-loading-skeleton__charts"
      :style="{ '--chart-count': chartCount }"
    >
      <div
        v-for="i in chartCount"
        :key="i"
        class="work-loading-skeleton__chart"
      >
        <div class="work-loading-skeleton__line work-loading-skeleton__line--title" />
        <div class="work-loading-skeleton__chart-area" />
      </div>
    </div>

    <!-- Table Skeleton -->
    <div
      v-if="showTable"
      class="work-loading-skeleton__table"
    >
      <div class="work-loading-skeleton__table-head">
        <div
          v-for="i in tableColumns"
          :key="i"
          class="work-loading-skeleton__line work-loading-skeleton__line--th"
        />
      </div>
      <div
        v-for="r in tableRows"
        :key="r"
        class="work-loading-skeleton__table-row"
      >
        <div
          v-for="c in tableColumns"
          :key="c"
          class="work-loading-skeleton__line work-loading-skeleton__line--td"
        />
      </div>
    </div>

    <!-- List Skeleton -->
    <div
      v-if="showList"
      class="work-loading-skeleton__list"
    >
      <div
        v-for="i in listItems"
        :key="i"
        class="work-loading-skeleton__list-item"
      >
        <div class="work-loading-skeleton__avatar" />
        <div class="work-loading-skeleton__list-content">
          <div class="work-loading-skeleton__line work-loading-skeleton__line--title" />
          <div class="work-loading-skeleton__line work-loading-skeleton__line--subtitle" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue"
import { t } from "@/utils/translation"

const props = defineProps({
	/** Number of KPI cards */
	kpiCount: { type: Number, default: 4 },
	/** Number of chart skeletons */
	chartCount: { type: Number, default: 3 },
	/** Show table skeleton */
	showTable: { type: Boolean, default: false },
	/** Table columns */
	tableColumns: { type: Number, default: 6 },
	/** Table rows */
	tableRows: { type: Number, default: 5 },
	/** Show list skeleton */
	showList: { type: Boolean, default: false },
	/** List items */
	listItems: { type: Number, default: 5 },
	/** ARIA label */
	ariaLabel: { type: String, default: "" },
})

const prefersReducedMotion = ref(false)
let mediaQuery = null

onMounted(() => {
	if (typeof window !== "undefined") {
		mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
		prefersReducedMotion.value = mediaQuery.matches
		mediaQuery.addEventListener?.("change", (e) => {
			prefersReducedMotion.value = e.matches
		})
	}
})

onUnmounted(() => {
	mediaQuery?.removeEventListener?.("change", () => {})
})
</script>

<style scoped>
/* ============================================================================
   WorkLoadingSkeleton — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-6, 24px);
  padding: var(--dy-spacing-4, 16px) 0;
}

/* Reduced motion */
.work-loading-skeleton--reduced .work-loading-skeleton__line,
.work-loading-skeleton--reduced .work-loading-skeleton__chart-area,
.work-loading-skeleton--reduced .work-loading-skeleton__avatar {
  animation: none !important;
  background: var(--dy-color-surface-border, #e2e8f0) !important;
}

/* Base skeleton line */
.work-loading-skeleton__line {
  border-radius: var(--dy-radius-md, 6px);
  background: linear-gradient(
    90deg,
    var(--dy-color-surface-border, #e2e8f0) 25%,
    var(--dy-color-surface-overlay, #f1f5f9) 50%,
    var(--dy-color-surface-border, #e2e8f0) 75%
  );
  background-size: 200% 100%;
  animation: work-skeleton-shimmer 1.5s ease-in-out infinite;
}

@keyframes work-skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* RTL: reverse animation direction */
:dir(rtl) .work-loading-skeleton__line {
  background: linear-gradient(
    270deg,
    var(--dy-color-surface-border, #e2e8f0) 25%,
    var(--dy-color-surface-overlay, #f1f5f9) 50%,
    var(--dy-color-surface-border, #e2e8f0) 75%
  );
  background-size: 200% 100%;
}

/* KPI Grid */
.work-loading-skeleton__kpis {
  display: grid;
  grid-template-columns: repeat(var(--kpi-count), minmax(0, 1fr));
  gap: var(--dy-spacing-4, 16px);
}

.work-loading-skeleton__kpi {
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-2, 8px);
  padding: var(--dy-spacing-4, 16px);
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
}

.work-loading-skeleton__line--label {
  height: 12px;
  width: 60%;
}
.work-loading-skeleton__line--value {
  height: 24px;
  width: 40%;
}
.work-loading-skeleton__line--trend {
  height: 10px;
  width: 30%;
}

/* Charts Grid */
.work-loading-skeleton__charts {
  display: grid;
  grid-template-columns: repeat(var(--chart-count), minmax(0, 1fr));
  gap: var(--dy-spacing-6, 24px);
}

.work-loading-skeleton__chart {
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-xl, 12px);
  padding: var(--dy-spacing-4, 16px);
}

.work-loading-skeleton__line--title {
  height: 16px;
  width: 30%;
  margin-bottom: var(--dy-spacing-3, 12px);
}

.work-loading-skeleton__chart-area {
  height: 200px;
  border-radius: var(--dy-radius-md, 6px);
}

/* Table */
.work-loading-skeleton__table {
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
  overflow: hidden;
}

.work-loading-skeleton__table-head {
  display: grid;
  grid-template-columns: repeat(var(--table-columns, 6), 1fr);
  gap: var(--dy-spacing-4, 16px);
  padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
  background: var(--dy-color-surface-overlay, #f8fafc);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}

.work-loading-skeleton__line--th {
  height: 12px;
  width: 80%;
}

.work-loading-skeleton__table-row {
  display: grid;
  grid-template-columns: repeat(var(--table-columns, 6), 1fr);
  gap: var(--dy-spacing-4, 16px);
  padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
  border-bottom: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}
.work-loading-skeleton__table-row:last-child {
  border-bottom: none;
}

.work-loading-skeleton__line--td {
  height: 14px;
  width: 70%;
}

/* List */
.work-loading-skeleton__list {
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-3, 12px);
}

.work-loading-skeleton__list-item {
  display: flex;
  align-items: flex-start;
  gap: var(--dy-spacing-3, 12px);
  padding: var(--dy-spacing-3, 12px);
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-lg, 8px);
}

.work-loading-skeleton__avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--dy-radius-full, 9999px);
  flex-shrink: 0;
}

.work-loading-skeleton__list-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-1, 4px);
}

.work-loading-skeleton__line--subtitle {
  height: 12px;
  width: 50%;
}

/* ============================================================================
   Responsive
   ============================================================================ */
@media (max-width: 1024px) {
  .work-loading-skeleton__kpis {
    grid-template-columns: repeat(2, 1fr);
  }
  .work-loading-skeleton__charts {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 640px) {
  .work-loading-skeleton__kpis {
    grid-template-columns: 1fr;
  }
  .work-loading-skeleton__charts {
    grid-template-columns: 1fr;
  }
  .work-loading-skeleton__table-head,
  .work-loading-skeleton__table-row {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* ============================================================================
   High Contrast
   ============================================================================ */
@media (forced-colors: active) {
  .work-loading-skeleton__line,
  .work-loading-skeleton__chart-area,
  .work-loading-skeleton__avatar {
    background: CanvasText !important;
    animation: none !important;
  }
  .work-loading-skeleton__kpi,
  .work-loading-skeleton__chart,
  .work-loading-skeleton__table,
  .work-loading-skeleton__list-item {
    border-color: CanvasText !important;
    background: Canvas !important;
  }
}
</style>