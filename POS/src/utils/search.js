/**
 * Search facade — unified professional entry-point for POS search.
 *
 * Eliminates the historic `fuzzy.js vs fuzzyMatch.js` confusion:
 * - Ranking (catalog): fuzzyScore, rankCandidates (alias of fuzzyMatch-list), suggestCorrections
 * - Boolean (filter): matches, bestFuzzyMatch
 * - Shared: levenshtein, similarity, normalizeArabic, maxEditDistance
 */

export {
	fuzzyScore,
	fuzzyMatch as rankCandidates,
	suggestCorrections,
} from "./fuzzy"
export { fuzzyMatch as matches, bestFuzzyMatch } from "./fuzzyMatch"
export { levenshtein, similarity } from "./levenshtein"
export { maxEditDistance } from "./fuzzyPolicy"
export { normalizeArabic, normalizeSearchTokens } from "./arabic"
