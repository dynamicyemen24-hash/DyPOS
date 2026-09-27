// TEMP: dump every static method string used by the POS UI (call/url).
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const root = join(process.cwd(), "src")
const map = new Map()
function walk(dir) {
	for (const e of readdirSync(dir)) {
		const p = join(dir, e)
		const st = statSync(p)
		if (st.isDirectory()) walk(p)
		else if (/\.(js|vue|ts)$/.test(e)) {
			const text = readFileSync(p, "utf8")
			const found = new Set()
			for (const m of text.matchAll(/(?:call|url)\s*\(\s*['"]([^'"]+)['"]/g)) found.add(m[1])
			for (const m of text.matchAll(/url\s*:\s*['"]([^'"]+)['"]/g)) found.add(m[1])
			for (const m of found) {
				if (!/^(DyPOS|dypos|dypos|login|logout|upload_file|get_)[\w.]*$/.test(m)) continue
				if (!map.has(m)) map.set(m, new Set())
				map.get(m).add(p.slice(root.length + 1).replaceAll("\\", "/"))
			}
		}
	}
}
walk(root)
for (const [m, files] of [...map.entries()].sort((a, b) => b[1].size - a[1].size))
	console.log(`${String(files.size).padStart(2)}  ${m}   ${[...files].slice(0, 3).join(", ")}`)
console.log(`TOTAL methods: ${map.size}`)
