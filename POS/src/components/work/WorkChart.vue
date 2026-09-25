/**
 * WorkChart — غلاف الرسم البياني الموحد (WCAG 2.2 AA).
 *
 * Features:
 *  - Wrapper for vue-chartjs (Line, Bar, Doughnut, etc.)
 *  - Responsive container with aspect ratio
 *  - Loading, error, empty states
 *  - ARIA: role="img", aria-label, accessible description
 *  - Reduced motion: static fallback
 *  - High contrast mode support
 */
<template>
  <div
    class="work-chart"
    :class="[
      `work-chart--${type}`,
      { 'work-chart--loading': loading, 'work-chart--error': error, 'work-chart--empty': isEmpty },
    ]"
    role="img"
    :aria-label="ariaLabel"
    :aria-describedby="describedById"
  >
    <!-- Loading -->
    <div v-if="loading" class="work-chart__loading" role="status" :aria-label="t('loadingChart')">
      <div class="work-chart__spinner" aria-hidden="true" />
      <span class="sr-only">{{ t('loadingChart') }}</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="work-chart__error" role="alert">
      <FeatherIcon :name="errorIcon" class="work-chart__error-icon" aria-hidden="true" />
      <p class="work-chart__error-text">{{ t('chartError') }}</p>
      <p class="work-chart__error-detail">{{ t(error) }}</p>
      <DyButton variant="outline" size="sm" @click="$emit('retry')">
        {{ t('retry') }}
      </DyButton>
    </div>

    <!-- Empty -->
    <div v-else-if="isEmpty" class="work-chart__empty" role="status">
      <FeatherIcon name="bar-chart-2" class="work-chart__empty-icon" aria-hidden="true" />
      <p>{{ t('noChartData') }}</p>
    </div>

    <!-- Chart -->
    <div v-else class="work-chart__canvas-wrapper" :style="{ aspectRatio }">
      <canvas
        ref="canvasRef"
        :aria-hidden="true"
        :role="prefersReducedMotion ? 'img' : undefined"
      />
      <div
        v-if="prefersReducedMotion"
        class="work-chart__static-fallback"
        :aria-label="ariaLabel"
      >
        <slot name="fallback" />
      </div>
    </div>

    <!-- Description for screen readers -->
    <div
      :id="describedById"
      class="sr-only"
      aria-live="polite"
    >
      {{ chartDescription }}
    </div>

    <!-- Footer -->
    <div v-if="$slots.footer" class="work-chart__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import DyButton from "@/components/ui/DyButton.vue"

const props = defineProps({
	/** Chart type */
	type: {
		type: String,
		default: "line",
		validator: (v) =>
			["line", "bar", "doughnut", "pie", "area", "scatter"].includes(v),
	},
	/** Chart.js data object */
	data: { type: Object, default: () => ({}) },
	/** Chart.js options object */
	options: { type: Object, default: () => ({}) },
	/** Aspect ratio (CSS) */
	aspectRatio: { type: String, default: "16/9" },
	/** Loading state */
	loading: { type: Boolean, default: false },
	/** Error message */
	error: { type: String, default: "" },
	/** Empty state */
	isEmpty: { type: Boolean, default: false },
	/** ARIA label */
	ariaLabel: { type: String, default: "Chart" },
	/** Chart description for screen readers */
	description: { type: String, default: "" },
	/** Chart.js plugins */
	plugins: { type: Array, default: () => [] },
})

const emit = defineEmits(["retry", "click"])

const canvasRef = ref(null)
const chartInstance = ref(null)
const prefersReducedMotion = ref(false)
let mediaQuery = null

const describedById = `work-chart-desc-${Math.random().toString(36).slice(2)}`

const chartDescription = computed(() => {
	if (props.description) return props.description
	const { labels, datasets } = props.data
	if (!labels?.length) return t("noChartData")
	const datasetLabels =
		datasets
			?.map((d) => d.label)
			.filter(Boolean)
			.join(", ") || ""
	return `${t("chartDescription", [props.type])}. ${t("dataPoints", [labels.length])}. ${datasetLabels ? t("series", [datasetLabels]) : ""}`
})

const errorIcon = computed(() => {
	return prefersReducedMotion.value ? "alert-triangle" : "alert-circle"
})

// Initialize chart
async function initChart() {
	if (!canvasRef.value || chartInstance.value) return

	try {
		const { Chart, registerables } = await import("chart.js")
		Chart.register(...registerables)

		const ctx = canvasRef.value.getContext("2d")
		if (!ctx) return

		const defaultOptions = getDefaultOptions()
		const mergedOptions = deepMerge(defaultOptions, props.options)

		chartInstance.value = new Chart(ctx, {
			type: props.type,
			data: props.data,
			options: mergedOptions,
			plugins: props.plugins,
		})
	} catch (e) {
		console.error("Chart init failed:", e)
	}
}

function getDefaultOptions() {
	const base = {
		responsive: true,
		maintainAspectRatio: false,
		animation: prefersReducedMotion.value
			? false
			: { duration: 750, easing: "easeOutQuart" },
		interaction: { intersect: false, mode: "index" },
		plugins: {
			legend: {
				display: true,
				position: "top",
				labels: {
					usePointStyle: true,
					padding: 16,
					font: { family: "Cairo, sans-serif", size: 12 },
				},
			},
			tooltip: {
				padding: 12,
				titleFont: { family: "Cairo, sans-serif", size: 13, weight: "600" },
				bodyFont: { family: "Cairo, sans-serif", size: 12 },
				backgroundColor: "rgba(15, 23, 42, 0.9)",
				titleColor: "#fff",
				bodyColor: "#e2e8f0",
				borderColor: "#334155",
				borderWidth: 1,
				cornerRadius: 8,
				displayColors: true,
				usePointStyle: true,
			},
		},
	}

	// Type-specific defaults
	if (["line", "area"].includes(props.type)) {
		base.scales = {
			x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
			y: {
				beginAtZero: true,
				grid: { color: "#f1f5f9" },
				ticks: { callback: formatNumber },
			},
		}
		base.elements = {
			line: { tension: 0.3 },
			point: { radius: 0, hoverRadius: 6 },
		}
	} else if (["bar"].includes(props.type)) {
		base.scales = {
			x: { grid: { display: false } },
			y: {
				beginAtZero: true,
				grid: { color: "#f1f5f9" },
				ticks: { callback: formatNumber },
			},
		}
	} else if (["doughnut", "pie"].includes(props.type)) {
		base.cutout = "60%"
		base.plugins.legend.position = "right"
	}

	return base
}

function deepMerge(target, source) {
	const result = { ...target }
	for (const key of Object.keys(source)) {
		if (
			source[key] &&
			typeof source[key] === "object" &&
			!Array.isArray(source[key])
		) {
			result[key] = deepMerge(target[key] || {}, source[key])
		} else {
			result[key] = source[key]
		}
	}
	return result
}

function formatNumber(value) {
	return new Intl.NumberFormat("ar-SA").format(value)
}

function updateChart() {
	if (!chartInstance.value) return

	chartInstance.value.data = props.data
	chartInstance.value.options = deepMerge(getDefaultOptions(), props.options)
	chartInstance.value.update()
}

function destroyChart() {
	if (chartInstance.value) {
		chartInstance.value.destroy()
		chartInstance.value = null
	}
}

// Watch for changes
watch(() => props.data, updateChart, { deep: true })
watch(() => props.options, updateChart, { deep: true })
watch(
	() => props.type,
	() => {
		destroyChart()
		nextTick(initChart)
	},
)

// Reduced motion
onMounted(() => {
	if (typeof window !== "undefined") {
		mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
		prefersReducedMotion.value = mediaQuery.matches
		mediaQuery.addEventListener?.("change", (e) => {
			prefersReducedMotion.value = e.matches
			if (chartInstance.value) {
				chartInstance.value.options.animation = e.matches
					? false
					: { duration: 750, easing: "easeOutQuart" }
				chartInstance.value.update()
			}
		})
	}
	initChart()
})

onUnmounted(() => {
	destroyChart()
	mediaQuery?.removeEventListener?.("change", () => {})
})

// Handle canvas click for data point interaction
function handleCanvasClick(e) {
	if (!chartInstance.value) return
	const points = chartInstance.value.getElementsAtEventForMode(
		e,
		"nearest",
		{ intersect: true },
		true,
	)
	if (points.length) {
		const point = points[0]
		const dataset = chartInstance.value.data.datasets[point.datasetIndex]
		emit("click", {
			index: point.index,
			datasetIndex: point.datasetIndex,
			label: chartInstance.value.data.labels?.[point.index],
			value: dataset.data[point.index],
			datasetLabel: dataset.label,
		})
	}
}
</script>

<style scoped>
/* ============================================================================
   WorkChart — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-chart {
  display: flex;
  flex-direction: column;
  gap: var(--dy-spacing-4, 16px);
  background: var(--dy-color-surface-base, #ffffff);
  border: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
  border-radius: var(--dy-radius-xl, 12px);
  padding: var(--dy-spacing-5, 20px);
  min-width: 0;
}

/* Canvas Wrapper */
.work-chart__canvas-wrapper {
  position: relative;
  width: 100%;
  height: 0;
  min-height: 200px;
}
.work-chart__canvas-wrapper canvas {
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
}

/* Static Fallback (reduced motion) */
.work-chart__static-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--dy-spacing-3, 12px);
  padding: var(--dy-spacing-4, 16px);
  background: var(--dy-color-surface-overlay, #f8fafc);
  border-radius: var(--dy-radius-lg, 8px);
  color: var(--dy-color-text-muted, #64748b);
  text-align: center;
}
.work-chart__static-fallback .feather-icon { width: 48px; height: 48px; }

/* Loading */
.work-chart__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--dy-spacing-3, 12px);
  padding: var(--dy-spacing-10, 40px);
  color: var(--dy-color-text-muted, #64748b);
}
.work-chart__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--dy-color-surface-border, #e2e8f0);
  border-block-start-color: var(--dy-color-brand-500, #10b981);
  border-radius: 50%;
  animation: work-chart-spin 1s linear infinite;
}
@keyframes work-chart-spin {
  to { transform: rotate(360deg); }
}

/* Error */
.work-chart__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--dy-spacing-3, 12px);
  padding: var(--dy-spacing-10, 40px);
  text-align: center;
  color: var(--dy-color-status-danger-text, #991b1b);
}
.work-chart__error-icon { width: 48px; height: 48px; color: var(--dy-color-status-danger-icon, #ef4444); }
.work-chart__error-text { margin: 0; font-weight: 600; }
.work-chart__error-detail { margin: 0; font-size: 0.875rem; color: var(--dy-color-text-muted, #64748b); }

/* Empty */
.work-chart__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--dy-spacing-3, 12px);
  padding: var(--dy-spacing-10, 40px);
  text-align: center;
  color: var(--dy-color-text-muted, #64748b);
}
.work-chart__empty-icon { width: 48px; height: 48px; }

/* Footer */
.work-chart__footer {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--dy-spacing-4, 16px);
  border-top: var(--dy-border-width-thin, 1px) solid var(--dy-color-surface-border, #e2e8f0);
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-chart__spinner { animation: none; border-block-start-color: var(--dy-color-brand-500, #10b981); }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-chart { border-color: CanvasText; }
  .work-chart__loading { color: CanvasText; }
  .work-chart__spinner { border-color: CanvasText; border-block-start-color: Highlight; }
  .work-chart__error { color: CanvasText; }
  .work-chart__error-icon { color: CanvasText; }
  .work-chart__empty { color: CanvasText; }
  .work-chart__static-fallback { background: Canvas; color: CanvasText; }
}

/* Print */
@media print {
  .work-chart { break-inside: avoid; }
  .work-chart__canvas-wrapper canvas { max-height: 300px; }
}
</style>