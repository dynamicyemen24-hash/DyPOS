// TEMP audit script: list dypos-ui API usages (call / createResource) under POS/src
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const root = join(process.cwd(), "src")
const files = []
function walk(dir) {
	for (const e of readdirSync(dir)) {
		const p = join(dir, e)
		const st = statSync(p)
		if (st.isDirectory()) walk(p)
		else if (/\.(js|vue)$/.test(e)) files.push(p)
	}
}
walk(root)

const apiPat = /\b(createResource|listResource|createDocument|documentResource)\b/
let apiFiles = 0
let uiFiles = 0
const report = []
for (const f of files) {
	const src = readFileSync(f, "utf8")
	if (!/dypos-ui/.test(src)) continue
	const lines = src.split(/\r?\n/)
	const apiHits = []
	lines.forEach((l, i) => {
		if (/from ["']dypos-ui["']/.test(l)) {
			const names = (l.match(/\{([^}]*)\}/) || [, ""])[1]
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
			const apiNames = names.filter((n) => ["call", "createResource", "listResource", "createDocument", "getResource"].includes(n))
			if (apiNames.length) apiHits.push(`L${i + 1} IMPORT-API ${apiNames.join(",")}`)
		}
		if (apiPat.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)) apiHits.push(`L${i + 1} ${l.trim().slice(0, 90)}`)
	})
	if (apiHits.length) {
		apiFiles++
		report.push(`${relative(process.cwd(), f)}\n  ${apiHits.join("\n  ")}`)
	} else uiFiles++
}
console.log(`FILES importing dypos-ui (UI-only): ${uiFiles}`)
console.log(`FILES with API usage (needs refactor): ${apiFiles}\n`)
console.log(report.join("\n"))
