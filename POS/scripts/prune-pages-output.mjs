/**
 * Prune stale build artifacts from the Pages output dir.
 *
 * Context: vite `emptyOutDir:false` (Windows EPERM workaround) lets hashed
 * chunks from previous builds accumulate. The PWA precache then ships
 * hundreds of dead files (672 stale .js, ~14 copies of the same chunk).
 *
 * Strategy (deterministic, no guessing):
 *   live = precache URLs in sw.js  ∪  explicit runtime keep-list
 *   delete everything else under DyPOS/public/pos.
 *
 * Usage: node scripts/prune-pages-output.mjs [--dry-run]
 */
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "..", "..", "DyPOS", "public", "pos");
const dryRun = process.argv.includes("--dry-run");

const sw = await readFile(path.join(outDir, "sw.js"), "utf8");
const live = new Set();

// 1) Everything Workbox precaches is live.
// Workbox emits root-relative URLs WITHOUT a leading slash
// (e.g. `assets/index-abc.js`, `favicon.ico`), so normalize both forms.
for (const m of sw.matchAll(/url:"([^"]+)"/g)) {
	const url = m[1].split("?")[0].replace(/^\//, "");
	if (url && !url.includes("://")) live.add(url);
}

// 2) Runtime keep-list (not precached but fetched/needed at runtime).
const KEEP_EXACT = new Set([
	"sw.js",
	"index.html",
	"manifest.webmanifest",
	"_headers",
	"version.json",
	"offline.html",
]);
const KEEP_PREFIX = ["locales/"];
const KEEP_EXT = new Set([".xlsx", ".woff", ".map"]);

async function walk(dir) {
	const out = [];
	for (const e of await readdir(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) out.push(...(await walk(p)));
		else out.push(p);
	}
	return out;
}

const rel = (p) => path.relative(outDir, p).split(path.sep).join("/");
const isLive = (r) => {
	if (live.has(r)) return true;
	if (KEEP_EXACT.has(r)) return true;
	if (KEEP_PREFIX.some((pre) => r.startsWith(pre))) return true;
	if (r.startsWith("workbox-") && r.endsWith(".js")) return true;
	const ext = path.extname(r).toLowerCase();
	if (KEEP_EXT.has(ext)) return true;
	return false;
};

let deleted = 0;
let freed = 0;
for (const file of await walk(outDir)) {
	const r = rel(file);
	if (isLive(r)) continue;
	const size = (await stat(file)).size;
	if (!dryRun) await rm(file, { force: true });
	deleted += 1;
	freed += size;
}

console.log(
	`[prune-pages-output] ${dryRun ? "would delete" : "deleted"} ${deleted} stale file(s), freeing ${(freed / 1024 / 1024).toFixed(2)} MB`,
);
