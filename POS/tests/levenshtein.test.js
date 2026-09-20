import { describe, expect, it } from "vitest"
import { levenshtein, similarity } from "@/utils/levenshtein"
import { maxEditDistance } from "@/utils/fuzzyPolicy"

describe("levenshtein canonical", () => {
	it("computes classic distances", () => {
		expect(levenshtein("kitten", "sitting")).toBe(3)
		expect(levenshtein("same", "same")).toBe(0)
		expect(levenshtein("", "abc")).toBe(3)
		expect(levenshtein(null, "x")).toBe(1)
	})

	it("similarity is 1 for exact, 0 for empty", () => {
		expect(similarity("b", "b")).toBe(1)
		expect(similarity("", "")).toBe(1)
		expect(similarity("a", "")).toBe(0)
	})
})

describe("fuzzyPolicy single budget", () => {
	it("short tokens allow 1 edit, long up to 3", () => {
		expect(maxEditDistance(2)).toBe(1)
		expect(maxEditDistance(5)).toBe(2)
		expect(maxEditDistance(20)).toBe(3)
	})
})
