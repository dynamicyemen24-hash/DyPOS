import { formatCurrency } from "@/utils/currency"

/**
 * Shared formatters for report tables and KPI cards.
 *
 * Thin wrappers around the existing DyPOS currency utilities so that
 * reports never invent their own money formatting.
 */

export function formatMoney(value: number | null | undefined): string {
	if (value == null || Number.isNaN(Number(value))) return "-"
	return formatCurrency(Number(value))
}

export function formatNumber(value: number | null | undefined): string {
	if (value == null || Number.isNaN(Number(value))) return "-"
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
		Number(value),
	)
}

export function formatPercent(value: number | null | undefined): string {
	if (value == null || Number.isNaN(Number(value))) return "-"
	return `${Number(value).toFixed(1)}%`
}

export function formatDate(value: string | null | undefined): string {
	if (!value) return "-"
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return String(value)
	return date.toISOString().slice(0, 10)
}

export function safePercent(part: number, whole: number): number | null {
	if (!whole) return null
	return (part / whole) * 100
}

export function changePercent(
	current: number,
	previous: number | undefined,
): number | undefined {
	if (previous == null || previous === 0) return undefined
	return ((current - previous) / Math.abs(previous)) * 100
}

export function trendOf(
	current: number,
	previous: number | undefined,
): "up" | "down" | "flat" {
	if (previous == null || current === previous) return "flat"
	return current > previous ? "up" : "down"
}
