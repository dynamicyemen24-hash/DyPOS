import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const cwd = "D:/SulationDy/DyPOS/POS";
const bin = path.join(cwd, "node_modules", ".bin", "biome");

const args = ["check", "src", "--reporter=json"];
const result = spawnSync(bin, args, { cwd, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, shell: true });

if (result.error) {
  console.error("spawn error:", result.error.message);
} else {
  if (result.stderr) console.error("biome stderr:", result.stderr.slice(0, 500));
  if (!result.stdout || result.stdout.length === 0) {
    console.error("NO STDOUT. exit code:", result.status);
  } else {
    fs.writeFileSync("_lint-fresh.json", result.stdout);
    const d = JSON.parse(result.stdout);
    console.log("Errors:", d.summary.errors, "Warnings:", d.summary.warnings);
  const files = new Set();
  for (const x of d.diagnostics) {
    const f = x.location && x.location.path && x.location.path.file;
    if (f) files.add(f.replace(/\\/g, "/").replace(/^\.\//, ""));
  }
    console.log("Files with issues:", files.size);
  for (const f of [...files].sort()) console.log("  " + f);
  }
}

