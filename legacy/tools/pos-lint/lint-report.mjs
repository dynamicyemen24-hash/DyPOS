/**
 * TEMPORARY helper — resolves Biome JSON byte spans into file:line positions.
 * Delete after use.
 */
import { readFileSync } from "node:fs"

const source = process.argv[2] ?? "./lint2.json"
const { diagnostics } = JSON.parse(readFileSync(source, "utf8"))
const cache = new Map()

function lineAt(file, byteOffset) {
	try {
		if (!cache.has(file)) {
			const buf = readFileSync(file)
			const text = buf.toString("utf8")
			// Map byte offset -> char index
			const byteToChar = new Int32Array(buf.length + 1)
			let charIndex = 0
			for (let i = 0; i < buf.length; ) {
				byteToChar[i] = charIndex
				const byte = buf[i]
				let len = 1
				if (byte >= 0xf0) len = 4
				else if (byte >= 0xe0) len = 3
				else if (byte >= 0xc0) len = 2
				for (let k = 1; k < len; k++) byteToChar[i + k] = charIndex
				i += len
				charIndex += 1
			}
			byteToChar[buf.length] = charIndex
			cache.set(file, { text, byteToChar })
		}
		const { text, byteToChar } = cache.get(file)
		const charOffset = byteToChar[Math.min(byteOffset, byteToChar.length - 1)]
		const before = text.slice(0, charOffset)
		const line = before.split("\n").length
		const col = charOffset - before.lastIndexOf("\n")
		const lineText = text.split("\n")[line - 1] ?? ""
		return { line, col, lineText: lineText.trim() }
	} catch {
		return { line: 0, col: 0, lineText: "(unresolved)" }
	}
}

const rows = diagnostics.map((d) => {
	const file = d.location?.path?.file ?? "(no-file)"
	const span = Array.isArray(d.location?.span) ? d.location.span : [0]
	const { line, col, lineText } = lineAt(file, span[0])
	return {
		file,
		line,
		col,
		severity: d.severity,
		rule: d.category,
		lineText,
	}
})
rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

for (const r of rows) {
	process.stdout.write(
		`${r.file}|${r.line}:${r.col}|${r.severity}|${r.rule}|${r.lineText}\n`,
	)
}
const errors = rows.filter((r) => r.severity === "error").length
process.stdout.write(`\nTOTAL ${rows.length} | ERRORS ${errors}\n`)
