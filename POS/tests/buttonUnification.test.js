/**
 * Button unification — one family, measured, with the direction pinned.
 *
 * ## What the audit found (POS/src, 323 files)
 *
 *   family         call sites   vocabulary
 *   ────────────────────────────────────────────────────────────────
 *   raw <button>      169      none — no ring, no tokens, no loading state
 *   `Button`           66      theme × variant (gray/blue/green/red)
 *   `DyButton`         61      variant (primary/secondary/…/warning)
 *   `ActionButton`      9      theme × variant, Carbon + Fluent palettes
 *   `IconButton`        3      a fourth token vocabulary again
 *
 * Four implementations of "a button". "Add a new button style" meant picking
 * one of three vocabularies, and no reviewer could tell which was canonical.
 *
 * ## Why `ActionButton` survived and the others did not
 *
 * It is the only family carrying the full Carbon AND Fluent palettes, six
 * sizes (xs…2xl), icon-only mode, `route`/`link` navigation, `prefix`/
 * `suffix` slots, a focus-visible ring, and token-resolved colours. Unifying
 * onto `Button` (66 call sites, four themes) or `DyButton` (61 call sites,
 * seven variants) would have deleted capability while calling it cleanup.
 *
 * `Button` survives as a shim that forwards to `ActionButton`, so the 66 call
 * sites resolve while the vocabulary converges on one name.
 *
 * ## The two dead contracts this caught
 *
 * This is not a style gate. It fails on:
 *
 *   1. a `<ActionButton>` whose `variant` the survivor does not paint — a
 *      typo'd variant falls through to `palette.subtle` silently, so a
 *      "danger" button renders neutral and nobody notices;
 *   2. a kit tag used in a template with no matching import. Five such tags
 *      existed. They render in production ONLY because `main.js` registers a
 *      few kit components globally, and they render as *unknown elements* the
 *      moment a test mounts the component — which is why no existing suite
 *      could ever have caught them.
 *
 * ## The ratchet
 *
 * `DyButton` must stay at zero, and the shim must stay a shim (no template).
 * Raw `<button>` is capped rather than banned: a raw button is legitimate for
 * a custom-drawn control, and forcing the kit onto those would trade a real
 * defect for a cosmetic one. The cap only moves down.
 */
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const SRC = join(POS, "src")
const KIT = join(POS, "packages", "dypos-ui", "src", "components")

const walk = (dir, out = []) => {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, e.name)
		if (e.isDirectory()) walk(full, out)
		else if (/\.(vue|js)$/.test(e.name)) out.push(full)
	}
	return out
}

const vueFiles = walk(SRC).filter((f) => f.endsWith(".vue"))
const rel = (f) => relative(SRC, f).replace(/\\/g, "/")

/* ── The survivor's vocabulary, READ from the source rather than restated ──
 * Restating the list here would let it drift from the implementation, and the
 * gate would then go green on a variant that no longer paints. It is parsed
 * instead — and the first test asserts the parse is not vacuous, because an
 * empty parse makes every assertion below silently true. */
const actionButton = readFileSync(join(KIT, "ActionButton.vue"), "utf8")

const themes = new Set(
	[...actionButton.matchAll(/^\t([a-z]+):\s*\{/gm)].map((m) => m[1]),
)
const variants = new Set(
	[...actionButton.matchAll(/^\t\t([a-z]+):\s*$/gm)].map((m) => m[1]),
)
describe("one button family", () => {
	it("the vocabulary this gate checks is non-empty", () => {
		expect(themes.size).toBeGreaterThan(0)
		expect(variants.size).toBeGreaterThan(0)
	})

	it("DyButton stays retired: zero references anywhere in src", () => {
		// It was a second token vocabulary with seven variants. It is deleted;
		// this is the ratchet, because "just one screen needs primary" is how
		// the second vocabulary came back.
		const hits = []
		for (const f of walk(SRC)) {
			if (/DyButton/.test(readFileSync(f, "utf8"))) hits.push(rel(f))
		}
		expect(hits, `DyButton is back in: ${hits.join(", ")}`).toEqual([])
	})

	it("the retired Button stays a shim: it forwards, it does not reimplement", () => {
		const shim = readFileSync(join(KIT, "Button.vue"), "utf8")

		// A template IS correct here — it forwards attributes, listeners and
		// both slots to the survivor. What must never come back is the styling
		// logic: the size/variant/palette tables, the click handling, the
		// loading state. Those are the second implementation.
		expect(shim).toMatch(/<template>/)
		expect(shim).toMatch(/ActionButton/)
		expect(
			shim,
			[
				"Button.vue re-implements the button again.",
				"The size/variant/palette tables and the click handler belong to",
				"ActionButton alone — that duplication is what this unification removed.",
			].join(" "),
		).not.toMatch(/\bSIZE\s*=\s*\{/)
		expect(shim).not.toMatch(/\bPALETTE\s*=\s*\{/)
		expect(shim).not.toMatch(/function onClick|const onClick/)
		// And it must forward the default slot: a shim that drops it renders an
		// empty box, which is what the first `$createElement` version did.
		expect(shim).toMatch(/<slot\s*\/>/)
	})
})

describe("no variant that silently falls through to subtle", () => {
	it("every variant on an ActionButton is one the survivor paints", () => {
		const bad = []
		for (const f of vueFiles) {
			const t = readFileSync(f, "utf8")
			for (const m of t.matchAll(/<ActionButton\b[\s\S]{0,600}?>/g)) {
				// LITERAL attributes only. `:variant="x"` is a variable resolved
				// at runtime; matching it here reported three working bindings
				// as unknown variants, and a gate that cries wolf teaches people
				// to ignore it.
				for (const v of m[0].matchAll(/(?<!:)\bvariant="([a-zA-Z-]+)"/g)) {
					if (!variants.has(v[1])) bad.push(`${rel(f)}: ${v[1]}`)
				}
			}
		}
		expect(
			bad,
			[
				`variant= values ActionButton cannot paint: ${bad.join(", ")}.`,
				'An unknown variant falls through to palette.subtle, so a "danger"',
				"button renders neutral — a silent, invisible regression.",
			].join(" "),
		).toEqual([])
	})

	it("every theme on an ActionButton is one the survivor knows", () => {
		const bad = []
		for (const f of vueFiles) {
			const t = readFileSync(f, "utf8")
			for (const m of t.matchAll(/<ActionButton\b[\s\S]{0,600}?>/g)) {
				for (const v of m[0].matchAll(/(?<!:)\btheme="([a-zA-Z-]+)"/g)) {
					if (!themes.has(v[1])) bad.push(`${rel(f)}: ${v[1]}`)
				}
			}
		}
		expect(
			bad,
			[
				`unknown themes: ${bad.join(", ")}.`,
				"ActionButton falls back to the neutral-ink palette for an unrecognised theme.",
			].join(" "),
		).toEqual([])
	})
})

describe("no kit tag used without an import", () => {
	it("every Button/ActionButton/FeatherIcon/IconButton tag is imported", () => {
		// The five violations this found were invisible to every other gate:
		// they resolve in production through `main.js`'s global registry, and
		// break in a test. AGENTS.md records the identical defect for
		// `<StepCard>`/`<ShortcutKey>`.
		const bad = []
		for (const f of vueFiles) {
			const t = readFileSync(f, "utf8")
			const lastScript = t.lastIndexOf("</script>")
			const imports = lastScript === -1 ? t : t.slice(0, lastScript)
			for (const tag of [
				"Button",
				"ActionButton",
				"FeatherIcon",
				"IconButton",
			]) {
				if (!new RegExp(`<${tag}\\b`).test(t)) continue
				const declared = new RegExp(
					`import\\s*\\{[\\s\\S]*?\\b${tag}\\b[\\s\\S]*?\\}\\s*from\\s*["'][^"']+["']`,
				).test(imports)
				if (!declared) bad.push(`${tag} in ${rel(f)}`)
			}
		}
		expect(bad, `unimported tags: ${bad.join(", ")}`).toEqual([])
	})
})

describe("raw <button> ratchet", () => {
	it("stays at or under the measured count, and the cap only moves down", () => {
		// 169 at the time of the audit. Not banned: a hand-drawn control is a
		// legitimate reason to use a raw element. But the number is now
		// measured, so it cannot quietly grow — and every one removed is a
		// button that gained a focus ring and a loading state.
		// 169 → 168: IconButton became a shim over ActionButton, so its raw
		// <button> is gone and the empty-cart control gained a real variant.
		// Direction: downward only.
		const CAP = 168
		const count = vueFiles.reduce(
			(sum, f) =>
				sum + (readFileSync(f, "utf8").match(/<button\b/g)?.length || 0),
			0,
		)
		expect(
			count,
			[
				`raw <button> count is ${count} (cap ${CAP}).`,
				"Convert them to ActionButton, or lower the cap in this file in the same commit.",
			].join(" "),
		).toBeLessThanOrEqual(CAP)
	})
})
