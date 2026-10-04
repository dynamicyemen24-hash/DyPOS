/**
 * One-off measurement: which barrel-exported components does no template render?
 *
 * Run from POS/: `node scripts/measure-dead-exports.mjs`
 *
 * `deadExports.test.js` is the permanent gate; this prints the WHOLE list with
 * its source barrel and line count, because a truncated vitest diff
 * (`[ 'A', …(17) ]`) is how a 6346-line decision gets made on partial evidence.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"

const SRC = resolve(process.cwd(), "src")

function walk(dir, out = []) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) walk(full, out)
		else if (/\.(vue|js|ts)$/.test(entry)) out.push(full)
	}
	return out
}

const files = walk(SRC)
const barrels = files.filter((f) =>
	/[/\\]components[/\\].*[/\\]index\.(js|ts)$/.test(f),
)

const exported = new Map()
for (const barrel of barrels) {
	const text = readFileSync(barrel, "utf8")
	for (const m of text.matchAll(
		/export\s*\{[^}]*?as\s+([A-Za-z_$][\w$]*)\s*\}/g,
	)) {
		exported.set(m[1], barrel)
	}
	for (const m of text.matchAll(/export\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
		if (!exported.has(m[1])) exported.set(m[1], barrel)
	}
}

const usedTags = new Set()
for (const file of files) {
	if (!file.endsWith(".vue")) continue
	const text = readFileSync(file, "utf8")
	for (const m of text.matchAll(/<([A-Z][\w.]*)/g)) usedTags.add(m[1])
	for (const m of text.matchAll(/:is\s*=\s*["']([A-Z][\w]*)["']/g))
		usedTags.add(m[1])
}

/** The component file behind a barrel export, for its line count. */
function sourceOf(name, barrel) {
	const text = readFileSync(barrel, "utf8")
	const m = text.match(
		new RegExp(
			`export\\s*\\{[^}]*?as\\s+${name}\\s*\\}\\s*from\\s*["']([^"']+)`,
		),
	)
	if (!m) return null
	const spec = m[1]
	const abs = spec.startsWith(".")
		? resolve(barrel, "..", spec)
		: resolve(SRC, spec.replace(/^@\//, ""))
	for (const ext of ["", ".vue", ".js", ".ts"]) {
		try {
			const candidate = abs.endsWith(ext) ? abs : `${abs}${ext}`
			if (statSync(candidate).isFile()) return candidate
		} catch {
			/* keep probing */
		}
	}
	return null
}

/**
 * Absolute paths reached through a literal `import("./x.vue")` anywhere — the
 * registry mechanism (`DASHBOARD_REGISTRY` → `<component :is>`). Without this
 * the report calls every dashboard dead, which was the FIRST run's false
 * verdict.
 */
const lazilyImported = new Set()
for (const file of files) {
	const text = readFileSync(file, "utf8")
	for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
		const spec = m[1]
		if (!/\.vue$/.test(spec)) continue
		const abs = spec.startsWith(".")
			? resolve(dirname(file), spec)
			: resolve(SRC, spec.replace(/^@\//, ""))
		if (existsSync(abs)) lazilyImported.add(abs)
	}
}

/**
 * Lazy imports of ANY specifier, not just `.vue` files. `router.js` mounts the
 * self-checkout screen through `() => import("@/components/selfCheckout").then(
 * (m) => m.SelfCheckoutScreen)` — a lazy import of a BARREL, which the
 * `.vue`-only scan cannot see. It is the third mount mechanism this tool (and
 * the gate beside it) learned about the hard way.
 */
for (const file of files) {
	const text = readFileSync(file, "utf8")
	for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
		const spec = m[1]
		const base = spec.startsWith(".")
			? resolve(dirname(file), spec)
			: resolve(SRC, spec.replace(/^@\//, ""))
		for (const cand of [
			base,
			`${base}.js`,
			`${base}.ts`,
			join(base, "index.js"),
			join(base, "index.ts"),
		]) {
			if (!existsSync(cand) || !statSync(cand).isFile()) continue
			lazilyImported.add(cand)
			break
		}
	}
}

/** A member read off a lazily imported module: `.then((m) => m.Member)`. */
for (const file of files) {
	const text = readFileSync(file, "utf8")
	for (const m of text.matchAll(
		/\.then\(\s*\(\s*\w+\s*\)\s*=>\s*\w+\.(\w+)\s*\)/g,
	))
		usedTags.add(m[1])
}

const dead = [...exported.keys()]
	.filter((name) => {
		if (usedTags.has(name)) return false
		const entry = exported.get(name)
		const source = sourceOf(name, entry)
		if (!source) return false
		if (lazilyImported.has(source)) return false
		// Mounted THROUGH its barrel: the route lazily imports the barrel module.
		const barrelFile = entry.barrel
		return (
			!lazilyImported.has(barrelFile) &&
			!lazilyImported.has(barrelFile.replace(/\/index\.(js|ts)$/, ""))
		)
	})
	.sort()
let total = 0
console.log(
	`barrels: ${barrels.length} · exported: ${exported.size} · dead: ${dead.length}\n`,
)
for (const name of dead) {
	const barrel = exported.get(name)
	const source = sourceOf(name, barrel)
	const lines = source ? readFileSync(source, "utf8").split("\n").length : 0
	total += lines
	console.log(
		`  ${name.padEnd(26)} ${String(lines).padStart(5)} lines  ${relative(SRC, source ?? barrel)}`,
	)
}
console.log(`\ntotal dead lines: ${total}`)
