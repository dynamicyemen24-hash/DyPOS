import { describe, expect, it } from "vitest"

import {
	formatMoney,
	formatDecimal,
	formatDate,
	formatDateTime,
	normalizeNumeric,
	taxLabel,
	resolveTaxDisplay,
	TAX_PROFILES,
	DEFAULT_LOCALE,
} from "@/utils/regional"

const FIXED_DATE = "2026-08-05T12:34:56.000Z"

describe("formatMoney (Intl)", () => {
	it("renders en-US USD with the standard convention", () => {
		expect(formatMoney(1234567.89, { locale: "en-US", currency: "USD" })).toBe(
			"$1,234,567.89",
		)
	})

	it("renders Arabic SAR currency with locale markup", () => {
		const expected = new Intl.NumberFormat("ar-SA-u-nu-latn", {
			style: "currency",
			currency: "SAR",
		}).format(1234567.89)
		expect(
			formatMoney(1234567.89, { locale: "ar-SA-u-nu-latn", currency: "SAR" }),
		).toBe(expected)
		expect(expected).toContain("ر.س.")
	})

	it("uses the DyPOS defaults when no options are given", () => {
		const expected = new Intl.NumberFormat(DEFAULT_LOCALE, {
			style: "currency",
			currency: "SAR",
		}).format(12.5)
		expect(formatMoney(12.5)).toBe(expected)
	})

	it("falls back to a plain 2-decimal number on bad input", () => {
		expect(
			formatMoney("not-a-number", { locale: "en-US", currency: "USD" }),
		).toBe("$0.00")
	})
})

describe("formatDecimal (Intl)", () => {
	it("renders the dotted grouping convention for ar-LB Latin digits", () => {
		expect(formatDecimal(1234567.89, { locale: "ar-LB-u-nu-latn" })).toBe(
			"1.234.567,89",
		)
	})

	it("honors explicit fraction digits", () => {
		expect(
			formatDecimal(1.5, { locale: "en-US", minimumFractionDigits: 3 }),
		).toBe("1.500")
	})
})

describe("formatDate / formatDateTime", () => {
	it("formats an ISO date via the en-US long style", () => {
		const expected = new Intl.DateTimeFormat("en-US", {
			dateStyle: "long",
		}).format(new Date(FIXED_DATE))
		expect(formatDate(FIXED_DATE, { locale: "en-US", dateStyle: "long" })).toBe(
			expected,
		)
	})

	it("formats date + time together", () => {
		const expected = new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(FIXED_DATE))
		expect(formatDateTime(FIXED_DATE, { locale: "en-US" })).toBe(expected)
	})

	it("returns the fallback for invalid dates", () => {
		expect(formatDate("not-a-date", { fallback: "--" })).toBe("--")
		expect(formatDateTime(null, { fallback: "--" })).toBe("--")
	})
})

describe("normalizeNumeric", () => {
	it("folds Arabic-Indic digits and the Arabic decimal separator", () => {
		expect(normalizeNumeric("١٬٢٣٤٬٥٦٧٫٨٩")).toBe("1234567.89")
	})

	it("folds Persian digits", () => {
		expect(normalizeNumeric("۰۱۲۳")).toBe("0123")
	})

	it("strips ASCII thousand separators and spaces", () => {
		expect(normalizeNumeric("1,234.56")).toBe("1234.56")
		expect(normalizeNumeric("1 234.56")).toBe("1234.56")
	})

	it("leaves numbers and edge inputs alone", () => {
		expect(normalizeNumeric(42)).toBe("42")
		expect(normalizeNumeric(null)).toBe("")
		expect(normalizeNumeric(undefined)).toBe("")
		expect(normalizeNumeric("")).toBe("")
	})
})

describe("tax display (labels only, never authoritative)", () => {
	it("splits an inclusive price into base + tax", () => {
		const r = resolveTaxDisplay(115, 0.15)
		expect(r.mode).toBe("inclusive")
		expect(r.base).toBe(100)
		expect(r.tax).toBe(15)
		expect(r.total).toBe(115)
	})

	it("adds exclusive tax on top of the base price", () => {
		const r = resolveTaxDisplay(100, { rate: 0.15, inclusion: "exclusive" })
		expect(r.mode).toBe("exclusive")
		expect(r.base).toBe(100)
		expect(r.tax).toBe(15)
		expect(r.total).toBe(115)
	})

	it("carries the profile key when given a real profile", () => {
		const profile = TAX_PROFILES.find((p) => p.key === "tax_inclusive_15")
		const r = resolveTaxDisplay(115, profile)
		expect(r.profileKey).toBe("tax_inclusive_15")
		expect(r.label).toBe(profile.nameAr)
	})

	it("resolves a localized label through an injected translate fn", () => {
		const label = taxLabel("tax_exclusive_15", {
			translate: () => "Tax added on top",
		})
		expect(label).toBe("Tax added on top")
	})

	it("returns the Arabic default label without a translator", () => {
		expect(taxLabel("tax_inclusive_0")).toBe("بدون ضريبة")
		expect(taxLabel("does.not.exist", { fallback: "--" })).toBe("--")
	})
})
