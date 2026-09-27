import fs from "node:fs";

const d = JSON.parse(fs.readFileSync("_lint-fresh.json", "utf8"));
const root = "D:/SulationDy/DyPOS/POS/";

const byFile = {};
for (const x of d.diagnostics) {
  const fp = x.location && x.location.path && x.location.path.file
    ? x.location.path.file.replace(/\\/g, "/").replace(/^\.\.\//, "")
    : null;
  if (!fp) continue;
  if (fp.includes("components.d.ts") || fp.includes("auto-imports.d.ts")) continue; // generated
  if (fp.includes("dist-")) continue;
  const code = (x.code && x.code.value) || "?";
  const desc = (x.description || "").slice(0, 70);
  const span = x.location ? x.location.span : null;
  (byFile[fp] = byFile[fp] || []).push({ code, desc, span });
}

for (const fp of Object.keys(byFile).sort()) {
  const full = root + fp;
  if (!fs.existsSync(full)) {
    console.log("\n## MISSING: " + fp);
    continue;
  }
  const lines = fs.readFileSync(full, "utf8").split("\n");
  console.log("\n## " + fp + " (" + byFile[fp].length + " issues)");
  for (const issue of byFile[fp]) {
    // span is [start, end] char positions; find line
    if (issue.span && typeof issue.span[0] === "number") {
      let pos = 0, lineNo = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineLen = lines[i].length + 1; // +1 for newline
        if (pos + lineLen > issue.span[0]) {
          lineNo = i + 1;
          break;
        }
        pos += lineLen;
      }
      if (lineNo > 0) {
        console.log("  L" + lineNo + " [" + issue.code + "] " + issue.desc);
        console.log("    > " + (lines[lineNo - 1] || "").slice(0, 110));
      }
    } else {
      console.log("  " + issue.code + " " + issue.desc);
    }
  }
}
