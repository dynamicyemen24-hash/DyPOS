import { describe, expect, it } from "vitest"
import {
	bestFuzzyMatch,
	fuzzyMatch,
	levenshtein,
	similarity,
} from "@/utils/fuzzyMatch"

describe("levenshtein", () => {
	it("computes classic distances", () => {
		expect(levenshtein("kitten", "sitting")).toBe(3)
		expect(levenshtein("book", "back")).toBe(2)
		expect(levenshtein("same", "same")).toBe(0)
	})

	it("handles empty strings", () => {
		expect(levenshtein("", "abc")).toBe(3)
		expect(levenshtein("abc", "")).toBe(3)
		expect(levenshtein("", "")).toBe(0)
		expect(levenshtein(null, "x")).toBe(1)
	})
})

describe("similarity", () => {
	it("returns 1 for identical and 0 for empty pair", () => {
		expect(similarity("b", "b")).toBe(1)
		expect(similarity("", "")).toBe(1)
		expect(similarity("a", "")).toBe(0)
	})
})

describe("fuzzyMatch", () => {
	it("matches Arabic inputs after normalization (hamza fold)", () => {
		expect(fuzzyMatch("احمد", "أحمد")).toBe(true)
		expect(fuzzyMatch("على", "علي")).toBe(true)
	})

	it("matches folded diacritics", () => {
		expect(fuzzyMatch("قلم", "قَلَم")).toBe(true)
	})

	it("normalizes Arabic-Indic and Persian digits", () => {
		expect(fuzzyMatch("123", "١٢٣")).toBe(true)
		expect(fuzzyMatch("58", "۵۸")).toBe(true)
	})

	it("treats an embedded word as a match", () => {
		expect(fuzzyMatch("قلم", "قلم رصاص")).toBe(true)
	})

	it("accepts minor misspellings above threshold", () => {
		expect(fuzzyMatch("شنطة", "شطة")).toBe(true)
	})

	it("rejects unrelated words", () => {
		expect(fuzzyMatch("سيارة", "بيت")).toBe(false)
	})

	it("honors minLength and normalization flags", () => {
		// candidate shorter than minLength is ignored
		expect(fuzzyMatch("قلم", "ق", { minLength: 2 })).toBe(false)
		// without normalization, alef-maqsura does not fold into ya -> below threshold
		expect(fuzzyMatch("على", "علي", { normalize: false })).toBe(false)
		// with normalization it folds and matches
		expect(fuzzyMatch("على", "علي")).toBe(true)
	})
})

describe("bestFuzzyMatch", () => {
	const catalog = ["قلم رصاص", "قلم حبر", "مسطرة", "ممحاة", "دفتر"]

	it("ranks close matches above partial ones", () => {
		const results = bestFuzzyMatch("قلم", catalog)
		expect(results.length).toBe(2)
		// Both embedded-word matches are boosted; the exact embedded match
		// ("قلم حبر" beats "قلم رصاص" only in locale order, so it is a tie
		// by score — assert membership + boost, not an arbitrary order).
		const texts = results.map((r) => r.text).sort()
		expect(texts).toEqual(["قلم حبر", "قلم رصاص"].sort())
		for (const result of results) {
			expect(result.score).toBeGreaterThan(0.9)
		}
	})

	it("puts an exact normalized match first", () => {
		const results = bestFuzzyMatch("قلم", ["قلم حبر", "قلم", "مسطرة"])
		expect(results[0].text).toBe("قلم")
		expect(results[0].score).toBeGreaterThan(results[1].score)
	})

	it("filters everything below threshold and sorts by score", () => {
		const results = bestFuzzyMatch("ممحاء", catalog, { threshold: 0.5 })
		expect(results.length).toBeGreaterThan(0)
		expect(results[0].text).toBe("ممحاة")
	})

	it("is defensive against invalid inputs", () => {
		expect(bestFuzzyMatch("", catalog)).toEqual([])
		expect(bestFuzzyMatch("قلم", null)).toEqual([])
		expect(bestFuzzyMatch("قلم", [123, null])).toEqual([])
	})
})
