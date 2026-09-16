/**
 * Typo-tolerant fuzzy search over search clients.
 *
 * Arabic-first: everything is normalized (diacritics, hamza, TA MARBUTA,
 * digits) before scoring, then ranked by a lightweight scoring model:
 *   token containment > word-prefix > fuzzy-within-edit-distance.
 *
 * Pure + framework-free for easy testing.
 */

import { normalizeSearchTokens, normalizeArabic } from "./arabic"

/** Classic Levenshtein distance (capped for long strings). */
export function levenshtein(a, b) {
	if (a === b) return 0
	if (a.length === 0) return b.length
	if (b.length === 0) return a.length

	const MAX = Math.min(a.length, b.length)
	if (Math.abs(a.length - b.length) > MAX) return Math.abs(a.length - b.length)

	const costs = new Array(b.length + 1)
	for (let j = 0; j <= b.length; j++) costs[j] = j
	for (let i = 1; i <= a.length; i++) {
		let prev = costs[0]
		costs[0] = i
		for (let j = 1; j <= b.length; j++) {
			const cell = costs[j]
			costs[j] = Math.min(
				costs[j] + 1,
				costs[j - 1] + 1,
				prev + (a[i - 1] === b[j - 1] ? 0 : 1),
			)
			prev = cell
		}
	}
	return costs[b.length]
}

/**
 * Maximum edits that still count as a "fuzzy hit" for a token.
 * Relative to token length: short tokens (esp. Arabic single words) get 1;
 * longer tokens allow up to 2.
 * @param {number} tokenLength
 */
export function maxEditDistance(tokenLength) {
	if (tokenLength <= 3) return 1
	if (tokenLength <= 7) return 2
	return 3
}

/**
 * Score one text against a query, in [-1000, 1000].
 * Higher = better. Both sides are normalized Arabic-first.
 * @param {string} query
 * @param {string} text
 * @param {Object} [opts]
 * @param {boolean} [opts.normalize=true] - Normalize Arabic before scoring.
 * @returns {number} score
 */
export function fuzzyScore(query, text, { normalize = true } = {}) {
	if (!query || !text) return 0
	const q = normalize ? normalizeArabic(query) : query
	const t = normalize ? normalizeArabic(text) : text
	if (!q || !t) return 0

	// Exact full-text match is the strongest signal.
	if (q === t) return 1000

	const qTokens = normalizeSearchTokens(q)
	if (qTokens.length === 0) return 0

	const words = t.split(/\s+/).filter(Boolean)
	let score = 0

	for (const qToken of qTokens) {
		let bestTokenScore = 0
		for (const word of words) {
			let s = 0
			if (word === qToken)
				s = 450 // whole-word exact
			else if (word.startsWith(qToken))
				s = 400 - 10 * (word.length - qToken.length)
			else if (word.includes(qToken)) s = 380
			else if (t.includes(qToken))
				s = 300 // anywhere in the field
			else {
				// Fuzzy fallback within edit distance (typo tolerance).
				const dist = levenshtein(qToken, word.substr(0, word.length))
				const within = dist > 0 && dist <= maxEditDistance(qToken.length)
				if (within) s = Math.max(120, 260 - 60 * dist)
				// Also compare against a truncated word window for long words.
				if (
					s === 0 &&
					dist <= maxEditDistance(Math.min(qToken.length, word.length))
				) {
					s = 100
				}
			}
			if (s > bestTokenScore) bestTokenScore = s
		}
		score += bestTokenScore
		if (bestTokenScore === 0) score -= 40 // missing token penalty
	}

	return Math.max(-1000, Math.min(score, 1000))
}

/**
 * Rank candidate objects by fuzzy relevance to the query.
 * @param {string} query
 * @param {Array<Object>} candidates
 * @param {Object} [opts]
 * @param {Function} [opts.getText] - `(item) => string` text to score (default item.name).
 * @param {number} [opts.limit=20]
 * @param {number} [opts.threshold=0] - Minimum score to include.
 * @param {boolean} [opts.scoreKey=false] - Attach `__score` to results.
 * @returns {Array<Object>} ranked (optionally scored) candidates.
 */
export function fuzzyMatch(
	query,
	candidates,
	{ getText, limit = 20, threshold = 0, scoreKey = false } = {},
) {
	if (!candidates || candidates.length === 0) return []
	const textOf =
		getText ||
		((item) => (typeof item === "string" ? item : (item?.name ?? "")))
	const scored = candidates.map((item) => {
		const score = fuzzyScore(query, textOf(item))
		return { item, score }
	})
	return scored
		.filter(({ score }) => score >= threshold)
		.sort((a, b) => b.score - a.score)
		.slice(0, Math.max(0, limit))
		.map(
			scoreKey
				? ({ item, score }) => ({ ...item, __score: score })
				: ({ item }) => item,
		)
}

/**
 * Did-you-mean suggestions for a failed query: nearest candidates from a
 * dictionary of known strings, ranked by edit distance.
 * @param {string} query
 * @param {Array<string>} dictionary - Known terms (e.g. item names/categories).
 * @param {number} [limit=3]
 * @param {number} [maxDist=2] - Max edit distance from normalized query.
 * @returns {Array<string>}
 */
export function suggestCorrections(
	query,
	dictionary,
	{ limit = 3, maxDist = 2 } = {},
) {
	if (!query || !Array.isArray(dictionary) || dictionary.length === 0) return []
	const q = normalizeArabic(query)
	if (!q) return []
	const qTokens = normalizeSearchTokens(q)
	const qLen = qTokens[0]?.length ?? q.length

	const ranked = []
	for (const term of dictionary) {
		const t = normalizeArabic(term)
		if (!t || t === q) continue
		const dist = levenshtein(q, t)
		if (dist <= Math.max(maxDist, maxEditDistance(Math.min(qLen, t.length)))) {
			// Prefer dictionary terms that also share a leading token.
			const shared = qTokens.some((tk) => t.includes(tk)) ? 0.25 : 0
			ranked.push({ term, dist: dist - shared })
		}
	}
	return ranked
		.sort((a, b) => a.dist - b.dist)
		.slice(0, Math.max(0, limit))
		.map(({ term }) => term)
}
