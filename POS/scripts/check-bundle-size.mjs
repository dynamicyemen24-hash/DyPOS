/**
 * Bundle budget gate — fails the build when the production JS/CSS payload
 * grows past the budget. Prevents silent bloat regressions (new chart lib,
 * duplicated icons, un-tree-shaken vendor) from reaching customers on slow
 * store networks.
 *
 * Run AFTER `vite build` (reads ../DyPOS/public/pos/assets).
 * Budget: BUNDLE_BUDGET_KB env (default 900). Current: ~600KB gzip.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

const dir = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"DyPOS",
	"public",
	"pos",
	"assets",
)
const budgetKb = Number(process.env.BUNDLE_BUDGET_KB) || 900

if (!existsSync(dir)) {
	console.error(
		`bundle budget: assets dir missing (${dir}) — run vite build first`,
	)
	process.exit(2)
}

let js = 0
let css = 0
for (const f of readdirSync(dir)) {
	if (!f.endsWith(".js") && !f.endsWith(".css")) continue
	const gz = gzipSync(readFileSync(join(dir, f))).length
	if (f.endsWith(".js")) js += gz
	else css += gz
}
const totalKb = Math.round((js + css) / 1024)
console.log(
	`bundle budget: JS ${Math.round(js / 1024)}KB + CSS ${Math.round(css / 1024)}KB = ${totalKb}KB gzip (budget ${budgetKb}KB)`,
)
if (totalKb > budgetKb) {
	console.error(
		`BUNDLE OVER BUDGET: ${totalKb}KB > ${budgetKb}KB — slim the payload before shipping`,
	)
	process.exit(1)
}
console.log("bundle budget: OK")
