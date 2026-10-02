/**
 * No unreachable source in POS/src.
 *
 * Measured, not aspirational: a BFS from the real entry points
 * (main.js / router.js / App.vue / the workers / the test+script roots) over
 * every static import specifier. Anything outside that graph never reaches the
 * bundle — proven against `dist/pos/assets` while pruning: 160 of 400 modules
 * (≈60k lines) produced no compiled `__name` marker, and one of them
 * (InstallAppBadge) was even referenced by a `useDialog("…")` key, so a
 * grep-for-references audit would have called it live.
 *
 * The point of the gate: dead code is invisible, grows by copy-paste, and every
 * reader pays for it. This test makes it fail loudly instead.
 *
 * The three resolution rules below are all learned the hard way — each one
 * produced a false "dead" verdict that deleted live code once:
 *   1. `@/x/y`      → src/x/y.{js,vue,ts,tsx}
 *   2. `@/x/y`      → src/x/y/index.js  (directory barrel)
 *   3. tests/scripts are roots, and their own imports are traversed too
 */
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const SRC = join(POS, "src")

/** Directories that hold no importable module. */
const SKIP = new Set([
	"node_modules",
	"dist",
	"assets",
	"illustrations",
	"Inter",
	"locales",
	// types/** are ambient declarations picked up by tsconfig, not by imports:
	// nothing "uses" them at runtime, and deleting them only breaks `typecheck`.
	"types",
])
const CODE = /\.(m?js|cjs|ts|vue|tsx|jsx)$/

const walk = (dir, out = []) => {
	let entries
	try {
		entries = readdirSync(dir, { withFileTypes: true })
	} catch {
		return out
	}
	for (const entry of entries) {
		if (SKIP.has(entry.name)) continue
		const full = join(dir, entry.name)
		if (entry.isDirectory()) walk(full, out)
		else if (CODE.test(entry.name)) out.push(full)
	}
	return out
}

const srcFiles = walk(SRC)
const key = (abs) => relative(SRC, abs).replace(/\\/g, "/")
const byKey = new Map(srcFiles.map((f) => [key(f), f]))

/** Every src module a file statically imports (alias, relative and barrel). */
const importsOf = (file) => {
	const text = readFileSync(file, "utf8")
	const out = new Set()
	for (const m of text.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)) {
		const spec = m[1]
		let abs
		if (spec.startsWith("@/")) abs = resolve(SRC, spec.slice(2))
		else if (spec.startsWith(".")) abs = resolve(dirname(file), spec)
		else continue
		for (const ext of [".js", ".vue", ".ts", ".tsx", ""]) {
			const candidate = `${abs}${ext}`
			if (byKey.has(key(candidate))) {
				out.add(key(candidate))
				break
			}
		}
		// ESM TypeScript writes `./x.js` for a file that is actually `x.ts`
		// (what `moduleResolution: bundler` expects). The literal probe
		// above never matches that, so a barrel re-exporting its own tree
		// reported every member dead. Try the sibling source extension.
		for (const alt of [".ts", ".vue", ".tsx"]) {
			const candidate = abs.replace(/\.js$/, alt)
			if (byKey.has(key(candidate))) {
				out.add(key(candidate))
				break
			}
		}
		// Barrel: `@/x/y` → `src/x/y/index.{js,ts}`. Only `index.js` was
		// probed, so a TypeScript barrel (`index.ts`) was invisible to the
		// BFS and every module it re-exported was reported dead — a false
		// verdict that says "delete it" about a live, wired entry point.
		for (const ext of [".js", ".ts"]) {
			const barrel = `${abs}/index${ext}`
			if (byKey.has(key(barrel))) {
				out.add(key(barrel))
				break
			}
		}
	}
	return out
}

const roots = [
	join(SRC, "main.js"),
	join(SRC, "router.js"),
	join(SRC, "App.vue"),
	join(SRC, "socket.js"),
	...srcFiles.filter((f) => /worker\.js$|serviceWorker\.js$/.test(f)),
	// Tests and build scripts are legitimate consumers of src modules.
	...walk(join(POS, "tests")),
	...walk(join(POS, "scripts")),
].filter((f) => {
	try {
		readFileSync(f)
		return true
	} catch {
		return false
	}
})

const reachable = new Set()
const queue = [...roots]
while (queue.length) {
	const file = queue.pop()
	if (reachable.has(file)) continue
	reachable.add(file)
	for (const k of importsOf(file)) {
		const target = byKey.get(k)
		if (target && !reachable.has(target)) queue.push(target)
	}
}

describe("no unreachable source in POS/src", () => {
	it("the graph walk is not vacuous (it finds the app and the kit)", () => {
		expect(srcFiles.length).toBeGreaterThan(50)
		for (const entry of ["main.js", "router.js", "App.vue"]) {
			expect(byKey.has(entry), `${entry} must exist`).toBe(true)
		}
		// A walk that reaches nothing would "pass" this suite while the whole
		// tree looked dead — the same class of lie the audit had before.
		expect(reachable.size).toBeGreaterThan(50)
	})

	it("every module is reachable from an entry point", () => {
		const unreachable = srcFiles
			.filter((f) => !reachable.has(f))
			.map((f) => key(f))
			.sort()
		expect(
			unreachable,
			"these modules are in POS/src but nothing imports them — they never " +
				"reach the bundle. Delete them, or wire them up on purpose.",
		).toEqual([])
	})
})
