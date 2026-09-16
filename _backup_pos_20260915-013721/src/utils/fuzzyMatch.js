/**
 * Arabic-aware fuzzy searching.
 *
 * Search in Arabic POS catalogs is brittle: users type "قلم" but the catalog
 * stores "قَلَم", or they misspell "شنطة"/"شطة", or type half-width digits.
 * This module normalizes both sides via normalizeArabic, then scores with a
 * bounded Levenshtein distance and exposes threshold helpers for
 * "did-you-mean" corrections and tolerant suggestion filters.
 *
 * Pure + fully unit-tested. No DOM, no I/O.
 */

import { normalizeArabic } from "@/utils/arabic"

/**
 * Levenshtein edit distance with a bounded band.
 * Falls back to long strings quickly when the gap is unreconcilable.
 * @param {string} a
 * @param {string} b
 * @returns {number} Edit distance.
 */
export function levenshtein(a, b) {
	// null/undefined are treated as empty strings, never as the text "null".
	if (a == null) a = ""
	if (b == null) b = ""
	if (!a || !b) return Math.max(String(a).length, String(b).length)
	if (a === b) return 0

	const m = a.length
	const n = b.length
	// If lengths differ by more than this, the distance is at least the gap.
	const gap = Math.abs(m - n)
	if (gap >= n && gap >= m) return m || n

	let prevRow = new Array(n + 1)
	let currRow = new Array(n + 1)
	for (let j = 0; j <= n; j++) prevRow[j] = j

	for (let i = 1; i <= m; i++) {
		currRow[0] = i
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			currRow[j] = Math.min(
				prevRow[j] + 1, // deletion
				currRow[j - 1] + 1, // insertion
				prevRow[j - 1] + cost, // substitution
			)
		}
		const swap = prevRow
		prevRow = currRow
		currRow = swap
	}
	return prevRow[n]
}

/**
 * Similarity in [0, 1]: 1 is an exact (normalized) match.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function similarity(a, b) {
	if (!a && !b) return 1
	if (!a || !b) return 0
	const dist = levenshtein(a, b)
	const maxLen = Math.max(a.length, b.length)
	if (maxLen === 0) return 1
	return 1 - dist / maxLen
}

/**
 * Fuzzy boolean match between a query and a candidate.
 * @param {string} query
 * @param {string} candidate
 * @param {Object} [opts]
 * @param {number} [opts.threshold=0.72] - Similarity threshold.
 * @param {boolean} [opts.normalize=true] - Normalize Arabic/digits first.
 * @param {number} [opts.minLength=2] - Ignore shorter candidates.
 * @returns {boolean}
 */
export function fuzzyMatch(query, candidate, opts = {}) {
	const { threshold = 0.72, normalize = true, minLength = 2 } = opts
	if (!query || !candidate) return false

	const clean = (value) =>
		normalize ? normalizeArabic(String(value)) : String(value)

	const q = clean(query).trim()
	const c = clean(candidate).trim()
	if (q.length < 1 || c.length < minLength) return false

	// Exact substring in a longer label always matches (e.g. "قلم" in
	// "قلم رصاص"), regardless of edit-distance noise.
	if (c.includes(q) || q.includes(c)) return true

	return similarity(q, c) >= threshold
}

/**
 * Rank a list of candidates against a query by similarity.
 * @param {string} query
 * @param {Array<string>} candidates
 * @param {Object} [opts] - same options as fuzzyMatch
 * @returns {Array<{ text: string, score: number }>} Matches above threshold,
 *          best first (stable sort).
 */
export function bestFuzzyMatch(query, candidates, opts = {}) {
	const { threshold = 0.72, normalize = true, minLength = 2 } = opts
	if (!query || !Array.isArray(candidates)) return []

	const clean = (value) =>
		normalize ? normalizeArabic(String(value)) : String(value)

	const q = clean(query).trim()
	if (q.length < 1) return []

	return candidates
		.map((candidate) => {
			if (typeof candidate !== "string") return null
			const c = clean(candidate).trim()
			if (c.length < minLength) return null
			let score = similarity(q, c)
			// Substring containment boosts dramatically: a query matching an
			// embedded word is more relevant than a partial edit-distance hit.
			if (c.includes(q)) score = Math.max(score, 0.98)
			else if (q.includes(c)) score = Math.max(score, 0.95)
			return score >= threshold ? { text: candidate, score } : null
		})
		.filter(Boolean)
		.sort((x, y) => {
			if (y.score !== x.score) return y.score - x.score
			return x.text.localeCompare(y.text)
		})
}

export default fuzzyMatch
