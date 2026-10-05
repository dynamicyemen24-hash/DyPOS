/**
 * Login.vue — source-level integrity gate.
 *
 * A `<script setup>` SFC resolves nothing at build time. A call to an
 * identifier the file never binds — `log`, `isBrowser`, `loginRateLimiter`,
 * `handleLogin` — compiles cleanly, ships, and throws a ReferenceError only
 * when a cashier reaches that line. The suite stayed green through four of
 * them, because no test ever touched the file.
 *
 * This walks the SFC's own identifiers and fails on any that is called or
 * read but never bound. It is deliberately a *source* check: no DOM, no
 * mocks, no network, and it still runs when every runtime dependency of the
 * page is unavailable.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const POS = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const source = readFileSync(join(POS, "src", "pages", "Login.vue"), "utf8")

/**
 * String and template-literal bodies are data, not code. A CSS gradient
 * like `linear-gradient(...)` or a `var(--x)` inside a style string reads as
 * a call to an undeclared function unless they are blanked first.
 *
 * Import statements must be collected BEFORE this runs: the module specifier
 * is a string, and blanking it would take `from "…"` — the very token the
 * import pattern anchors on — with it.
 */
function stripLiterals(text) {
	return (
		text
			// Template literals: blank the text, keep the `${…}` holes. A CSS
			// gradient is one long multi-line template literal, so collapsing the
			// body to a single line also keeps the rest of the line-anchored
			// analysis (declarations, top-level checks) from being fooled.
			.replace(/`([^`]*)`/g, (_m, body) => {
				const holes = body.replace(/[^\n]*\$\{[^}]*\}/g, " ${x} ")
				return `\`${(holes.match(/\$\{[^}]*\}/g) || []).join(" ")}\``
			})
			.replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
			.replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
	)
}

/** Every binding the file creates, however it was introduced. */

/** The <script setup> body with comments stripped, so prose about a symbol
 *  ("the old code called `handleLogin()`") is not counted as a finding. */
const script = stripLiterals(
	source
		.slice(source.indexOf("<script setup>"), source.indexOf("</script>"))
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/\/\/[^\n]*/g, " ")
		.replace(/\$\{[^}]*\}/g, " "),
)

/** The whole SFC, comments stripped — used to decide whether a binding is
 *  actually *used*, because in a Vue page that means "used by the template". */
const whole = source
	.replace(/\/\*[\s\S]*?\*\//g, " ")
	.replace(/\/\/[^\n]*/g, " ")
	.replace(/<!--[\s\S]*?-->/g, " ")
	.replace(/\$\{[^}]*\}/g, " ")

/** Identifiers the environment provides without an import. */
const AMBIENT = [
	"defineProps",
	"defineEmits",
	"defineExpose",
	"ref",
	"computed",
	"watch",
	"onMounted",
	"onBeforeUnmount",
	"nextTick",
	"window",
	"document",
	"navigator",
	"localStorage",
	"sessionStorage",
	"console",
	"fetch",
	"location",
	"crypto",
	"structuredClone",
	"setTimeout",
	"clearTimeout",
	"setInterval",
	"clearInterval",
	"Math",
	"Object",
	"Array",
	"String",
	"Number",
	"Boolean",
	"JSON",
	"Date",
	"Error",
	"Promise",
	"RegExp",
	"URL",
	"AbortController",
	"AbortSignal",
	"TextEncoder",
	"HTMLTextAreaElement",
	"HTMLElement",
]

/** Language syntax that looks like an identifier to a regex. */
const KEYWORDS = [
	"if",
	"for",
	"while",
	"switch",
	"catch",
	"return",
	"typeof",
	"await",
	"async",
	"new",
	"delete",
	"void",
	"in",
	"of",
	"do",
	"else",
	"try",
	"finally",
	"throw",
	"case",
	"break",
	"continue",
	"default",
	"export",
	"import",
	"this",
	"super",
	"instanceof",
	"with",
	"yield",
	"static",
	"get",
	"set",
	"function",
	"const",
	"let",
	"var",
	"class",
	"extends",
	"from",
	"as",
]

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function collectBindings() {
	const names = new Set(AMBIENT)

	const add = (raw) => {
		const name = String(raw)
			.trim()
			.split(/\s+as\s+/)
			.pop()
			.trim()
		if (IDENT.test(name)) names.add(name)
	}

	// import { a, b as c } from "…"   |   import x, { y } from "…"
	// Read from the RAW source: the module specifier is a string literal, and
	// `script` has already had its strings blanked.
	for (const m of source.matchAll(
		/import\s+([^;]+?)\s+from\s+["'][^"']+["']/g,
	)) {
		const clause = m[1]
		const braces = clause.match(/\{([^}]*)\}/)
		if (braces) {
			for (const part of braces[1].split(",")) add(part)
		}
		const star = clause.match(/\*\s+as\s+([A-Za-z0-9_$]+)/)
		if (star) names.add(star[1])
		const defaults = clause
			.replace(/\{[^}]*\}/, "")
			.replace(/,/g, " ")
			.trim()
		if (defaults) names.add(defaults)
	}

	// const/let/var x = …   |   function x( … )
	for (const m of script.matchAll(/\b(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) {
		names.add(m[1])
	}
	for (const m of script.matchAll(/\bfunction\s+([A-Za-z0-9_$]+)\s*\(/g)) {
		names.add(m[1])
	}

	// const { a, b: c } = useSomething() — how every composable binds.
	for (const m of script.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
		for (const part of m[1].split(",")) {
			const name = part.includes(":") ? part.split(":")[1] : part
			const clean = name.trim().split(/[=\s]/)[0]
			if (IDENT.test(clean)) names.add(clean)
		}
	}

	// Arrow and function parameters.
	const params = [
		[/\(([^)]*)\)\s*=>/g],
		[/\bfunction\s*\*?\s*[A-Za-z0-9_$]*\s*\(([^)]*)\)/g],
	]
	for (const [pattern] of params) {
		for (const m of script.matchAll(pattern)) {
			for (const part of m[1].split(",")) {
				const clean = part.trim().split(/[:=]/)[0]
				if (IDENT.test(clean)) names.add(clean)
			}
		}
	}

	return names
}

const bound = collectBindings()

/** Identifiers the script calls (`name(`) or reads (`name.`). */
function collectReferences() {
	const referenced = new Set()
	const call = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g
	const read = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\./g
	for (const m of script.matchAll(call)) referenced.add(m[1])
	for (const m of script.matchAll(read)) referenced.add(m[1])

	/*
	 * Arrow-function / callback PARAMETERS are not free references.
	 *
	 * `verify().then(res => { res.success })` looks exactly like an unbound
	 * `res` call and `res.` read, so this probe used to report every callback
	 * parameter in the file as a missing binding. A gate that cries wolf gets
	 * ignored — and the first real `ReferenceError` it was written to catch
	 * would be dismissed as one more false positive.
	 *
	 * The parameters are collected from `(...names) =>`, `(name) =>`,
	 * `async (name) =>` and `function (…)`, then subtracted.
	 */
	for (const m of script.matchAll(/(?:async\s+)?\(([^()]*)\)\s*=>/g)) {
		for (const part of m[1].split(",")) {
			const name = part
				.trim()
				.split(/[:=\s]/)[0]
				.trim()
			if (/^[A-Za-z_$][\w$]*$/.test(name)) referenced.delete(name)
		}
	}
	for (const m of script.matchAll(/(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/g)) {
		referenced.delete(m[1])
	}
	for (const m of script.matchAll(
		/function\s*[A-Za-z_$][\w$]*\s*\(([^()]*)\)/g,
	)) {
		for (const part of m[1].split(",")) {
			const name = part
				.trim()
				.split(/[:=\s]/)[0]
				.trim()
			if (/^[A-Za-z_$][\w$]*$/.test(name)) referenced.delete(name)
		}
	}

	return referenced
}

describe("Login.vue — no unbound identifier", () => {
	it("binds every identifier the script calls or reads", () => {
		const unbound = [...collectReferences()].filter(
			(name) => !bound.has(name) && !KEYWORDS.includes(name),
		)

		expect(
			unbound,
			`Login.vue references identifiers it never binds: ${unbound.join(", ")}. A \`<script setup>\` SFC compiles this silently — the ReferenceError only fires when a user reaches that line.`,
		).toEqual([])
	})

	it("declares no top-level binding twice", () => {
		// The page computed `isRuntimeReady`, `rateLimitState`, `isRateLimited`
		// and `sessionReady` locally while the runtime composable returned the
		// same four. A `const` redeclaration is a SyntaxError; the shadowing
		// version shipped as a silent "last one wins".
		//
		// Only *top-level* declarations are counted: two nested `const result`
		// in different function bodies is ordinary, correct code.
		const counts = new Map()
		for (const line of script.split("\n")) {
			if (/^\S/.test(line)) {
				const m = line.match(/^\s*(?:const|let)\s+([A-Za-z0-9_$]+)\s*=/)
				if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1)
			}
		}
		const dupes = [...counts.entries()].filter((e) => e[1] > 1).map((e) => e[0])

		expect(
			dupes,
			`Login.vue declares these more than once: ${dupes.join(", ")}`,
		).toEqual([])
	})

	it("does not ship a dead binding", () => {
		// A top-level `const` written once and never read anywhere in the SFC is
		// dead weight the compiler will not warn about. "Read" includes the
		// template: in a Vue page, `{{ brandBackground }}` is the use.
		const declared = [
			...new Set(
				[...script.matchAll(/^\s*(?:const|let)\s+([A-Za-z0-9_$]+)\s*=/gm)].map(
					(m) => m[1],
				),
			),
		]
		const dead = declared.filter((name) => {
			const uses = whole.match(new RegExp(`\\b${name}\\b`, "g")) || []
			return uses.length <= 1
		})

		expect(
			dead,
			`Login.vue declares but never uses: ${dead.join(", ")}`,
		).toEqual([])
	})
})

describe("Login.vue — the four defects this gate was written for", () => {
	// Each of these shipped inside the file and threw a ReferenceError at
	// runtime. Naming them keeps the regression from reading as a lint
	// preference: these are defects that were measured, not style.
	//
	// `log` and `loginRateLimiter` are still called by the page and are now
	// imported from the runtime composable. `isBrowser` no longer appears in
	// the page at all: the offline probe moved into that composable, which is
	// the only place it was ever needed. `handleLogin` was a call to a
	// function that never existed, and the call site now points at
	// `submitLogin`, so the name must be gone entirely.
	const CALLED_UNDEFINED = [
		["log", "logger namespace — called ~18 times against an undefined name"],
		[
			"loginRateLimiter",
			"rate limiting (the file imported enhancedLoginRateLimiter instead)",
		],
	]

	for (const [name, why] of CALLED_UNDEFINED) {
		it(`binds ${name} — ${why}`, () => {
			expect(bound.has(name), `${name} is not bound in Login.vue`).toBe(true)
		})
	}

	it("no longer references isBrowser — the probe moved to useLoginRuntime", () => {
		// The SSR guard travelled with `detectOfflineMode`. If it reappears in
		// the page it will be a second, independent copy of the same rule.
		expect(
			script.includes("isBrowser"),
			"isBrowser is duplicated in Login.vue — it belongs to useLoginRuntime",
		).toBe(false)
	})

	it("calls submitLogin, not the handleLogin that never existed", () => {
		// `handleLogin` was a call to a function with no definition anywhere in
		// the file: pressing Enter outside the fields threw a ReferenceError.
		expect(
			script.includes("handleLogin("),
			"Login.vue calls handleLogin() — the function is submitLogin()",
		).toBe(false)
		expect(script.includes("submitLogin()"), "submitLogin is not called").toBe(
			true,
		)
	})
})

describe("Login.vue — template state contracts", () => {
	const template = source.slice(source.indexOf("<template>"))

	it("binds the password visibility control", () => {
		expect(bound.has("showPassword")).toBe(true)
	})

	it("uses Vue-unwrapped refs in the template", () => {
		expect(template).not.toMatch(/\b(?:email|password)\.value\b/)
	})

	it("renders translated PIN labels instead of their source expression", () => {
		// The label moved into `LoginPinForm.vue` with the rest of the PIN form.
		// The DEFECT is unchanged — a template that prints `__("…")` as literal
		// text shows the reader the function call — so the assertion follows the
		// markup instead of being deleted.
		const pinForm = readFileSync(
			resolve(process.cwd(), "src/components/common/LoginPinForm.vue"),
			"utf8",
		)
		expect(pinForm).not.toContain('"__("')
		// Every user-facing string in the form still goes through the translator.
		expect(pinForm).toContain("__('")
		expect(template).not.toContain('"__("')
	})

	it("exposes required-field errors and keeps empty-form submission available", () => {
		expect(bound.has("emailMissing")).toBe(true)
		expect(bound.has("passwordMissing")).toBe(true)
		expect(template).toContain(':aria-invalid="emailMissing"')
		expect(template).toContain(':aria-invalid="passwordMissing"')
		expect(template).toContain('name="username"')
		expect(template).toContain('name="password"')
		expect(template).toContain(':disabled="isSubmitting"')
		expect(script).toContain("validateRequiredFields()")
	})
})
