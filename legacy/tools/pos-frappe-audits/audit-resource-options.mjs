// TEMP audit #2: which createResource() option keys does the POS UI rely on?
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

// Collect top-level keys of each createResource({ ... }) object literal.
function blocks(src, opener) {
	const out = []
	const re = new RegExp(opener, "g")
	let m
	while ((m = re.exec(src))) {
		let i = src.indexOf("{", re.lastIndex - 1)
		if (i < 0) continue
		let depth = 0
		let j = i
		for (; j < src.length; j++) {
			const c = src[j]
			if (c === "{") depth++
			else if (c === "}") {
				depth--
				if (depth === 0) break
			}
		}
		out.push(src.slice(i + 1, j))
	}
	return out
}

function topLevelKeys(body) {
	const keys = []
	let depth = 0
	let line = ""
	for (const c of body) {
		if ("([{".includes(c)) depth++
		else if (")]}" .includes(c)) depth--
		if (c === "\n" && depth === 0) {
			const k = line.match(/^\s*(?:async\s+)?([A-Za-z0-9_$]+)\s*[(:]/)
			if (k) keys.push(k[1])
			line = ""
		} else line += c
	}
	const k = line.match(/^\s*(?:async\s+)?([A-Za-z0-9_$]+)\s*[(:]/)
	if (k) keys.push(k[1])
	return keys
}

// Resource member usages: res.<member>
const memberHits = new Map()
const keyHits = new Map()
let n = 0
for (const f of files) {
	const src = readFileSync(f, "utf8")
	for (const body of blocks(src, "createResource\\(\\s*\\{")) {
		n++
		for (const k of topLevelKeys(body)) keyHits.set(k, (keyHits.get(k) || 0) + 1)
	}
	// members accessed on variables assigned from createResource(...)
	const varNames = new Set()
	for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*createResource\s*\(/g))
		varNames.add(m[1])
	for (const v of varNames) {
		for (const m of src.matchAll(new RegExp(`\\b${v}\\.([A-Za-z0-9_$]+)`, "g"))) {
			memberHits.set(m[1], (memberHits.get(m[1]) || 0) + 1)
		}
	}
}
console.log(`createResource blocks: ${n}`)
console.log("\nOPTION KEYS:")
console.log([...keyHits.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join("\n"))
console.log("\nMEMBERS USED ON RESOURCE VARS:")
console.log([...memberHits.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join("\n"))
