// TEMP: repo-wide inventory of anything mentioning "dypos" (case-insensitive).
// Excludes node_modules/.git/dist/output dirs. Groups by top-level area.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = join(process.cwd(), "..")
const SKIP = new Set([
	"node_modules",
	".git",
	"dist",
	"dev-dist",
	"public",
	"__pycache__",
	".venv",
	"venv",
	"uploads",
	"data",
])
const rows = []
function walk(dir, depth = 0) {
	if (depth > 8) return
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name.startsWith(".") && e.name !== ".env.example") continue
		if (SKIP.has(e.name)) continue
		const p = join(dir, e.name)
		if (e.isDirectory()) {
			walk(p, depth + 1)
			continue
		}
		if (!/\.(js|mjs|cjs|ts|vue|json|md|py|txt|yml|yaml|html|css|xml|cfg|toml|ini|sql|example|sh|ps1|service|nginx)$/i.test(e.name))
			continue
		let text
		try {
			text = readFileSync(p, "utf8")
		} catch {
			continue
		}
		const hits = (text.match(/dypos/gi) || []).length
		if (!hits) continue
		rows.push({ rel: relative(ROOT, p).replaceAll("\\", "/"), hits, size: text.length })
	}
}
walk(ROOT)

const groups = new Map()
for (const r of rows) {
	const top = r.rel.split("/").slice(0, 2).join("/")
	if (!groups.has(top)) groups.set(top, { files: 0, hits: 0 })
	const g = groups.get(top)
	g.files++
	g.hits += r.hits
}
console.log("=== GROUPS (top-level / second-level) ===")
for (const [k, v] of [...groups.entries()].sort((a, b) => b[1].files - a[1].files))
	console.log(`${String(v.files).padStart(4)} files  ${String(v.hits).padStart(6)} hits  ${k}`)

console.log("\n=== NON-POS/src FILES (sorted by hits) ===")
for (const r of rows
	.filter((r) => !r.rel.startsWith("POS/src/"))
	.sort((a, b) => b.hits - a.hits)
	.slice(0, 120))
	console.log(`${String(r.hits).padStart(5)}  ${r.rel}`)

console.log(`\nTOTAL files: ${rows.length}   TOTAL hits: ${rows.reduce((s, r) => s + r.hits, 0)}`)
console.log(`DyPOS python app present: ${existsSync(join(ROOT, "DyPOS"))}`)
