import { describe, expect, it } from "vitest"
import {
	convertToKilograms,
	parseScaleReading,
	quantityFromWeight,
	weightLineTotal,
} from "@/utils/scale"

describe("parseScaleReading", () => {
	it("parses a stable CAS reading", () => {
		const r = parseScaleReading("ST,GS,+  1.234kg")
		expect(r.ok).toBe(true)
		expect(r.weightKg).toBeCloseTo(1.234, 9)
		expect(r.unit).toBe("kg")
		expect(r.stable).toBe(true)
	})

	it("parses grams into kilograms", () => {
		const r = parseScaleReading("ST,GS,+  512g")
		expect(r.weightKg).toBeCloseTo(0.512, 9)
		expect(r.unit).toBe("g")
	})

	it("parses Mettler-style prefixed readings as stable", () => {
		const r = parseScaleReading("S+0001.234kg")
		expect(r.ok).toBe(true)
		expect(r.weightKg).toBeCloseTo(1.234, 9)
		expect(r.stable).toBe(true)
	})

	it("parses SI-prefixed readings with space before unit", () => {
		const r = parseScaleReading("SI+0012.345 kg")
		expect(r.weightKg).toBeCloseTo(12.345, 9)
	})

	it("parses a bare signed number", () => {
		const r = parseScaleReading("+1.5")
		expect(r.weightKg).toBeCloseTo(1.5, 9)
		expect(r.stable).toBe(false)
	})

	it("reports magnitude only (sign is not negative weight)", () => {
		const r = parseScaleReading("-2.0kg")
		expect(r.weightKg).toBeCloseTo(2.0, 9)
	})

	it("converts imperial pounds", () => {
		const r = parseScaleReading("WT,GS,-  1lb")
		expect(r.ok).toBe(true)
		expect(r.weightKg).toBeCloseTo(0.45359237, 9)
		expect(r.stable).toBe(false)
	})

	it("rejects garbage without a weight token", () => {
		expect(parseScaleReading("hello world").ok).toBe(false)
		expect(parseScaleReading("hello world").reason).toBe("no-weight-token")
	})

	it("rejects empty and non-string input", () => {
		expect(parseScaleReading("").reason).toBe("empty")
		expect(parseScaleReading("   ").reason).toBe("empty")
		expect(parseScaleReading(null).reason).toBe("not-a-string")
		expect(parseScaleReading(undefined).reason).toBe("not-a-string")
		expect(parseScaleReading(42).reason).toBe("not-a-string")
	})
})

describe("convertToKilograms", () => {
	it("passes through kilograms", () => {
		expect(convertToKilograms(3)).toBe(3)
	})

	it("converts grams", () => {
		expect(convertToKilograms(250, "g")).toBeCloseTo(0.25, 9)
	})

	it("converts pounds", () => {
		expect(convertToKilograms(1, "lb")).toBeCloseTo(0.45359237, 9)
	})
})

describe("quantityFromWeight", () => {
	it("returns kilograms as-is", () => {
		expect(quantityFromWeight(1.5, "kg")).toBeCloseTo(1.5, 9)
	})

	it("scales to grams (UOM = g)", () => {
		expect(quantityFromWeight(0.25, "g")).toBeCloseTo(250, 9)
	})

	it("scales to pounds (UOM = lb)", () => {
		expect(quantityFromWeight(1, "lb")).toBeCloseTo(2.2046226218, 6)
	})
})

describe("weightLineTotal", () => {
	it("multiplies weight by rate per kg", () => {
		expect(weightLineTotal(1.5, 20, "kg")).toBe(30)
	})

	it("rounds to two decimals by default", () => {
		expect(weightLineTotal(2.125, 3, "kg")).toBe(6.38)
	})

	it("uses an injected rounding function (banker-friendly)", () => {
		const rounder = (n) => Math.round(n * 100) / 100
		expect(weightLineTotal(0.45359237, 10.123, "kg", rounder)).toBeCloseTo(
			4.59,
			2,
		)
	})

	it("is safe against bad inputs", () => {
		expect(weightLineTotal(Number.NaN, 5, "kg")).toBe(0)
		expect(weightLineTotal(1, Number.NaN, "kg")).toBe(0)
		expect(weightLineTotal(1, -5, "kg")).toBe(0)
		expect(weightLineTotal(1, 0, "kg")).toBe(0)
	})
})
