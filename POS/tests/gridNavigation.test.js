/**
 * Grid keyboard navigation — the arithmetic that used to live inline in
 * POSSale.vue (where nothing could test it).
 */
import { describe, expect, it } from "vitest"

import {
	gridNextIndex,
	isGridNavigationKey,
	readDirectionRTL,
} from "@/utils/gridNavigation"

const LTR = { columns: 4, rtl: false }
const RTL = { columns: 4, rtl: true }

describe("gridNextIndex — vertical", () => {
	it("moves a full row and clamps at both edges", () => {
		expect(gridNextIndex("ArrowDown", 2, 10, LTR)).toBe(6)
		expect(gridNextIndex("ArrowUp", 6, 10, LTR)).toBe(2)
		// last row is partial: 9 + 4 clamps to the last item
		expect(gridNextIndex("ArrowDown", 9, 10, LTR)).toBe(9)
		expect(gridNextIndex("ArrowUp", 1, 10, LTR)).toBe(0)
	})

	it("is direction-independent for vertical keys", () => {
		expect(gridNextIndex("ArrowDown", 2, 10, RTL)).toBe(
			gridNextIndex("ArrowDown", 2, 10, LTR),
		)
	})
})

describe("gridNextIndex — horizontal follows the visual direction", () => {
	it("in LTR, right advances and left retreats", () => {
		expect(gridNextIndex("ArrowRight", 3, 10, LTR)).toBe(4)
		expect(gridNextIndex("ArrowLeft", 3, 10, LTR)).toBe(2)
	})

	it("in RTL, right retreats and left advances", () => {
		expect(gridNextIndex("ArrowRight", 3, 10, RTL)).toBe(2)
		expect(gridNextIndex("ArrowLeft", 3, 10, RTL)).toBe(4)
	})

	it("clamps at the ends instead of wrapping", () => {
		expect(gridNextIndex("ArrowRight", 9, 10, LTR)).toBe(9)
		expect(gridNextIndex("ArrowLeft", 0, 10, LTR)).toBe(0)
	})
})

describe("gridNextIndex — defensive inputs", () => {
	it("returns null for keys the grid does not own", () => {
		for (const key of ["Enter", "a", "Escape", "F2", "Tab", ""]) {
			expect(gridNextIndex(key, 0, 5, LTR), key).toBeNull()
		}
	})

	it("returns null for an empty grid and 0 when nothing is selected", () => {
		expect(gridNextIndex("ArrowDown", 0, 0, LTR)).toBeNull()
		expect(gridNextIndex("ArrowRight", -1, 5, LTR)).toBe(1)
		expect(gridNextIndex("ArrowLeft", Number.NaN, 5, LTR)).toBe(0)
	})

	it("never returns an out-of-range index", () => {
		for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
			for (let total = 1; total <= 12; total++) {
				for (let index = -2; index < total + 2; index++) {
					const next = gridNextIndex(key, index, total, RTL)
					if (next === null) continue
					expect(next).toBeGreaterThanOrEqual(0)
					expect(next).toBeLessThanOrEqual(total - 1)
				}
			}
		}
	})
})

describe("key ownership and direction reading", () => {
	it("claims only the navigation keys", () => {
		expect(isGridNavigationKey("ArrowUp")).toBe(true)
		expect(isGridNavigationKey("ArrowLeft")).toBe(true)
		expect(isGridNavigationKey("Enter")).toBe(false)
	})

	it("defaults to RTL when the document says nothing", () => {
		const original = document.documentElement.getAttribute("dir")
		document.documentElement.setAttribute("dir", "ltr")
		expect(readDirectionRTL()).toBe(false)
		document.documentElement.setAttribute("dir", "rtl")
		expect(readDirectionRTL()).toBe(true)
		document.documentElement.removeAttribute("dir")
		expect(readDirectionRTL(), "no dir attribute must fall back to RTL").toBe(
			true,
		)
		if (original !== null)
			document.documentElement.setAttribute("dir", original)
	})
})
