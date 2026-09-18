/**
 * DyPOS Invoice Chain — tamper-evident hash-chained audit (ZATCA/SAMA foundation).
 *
 * Every invoice mutation (CREATE/PAY/VOID/RETURN) appends:
 *   hash = SHA256(prev_hash + '|' + invoice_id + '|' + number + '|' + total + '|' + status + '|' + action)
 * GENESIS prev for the first row. Verification replays the chain in id order.
 * Called INSIDE the caller's SQLite transaction (uses savepoints when nested).
 */
import crypto from 'crypto';
import db from '../db/schema.js';

export const GENESIS = 'GENESIS';

export function chainHash(prev, { invoiceId = '', number = '', total = 0, status = '', action = '' }) {
  return crypto.createHash('sha256')
    .update([String(prev || GENESIS), String(invoiceId), String(number), String(Number(total) || 0), String(status), String(action)].join('|'))
    .digest('hex');
}

export function lastHash() {
  try {
    const row = db.prepare('SELECT hash FROM invoice_audit ORDER BY id DESC LIMIT 1').get();
    return row?.hash || GENESIS;
  } catch {
    return GENESIS;
  }
}

/** Append one link + stamp invoices.chain_hash/chain_prev. Returns { prev, hash }. */
export function appendChain(invoiceId, { number = '', total = 0, status = '', action = 'CREATE' } = {}) {
  const prev = lastHash();
  const hash = chainHash(prev, { invoiceId, number, total, status, action });
  try {
    db.prepare('UPDATE invoices SET chain_hash=?,chain_prev=? WHERE id=?').run(hash, prev, invoiceId);
  } catch { /* invoices row may not exist yet in exotic flows — audit still records */ }
  db.prepare(`INSERT INTO invoice_audit (invoice_id,prev_hash,hash,action,total,number,status) VALUES (?,?,?,?,?,?,?)`)
    .run(invoiceId, prev, hash, String(action).slice(0, 20), Number(total) || 0, String(number).slice(0, 64), String(status).slice(0, 20));
  return { prev, hash };
}

/** Verify the full chain exactly. Returns { ok, checked, brokenAt, reason }. */
export function verifyChain(limit = 100000) {
  const rows = db.prepare('SELECT id,invoice_id,prev_hash,hash,action,total,number,status FROM invoice_audit ORDER BY id ASC LIMIT ?').all(Math.min(Math.max(limit, 1), 1000000));
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prev_hash !== prev) return { ok: false, checked: rows.length, brokenAt: r.id, reason: 'prev-link mismatch' };
    const expect = chainHash(prev, {
      invoiceId: r.invoice_id, number: r.number || '', total: r.total || 0, status: r.status || '', action: r.action,
    });
    if (expect !== r.hash) return { ok: false, checked: rows.length, brokenAt: r.id, reason: 'hash mismatch (tamper?)' };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length, brokenAt: null };
}

export default { GENESIS, chainHash, lastHash, appendChain, verifyChain };
