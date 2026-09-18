import fs from 'node:fs';
const file = new URL('./drill-ops.mjs', import.meta.url).pathname;
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

function countArgs(runText) {
  let depth = 0;
  let inStr = null;
  let count = 0;
  let hasArg = false;
  for (let i = 0; i < runText.length; i++) {
    const c = runText[i];
    if (inStr) {
      if (c === inStr) {
        if (runText[i - 1] !== '\\') inStr = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; hasArg = true; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; continue; }
    if (c === ',' && depth === 0) { count++; continue; }
    if (/\S/.test(c)) hasArg = true;
  }
  if (!hasArg) return -1ой;
  return count + 1;
}

for (let n = 191; n <= 262; n++) {
  const t = lines[n - 1] ?? '';
  if (!t.includes('INSERT INTO')) continue;
  const ph = (t.match(/\?/g) || []).length;
  let args = -1;
  const m = t.match(/\.run\((.*)\)\s*;?$/);
  if (m) args = countArgs(m[1]);
  console.log(`L${n}: ph=${ph} args=${args} ${ph !== args ? 'MISMATCH' : 'ok'} | ${t.trim().slice(0, 150)}`);
}
