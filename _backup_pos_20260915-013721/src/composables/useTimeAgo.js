/**
 * Localized, human-friendly relative timestamps ("3 minutes ago", "منذ 3 دقائق").
 *
 * Real value for dashboards/history: absolute timestamps are hard to scan at a
 * counter, relative ones read instantly. Arabic pluralization (singular/dual/
 * plural) and optional "short" mode are handled here. Digits stay Latin for
 * consistency with the POS number formatting.
 */

import { computed, onUnmounted, ref } from "vue"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

/** Arabic unit forms: [singular, dual-ish, plural-3..10]. */
const AR = {
	now: "الآن",
	ago: "منذ",
	in: "بعد",
	second: ["ثانية", "ثانيتين", "ثوانٍ"],
	minute: ["دقيقة", "دقيقتين", "دقائق"],
	hour: ["ساعة", "ساعتين", "ساعات"],
	day: ["يوم", "يومين", "أيام"],
	week: ["أسبوع", "أسبوعين", "أسابيع"],
	month: ["شهر", "شهرين", "أشهر"],
	year: ["سنة", "سنتين", "سنوات"],
}

const EN = {
	now: "just now",
	ago: "ago",
	in: "in",
	second: ["second", "seconds", "seconds"],
	minute: ["minute", "minutes", "minutes"],
	hour: ["hour", "hours", "hours"],
	day: ["day", "days", "days"],
	week: ["week", "weeks", "weeks"],
	month: ["month", "months", "months"],
	year: ["year", "years", "years"],
}

function pluralUnit(forms, value) {
	if (value === 1) return forms[0]
	if (value === 2 && forms[1]) return forms[1]
	return forms[2]
}

/**
 * Format a date/duration as a relative string.
 * @param {Date|number|string} input - Date, timestamp, or valid date string.
 * @param {Object} [opts]
 * @param {string} [opts.locale="en"] - "ar", "en", ...
 * @param {boolean} [opts.short=false] - Compact form ("5m ago", "قبل 5 د").

 * Returns "" for invalid input.
 */
export function formatTimeAgo(input, { locale = "en", short = false } = {}) {
	const then =
		input instanceof Date ? input.getTime() : new Date(input).getTime()
	if (Number.isNaN(then)) return ""

	const now = Date.now()
	const diff = now - then
	const future = diff < 0
	const abs = Math.abs(diff)
	const dict = locale === "ar" ? AR : EN

	if (abs < 45_000) return dict.now

	let value
	let unit

	if (abs < MINUTE) {
		value = Math.floor(abs / 1000)
		unit = "second"
	} else if (abs < HOUR) {
		value = Math.max(1, Math.floor(abs / MINUTE))
		unit = "minute"
	} else if (abs < DAY) {
		value = Math.max(1, Math.floor(abs / HOUR))
		unit = "hour"
	} else if (abs < WEEK) {
		value = Math.max(1, Math.floor(abs / DAY))
		unit = "day"
	} else if (abs < MONTH) {
		value = Math.max(1, Math.floor(abs / WEEK))
		unit = "week"
	} else if (abs < YEAR) {
		value = Math.max(1, Math.floor(abs / MONTH))
		unit = "month"
	} else {
		value = Math.max(1, Math.floor(abs / YEAR))
		unit = "year"
	}

	if (short && locale !== "ar") {
		const code =
			unit === "second"
				? "s"
				: unit === "minute"
					? "m"
					: unit === "hour"
						? "h"
						: unit === "day"
							? "d"
							: unit === "week"
								? "w"
								: unit === "month"
									? "M"
									: "y"
		return future ? `${dict.in} ${value}${code}` : `${value}${code} ${dict.ago}`
	}

	const word = pluralUnit(dict[unit], value)
	if (future) return `${dict.in} ${value} ${word}`
	return locale === "ar"
		? `${dict.ago} ${value} ${word}`
		: `${value} ${word} ${dict.ago}`
}

// ---------------------------------------------------------------------------
// Reactive variant: re-formats periodically so values stay fresh.
// ---------------------------------------------------------------------------

/**
 * @param {import('vue').Ref<Date|number|string>} dateRef
 * @param {Object} [opts]
 * @param {import('vue').Ref<string>} [opts.localeRef] - Reactive locale.
 * @param {boolean} [opts.short=false]
 * @param {number} [opts.refreshMs=30000]
 * @returns {{ text: import('vue').Ref<string>, refresh(): void }}
 */
export function useTimeAgo(
	dateRef,
	{ localeRef = null, short = false, refreshMs = 30000 } = {},
) {
	const text = ref("")
	let timer = null

	function refresh() {
		const locale = localeRef?.value || "en"
		text.value = formatTimeAgo(dateRef?.value, { locale, short })
	}

	refresh()
	if (refreshMs > 0) {
		timer = setInterval(refresh, refreshMs)
		onUnmounted(() => clearInterval(timer))
	}

	return { text: computed(() => text.value), refresh }
}
