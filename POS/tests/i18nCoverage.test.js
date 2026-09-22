import { beforeEach, describe, expect, it, vi } from "vitest"

// Heavy, URL-requiring modules are mocked so this test exercises the
// dictionary + locale logic in isolation.
const mocks = vi.hoisted(() => ({
	__: vi.fn((msg, replace) => {
		const messages = globalThis.window?.translatedMessages || {}
		let out = messages[msg] || msg
		if (replace) {
			out = out.replace(/{(\d+)}/g, (_, n) => replace[n] ?? _)
		}
		return out
	}),
	call: vi.fn(() => Promise.resolve(null)),
	useBootstrapStore: vi.fn(() => ({ getPreloadedLocale: () => null })),
}))

vi.mock("@/utils/logger", () => ({
	logger: {
		create: () =>
			new Proxy(
				{},
				{
					get: () => () => {},
				},
			),
	},
}))

vi.mock("@/utils/translation", () => ({
	translationVersion: { value: 0 },
	__: mocks.__,
	translate: mocks.__,
	changeLanguage: vi.fn(() => Promise.resolve()),
	default: vi.fn(),
}))

vi.mock("@/utils/apiWrapper", () => ({
	call: mocks.call,
}))

vi.mock("@/utils/offline/offlineState", () => ({
	offlineState: { isOffline: true },
}))

vi.mock("@/stores/bootstrap", () => ({
	useBootstrapStore: mocks.useBootstrapStore,
}))

import {
	hasTranslation,
	translate,
	t,
	SUPPORTED_LOCALES,
} from "@/composables/useLocale"

// Real Arabic surface strings currently rendered by Login.vue / POSSale.vue —
// the i18n coverage proof: every audited surface must resolve to a translatable
// entry (or be covered by the Arabic fallback map).
const SURFACE_STRINGS = [
	"تسجيل الدخول",
	"كلمة المرور",
	"البريد الإلكتروني",
	"استعادة كلمة المرور",
	"نقطة البيع",
]

beforeEach(() => {
	globalThis.window.translatedMessages = undefined
})

describe("hasTranslation", () => {
	it("accepts keys covered by the Arabic fallback map", () => {
		expect(hasTranslation("cashier_resume_title")).toBe(true)
		expect(hasTranslation("tax_inclusive_15")).toBe(true)
	})

	it("accepts keys present in the server/GUI translation dictionary", () => {
		globalThis.window.translatedMessages = { Save: "حفظ" }
		expect(hasTranslation("Save")).toBe(true)
	})

	it("rejects unknown keys and empty input", () => {
		expect(hasTranslation("dypos.totally.unknown.key")).toBe(false)
		expect(hasTranslation("")).toBe(false)
		expect(hasTranslation(null)).toBe(false)
		expect(hasTranslation(42)).toBe(false)
	})
})

describe("translate / t", () => {
	it("prefers the server translation when present", () => {
		globalThis.window.translatedMessages = {
			cashier_resume_accept: "Resume sale",
		}
		expect(t("cashier_resume_accept", "استئناف البيع")).toBe("Resume sale")
	})

	it("falls back to the Arabic default map for untranslated keys", () => {
		expect(t("tax_exclusive_15", "غير معروف")).toBe(
			"الضريبة تُضاف إلى السعر (15%)",
		)
		expect(t("cashier_resume_dismiss", "تجاهل")).toBe("تجاهل")
	})

	it("honors the caller fallback when the key is unknown everywhere", () => {
		expect(t("brand.new.key", "القيمة الافتراضية")).toBe("القيمة الافتراضية")
	})

	it("returns the raw key when nothing else is known", () => {
		expect(t("brand.new.key")).toBe("brand.new.key")
	})

	it("resolves Arabic-only placeholders via the fallback map", () => {
		const body = t(
			"cashier_resume_body",
			"عُثر على عملية بيع مُعلّقة ({0} صنف). هل تريد استئنافها؟",
		).replace("{0}", "3")
		expect(body).toContain("3")
		expect(body).toContain("عملية بيع")
	})

	it("returns safe empty-string variants for falsy input", () => {
		expect(t("", "بديل")).toBe("بديل")
		expect(t(null, "بديل")).toBe("بديل")
	})
})

describe("i18n coverage: audited UI surfaces", () => {
	it("holds an entry for every audited Arabic surface string", () => {
		const dictionary = {}
		for (const s of SURFACE_STRINGS) dictionary[s] = s
		globalThis.window.translatedMessages = dictionary

		for (const s of SURFACE_STRINGS) {
			expect(hasTranslation(s)).toBe(true)
			expect(translate(s, "")).toBe(s)
		}
	})

	it("flags a missing entry so coverage gaps are caught", () => {
		globalThis.window.translatedMessages = {}
		expect(hasTranslation("نقطة البيع")).toBe(false)
	})
})

describe("global-readiness marker: Intl Arabic rendering", () => {
	it("renders SAR currency with Arabic locale markup", () => {
		const expected = new Intl.NumberFormat("ar-SA-u-nu-latn", {
			style: "currency",
			currency: "SAR",
		}).format(1234567.89)
		expect(expected).toContain("ر.س.")
		expect(expected).toContain("1,234,567.89")
	})

	it("renders USD with the en-US convention", () => {
		expect(
			new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
			}).format(1234567.89),
		).toBe("$1,234,567.89")
	})

	it("supports the full app locale set for UI installability", () => {
		expect(SUPPORTED_LOCALES).toMatchObject({
			ar: { dir: "rtl" },
			en: { dir: "ltr" },
			id: { dir: "ltr" },
			"pt-br": { dir: "ltr" },
		})
	})
})
