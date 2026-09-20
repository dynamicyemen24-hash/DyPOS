/**
 * Fuzzy policy — single source of edit-distance budgets.
 * Both fuzzy engines import from here: one policy, zero drift.
 */

/**
 * Maximum edits that still count as a "fuzzy hit" for a token.
 * Relative to token length: short tokens (esp. Arabic single words) get 1;
 * longer tokens allow up to 2-3.
 * @param {number} tokenLength
 */
export function maxEditDistance(tokenLength) {
	if (tokenLength <= 3) return 1
	if (tokenLength <= 7) return 2
	return 3
}

export default maxEditDistance
