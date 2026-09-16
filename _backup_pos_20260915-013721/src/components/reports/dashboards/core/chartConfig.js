/**
 * Chart.js global registration + shared theme config.
 *
 * Registers all required Chart.js components once and exports
 * a DyPOS-branded defaults object for consistent chart styling.
 */
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	BarElement,
	ArcElement,
	RadialLinearScale,
	Title,
	Tooltip,
	Legend,
	Filler,
	TimeScale,
} from "chart.js"

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	BarElement,
	ArcElement,
	RadialLinearScale,
	Title,
	Tooltip,
	Legend,
	Filler,
	TimeScale,
)

/** DyPOS brand palette */
export const COLORS = {
	primary: "#6366f1",
	primaryLight: "rgba(99,102,241,0.15)",
	secondary: "#f59e0b",
	secondaryLight: "rgba(245,158,11,0.15)",
	success: "#10b981",
	successLight: "rgba(16,185,129,0.15)",
	danger: "#ef4444",
	dangerLight: "rgba(239,68,68,0.15)",
	warning: "#f59e0b",
	warningLight: "rgba(245,158,11,0.15)",
	info: "#3b82f6",
	infoLight: "rgba(59,130,246,0.15)",
	gray: "#9ca3af",
	grayLight: "rgba(156,163,175,0.15)",
}

/** Extended palette for multi-dataset charts */
export const PALETTE = [
	"#6366f1",
	"#f59e0b",
	"#10b981",
	"#ef4444",
	"#3b82f6",
	"#8b5cf6",
	"#ec4899",
	"#14b8a6",
	"#f97316",
	"#06b6d4",
]

export const PALETTE_LIGHT = PALETTE.map((c) => `${c}22`)

/** Shared chart defaults applied globally */
ChartJS.defaults.responsive = true
ChartJS.defaults.maintainAspectRatio = true
ChartJS.defaults.plugins.legend.labels.usePointStyle = true
ChartJS.defaults.plugins.legend.labels.padding = 16
ChartJS.defaults.plugins.tooltip.backgroundColor = "rgba(15,23,42,0.9)"
ChartJS.defaults.plugins.tooltip.titleFont = { size: 13, weight: "600" }
ChartJS.defaults.plugins.tooltip.bodyFont = { size: 12 }
ChartJS.defaults.plugins.tooltip.padding = 10
ChartJS.defaults.plugins.tooltip.cornerRadius = 6
ChartJS.defaults.elements.line.tension = 0.35
ChartJS.defaults.elements.point.radius = 3
ChartJS.defaults.elements.point.hoverRadius = 5
ChartJS.defaults.elements.bar.borderRadius = 4

/**
 * Build a gradient fill for line/area charts.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} color - base color (hex or rgba)
 * @returns {CanvasGradient}
 */
export function createGradient(ctx, color) {
	const gradient = ctx.createLinearGradient(0, 0, 0, 300)
	const base = color.startsWith("#")
		? hexToRgba(color, 0.3)
		: color.replace(/[\d.]+\)$/, "0.3)")
	gradient.addColorStop(0, base)
	gradient.addColorStop(1, "rgba(255,255,255,0)")
	return gradient
}

function hexToRgba(hex, alpha) {
	const r = Number.parseInt(hex.slice(1, 3), 16)
	const g = Number.parseInt(hex.slice(3, 5), 16)
	const b = Number.parseInt(hex.slice(5, 7), 16)
	return `rgba(${r},${g},${b},${alpha})`
}

/**
 * Currency formatter for chart tooltips/axes.
 */
export function currencyTick(value) {
	const formatter = new Intl.NumberFormat(isRTL() ? 'ar-EG' : 'en-US', {
		style: 'currency',
		currency: isRTL() ? 'EGP' : 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})
	const formatted = formatter.format(value)
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
	return formatted
}

function isRTL() {
	return document.documentElement.dir === 'rtl' ||
		(typeof navigator !== 'undefined' &&
			(navigator.language?.startsWith('ar') || navigator.language?.startsWith('fa')))
}

const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/**
 * Short date label (DD/MM) with Arabic month names when RTL.
 */
export function shortDate(isoString) {
	if (!isoString) return ""
	const parts = String(isoString).slice(0, 10).split("-")
	const monthIndex = parseInt(parts[1], 10) - 1
	const monthName = isRTL() ? arabicMonths[monthIndex] : parts[1]
	return isRTL() ? `${parts[2]} ${monthName}` : `${parts[2]}/${parts[1]}`
}
