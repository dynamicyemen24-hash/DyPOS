import fs from "node:fs";

const raw = fs.readFileSync("_lint6.json", "utf8");
const d = JSON.parse(raw);

const g = {};
for (const x of d.diagnostics) {
  const f =
    x.location &&
    x.location.path &&
    x.location.path.file
      ? x.location.path.file
            .replace(/\\/g, "/")
            .replace(/^\.\//, "")
      : "<unknown>";
  const code = (x.code && x.code.value) || "?";
  const desc = (x.description || "").slice(0, 90);
  if (!g[f]) g[f] = [];
  g[f].push(code + " :: " + desc);
}

console.log("Total diag files:", Object.keys(g).length);
console.log("Summary:", JSON.stringify(d.summary));
let tot = 0;
for (const [k, v] of Object.entries(g)) {
  if (v.length > 0) {
    tot += v.length;
    console.log("\n## " + k + " (" + v.length + ")");
    v.slice(0, 6).forEach((e) => console.log("  - " + e));
  }
}
console.log("\n\nTOTAL DIAGS:", tot);
