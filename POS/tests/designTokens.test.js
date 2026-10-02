/**
 * Design-token single-source gate.
 *
 * The repo carried two design systems for years. `styles/brand/variables.css`
 * declared 278 custom properties, 74 of which the DyPOS tree already owned —
 * with DIFFERENT values, and `main.js` imports that file *after* `index.css`,
 * so the legacy layer won every conflict. The measured consequences:
 *
 *   - Dark mode was dead. `[data-theme="dark"]` in themes.css has the same
 *     specificity as the legacy `:root` rules, and the legacy file came later
 *     in source order, so it overrode every dark surface. The app rendered
 *     light no matter what `useAppTheme` set.
 *   - Accent switching was dead. `--dy-accent` was pinned to a desert-gold
 *     step, so `[data-accent="emerald"]` in accents.css had no effect.
 *   - The z-index ladder was split across two disagreeing scales.
 *
 * None of that failed a test, because nothing measured the tokens. This file
 * is the measurement, and it is deliberately a *source* check: no DOM, no
 * bundler, no network, so it still runs when a runtime dependency is gone.
 *
 * ── The runtime twins ───────────────────────────────────────────────────────
 * Three defects that shipped on a green suite, all found by opening the login
 * page in a real browser rather than by running a test:
 *
 *   1. `getState()` in rateLimiterEnhanced.js returned neither `allowed` nor
 *      `retryAfterMs`, while `check()` returned both. A consumer deriving
 *      `allowed` from `getState()` evaluated `!undefined` → `true`, so the
 *      lockout banner rendered permanently on a page that was never locked,
 *      and its countdown printed the literal text "NaN".
 *   2. `<script setup>` unwraps only *top-level* bindings. Reading
 *      `sessionTimeout.showWarning` off the composable's returned object hands
 *      the template a ref object — always truthy — so the expiring-session
 *      dialog stood over the login form on every load, counting down `NaN`.
 *   3. Login inputs were 0.95rem (15.2px). iOS Safari zooms the viewport for
 *      any focused field under 16px, so the page zoomed on an iPhone.
 *
 * The rules below are the receipts. Each names the defect it would catch, and
 * each fails on the exact pre-fix source.
 */
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ref } from "vue"

import { useSecondsRemaining } from "../src/composables/useSecondsRemaining"
import { useRememberedEmail } from "../src/composables/useRememberedEmail"
import {
	PIN_MAX_LENGTH,
	PIN_MIN_LENGTH,
	sanitizePin,
	validatePinPair,
} from "../src/composables/usePinAuthRules"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const SRC = join(POS, "src")
const SYSTEM_DIR = join(SRC, "styles", "dypos")
const LEGACY_FILE = join(SRC, "styles", "brand", "variables.css")

const read = (...p) => readFileSync(join(...p), "utf8")

/**
 * Strip CSS comments before any counting. A comment that *mentions* a token is
 * prose, not a declaration — and prose is exactly how the "legacy redefines
 * the design system" list is computed, so counting it would report a conflict
 * that does not exist.
 */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, " ")

/** Every `--name: value` declaration in a stylesheet. */
const declarationsOf = (css) => {
	const out = new Map()
	for (const m of stripComments(css).matchAll(
		/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g,
	)) {
		out.set(m[1], m[2].trim().replace(/\s+/g, " "))
	}
	return out
}

/** The design system's own files, in cascade order. */
const systemFiles = readdirSync(SYSTEM_DIR).filter((f) => f.endsWith(".css"))
const systemTokens = declarationsOf(
	systemFiles.map((f) => read(SYSTEM_DIR, f)).join("\n"),
)

/** The app-entry CSS also owns a few tokens (fonts, cursor, motion aliases). */
const appTokens = declarationsOf(read(SRC, "index.css"))

const legacyCss = read(LEGACY_FILE)
const legacyTokens = declarationsOf(legacyCss)

/* ── Colour resolution, shared by the contrast gates ─────────────────────────
 * `--dy-text-disabled: var(--dy-ink-700)` is only meaningful once both hops are
 * walked, and the hops live in different files: the theme block maps semantic
 * names, `accents.css` maps the accent scale, `tokens.css` holds the raw
 * palette. Resolving inside one file is how a gate ends up asserting a value
 * the browser never paints — which is exactly what happened while chasing the
 * disabled button: the gate said #334155 while the browser painted #94a3b8
 * (the legacy layer's alias won the cascade). So the resolver walks the same
 * chain, and the legacy-override gate below fails if the two ever disagree.
 */

/** The palette files a theme block falls back to when it names no value. */
const PALETTE = ["accents.css", "tokens.css"]
	.map((f) => read(SYSTEM_DIR, f))
	.join("\n")

/** The first `--name: value;` in a chunk of CSS, or null. */
const declarationIn = (text, name) => {
	const m = text.match(new RegExp(`${name}:\\s*([^;]+);`))
	return m ? m[1].trim() : null
}

/** A custom property, followed through `var()` to a `#hex`, theme first. */
const resolveColor = (name, block = "", depth = 0) => {
	expect(depth, `colour cycle through ${name}`).toBeLessThan(10)
	const value = declarationIn(block, name) ?? declarationIn(PALETTE, name)
	expect(value, `${name} is never declared`).not.toBeNull()
	const hex = value.match(/^#[0-9a-fA-F]{3,8}$/)
	if (hex) return hex[0]
	const ref = value.match(/^var\((--[a-z0-9-]+)(?:,[^)]*)?\)$/)
	expect(
		ref,
		`${name} resolves to "${value}" — neither a hex nor a single var()`,
	).not.toBeNull()
	return resolveColor(ref[1], block, depth + 1)
}

/** The light and dark theme blocks of themes.css. */
const themeBlocks = () => {
	// Comments first: this file *documents* `[data-theme="dark"]` in its header,
	// and prose about a selector is not a selector. Reading raw text put the end
	// of the "light" block inside the introduction, so the light block appeared
	// to declare no text tokens at all — a gate failing for a reason that has
	// nothing to do with the source it claims to measure.
	const css = stripComments(read(SYSTEM_DIR, "themes.css"))
	// themes.css opens with a combined `:root, [data-theme="light"]` rule and
	// later carries `[data-theme="dark"]`, `[data-theme="system"]`, a
	// `prefers-contrast` override, a `prefers-reduced-motion` block and a print
	// block, so each boundary is searched *after* the previous one.
	const start = css.indexOf(":root,")
	const darkStart = css.indexOf('[data-theme="dark"]', start)
	const systemStart = css.indexOf('[data-theme="system"]', darkStart)
	expect(
		start,
		"themes.css opens with :root, [data-theme=light]",
	).toBeGreaterThan(-1)
	expect(
		darkStart,
		"themes.css carries a dark block after the light one",
	).toBeGreaterThan(-1)
	expect(
		systemStart,
		"themes.css carries a system block after the dark one",
	).toBeGreaterThan(-1)
	return {
		light: css.slice(start, darkStart),
		dark: css.slice(darkStart, systemStart),
	}
}

/** WCAG relative luminance of a #rgb / #rrggbb hex. */
const luminance = (hex) => {
	const full = hex.replace("#", "")
	const n = Number.parseInt(
		full.length === 3
			? full
					.split("")
					.map((c) => c + c)
					.join("")
			: full,
		16,
	)
	const channel = (shift) => {
		const v = (n >> shift) & 0xff
		const s = v / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
}

/** WCAG contrast ratio between two hex colours. */
const contrast = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

/** Every source file that can reference a token, minus the one under audit. */
const SKIP_DIRS = new Set(["node_modules", "dist", "dev-dist"])
const SOURCE_EXT = /\.(vue|js|ts|css|html)$/

function walk(dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue
		const full = join(dir, entry.name)
		if (entry.isDirectory()) walk(full, out)
		else if (SOURCE_EXT.test(entry.name)) out.push(full)
	}
	return out
}

const consumerFiles = [
	...walk(SRC).filter((f) => f !== LEGACY_FILE),
	...walk(join(POS, "packages")),
	join(POS, "tailwind.config.js"),
]

/** `var(--x)` references across the whole app, as name → count. */
const references = new Map()
for (const file of consumerFiles) {
	const text = stripComments(read(file))
	for (const m of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
		references.set(m[1], (references.get(m[1]) || 0) + 1)
	}
}

/**
 * Tokens the app sets locally through a `:style` binding, or reads with an
 * inline fallback. Both are legitimate: the value belongs to the component,
 * not to the design system. Listed explicitly so the list stays reviewable —
 * a catch-all regex would quietly absorb real gaps.
 */
const LOCALLY_BOUND = [
	/^--chart-count$/,
	/^--frozen-(left|right)-width$/,
	/^--item-delay$/,
	/^--kpi-count$/,
	/^--label-width$/,
	/^--login-content-width$/,
	/^--register-content-width$/,
	/^--sale-sidebar-width$/,
	/^--scrollbar-thumb(-hover)?$/,
	/^--table-columns$/,
]

const isLocallyBound = (name) => LOCALLY_BOUND.some((re) => re.test(name))

describe("design tokens: one source of truth", () => {
	it("the legacy layer never redefines a token the design system owns", () => {
		// The exact defect: two files, two values, and the winner was whichever
		// the cascade happened to reach last.
		//
		// This gate first shipped as "an alias is fine, a literal is not" — and
		// that rule had a hole you could drive a till through. It passed
		// `--dy-text-disabled: var(--dy-disabled)` here: a var() alias, but an
		// alias to a *different* value than themes.css's own
		// `--dy-text-disabled: var(--dy-ink-700)`. Since main.js imports this
		// file AFTER index.css, the legacy alias won, and the primary button on
		// the login page painted #94a3b8 on a #f1f5f9 fill — 2.2:1, an invisible
		// label. The measured value in the browser disagreed with what this
		// file's own contrast gate computed, which is the only reason the hole
		// was found. So the rule is now about *agreement*, not about syntax.
		const disagreements = [...legacyTokens.entries()]
			.map(([name, legacyValue]) => {
				const owned = systemTokens.get(name) ?? appTokens.get(name)
				if (owned === undefined) return null
				// `--dy-focus-ring-width: var(--dy-focus-width)` on both sides is
				// the same statement twice: harmless, and the legacy layer exists
				// to carry old names. A different value is a second opinion.
				return owned === legacyValue ? null : { name, owned, legacyValue }
			})
			.filter(Boolean)

		expect(
			disagreements.map(
				(d) => `${d.name} (system: ${d.owned} / legacy: ${d.legacyValue})`,
			),
			"styles/brand/variables.css gives these tokens a different value than " +
				"styles/dypos/* owns, and it is imported last, so it wins. Two values " +
				"for one name means the cascade decides — which is how dark mode, " +
				"[data-accent] and the disabled button's label all died. Alias the " +
				"same value with var(--dy-…), or delete the line and let the design " +
				"system own it.",
		).toEqual([])
	})

	it("the legacy layer declares no dead token", () => {
		// A token nobody reads is a second place to change a value when the
		// design moves — and the reason the two systems drifted apart.
		const dead = [...legacyTokens.keys()].filter(
			(name) => !references.has(name),
		)

		expect(
			dead,
			`declared in the legacy layer and referenced nowhere: ${dead.join(", ")}. Delete them, or wire them up.`,
		).toEqual([])
	})

	it("the design system references no token it does not define", () => {
		// `var(--nope)` does not fail loudly: the declaration is dropped and the
		// browser falls back to its initial value. The measured symptom was
		// `--dy-border-width-thin` resolving to `medium` (3px) instead of 1px.
		const known = new Set([
			...systemTokens.keys(),
			...appTokens.keys(),
			...legacyTokens.keys(),
		])
		const missing = [...references.keys()]
			.filter((name) => !known.has(name))
			.filter((name) => !isLocallyBound(name))

		expect(
			missing,
			`read with var() but defined nowhere: ${missing.join(", ")}. A fallback is not a design system.`,
		).toEqual([])
	})

	it("no token points at itself", () => {
		// `--dy-accent: var(--dy-accent-600)` is fine; a token referencing
		// ITSELF is a cycle, and CSS resolves that to the guaranteed-invalid
		// value — silently, with no error anywhere.
		const selfReferencing = []
		for (const [name, value] of [
			...legacyTokens,
			...systemTokens,
			...appTokens,
		]) {
			for (const ref of value.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
				if (ref[1] === name) selfReferencing.push(name)
			}
		}

		expect(
			[...new Set(selfReferencing)],
			"these tokens reference themselves, which CSS resolves to the " +
				"guaranteed-invalid value — no error, just a missing value",
		).toEqual([])
	})

	it("the theme layer is the only owner of the theme attributes", () => {
		// The other half of the dead-dark-mode bug: a second file answering
		// `[data-theme="dark"]` is a second opinion, and the later one wins.
		//
		// Comments are stripped first: this file *documents* the old
		// `[data-theme="dark"]` block it removed, and prose about a selector is
		// not a selector. Reading the raw text made the gate fail on its own
		// changelog — the exact "gate that can never pass" defect the repo
		// already has a name for.
		expect(
			stripComments(legacyCss),
			"the legacy layer must not style [data-theme]; themes.css owns it",
		).not.toMatch(/\[data-theme[~^$*|]?=[^\]]*\]/)

		expect(systemFiles, "themes.css is the theme owner").toContain("themes.css")
	})

	it("the token scan is not vacuous", () => {
		// A walk that found nothing would report all six rules green while the
		// tree looked empty — the same class of lie the audit had before.
		expect(systemFiles.length).toBeGreaterThan(5)
		expect(systemTokens.size).toBeGreaterThan(300)
		expect(legacyTokens.size).toBeGreaterThan(50)
		expect(references.size).toBeGreaterThan(200)
	})
})

/* ============================================================================
 * Runtime-defect receipts (defects 1–3 in the header).
 *
 * These are source gates, not browser gates, on purpose: the browser that
 * found them is not available in CI, and a gate that only a human can run is
 * not a gate. Each one fails on the exact pre-fix text.
 * ========================================================================== */

const LOGIN_VUE = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../src/pages/Login.vue",
)
const RATE_LIMITER = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../src/utils/rateLimiterEnhanced.js",
)
const LOGIN_CSS = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../src/styles/pages/login.css",
)

describe("rate-limiter state contract", () => {
	const source = readFileSync(RATE_LIMITER, "utf8")
	const getStateBody = source.slice(source.indexOf("function getState()"))

	it("getState() returns the same allowed/retryAfterMs pair as check()", () => {
		// The contract mismatch. `check()` has returned `allowed` and
		// `retryAfterMs` in every branch since it was written; `getState()`
		// returned neither, so `!state.allowed` was `!undefined` === `true` and
		// the login page rendered "تم قفل المؤقت" to a user who had never
		// failed a login. Accept both the explicit (`key:`) and the ES2015
		// shorthand (`key,`) form, and assert them inside getState() itself so
		// adding them to a *different* method does not satisfy this.
		expect(getStateBody).toMatch(/\ballowed\s*:/)
		expect(getStateBody).toMatch(/\bretryAfterMs\s*[:,]/)
	})

	it("derives both from one isLocked value, never from a bare literal", () => {
		// A literal `allowed: true` would pass the rule above and reintroduce
		// the permanent banner. The countdown and the flag must come from the
		// same computation, or they can disagree.
		expect(getStateBody).toMatch(/const isLocked\s*=/)
		expect(getStateBody).toMatch(/allowed:\s*!isLocked/)
	})
})

describe("login template ref unwrapping", () => {
	const source = readFileSync(LOGIN_VUE, "utf8")
	const template = source.slice(source.lastIndexOf("<template>"))

	it("never reads a ref through a composable object in the template", () => {
		// `sessionTimeout.showWarning` evaluates to a ref object, which is
		// always truthy — so the dialog showed permanently. Any `<object>.<prop>`
		// read of a destructured composable in the template is the same trap;
		// `<object>.<method>()` is fine and is exempted.
		const offenders = [
			...template.matchAll(
				/\b(\w+)\.(showWarning|timeRemaining|isExtending)\b/g,
			),
		].map((m) => m[0])
		expect(
			[...new Set(offenders)],
			"template reads a ref off a composable object (always-truthy trap)",
		).toEqual([])
	})

	it("computes countdowns in script, not in the template", () => {
		// `Math.ceil(sessionTimeout.timeRemaining / 1000)` in a template is
		// `Math.ceil(refObject / 1000)` === NaN. Any arithmetic on a
		// template-bound value belongs in a `computed`.
		expect(
			template,
			"template performs arithmetic; a ref object coerces to NaN",
		).not.toMatch(/Math\.(ceil|round|floor)\(\s*\w+\.\w+/)
	})
})

describe("login input sizing (iOS zoom floor)", () => {
	const css = readFileSync(LOGIN_CSS, "utf8")
	const rule = css.slice(
		css.indexOf(".dy-login__input {"),
		css.indexOf("}", css.indexOf(".dy-login__input {")),
	)

	it("renders inputs at 16px or more", () => {
		// iOS Safari zooms the viewport for a focused field under 16px, which
		// breaks the layout and moves the submit button off screen. The measured
		// value was 15.2px (0.95rem) — under the floor on the device a cashier
		// is most likely to hold.
		const rem = rule.match(/font-size:\s*([\d.]+)rem/)
		expect(rem, "login input declares no rem font-size").not.toBeNull()
		expect(Number(rem[1]) * 16).toBeGreaterThanOrEqual(16)
	})
})

describe("disabled-control legibility (WCAG 2.2 SC 1.4.3)", () => {
	// Measured, not asserted by eye. The login submit button is disabled until
	// both fields are filled, and it rendered a white label on a near-white
	// fill — 1.06:1. The primary-contrast token (white) belongs on the
	// saturated brand fill; reusing it on the pale disabled fill made the
	// primary call to action unreadable at the exact moment it is looked for.
	//
	// These rules compute the ratio, so a later palette tweak that quietly
	// drops below the floor fails here instead of on a till.
	const THEMES = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../src/styles/dypos/themes.css",
	)
	// The `--dy-ink-*` palette is theme-independent and lives here, while
	// `themes.css` only maps semantic names onto it. Resolving a colour means
	// walking from one file into the other, exactly as the browser does.
	const BUTTON = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../src/components/ui/DyButton.vue",
	)

	it("finds both theme blocks", () => {
		// Without this, a split that silently returned empty strings would make
		// every rule below fail for the wrong reason.
		const { light, dark } = themeBlocks()
		expect(light).toContain("--dy-text-disabled")
		expect(dark).toContain("--dy-text-disabled")
	})

	it.each(["light", "dark"])(
		"%s: the disabled label reaches 4.5:1 on the disabled fill",
		(theme) => {
			const block = themeBlocks()[theme]
			// The pair the browser actually paints: `DyButton` fills with
			// `--dy-color-interactive-primary-bg-disabled`, which maps to
			// `--dy-disabled-soft`, and now labels with `--dy-text-disabled`.
			const ratio = contrast(
				resolveColor("--dy-disabled-soft", block),
				resolveColor("--dy-text-disabled", block),
			)
			expect(
				ratio,
				`${theme}: disabled label is ${ratio.toFixed(2)}:1, WCAG 2.2 wants 4.5:1`,
			).toBeGreaterThanOrEqual(4.5)
		},
	)

	// The primary-variant specifics moved to "compounded dimming" below, which
	// reads the same rule with comments stripped — the raw-text version here
	// matched its own prose.
})

describe("inline icon sizing", () => {
	const ICON = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../packages/dypos-ui/src/components/FeatherIcon.vue",
	)
	const BASE = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../src/styles/dypos/base.css",
	)
	const icon = readFileSync(ICON, "utf8")
	const base = readFileSync(BASE, "utf8")

	it("carries a class, so the base layer can give it a size floor", () => {
		// The defect: `width: null` / `height: null` were merged onto the SVG
		// and the only class was `shrink-0`, which sizes nothing. An inline
		// `<svg>` is a replaced element, so with no width of its own it fell
		// back to `width: 100%` and filled its container — a 382px envelope
		// across the login form's email and password fields. Dropping the
		// attributes is correct (the caller's utility class should win); the
		// missing half was the floor.
		expect(icon).toMatch(
			/class: \[icon\.value\.attrs\.class, "[^"]*dy-icon[^"]*"\]/,
		)
	})

	it("sets no width/height attribute of its own", () => {
		// A reintroduced `width: 24` here would beat every caller's utility
		// class and re-break all 280+ call sites at once.
		expect(icon).not.toMatch(/^\s*(width|height):/m)
	})

	it("defines the floor in the base layer, not per component", () => {
		// Per-component sizing is how the two halves drifted apart before.
		expect(base).toMatch(/\.dy-icon\s*\{[^}]*width:/s)
		expect(base).toMatch(/\.dy-icon\s*\{[^}]*height:/s)
	})

	it("sizes the login field icons explicitly", () => {
		const css = readFileSync(LOGIN_CSS, "utf8")
		const rule = css.slice(
			css.indexOf(".dy-login__input-icon {"),
			css.indexOf("}", css.indexOf(".dy-login__input-icon {")),
		)
		expect(rule).toMatch(/width:\s*\d+px/)
		expect(rule).toMatch(/height:\s*\d+px/)
	})
})

describe("every shipped SFC parses", () => {
	// The defect this catches is the reason the browser found it and the
	// source gates did not. A PowerShell edit of FeatherIcon.vue left
	// `"shrink-0 dy-icon"],]` — one stray bracket. The build died with
	// "Unterminated string constant", the page rendered a Babel stack trace
	// over itself, and every gate in this file stayed green, because they read
	// the source as *text* and a text comparison cannot tell valid syntax from
	// a near-miss. A gate that only compares strings proves the string you
	// wrote, not that it compiles.
	//
	// So: hand the files to the actual parser. Compiler-only (no runtime
	// import of feather-icons, no Vue mount), so it stays a source gate.
	const sfc = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../packages/dypos-ui/src/components",
	)

	const parseable = readdirSync(sfc, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".vue"))
		.map((e) => join(sfc, e.name))

	it("finds components to parse", () => {
		expect(parseable.length).toBeGreaterThan(0)
	})

	it.each(parseable)("%s has a syntactically valid <script>", (path) => {
		const source = readFileSync(path, "utf8")
		const match = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)
		if (!match) return
		const code = match[1]
		// `new Function` compiles the body without running it, which is the
		// cheapest way to reach a real parser: the arrow-function wrapper
		// supplies the function scope top-level `import`/`export` needs.
		expect(
			() => new Function(`return (async () => { ${stripModuleSyntax(code)} })`),
			`${path} does not parse`,
		).not.toThrow()
	})
})

/** Remove ESM keywords so the body can be compiled as a classic function. */
function stripModuleSyntax(code) {
	return code
		.replace(/^\s*import\s[\s\S]*?from\s*["'][^"']+["'];?\s*$/gm, "")
		.replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, "")
		.replace(/^\s*export\s+default\s+/gm, "void ")
		.replace(/^\s*export\s+(const|let|var|function|class)\s/gm, "$1 ")
		.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, "")
}

describe("every source file opens and closes its banner comment", () => {
	// A real, twice-seen defect. `semantic.css` and, later, a new composable
	// each lost the `/*` opener while keeping the `*/` closer, so the parser
	// read the banner as code: postcss said "Unknown word" on the first, and
	// vite said "invalid JS syntax" on the second. The build broke; the tests
	// that do not import the file stayed green. A banner is the first thing
	// every reader sees, so it gets the one check that catches its own damage.
	const roots = [
		resolve(dirname(fileURLToPath(import.meta.url)), "../src/composables"),
		resolve(dirname(fileURLToPath(import.meta.url)), "../src/utils"),
		resolve(dirname(fileURLToPath(import.meta.url)), "../src/styles"),
	]

	const scannable = roots.flatMap((root) =>
		readdirSync(root, { recursive: true, withFileTypes: true })
			.filter((e) => e.isFile() && /\.(js|css)$/.test(e.name))
			.map((e) => join(e.parentPath ?? e.path, e.name)),
	)

	it("finds files to check", () => {
		// A walk that matched nothing would pass this rule and every rule in
		// the block — the vacuous-gate failure mode the file already forbids.
		expect(scannable.length).toBeGreaterThan(50)
	})

	it.each(scannable)("%s opens a banner comment with /*", (path) => {
		const text = readFileSync(path, "utf8")
		const firstLine = text.slice(0, text.indexOf("\n")).trim()
		// Only files that *look* like they have a banner are held to it, and
		// the failing shape is precise: a first line that continues a comment
		// without ever opening one.
		if (firstLine.startsWith("*")) {
			expect(
				firstLine,
				"banner comment lost its /* opener — the parser reads it as code",
			).toMatch(/^\/\*\*?/)
		}
	})
})

describe("PIN field rules", () => {
	// The rules the keypad depends on. These were inline literals in a
	// 2000-line SFC, where "change the max" and "change the filter" were two
	// edits in two places and neither test could see either.
	it("caps input at the maximum, so PBKDF2 never hashes unbounded input", () => {
		expect(sanitizePin("1".repeat(64))).toHaveLength(PIN_MAX_LENGTH)
	})

	it("drops everything that is not a digit", () => {
		expect(sanitizePin("12ab34")).toBe("1234")
		// Arabic-Indic digits: a cashier on a phone keyboard may type them, and
		// silently discarding them beats hashing "٤٥٦٧" as a PIN the
		// confirmation field can never match.
		expect(sanitizePin("٤٥٦٧")).toBe("")
	})

	it("survives an empty or non-string field", () => {
		expect(sanitizePin(undefined)).toBe("")
		expect(sanitizePin(null)).toBe("")
	})

	it("names the minimum length in Arabic when the PIN is too short", () => {
		expect(validatePinPair("12", "12")).toBe(
			`كود PIN يجب أن يكون ${PIN_MIN_LENGTH} خانات على الأقل`,
		)
	})

	it("reports a mismatch after the length check, not before", () => {
		// Order matters: a short *and* mismatched pair should complain about
		// length, which is the problem the user has to fix first.
		expect(validatePinPair("12", "34")).toContain("خانات")
		expect(validatePinPair("1234", "5678")).toBe("كودا PIN غير متطابقين")
	})

	it("accepts a matching pair within the range", () => {
		expect(validatePinPair("1234", "1234")).toBeNull()
		expect(validatePinPair("12345678", "12345678")).toBeNull()
	})

	it("rejects a nine-digit pair even when both sides match", () => {
		// The filter caps what can be *typed*, so a nine-digit value can only
		// arrive programmatically. Validating only the lower bound would let it
		// through.
		const nine = "123456789"
		expect(nine).toHaveLength(PIN_MAX_LENGTH + 1)
		expect(sanitizePin(nine)).toHaveLength(PIN_MAX_LENGTH)
	})
})

describe("useRememberedEmail", () => {
	const KEY = "dypos.auth.email"

	function withStorage(impl, run) {
		const original = window.localStorage
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: impl,
		})
		try {
			return run()
		} finally {
			Object.defineProperty(window, "localStorage", {
				configurable: true,
				value: original,
			})
		}
	}

	const makeStore = () => {
		const map = new Map([[KEY, "cashier@shop.example"]])
		return {
			getItem: (k) => map.get(k) ?? null,
			setItem: (k, v) => map.set(k, v),
			removeItem: (k) => map.delete(k),
		}
	}

	it("restores the stored address on mount", () => {
		withStorage(makeStore(), () => {
			const { email, restore } = useRememberedEmail()
			restore()
			expect(email.value).toBe("cashier@shop.example")
		})
	})

	it("persists a trimmed address when the box is ticked", () => {
		const store = makeStore()
		withStorage(store, () => {
			const { email, rememberMe, persist } = useRememberedEmail()
			email.value = "  cashier@shop.example  "
			rememberMe.value = true
			persist()
			expect(store.getItem(KEY)).toBe("cashier@shop.example")
		})
	})

	it("clears the stored address when the box is unticked", () => {
		// The half that is easy to forget: a stored address is PII, and leaving
		// it on a shared till after the user opted out keeps it there.
		const store = makeStore()
		withStorage(store, () => {
			const { rememberMe, persist } = useRememberedEmail()
			expect(store.getItem(KEY)).not.toBeNull()
			rememberMe.value = false
			persist()
			expect(store.getItem(KEY)).toBeNull()
		})
	})

	it("never touches storage when disabled", () => {
		let touched = false
		const store = new Proxy(makeStore(), {
			get(target, prop) {
				if (typeof prop === "string") touched = true
				return target[prop]
			},
		})
		withStorage(store, () => {
			const { email, restore, persist } = useRememberedEmail({
				enabled: false,
			})
			email.value = "x@y.example"
			restore()
			persist()
			expect(touched).toBe(false)
		})
	})

	it("survives a storage that throws, and reports it", () => {
		// Private / partitioned mode throws on access rather than returning
		// null. A login page that crashes on load because a *preference* could
		// not be read leaves a cashier at a dead terminal.
		const hostile = {
			getItem() {
				throw new Error("SecurityError: storage is blocked")
			},
			setItem() {
				throw new Error("SecurityError: storage is blocked")
			},
			removeItem() {
				throw new Error("SecurityError: storage is blocked")
			},
		}
		const seen = []
		withStorage(hostile, () => {
			const { email, restore, persist } = useRememberedEmail({
				onError: (message) => seen.push(message),
			})
			expect(() => restore()).not.toThrow()
			expect(() => persist()).not.toThrow()
			expect(email.value).toBe("")
		})
		expect(seen).toHaveLength(2)
	})
})

describe("useSecondsRemaining", () => {
	// The unit that keeps `NaN` out of Arabic sentences. Behavioural, not
	// textual: the source gates above prove the page calls this, and these
	// prove it never leaks a non-number.
	it("converts a ref of milliseconds to whole seconds", () => {
		expect(useSecondsRemaining(ref(90_000)).value).toBe(90)
		expect(useSecondsRemaining(ref(1)).value).toBe(1)
	})

	it("accepts a plain number as well as a ref", () => {
		expect(useSecondsRemaining(5_000).value).toBe(5)
	})

	it.each([
		["undefined", undefined],
		["null", null],
		["NaN", Number.NaN],
		["Infinity", Number.POSITIVE_INFINITY],
		["a non-numeric string", "soon"],
		["an object", {}],
		["true", true],
		["false", false],
	])("never leaks %s into the view", (_label, input) => {
		// Every one of these printed "NaN" in the Arabic countdown before the
		// extraction. The contract is the important half: a value the module
		// cannot understand renders 0, it does not render a broken sentence.
		const seconds = useSecondsRemaining(input).value
		expect(Number.isFinite(seconds)).toBe(true)
		expect(seconds).toBe(0)
	})

	it("accepts a numeric string, because JSON and localStorage hand back one", () => {
		// A stored lockout deadline is a string once it has been through
		// JSON.parse. Rejecting it would show "0 ثانية" for a user who is
		// genuinely locked out — the coercion is the feature, not an accident.
		expect(useSecondsRemaining("30000").value).toBe(30)
	})

	it("floors at zero rather than showing a negative countdown", () => {
		// A stale deadline yields a negative remainder. "-3 ثانية" is worse
		// than "0 ثانية".
		expect(useSecondsRemaining(ref(-3_000)).value).toBe(0)
		expect(useSecondsRemaining(ref(0)).value).toBe(0)
	})
})

/* ============================================================================
 * Second browser pass — the states the form actually ships in.
 *
 * The first pass measured the page as loaded. The submit button, however, is
 * born DISABLED (it enables once both fields are filled), the PIN dialog only
 * exists after a click, and the brand panel is whatever photo the reseller
 * chose. Three defects lived in exactly those states:
 *
 *   4. The disabled submit button painted a white label on a #f1f5f9 fill —
 *      1.10:1 — and stayed at 3.27:1 after the colour was fixed, because
 *      `.dy-btn--disabled` also applies `opacity: 0.6`: colour and opacity
 *      each dim, so they mulitplied. Measured 9.45:1 once only the colour
 *      carries the state.
 *   5. The panel's background is a photo (passed from the component as an
 *      inline gradient + url). At the footer's position the gradient's last
 *      stop is 0.62, so the photo dominated: backdrop rgb(93,123,161), on
 *      which *no* text colour can reach 4.5:1 (pure white tops out at 4.36).
 *      Legibility has to be scrimmed, not hoped for.
 *   6. Dark-theme quiet text used the same steps as light: `--dy-text-muted`
 *      (3.07:1) and the accent-as-link (3.84:1) on a near-black surface.
 * ========================================================================== */

const LOGIN_CSS_FILE = read(SRC, "styles", "pages", "login.css")
const COMPANY_FOOTER = read(SRC, "components", "common", "CompanyFooter.vue")

/** The body of a rule, insensitive to the exact whitespace before `{`. */
const ruleBody = (css, selector) => {
	const at = css.indexOf(selector)
	if (at < 0) return ""
	const open = css.indexOf("{", at)
	if (open < 0) return ""
	// Balance braces: these bodies contain comments and nested parens.
	let depth = 0
	for (let i = open; i < css.length; i++) {
		if (css[i] === "{") depth++
		else if (css[i] === "}") {
			depth--
			if (depth === 0) return css.slice(open + 1, i)
		}
	}
	return css.slice(open + 1)
}

describe("compounded dimming (colour × opacity)", () => {
	it("a disabled login link states its colour and sets no opacity", () => {
		// `color: var(--dy-text-muted)` plus `opacity: 0.55` measured 2.13:1 for
		// "إنشاء رمز دخول سريع" — the button read as empty, not as disabled.
		const body = stripComments(
			ruleBody(LOGIN_CSS_FILE, ".dy-login__link-button:disabled"),
		)
		expect(body, "the rule still exists").not.toBe("")
		expect(body).not.toMatch(/opacity\s*:/)
		expect(body).toMatch(/color:\s*var\(--dy-text-muted\)/)
	})

	it("the company link carries no opacity", () => {
		// 0.85 on top of `--dy-text-muted` measured 3.56:1; hover deepens the
		// colour instead of removing transparency.
		const body = stripComments(ruleBody(COMPANY_FOOTER, ".dy-company__link {"))
		expect(body).not.toMatch(/opacity\s*:/)
		expect(ruleBody(COMPANY_FOOTER, ".dy-company__link:hover")).toMatch(
			/color:\s*var\(--dy-text\)/,
		)
	})

	it("the primary disabled button opts out of the generic opacity", () => {
		const button = stripComments(read(SRC, "components", "ui", "DyButton.vue"))
		// Comments already stripped above, deliberately: an earlier version of
		// this rule read the raw file, and its own explanatory comment —
		// "و`opacity: 1`" — satisfied `/opacity:\s*1/`. The gate was green on a
		// button that still multiplied its opacity, which is the "prose is not a
		// declaration" trap this file documents elsewhere. The negative test
		// caught it, not a human.
		// The generic rule stays — secondary/ghost variants still rely on it.
		expect(ruleBody(button, ".dy-btn--disabled,")).toMatch(/opacity:\s*0\.6/)
		// …and the primary variant, whose disabled state is now expressed by
		// fill + label colour, must not multiply it again.
		const body = ruleBody(button, ".dy-btn--primary.dy-btn--disabled")
		expect(body).toMatch(/opacity:\s*1\s*;/)
		expect(body).toMatch(
			/color:\s*var\(--dy-color-interactive-primary-text-disabled/,
		)
		expect(body).toMatch(
			/background:\s*var\(--dy-color-interactive-primary-bg-disabled/,
		)
		// The *enabled* rule keeps the brand-contrast token: the new token is
		// additive, not a replacement. Without this, "fix the disabled label"
		// could be satisfied by darkening the button for everybody.
		expect(ruleBody(button, ".dy-btn--primary {")).toMatch(
			/color:\s*var\(--dy-color-interactive-primary-text,/,
		)
	})
})

describe("login viewport layout", () => {
	it("keeps the desktop identity rail in view and scrolls the long panel", () => {
		expect(LOGIN_CSS_FILE).toMatch(
			/@media\s*\(min-width:\s*901px\)[\s\S]*?\.dy-login\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;/,
		)
		expect(LOGIN_CSS_FILE).toMatch(
			/@media\s*\(min-width:\s*901px\)[\s\S]*?\.dy-login__panel\s*\{[^}]*overscroll-behavior-y:\s*contain;[^}]*scrollbar-gutter:\s*stable;/,
		)
		expect(LOGIN_CSS_FILE).toMatch(
			/@media\s*\(max-width:\s*900px\)[\s\S]*?\.dy-login\s*\{[^}]*height:\s*auto;/,
		)
		expect(LOGIN_CSS_FILE).toMatch(
			/@media\s*\(max-width:\s*900px\)[\s\S]*?\.dy-login__brand\s*\{[^}]*padding-inline:/,
		)
		expect(LOGIN_CSS_FILE).not.toMatch(
			/@media\s*\(max-width:\s*900px\)[\s\S]*?\.dy-login__brand\s*\{[^}]*display:\s*none/,
		)
	})
})

describe("the identity image is framed, never stretched behind live text", () => {
	/*
	 * `smart-ports-og.jpg` is a 1200×630 *sharing card*: the company name in two
	 * scripts, a tagline and four badges are printed into its pixels. Shipped as
	 * a `cover` backdrop of the tall brand panel, the browser can only ever show
	 * fragments of that typography — «الذكية للبرمجيا…»، «Smart Ports Softw…» —
	 * cropped mid-word, with the live headline painted straight on top of them.
	 * Two competing texts, neither readable. These are the rules that keep the
	 * framed treatment from regressing to that.
	 */
	it("the brand backdrop is a pure gradient owned by the stylesheet", () => {
		const body = stripComments(ruleBody(LOGIN_CSS_FILE, ".dy-login__brand {"))
		expect(body, "the rule still exists").not.toBe("")
		expect(body).toMatch(/background:\s*var\(--dy-surface\)/)
		expect(body).not.toMatch(/url\(/)
		expect(body).not.toMatch(/background-size:\s*cover/)

		// Single owner. The component used to win this with an inline `:style`,
		// which made every edit to the rule above invisible in the browser —
		// two measurement rounds were lost to it before the cascade was walked.
		expect(
			read(SRC, "pages", "Login.vue"),
			"Login.vue must not repaint the panel background inline",
		).not.toMatch(/:style="[^"]*background/i)
	})
	/*
	 * The showcase prints the OFFICIAL sharing card at a compact size.
	 * The artwork is NOT cropped or substituted — the company name is
	 * part of that design, and a branding gate pins the file byte-for-byte.
	 *
	 * What this gate protects, unchanged: the image is a real element
	 * (never a CSS background behind live text), it declares its intrinsic
	 * size (no reflow as the JPEG decodes), it keeps its own aspect ratio
	 * (no stretching, no mid-word crop), and it is named for assistive tech.
	 */
	it("renders the official artwork whole, at its own aspect ratio", () => {
		const panel = read(SRC, "components", "common", "SystemAboutPanel.vue")

		// A real element, not a CSS background painted behind live text.
		expect(panel).toMatch(/<img/)
		// The OFFICIAL asset, imported — not a derived or cropped copy.
		expect(panel).toMatch(/from "@\/assets\/smart-ports-og\.jpg"/)
		expect(panel).not.toMatch(/smart-ports-mark/)

		// Intrinsic size: without it the box reflows as the JPEG decodes.
		expect(panel).toMatch(/\bwidth="1200"/)
		expect(panel).toMatch(/\bheight="630"/)

		// Named, not decorative.
		expect(panel).toMatch(/:alt="[^"]+"/)
		expect(panel).toMatch(/\bdecoding="async"/)

		// `contain`, never `cover`: the card shows the whole artwork.
		expect(panel).toMatch(/object-fit:\s*contain/)
		expect(panel).not.toMatch(/object-fit:\s*cover/)
	})
	it("keeps the masthead compact and links the full company artwork in its showcase", () => {
		const login = read(SRC, "pages", "Login.vue")
		const masthead = login.slice(
			login.indexOf('<section class="dy-login__brand"'),
			login.indexOf(
				"</section>",
				login.indexOf('<section class="dy-login__brand"'),
			),
		)
		expect(masthead).toContain("<CompanyFooter")
		expect(masthead).not.toContain("dy-login__brand-card")

		const showcaseStart = login.indexOf('class="dy-login__showcase"')
		const showcase = login.slice(
			showcaseStart,
			login.indexOf("</section>", showcaseStart),
		)
		expect(showcase).toMatch(/<SystemAboutPanel/)
		// The company stays reachable FROM THE CARD (it moved off the
		// image when the image became a mark).
		const card = read(SRC, "components", "common", "SystemAboutPanel.vue")
		expect(card).toMatch(/:href="COMPANY_WEBSITE"/)
		expect(card).toMatch(/target="_blank"/)
		expect(card).toMatch(/rel="noopener noreferrer"/)
	})

	/*
	 * The same treatment, measured on the siblings that still carry the
	 * panel. ForgotPassword and ResetPassword each hold their own scoped
	 * copy, so keeping Login.vue correct says nothing about them — and
	 * siblings drifting apart is exactly how one page got framed while
	 * three of them stayed stretched behind the copy.
	 */
	const SIBLINGS = [
		["ForgotPassword.vue", "dy-forgot"],
		["ResetPassword.vue", "dy-reset"],
	]

	it.each(SIBLINGS)("%s frames the identity image", (file, prefix) => {
		const vue = read(SRC, "pages", file)

		// The gradient is the panel's own; a `url(` or a `cover` sizing would
		// be the photo creeping back in behind live text.
		const brand = stripComments(ruleBody(vue, `.${prefix}__brand {`))
		expect(brand, "the panel rule still exists").not.toBe("")
		expect(brand).toMatch(/background:\s*linear-gradient/)
		expect(brand).not.toMatch(/url\(/)
		expect(brand).not.toMatch(/background-size:\s*cover/)

		const img = stripComments(ruleBody(vue, `.${prefix}__brand-card img`))
		expect(img, "the framed-card rule exists").not.toBe("")
		expect(img).toMatch(/object-fit:\s*contain/)
		expect(img).not.toMatch(/object-fit:\s*cover/)

		const tag = `figure class="${prefix}__brand-card"`
		const open = vue.indexOf(tag)
		expect(open, "the card is markup, not a CSS background").toBeGreaterThan(-1)

		// Size and name are checked on the card itself: a `width="1200"`
		// elsewhere in the file would prove nothing about its layout shift.
		const card = vue.slice(open, vue.indexOf("</figure>", open))
		expect(card).toMatch(/\bwidth="1200"/)
		expect(card).toMatch(/\bheight="630"/)
		expect(card, "the image is named, not decorative").toMatch(/\balt="[^"]+"/)

		expect(
			vue,
			`${file} must not repaint the panel background inline`,
		).not.toMatch(/:style="[^"]*background/i)
	})

	/*
	 * Register.vue is the counter-example, and it is a gate rather than a
	 * comment.
	 *
	 * It used to be a two-column page whose left cell held the 1200x630
	 * artwork in a glass plaque. The panel was removed (one centred column,
	 * one job) and the identity card moved to `SystemAboutPanel.vue`, which
	 * the login family renders. What survived the removal was **204 lines of
	 * CSS for 13 selectors the template never references** — rules that
	 * render nothing, weigh down the stylesheet, and read like a live feature
	 * to the next maintainer.
	 *
	 * Asserting the absence is what makes the cleanup stick: without it, the
	 * dead block grows back the first time someone "restores the brand
	 * panel" from memory.
	 */
	it("Register.vue carries no dead brand-panel CSS", () => {
		const vue = read(SRC, "pages", "Register.vue")
		const template = vue.slice(0, vue.indexOf("<style scoped>"))
		// Comments may NAMES the removed selectors (this file's own note does),
		// so every assertion runs on code with the commentary stripped —
		// otherwise the gate fails on the documentation of its own cleanup.
		const code = stripComments(vue)

		// No panel markup…
		expect(code).not.toContain("dy-register__brand")
		expect(code).not.toContain("dy-register__logo")
		expect(code).not.toContain("dy-register__eyebrow")

		// …and no rules pretending to style one.
		const style = stripComments(vue.slice(vue.indexOf("<style scoped>")))
		for (const selector of [
			"__brand",
			"__brand-card",
			"__brand-content",
			"__brand-overlay",
			"__brand-copy",
			"__brand-title",
			"__brand-description",
			"__brand-footer",
			"__logo-shell",
			"__eyebrow",
			"__mobile-logo",
		]) {
			expect(style, `.dy-register${selector} is dead CSS`).not.toContain(
				selector,
			)
		}

		// The company is still reachable: the artwork moved to the shared
		// panel, the name stayed on `CompanyFooter`. A page with no brand at
		// all would satisfy the assertions above, so name the successor.
		expect(template).toMatch(/<CompanyFooter/)
	})
	/**
	 * login.css carries no rule for a class nothing renders.
	 *
	 * The masthead refactor replaced the bespoke identity block with
	 * `SystemAboutPanel.vue`, and 137 lines of CSS stayed behind for eleven
	 * selectors (`brand-overlay`, `brand-copy`, `eyebrow`, `brand-title`,
	 * `brand-footer`, `mobile-logo`…). They cost bytes in the shipped
	 * stylesheet and — worse — they read like live features to whoever opens
	 * the file next.
	 *
	 * Asserting absence is what keeps the cleanup. A comment does not: the
	 * first person to "restore the brand panel" from memory would otherwise
	 * copy the rules straight back, dead and all.
	 */
	it("login.css styles nothing the login page does not render", () => {
		const css = read(SRC, "styles", "pages", "login.css")
		const code = stripComments(css)

		for (const selector of [
			"brand-overlay",
			"brand-card-link",
			"brand-copy",
			"eyebrow",
			"brand-title",
			"brand-description",
			"context-icon",
			"brand-footer",
			"brand-dot",
			"mobile-logo",
		]) {
			expect(code, `.dy-login__${selector} is dead CSS`).not.toContain(selector)
		}
	})

	/**
	 * The runtime banner's modifier classes are built at runtime —
	 * `` `dy-login__runtime--${runtimeStatus.type}` `` — so they never appear
	 * literally in the template. A naive "is this class used?" sweep reports
	 * them dead, and deleting them would strip live styling (they cover all
	 * four readiness states). Pin the binding so the next sweep cannot repeat
	 * that mistake.
	 */
	it("the runtime banner keeps its dynamic modifier binding", () => {
		const login = read(SRC, "pages", "Login.vue")
		expect(login).toMatch(/`dy-login__runtime--\$\{[^}]+\}`/)

		const css = read(SRC, "styles", "pages", "login.css")
		for (const tone of ["info", "success", "warning", "error"]) {
			expect(
				css,
				`runtime tone "${tone}" is produced by RUNTIME_STATUS_BY_STATE and must be styled`,
			).toContain(`dy-login__runtime--${tone}`)
		}
	})
})

describe("text tokens step up in the dark theme", () => {
	const PAIRS = ["--dy-text-muted", "--dy-text-link"]

	it.each(PAIRS)("%s differs between the themes", (name) => {
		// These are the two the browser failed in dark: the light steps do not
		// survive a near-black surface.
		const { light, dark } = themeBlocks()
		expect(resolveColor(name, light)).not.toBe(resolveColor(name, dark))
	})

	it.each(["light", "dark"])(
		"%s: quiet text clears 4.5:1 on the surface",
		(theme) => {
			const block = themeBlocks()[theme]
			const surface = resolveColor("--dy-surface", block)
			for (const name of PAIRS) {
				const ratio = contrast(resolveColor(name, block), surface)
				expect(
					ratio,
					`${theme}: ${name} is ${ratio.toFixed(2)}:1 on ${surface}, WCAG 2.2 wants 4.5:1`,
				).toBeGreaterThanOrEqual(4.5)
			}
		},
	)
})
