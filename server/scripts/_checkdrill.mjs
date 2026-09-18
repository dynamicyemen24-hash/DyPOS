import fs from 'node:fs';
const lines = fs.readFileSync(new URL('./drill-ops.mjs', import.meta.url), 'utf8').split(/\r?\n/);

function countTop(expr) {
  let depth = 0, inStr = null, prev = '';
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inStr) {
      if (c === inStr && prev !== '\\') inStr = null;
      prev = c;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; prev = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) return '?';
    prev = c;
  }
  return '?';
}

for (let i = 0; i < lines.length; i++) {
  const t = lines[i];
  if (!t.includes('INSERT INTO')) continue;
  const ph = (t.match(/\?/g) || []).length;
  let runCount = null;
  let runLine = null;
  for (let j = i; j < lines.length && j < i + 6; j++) {
    if (lines[j].includes('.run(')) {
      const a = lines[j].indexOf('.run(') + 5;
      let expr = lines[j].slice(a);
      while (countTop(expr) === '?') {
        const k = lines[j].indexOf(',', a + countTop(expr) === '?' ? 0 : 0);
        break;
      }
      let depth2 = 0, inStr2 = null, prev2 = '', count = 1;
      for (let k = 0; k < expr.length; k++) {
        const c = expr[k];
        if (inStr2) {
          if (c === inStr2 && prev2 !== '\\') inStr2 = null;
          prev2 = c; continue;
        }
        if (c === '"' || c === "'" || c === '`') { inStr2 = c; prev2 = c; continue; }
        if (c === '(' || c === '[' || c === '{') depth2++;
        else if (c === ')' || c === ']' || c === '}') depth2--;
        else if (c === ',' && depth2 === 0) count++;
        prev2 = c;
      }
      runCount = count;
      runLine = j + 1;
      break;
    }
  }
  const ok = ph === runCount ? 'OK ' : 'MISMATCH';
  console.log(`L${i + 1}: placeholders=${ph} runArgs=${runCount} (run@L${runLine}) ${ph !== runCount ? ' <<< ' + ok : 'ok'}`);
}
