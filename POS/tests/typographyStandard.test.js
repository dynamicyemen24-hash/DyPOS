/**
 * المعيار الطباعي الإلزامي — IBM Plex Sans Arabic + Inter.
 *
 * تثبت البوابة أن:
 *  1. أوزان Plex العربية (400/600/700) مستوردة محليًا — لا شبكة ولا بديل صامت.
 *  2. حزم الخطوط تبدأ بـ Plex للعربية وInter للإنجليزية والأرقام.
 *  3. أحجام الكاشير ضمن المدى الملزم (أصناف 16–18 · أسعار 18–22 ·
 *     إجمالي 26–32 · ثانوي 13–15) والأوزان 400/600/700 معلنة.
 *  4. وجوه Plex العربية تحمل unicode-range (لا تنافس اللاتينية والأرقام).
 *  5. تباين WCAG AA محسوب من الرموز الفعلية (نص/خلفية، خافت/خلفية،
 *     زر/نص الزر ≥ 4.5) — لا ادعاء، بل نسبة محسوبة.
 *  6. الأهداف الأساسية ≥ 44px (الوحدات والمشغّل) وشريط القوائم ≥ 40px.
 */
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const read = (...p) => readFileSync(join(POS, ...p), "utf8")

const entry = () => read("src", "index.css")
const tokens = () => read("src", "styles", "dypos", "tokens.css")
const themes = () => read("src", "styles", "dypos", "themes.css")
const accents = () => read("src", "styles", "dypos", "accents.css")

function stackOf(source, token) {
	const m = new RegExp(`${token}:\\s*([^;]+);`).exec(source)
	expect(m, `الرمز ${token} غير معلن`).toBeTruthy()
	return m[1].trimStart()
}

function pxOf(source, token) {
	const m = new RegExp(`${token}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(source)
	expect(m, `الحجم ${token} غير معلن بالبكسل`).toBeTruthy()
	return Number(m[1])
}

// WCAG 2.1 relative luminance + contrast (same math every auditor uses).
function luminance(hex) {
	const rgb = [1, 3, 5].map((i) => {
		const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}
const ratio = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

// Light scope only (the RULE blocks, never a doc comment that merely names a
// theme — slicing to the first textual hit once ended the range early).
function lightBlock() {
	const source = themes()
	const start = /^:root,\s*\n\[data-theme="light"\] \{/m.exec(source)
	expect(start, "نطاق السمة الفاتحة").toBeTruthy()
	const end = /^\[data-theme="dark"\] \{/m.exec(source)
	expect(end, "نطاق السمة الداكنة").toBeTruthy()
	return source.slice(start.index, end.index)
}
function firstDecl(source, token) {
	const m = new RegExp(`${token}:\\s*([^;]+);`).exec(source)
	return m ? m[1].trim() : null
}
function resolveColor(token) {
	let value =
		firstDecl(lightBlock(), token) ??
		firstDecl(tokens(), token) ??
		firstDecl(accents(), token)
	expect(value, `اللون ${token} بلا قيمة`).toBeTruthy()
	for (let hop = 0; hop < 6 && value.startsWith("var("); hop++) {
		const inner = /^var\(\s*(--[\w-]+)/.exec(value)?.[1]
		expect(inner, `مرجع مكسور ${value}`).toBeTruthy()
		value =
			firstDecl(lightBlock(), inner) ??
			firstDecl(tokens(), inner) ??
			firstDecl(accents(), inner)
		expect(value, `المرجع ${inner} بلا قيمة`).toBeTruthy()
	}
	expect(value, `${token} لم يُحلّ إلى hex`).toMatch(/^#[0-9a-fA-F]{6}$/)
	return value
}

function minHeightOf(source, selector) {
	const m = new RegExp(`${selector}\\s*\\{[^}]*?min-height:\\s*(\\d+)px`).exec(
		source,
	)
	expect(m, `${selector} بلا min-height مقاس`).toBeTruthy()
	return Number(m[1])
}

describe("المعيار الطباعي (Plex + Inter)", () => {
	it("أوزان Plex العربية الثلاثة مستوردة محليًا وبمدى unicode-range", () => {
		for (const weight of [400, 600, 700]) {
			const rel = `node_modules/@fontsource/ibm-plex-sans-arabic/arabic-${weight}.css`
			expect(entry()).toContain(
				`@fontsource/ibm-plex-sans-arabic/arabic-${weight}.css`,
			)
			expect(existsSync(join(POS, rel)), `ملف الخط مفقود: ${rel}`).toBe(true)
		}
		// المدى في الوحدة المحلية (نمط cairo-arabic.css): الحزمة لا تعلنه.
		const faces = read("src", "styles", "fonts", "plex-arabic.css").replace(
			/\/\*[\s\S]*?\*\//g,
			"",
		)
		const blocks = [...faces.matchAll(/@font-face\s*\{([^}]*)\}/g)]
			.map((m) => m[1])
			.filter((block) =>
				/font-family:\s*["']IBM Plex Sans Arabic["']/.test(block),
			)
		expect(blocks.length).toBe(3)
		for (const block of blocks) {
			expect(block).toMatch(/font-weight:\s*(400|600|700)/)
			expect(block).toMatch(/unicode-range:\s*U\+0600-06FF/)
			expect(block).toMatch(/U\+FB50-FDFF/)
		}
	})

	it("الحزم تبدأ بـ Plex للعربية وInter للإنجليزية والأرقام", () => {
		expect(
			stackOf(entry(), "--dy-font-ar").indexOf('"IBM Plex Sans Arabic"'),
		).toBe(0)
		expect(
			stackOf(entry(), "--dy-font-ui").indexOf('"IBM Plex Sans Arabic"'),
		).toBe(0)
		expect(
			stackOf(tokens(), "--dy-font-sans").indexOf('"IBM Plex Sans Arabic"'),
		).toBe(0)
		expect(
			stackOf(tokens(), "--dy-font-arabic").indexOf('"IBM Plex Sans Arabic"'),
		).toBe(0)
		const money = stackOf(tokens(), "--dy-font-money")
		// النقدية: Inter للأرقام اللاتينية قبل Plex — العملة تُرسم بالأرقام أولًا.
		expect(money.indexOf('"Inter"')).toBeGreaterThan(-1)
		expect(
			money.indexOf('"Inter"') < money.indexOf('"IBM Plex Sans Arabic"'),
		).toBe(true)
	})

	it("أحجام الكاشير ضمن المدى الملزم والأوزان معلنة", () => {
		const t = tokens()
		const product = pxOf(t, "--dy-type-product")
		const price = pxOf(t, "--dy-type-price")
		const total = pxOf(t, "--dy-type-total")
		const secondary = pxOf(t, "--dy-type-secondary")
		expect(product >= 16 && product <= 18, `الأصناف ${product}`).toBe(true)
		expect(price >= 18 && price <= 22, `الأسعار ${price}`).toBe(true)
		expect(total >= 26 && total <= 32, `الإجمالي ${total}`).toBe(true)
		expect(secondary >= 13 && secondary <= 15, `الثانوي ${secondary}`).toBe(
			true,
		)
		for (const [token, weight] of [
			["--dy-weight-regular", "400"],
			["--dy-weight-semibold", "600"],
			["--dy-weight-bold", "700"],
		]) {
			expect(new RegExp(`${token}:\\s*${weight}`).test(t), token).toBe(true)
		}
	})

	it("تباين AA محسوب من الرموز الفعلية (≥ 4.5)", () => {
		const text = resolveColor("--dy-text")
		const bg = resolveColor("--dy-bg")
		const muted = resolveColor("--dy-text-muted")
		const primary = resolveColor("--dy-primary")
		const onPrimary = resolveColor("--dy-primary-contrast")
		expect(ratio(text, bg), "نص/خلفية").toBeGreaterThanOrEqual(4.5)
		expect(ratio(muted, bg), "خافت/خلفية").toBeGreaterThanOrEqual(4.5)
		expect(ratio(onPrimary, primary), "زر/نص الزر").toBeGreaterThanOrEqual(4.5)
		// لون صف التنبيه الحرج على السطح — نفس الحساب لا Fallback.
		const danger = resolveColor("--dy-danger")
		const surface = resolveColor("--dy-surface")
		expect(ratio(danger, surface), `حرج/سطح`).toBeGreaterThanOrEqual(4.5)
	})

	it("أهداف اللمس الأساسية ≥ 44px", () => {
		const home = read("src", "components", "reports", "DashboardPage.vue")
		const strip = read("src", "components", "work", "WorkMenuStrip.vue")
		expect(
			minHeightOf(home, ".home-module"),
			"البلاطات",
		).toBeGreaterThanOrEqual(44)
		expect(
			minHeightOf(home, ".home-operator"),
			"زر المشغّل",
		).toBeGreaterThanOrEqual(44)
		expect(
			minHeightOf(home, ".home-alerts__go"),
			"سهم التنبيه",
		).toBeGreaterThanOrEqual(44)
		expect(
			minHeightOf(strip, ".work-menu-strip__item"),
			"شريط القوائم",
		).toBeGreaterThanOrEqual(40)
	})
})
