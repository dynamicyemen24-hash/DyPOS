/**
 * Levenshtein — canonical single-source implementation.
 *
 * DyPOS Quality: one exact implementation, zero duplication.
 * Both fuzzy engines import from here so scoring stays consistent.
 * Pure, framework-free, fully unit-tested.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} edit distance
 */
export function levenshtein(a, b) {
	const left = a == null ? "" : String(a)
	const right = b == null ? "" : String(b)
	if (left === right) return 0
	if (!left) return right.length
	if (!right) return left.length

	// Early exit: length gap alone proves no fuzzy hit for short tokens.
	const gap = Math.abs(left.length - right.length)
	if (gap > Math.max(left.length, right.length))
		return Math.max(left.length, right.length)

	// Single-row DP — O(min(m,n)) memory, cache-friendly for catalog scans.
	let prev = new Array(right.length + 1)
	let curr = new Array(right.length + 1)
	for (let j = 0; j <= right.length; j++) prev[j] = j
	for (let i = 1; i <= left.length; i++) {
		curr[0] = i
		for (let j = 1; j <= right.length; j++) {
			const cost = left[i - 1] === right[j - 1] ? 0 : 1
			curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
		}
		const swap = prev
		prev = curr
		curr = swap
	}
	return prev[right.length]
}

/**
 * Similarity in [0,1]: 1 = exact match.
 */
export function similarity(a, b) {
	if (!a && !b) return 1
	if (!a || !b) return 0
	const sa = String(a)
	const sb = String(b)
	const maxLen = Math.max(sa.length, sb.length)
	if (maxLen === 0) return 1
	return 1 - levenshtein(sa, sb) / maxLen
}

export default levenshtein
