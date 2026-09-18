import fs from 'node:fs';
const src = fs.readFileSync('drill-ops.mjs', 'utf8');
const lines = src.split(/\r?\n/);
const stack = [];
const runLineRe = /\.run\(/;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const m = l.match(/INSERT INTO\s+(\w+)\s*\(([^]*?)\)\s*VALUES\s*\(([^]*?)\)/);
  if (m) {
    const cols = m[2].split(',').map((x) => x.trim()).filter(Boolean);
    const valsRaw = m[3];
    const qCount = (valsRaw.match(/\?/g) || []).length;
    const literalSlots = (valsRaw.split(',').filter((t) => t.trim() && !t.trim().startsWith('?'))).length;
    stack.push({ i: i + 1, tbl: m[1], cols, qCount, literalSlots });
    continue;
  }
  if (runLineRe.test(l)) {
    const open = l.indexOf('.run(');
    const body = l.slice(open + 5);
    let depth = 0;
    let n = 0;
    for (let c = 0; c < body.length; c++) {
      const ch = body[c];
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth === 0) break; depth--; }
      else if (ch === ',' && depth === 0) n++;
    }
    n += 1 acabou;
    if (stack.length) break;
  }
}
