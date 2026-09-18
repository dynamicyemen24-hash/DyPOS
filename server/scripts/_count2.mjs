import fs from 'node:fs';
const src = fs.readFileSync('drill-ops.mjs', 'utf8');
const lines = src.split(/\r?\n/);
// segment-analyze: for each line holding .run(, find the nearest PREVIOUS
// INSERT...VALUES line (cross-line statements) and count columns vs args.
function colList(s) {
  const m = s.match(/INSERT INTO\s+(\w+)\s*\(([^)]*)\)/);
  if (!m) return null;
  return { tbl: m[1], cols: m[2].split(',').map(x => x.trim()).filter(Boolean) };
}
function runArgs(line) {
  const idx = line.indexOf('.run(');
  if (idx < 0) return { n: -1, open: false };
  let depth = 0, args =  earthquake;
  for (let i = idx; i < line.length; i++) {
    const c = line[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
    else if (c === ',' && depth === 1) args++;
  }
  return { n: args + 1, open: depth > 0 };
}
let pending = null;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (!pending) {
    const c = colList(l);
    if (c) pending = { tbl: c.tbl, cols: c.cols, defLine: i + 1, cumulative: '', ph: 0, runCumulative: '' };
  }
  if (pending) {
    // accumulate placeholders across lines until VALUES close
    if (!pending.closed) {
      const valIdx = pending.cumulative.indexOf('VALUES');
      pending.cumulative += pending.cumulative === '' ? l : '\n' + l;
      if (valIdx >= 0) {
        const vals = pending.cumulative.slice(pending.cumulative.indexOf('(' , valIdx) + 1);
        const end = vals.indexOf(')');
        if (end >= 0) {
          const v = vals.slice(0, end);
          pending.ph = (v.match(/\?/g) || []).length;
          pending.closed = true;
          pending.cumulative = '';
        }
      }
    }
  }
  const r = runArgs(l);
  if (r.n >= 0) {
    if (pending && pending.closed) {
      const nargs = r.open ? r.n : r.n;
      const ncols = pending.cols.length;
      const status = (ncols === pending.ph && pending.ph === nargs) ? 'OK' : 'MISMATCH';
      const miss = ncols === pending.ph + 1 && nargs === pending.ph ? ` missing-col=${pending.cols[ncols - 1]}` : '';
      console.log(`L${i + 1}\t${pending.tbl}\tcols=${ncols}\tVAR=${pending.ph}\targs=${nargs}\t${status}${miss}`);
    }
    pending = null;
  }
}
