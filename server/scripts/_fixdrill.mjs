import fs from 'node:fs';
const p = new URL('./drill-ops.mjs', import.meta.url).pathname;
let src = fs.readFileSync(p, 'utf8');
const lines = src.split(/\r?\n/);

// === invoices: line 235 (prepare) / 236 (run). SQL defines 20 columns with 3 hardcoded 0s (subtotal? no).
// Ground truth: VALUES has 17 '?' but run passes 20 => need 17 args.
const max = 17;
const prep = lines[235 - 1];
let run = lines[236 - 1];
const fixed = prep
  .replace(/VALUES \(/i, 'VALUES (')
  .split('') // no-op keep
  .join('');
console.log('INV prep placeholders:', (prep.match(/\?/g) || []).length);
console.log('INV run before:', run.slice(0, 90));

// Rebuild run: id,number,customer_id,customer_name,tax_amount,total,paid_amount,status,currency,notes,channel_id,shift_id,terminal_id,idempotency_key,tenant_id,branch_id,created_by = 17
run = `.run(invId, number, customer, customer ? 'عميل' : 'Walk-in Customer', 0, 0, 0, 'UNPAID', 'SAR', '', 'POS', null, \`${'${tenant}-T1'}\`, uuid(), tenant, \`${'${tenant}-B1'}\`, \`${'${tenant}-U1'}\`);`;
lines[236 - 1] = run;

// === invoice_items: line 247 (prepare) / 248 (run). 12 placeholders, run passes 13 => remove 1 arg.
const iprep = lines[247 - 1];
let irun = lines[248 - 1];
console.log('ITEMS prep placeholders:', (iprep.match(/\?/g) || []).length);
console.log('ITEMS run before:', irun.slice(0, 90));
irun = `.run(iiId, invId, pid, String(it.name || 'Item'), String(it.barcode || ''), qty, unitPrice, taxRate, lineTaxMinor, lineNetMinor + lineTaxMinor, 'Unit', warehouse);`;
lines[248 - 1] = irun;

fs.writeFileSync(p, lines.join('\r\n'), 'utf8');
console.log('--- written ---');
console.log('N236:', fs.readFileSync(p, 'utf8').split(/\r?\n/)[235]);
console.log('N248:', fs.readFileSync(p, 'utf8').split(/\r?\n/)[247]);
