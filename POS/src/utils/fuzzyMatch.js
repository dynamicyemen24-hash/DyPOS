/**
 * Arabic-aware fuzzy matching — BOOLEAN matcher (this file is the whole
 * matching surface now).
 *
 * The old role split is gone: `utils/fuzzy.js` (ranking) and `utils/search.js`
 * (facade) were deleted as unreachable, so fuzzyMatch.js is the only matcher
 * left: `fuzzyMatch(query, candidate)` for a single boolean decision and
 * `bestFuzzyMatch(query, candidates[])` to pick the best candidate from a list.
 *
 * Pure + fully unit-tested. No DOM, no I/O.
 */

import { normalizeArabic } from "@/utils/arabic"
import { levenshtein, similarity } from "@/utils/levenshtein"

export { levenshtein, similarity }

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
