import fs from 'node:fs';
const src = fs.readFileSync('drill-ops.mjs', 'utf8');
const lines = src.split(/\r?\n/);
const stack = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const m = l.match(/INSERT INTO\s+(\w+)/);
  const p = l.match(/VALUES\s*\(([^)]*)\)/);
  if (m && p) {
    stack.push({ i: i + 1, tbl: m[1], ph: (p[1].match(/\?/g) || []).length, args: null });
  }
  const r = l.match(/\.run\(/);
  if (r && stack.length) {
    const open = l.indexOf('.run(');
    const body = l.slice(open + 5); // past ".run("
    let depth = 0, args = 1;
    for (let k = 0; k < body.length; k++) {
      const c = body[k];
      if (c === '(') depth++;
      else if (c === ')') { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) args++;
    }
    const s = stack.pop();
    s.args = args;
    console.log(`L${l.replace(/\s+/g, ' ').trim().slice(0, 40)}  > ${
      s.i
    } \t${s.tbl}\tINSERT_LINE=${s.i}\tplaceholders=${s.ph}\trun_args=${s.args}\t${
      s.ph === s.args ? 'OK' : 'MISMATCH'
    }`);
  }
}
if (stack.length) console.log('UNCLOSED INSERTS:', stack.map(x => x.tbl + '@' + x.i).join(', '));
