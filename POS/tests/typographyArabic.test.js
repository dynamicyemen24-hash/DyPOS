/**
 * Arabic typography contract — the defects this gate exists for.
 *
 * Typography bugs are invisible in a unit test and lethal on a till: a clipped
 * diacritic, a price column that stops lining up, a code rendered in a font
 * nobody installed. All four shipped with a fully green suite because nothing
 * asserted the contract. Each assertion below states the DEFECT, not a
 * preference, so reintroducing it fails the build.
 *
 * 1. `unicode-range` on the Arabic face. `@fontsource/cairo` ships none, so
 *    without it Cairo competes for Latin and digits too — a right-aligned price
 *    column loses alignment even though `tabular-nums` is set on it.
 * 2. No dead font token. `--dy-font-mono` listed "JetBrains Mono", which is in
 *    neither package.json nor node_modules: every consumer silently fell back
 *    while the declaration read as a deliberate choice.
 * 3. Arabic wrapping rules at the ROOT. A long Arabic name cannot be
 *    hyphenated, so without a break rule it overflows a 320px column — and only
 *    in the locale CI does not test.
 * 4. Bidi isolation on POS numbers. `direction: ltr` alone lets surrounding
 *    Arabic reorder around the digits, so "12.50" can render as "50.12".
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8")

const entry = () => read("src", "index.css")
const base = () => read("src", "styles", "dypos", "base.css")
const tokens = () => read("src", "styles", "dypos", "tokens.css")
// The Cairo faces live in their own module: CSS requires every @import to
// precede every other at-rule, and index.css imports the design system below.
// Comments are stripped first — a face MENTIONED in a doc comment would
// otherwise be parsed as a real declaration, which is how a gate ends up
// counting its own documentation.
const cairoFaces = () =>
	read("src", "styles", "fonts", "cairo-arabic.css").replace(
		/\/\*[\s\S]*?\*\//g,
		"",
	)

describe("Arabic typography", () => {
	it("every locally-declared Cairo face declares a unicode-range", () => {
		const faces = [...cairoFaces().matchAll(/@font-face\s*\{([^}]*)\}/g)]
			.map((m) => m[1])
			.filter((block) => /font-family:\s*["']Cairo["']/.test(block))
		expect(faces.length).toBeGreaterThanOrEqual(5)

		for (const block of faces) {
			const weight = /font-weight:\s*(\d+)/.exec(block)?.[1]
			expect(block).toMatch(/unicode-range:\s*U\+0600-06FF/)
			// A range on ONE weight fixes nothing: the browser downloads the
			// unranged faces for the other weights used on the same screen.
			expect(
				weight,
				"every Cairo face needs a weight to be identifiable",
			).toBeTruthy()
		}
	})

	it("the Cairo range covers the Arabic Presentation Forms the UI renders", () => {
		const range = /unicode-range:\s*([^;]+);/.exec(cairoFaces())
		expect(range).toBeTruthy()
		// U+FB50-FDFF is what the shaper emits for lam-alef ligatures; without it a
		// ligature falls back to a system font in the middle of a word.
		expect(range[1]).toMatch(/U\+FB50-FDFF/)
		expect(range[1]).toMatch(/U\+FE70-FEFF/)
	})

	it("no font token names a family the project does not ship", () => {
		const declared = [
			...tokens().matchAll(/--dy-font-[\w-]+:\s*([^;]+);/g),
		].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((f) => f[1]))
		// Shipped here: Inter (src/assets/Inter), Cairo (@fontsource/cairo),
		// IBM Plex Sans Arabic (@fontsource/ibm-plex-sans-arabic), the
		// riyal glyph font. Everything else must be a platform stack the device
		// actually resolves — never a family name that resolves to nothing.
		const shipped = new Set(["Inter", "Cairo", "IBM Plex Sans Arabic", "SaudiRiyalSymbol"])
		const platform = new Set([
			"Segoe UI",
			"Arial",
			"Tahoma",
			"Noto Sans Arabic",
			"SFMono-Regular",
			"Consolas",
			"Liberation Mono",
			"Courier New",
		])
		const generic = /^(ui-monospace|monospace|sans-serif|serif|system-ui)$/i

		for (const family of declared) {
			expect(
				shipped.has(family) || platform.has(family) || generic.test(family),
				`--dy-font-* names "${family}", which is neither shipped nor a platform stack`,
			).toBe(true)
		}
	})

	it("the mono token does not name the uninstalled JetBrains Mono", () => {
		const mono = /--dy-font-mono:\s*([^;]+);/.exec(tokens())
		expect(mono).toBeTruthy()
		expect(mono[1]).not.toMatch(/JetBrains/)
	})

	it("Arabic wrapping and leading rules live at the root, not per screen", () => {
		const rootBlock = /body,\s*\nbutton,[\s\S]{0,200}?\{([^}]*)\}/.exec(base())
		expect(rootBlock, "no root typography rule found in base.css").toBeTruthy()
		const block = rootBlock[1]
		expect(block).toMatch(/word-break:\s*normal/)
		expect(block).toMatch(/line-break:\s*strict/)
		expect(block).toMatch(/overflow-wrap:\s*break-word/)
		expect(block).toMatch(/line-height:\s*var\(--dy-leading-ar\)/)
	})

	it("the Arabic leading tokens are declared", () => {
		expect(base()).toMatch(/--dy-leading-ar:\s*1\.\d/)
		expect(base()).toMatch(/--dy-leading-ar-tight:\s*1\.\d/)
	})

	it("POS numbers are bidi-isolated, not merely LTR-directed", () => {
		const block = /\.dy-numeric,[\s\S]{0,240}?\{([^}]*)\}/.exec(base())
		expect(block, "the numeric utility block was not found").toBeTruthy()
		expect(block[1]).toMatch(/direction:\s*ltr/)
		// The one that actually matters: without isolation the surrounding Arabic
		// reorders around the digits and "12.50" renders as "50.12".
		expect(block[1]).toMatch(/unicode-bidi:\s*isolate/)
	})

	it("Latin runs inside Arabic UI opt back out of the Arabic breaking rules", () => {
		expect(base()).toMatch(/\.dy-latin-run[\s\S]{0,220}?line-break:\s*auto/)
	})

	it("a long Arabic product name keeps a bounded break utility", () => {
		// The concrete symptom: a 40-character Arabic name in a 320px column with
		// no hyphenation point either clips or adds a horizontal scrollbar to the
		// till. The utility lives in utilities.css (that is where the rest of the
		// one-off helpers are), so the gate reads it there rather than assuming.
		const utilities = read("src", "styles", "dypos", "utilities.css")
		expect(utilities).toMatch(/\.dy-break-words[\s\S]{0,140}?overflow-wrap/)
		// …and it must not fall back to `anywhere`, which also breaks INSIDE short
		// words and visibly damages ordinary Arabic text.
		expect(utilities).not.toMatch(
			/\.dy-break-words[\s\S]{0,140}?overflow-wrap:\s*anywhere/,
		)
	})
})
