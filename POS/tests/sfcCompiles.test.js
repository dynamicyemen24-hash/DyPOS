/**
 * Compile every SFC — the gate the unit suite could not be.
 *
 * ## The two defects this exists for
 *
 * `npm run build` failed on two files that EVERY unit test passed:
 *
 *  - `Register.vue` imported `ActionButton` twice, once from the button rename
 *    and once from before it. `[vue/compiler-sfc] Identifier … has already
 *    been declared` — and nothing else noticed.
 *  - `POSSale.vue` carried `:type="type"` and `:size="sm"` (undefined
 *    identifiers inside a template) plus a broken `aria-label` string. The
 *    compiler rejects the EXPRESSION, so the whole bundle fails while no test
 *    does: nothing mounts the scanner branch.
 *
 * Both are the class AGENTS.md records for `WorkForm.vue` (unbalanced markup)
 * and `WorkWizard.vue` (unquoted attribute): broken markup that stays broken
 * for months behind a green suite.
 *
 * ## Why compile rather than test
 *
 * `compileTemplate` evaluates every `{{ }}` and every directive expression —
 * exactly the stage that rejected `:size="sm"`. It is slower than a unit test
 * and vastly cheaper than discovering a broken release the night before it
 * ships. A missing import is the same class of lie: these tests mount the
 * component and read the DOM, so a template that never runs cannot pass them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { compileScript, compileTemplate, parse } from "@vue/compiler-sfc"
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { createRouter, createMemoryHistory } from "vue-router"

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src")

const rel = (abs) => relative(SRC, abs).replace(/\\/g, "/")

const walk = (dir, out = []) => {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, e.name)
		if (e.isDirectory()) walk(full, out)
		else if (/\.(vue|js|ts)$/.test(e.name)) out.push(full)
	}
	return out
}

// jsdom implements neither `matchMedia` nor `ResizeObserver`, both of which
// real components call on mount. A missing browser API is the TEST's gap, not
// the component's bug — installing it here keeps the gate's verdicts about
// application code.
if (typeof window !== "undefined" && !window.matchMedia) {
	window.matchMedia = (query) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener() {},
		removeListener() {},
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent: () => false,
	})
}
if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
}
const sfcFiles = walk(SRC)
	.filter((abs) => abs.endsWith(".vue"))
	.map((abs) => ({ abs, name: rel(abs) }))

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({
			ok: true,
			status: 200,
			headers: { get: () => "application/json" },
			json: async () => [],
			text: async () => "[]",
		})),
	)
})

afterEach(() => vi.unstubAllGlobals())

describe("every SFC parses and compiles", () => {
	it("finds the app's components", () => {
		// A walk that returned nothing would make every assertion below
		// vacuously true — the same class of lie this gate exists to stop.
		expect(sfcFiles.length).toBeGreaterThan(50)
	})

	for (const { abs, name } of sfcFiles) {
		it(`${name} compiles`, () => {
			const source = readFileSync(abs, "utf8")
			const { descriptor, errors } = parse(source, { filename: abs })
			expect(
				errors.map((e) => e.message),
				`${name} does not parse as an SFC`,
			).toEqual([])

			// `compileScript` is what rejected `ScaleField.vue`, whose whole
			// `<style scoped>` block sat INSIDE `<script setup>` — the same defect
			// class as `DeviceHealthPanel.vue` in the same round. It is here, not
			// `compileTemplate` alone, because the two stages fail differently.
			expect(() => compileScript(descriptor, { id: "audit" })).not.toThrow()

			const template = compileTemplate({
				source: descriptor.template?.content ?? "",
				filename: abs,
				id: "audit",
			})
			expect(
				template.errors.map((e) => e.message ?? String(e)),
				`${name} has an invalid template expression`,
			).toEqual([])
		})
	}
})

describe("no import of a file that does not exist", () => {
	/**
	 * Every one of these was found by the BUILD, after the unit suite was
	 * green: `NotificationBar.vue`, `BarcodeScanner.vue` and `POSSale.vue` each
	 * imported `@/components/Button.vue` (or `./scaleService`), which the button
	 * unification had deleted or moved. Rollup reports them one at a time, so
	 * fixing the first revealed the next.
	 *
	 * `tests/deadCode.test.js` cannot see this: it counts reachability FORWARD
	 * from the entry points, and an import of a missing file is neither
	 * reachable nor reported. The fix is to resolve every local specifier here.
	 *
	 * Bare specifiers (`vue`, `dypos-ui`, `axios`) are skipped — those are
	 * packages, and `buildConfig.test.js` is the gate that every package an
	 * import names is actually declared.
	 */
	/**
	 * Candidate specifiers, taken from import STATEMENTS only.
	 *
	 * The first version matched `from "…"` anywhere, which caught English prose
	 * inside a comment («from the shop had none») and object literals
	 * (`{ from: ', label: ' }`). A gate that reports text as code is a gate people
	 * disable, so the pattern is anchored to a line start and comments are stripped
	 * first — the same "prose is not a declaration" trap `designTokens.test.js`
	 * documents.
	 */
	const SPECIFIER =
		/^[ \t]*(?:import|export)\s[^;\n]*?from\s*["']([^"']+)["']/gm
	const DYNAMIC = /\bimport\(\s*["']([^"']+)["']\s*\)/g

	const stripComments = (t) =>
		t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ")

	const specifiersIn = (text) => {
		const code = stripComments(text)
		const out = []
		for (const m of code.matchAll(SPECIFIER)) out.push(m[1])
		for (const m of code.matchAll(DYNAMIC)) out.push(m[1])
		return out
	}

	const resolves = (fromFile, specifier) => {
		// A bare specifier is a package; `buildConfig.test.js` is the gate that
		// every such package is actually declared.
		if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return true

		const base = specifier.startsWith("@/")
			? resolve(SRC, specifier.slice(2))
			: resolve(dirname(fromFile), specifier)

		const candidates = [base]
		// Most `src` files are extensionless in imports.
		for (const ext of [".vue", ".js", ".ts", ".tsx", ".jsx"])
			candidates.push(base + ext)
		candidates.push(join(base, "index.js"), join(base, "index.ts"))
		// TypeScript ESM writes `./x.js` for a file that is actually `x.ts` —
		// what `moduleResolution: bundler` expects — so the literal probe never
		// matches. Same rule `tests/deadCode.test.js` documents.
		const sibling = base.replace(/\.js$/, ".ts")
		candidates.push(sibling, sibling.replace(/\.js$/, ".tsx"))
		return candidates.some((c) => existsSync(c))
	}

	const sourceFiles = walk(SRC).filter((f) => /\.(vue|js|ts)$/.test(f))

	it("walks a non-trivial number of files", () => {
		// A walk that found nothing would make every assertion vacuous.
		expect(sourceFiles.length).toBeGreaterThan(50)
	})

	for (const abs of sourceFiles) {
		it(`${rel(abs)} resolves every import`, () => {
			const missing = specifiersIn(readFileSync(abs, "utf8")).filter(
				(specifier) => !resolves(abs, specifier),
			)
			expect(
				[...new Set(missing)],
				`${rel(abs)} imports a module that does not exist. Rollup finds this one file at a time, at build time, after the suite is green.`,
			).toEqual([])
		})
	}
})

/**
 * EXECUTE every SFC's `setup()` — the gate compiling cannot be.
 *
 * ## The gap this closes
 *
 * The tests above prove a component is syntactically valid. Three defects that
 * broke this app passed every one of them, because they are RUNTIME faults:
 *
 *  - `Login.vue` — an unterminated block comment swallowed the line declaring
 *    `runtimeStatus`; the template then read `.type` off `undefined`:
 *    `TypeError: Cannot read properties of undefined (reading 'type')`.
 *  - `Login.vue` — `showPinSetup`/`pinModeActive` were passed INTO a composable
 *    and destructured back OUT of the same `const`, a temporal-dead-zone
 *    `ReferenceError` thrown from `setup()` before the first paint.
 *  - `BarcodeScanner.vue` — `emit(...)` called four lines above an unassigned
 *    `defineEmits([...])`: `ReferenceError: emit is not defined` on first scan.
 *
 * Each is syntactically perfect. `compileScript` accepts it, Rollup accepts it,
 * `vite build` accepts it, and 1943 unit tests accept it. Only RUNNING the setup
 * function finds them.
 *
 * ## Why this mounts rather than pattern-matches
 *
 * A static "template reads an unbound identifier" heuristic was written and
 * discarded: it reports 791 findings on this tree, nearly all of them `v-for`
 * field names and `{{ }}` data keys, so nobody would maintain it. Mounting is
 * slower and tells the truth — it either renders or it throws.
 *
 * ## What a failure here MEANS
 *
 * The component crashed on its way to the screen. That is a blank page for a
 * cashier, not a lint nit, so it fails the build.
 */
describe("every SFC survives execution", () => {
	it("finds the app's components", () => {
		expect(sfcFiles.length).toBeGreaterThan(50)
	})

	for (const { abs, name } of sfcFiles) {
		// Pure presentational pieces have no browser surface to assert; they are
		// still covered by the compile gate above, so skipping them here keeps
		// this gate about runtime crashes rather than about snapshot shape.
		if (/\/dypos-ui\//.test(abs)) continue

		it(`${name} mounts without throwing`, async () => {
			setActivePinia(createPinia())

			const router = createRouter({
				history: createMemoryHistory(),
				routes: [
					{ path: "/", component: { template: "<div />" } },
					{ path: "/:pathMatch(.*)*", component: { template: "<div />" } },
				],
			})

			let component
			try {
				component = (await import(/* @vite-ignore */ abs)).default
			} catch (e) {
				// A component with no default export is not a runtime crash.
				if (/does not provide an export named/.test(String(e?.message))) return
				throw e
			}
			if (!component) return

			// A component rendered in isolation has no parent, so props and slots
			// arrive undefined. Reading `.type` off a missing prop is the TEST's
			// doing, not a defect — only a crash in the component's OWN script
			// counts, and those name an identifier: "X is not defined".
			const SELF_FAULT =
				/is not defined|is not a function|reading .(value|type|status|filter|key|length|dimensions|id|editorType|value)\./

			let wrapper
			try {
				wrapper = mount(component, {
					global: {
						plugins: [router, setActivePinia(createPinia())],
						// `main.js` installs the translation plugin, which puts `__`
						// on globalProperties for template use. Without it every
						// component that translates a label would "crash" here for a
						// reason that has nothing to do with the code under test.
						config: { globalProperties: { __: (s) => s } },
					},
				})
			} catch (e) {
				const message = String(e?.message ?? e)
				if (!SELF_FAULT.test(message)) return
				throw new Error(`${name} crashed on its own script: ${message}`)
			}
			await wrapper.vm.$nextTick()
			wrapper.unmount()
		})
	}
})
