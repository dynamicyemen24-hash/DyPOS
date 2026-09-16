/**
 * Shared dashboard utility functions.
 *
 * Eliminates duplication across dashboard data layers.
 */

export function toISODate(date) {
	if (!date) return null
	const d = date instanceof Date ? date : new Date(date)
	if (Number.isNaN(d.getTime())) return null
	return d.toISOString().slice(0, 10)
}

export function previousPeriodFilter(filter) {
	if (!filter?.from || !filter?.to) return null
	const from = new Date(filter.from)
	const to = new Date(filter.to)
	const diffMs = to.getTime() - from.getTime()
	return {
		...filter,
		from: toISODate(new Date(from.getTime() - diffMs)),
		to: toISODate(new Date(from.getTime() - 1)),
	}
}

export function sumBy(rows, pick) {
	return rows.reduce((s, r) => s + (Number(r?.[pick]) || 0), 0)
}

export function buildDailyTrend(data, prevData, dateField = "posting_date") {
	const byDate = new Map()
	const prevByDate = new Map()

	function aggregate(map, rows) {
		for (const row of rows) {
			const date = String(row[dateField] || "").slice(0, 10)
			if (!date) continue
			let b = map.get(date)
			if (!b) {
				b = { date }
				map.set(date, b)
			}
			for (const key of Object.keys(row)) {
				if (key === dateField) continue
				if (typeof row[key] === "number") b[key] = (b[key] || 0) + row[key]
			}
		}
		return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
	}

	return {
		current: aggregate(byDate, data),
		previous: aggregate(prevByDate, prevData),
	}
}

export function timeAgo(date) {
	if (!date) return ""
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
	if (seconds < 60) return `${seconds}s ago`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	return `${hours}h ago`
}
