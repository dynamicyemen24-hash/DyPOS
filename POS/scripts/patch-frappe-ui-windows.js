// Idempotent, version-proof patch for frappe-ui/vite on Windows.
//
// node_modules/frappe-ui/vite/utils.js walks up the directory tree looking for
// a frappe-bench layout (`sites` + `apps`). The published source terminates the
// walk with `while (currentDir !== '/')`. On POSIX that condition eventually
// stops at the filesystem root; on Windows the root is "C:\" which is NEVER
// equal to "/", so importing frappe-ui/vite spins forever and both `vite build`
// and `vite dev` hang before printing anything.
//
// Previous revisions of this script matched exact source variants and silently
// no-opped when upstream reworded the file (0.1.278 changed the loop bodies,
// leaving the hang in place). This revision is textual and version-proof:
// it rewrites EVERY `while (currentDir !== '/')` guard to a root-detecting
// condition, whatever the loop body contains. Safe to re-run; no-op when
// no vulnerable guard remains.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const utilsPath = path.resolve(here, "../node_modules/frappe-ui/vite/utils.js")

if (!fs.existsSync(utilsPath)) {
	console.warn("[patch-frappe-ui-windows] utils.js not found, skipping")
	process.exit(0)
}

const source = fs.readFileSync(utilsPath, "utf8")

const VULNERABLE_GUARD = /while\s*\(\s*currentDir\s*!==\s*['"]\/['"]\s*\)\s*\{/g
const HELPER_ANCHOR = "__dyposIsFsRoot"
const HELPER_DEF = `
// DyPOS Windows patch: drive roots ("C:\\") never equal "/", so the upstream
// guard would loop forever. A directory is a filesystem root when resolving
// ".." no longer changes it (true for "/" and "C:\\" alike).
function ${HELPER_ANCHOR}(dir) {
	try {
		const resolved = path.resolve(dir)
		return path.resolve(resolved, "..") === resolved
	} catch {
		return true
	}
}
`

let next = source
const occurrences = next.match(VULNERABLE_GUARD) || []

if (occurrences.length > 0) {
	next = next.replace(
		VULNERABLE_GUARD,
		`while (!${HELPER_ANCHOR}(currentDir)) {`,
	)
	if (
		!next.includes(`${HELPER_ANCHOR}(`) ||
		!next.includes(`function ${HELPER_ANCHOR}`)
	) {
		// Insert the helper right after the last import statement.
		const lines = next.split("\n")
		let lastImport = -1
		lines.forEach((line, index) => {
			if (/^\s*import\s/.test(line)) lastImport = index
		})
		lines.splice(lastImport + 1, 0, HELPER_DEF)
		next = lines.join("\n")
	}
	// Ensure the helper definition itself is present (replace-guard above
	// already references it; this covers files where only the helper was lost).
	if (!next.includes(`function ${HELPER_ANCHOR}`)) {
		const lines = next.split("\n")
		let lastImport = -1
		lines.forEach((line, index) => {
			if (/^\s*import\s/.test(line)) lastImport = index
		})
		lines.splice(lastImport + 1, 0, HELPER_DEF)
		next = lines.join("\n")
	}
	fs.writeFileSync(utilsPath, next, "utf8")
	console.log(
		`[patch-frappe-ui-windows] hardened ${occurrences.length} loop guard(s) in ${utilsPath}`,
	)
} else {
	console.log("[patch-frappe-ui-windows] already patched, nothing to do")
}

process.exit(0)
