import { describe, expect, it } from "vitest";

import {
	digitsOnly,
	isEmptyArabic,
	normalizeArabic,
	normalizeSearchTokens,
} from "../src/utils/arabic.js";

describe("normalizeArabic", () => {
	it("strips diacritics (tashkeel)", () => {
		expect(normalizeArabic("بَيْت")).toBe("بيت");
		expect(normalizeArabic("مُحَمَّد")).toBe("محمد");
	});

	it("folds hamza variants to base letter", () => {
		expect(normalizeArabic("أحمد")).toBe("احمد");
		expect(normalizeArabic("إسلام")).toBe("اسلام");
		expect(normalizeArabic("آمن")).toBe("امن");
	});

	it("folds ta-marbuta to ha", () => {
		expect(normalizeArabic("مدرسة")).toBe("مدرسه");
		expect(normalizeArabic("مدرسة")).toBe("مدرسه"); // ثابت ومتكرر
	});

	it("folds alef-maksura to ya", () => {
		expect(normalizeArabic("على")).toBe("علي");
		expect(normalizeArabic("مستشفى")).toBe("مستشفي");
	});

	it("converts Arabic-Indic digits to Latin", () => {
		expect(normalizeArabic("١٢٣٤٥")).toBe("12345");
		expect(normalizeArabic("٠")).toBe("0");
	});

	it("converts Persian digits to Latin", () => {
		expect(normalizeArabic("۱۲۳")).toBe("123");
		expect(normalizeArabic("۰")).toBe("0");
	});

	it("collapses whitespace and lowercases", () => {
		expect(normalizeArabic("  بيت   كبير  ")).toBe("بيت كبير");
	});

	it("returns empty string for non-string input", () => {
		expect(normalizeArabic(null)).toBe("");
		expect(normalizeArabic(undefined)).toBe("");
		expect(normalizeArabic(123)).toBe("");
		expect(normalizeArabic("")).toBe("");
	});

	it("equates same word with different forms", () => {
		expect(normalizeArabic("بَيْت")).toBe(normalizeArabic("بيت"));
		expect(normalizeArabic("أحمد")).toBe(normalizeArabic("احمد"));
	});

	it("handles full sentence", () => {
		expect(normalizeArabic("السَّلَامُ عَلَيْكُمْ")).toBe("السلام عليكم");
	});
});

describe("normalizeSearchTokens", () => {
	it("splits on punctuation and Arabic punctuation", () => {
		expect(normalizeSearchTokens(" foo, bar; baz ")).toEqual(["foo", "bar", "baz"]);
		expect(normalizeSearchTokens("أحمد.محمد;علي")).toEqual(["احمد", "محمد", "علي"]);
	});

	it("filters empty tokens from consecutive separators", () => {
		expect(normalizeSearchTokens(" , , ,foo")).toEqual(["foo"]);
	});

	it("handles Arabic question marks and exclamation", () => {
		expect(normalizeSearchTokens("أهلاً! كيف حالك؟")).toEqual(["اهلا", "كيف", "حالك"]);
	});

	it("returns empty array for empty/whitespace input", () => {
		expect(normalizeSearchTokens("")).toEqual([]);
		expect(normalizeSearchTokens("   ")).toEqual([]);
	});
});

describe("isEmptyArabic", () => {
	it("returns true for empty strings", () => {
		expect(isEmptyArabic("")).toBe(true);
		expect(isEmptyArabic("   ")).toBe(true);
	});

	it("returns true for non-string types", () => {
		expect(isEmptyArabic(null)).toBe(true);
		expect(isEmptyArabic(undefined)).toBe(true);
		expect(isEmptyArabic(0)).toBe(true);
	});

	it("returns false for actual content", () => {
		expect(isEmptyArabic("أحمد")).toBe(false);
		expect(isEmptyArabic("a")).toBe(false);
	});
});

describe("digitsOnly", () => {
	it("strips non-digit characters", () => {
		expect(digitsOnly("+966 55 123 4567")).toBe("966551234567");
		expect(digitsOnly("05-1234-5678")).toBe("0512345678");
	});

	it("preserves all digits", () => {
		expect(digitsOnly("1234567890")).toBe("1234567890");
	});

	it("returns empty string for non-string input", () => {
		expect(digitsOnly(null)).toBe("");
		expect(digitsOnly(12345)).toBe("");
	});

	it("handles empty string", () => {
		expect(digitsOnly("")).toBe("");
	});
});
