/**
 * DyPOS stock policy — ONE implementation of the sale-time stock decision.
 *
 * Why this module exists: the REST sale route (`routes/invoices.js`) and the
 * method-router sale (`routes/method.js#createOrFinalizeSale`) each carried
 * their own copy of the decrement policy. Two copies of a stock rule drifts —
 * and the drift is invisible until a shop oversells on one path and not the
 * other. Both now call `decrementStock()` here.
 *
 * The policy is a **setting**, not a constant (`business_settings`):
 *   strict → short stock refuses the sale (409), stock never goes negative
 *   warn   → DEFAULT, the sale always completes: shortage is recorded as an
 *            Arabic warning, the ledger keeps the truth (qty may go negative,
 *            visible for a stock adjustment), low stock warns at the threshold
 *   off    → no availability check at all (blind decrement)
 *
 * `DYPOS_STOCK_GUARD=strict` remains an operator hard floor over all of it
 * (see `settings.js#stockControlMode`).
 */

export const STOCK_MODES = Object.freeze(['strict', 'warn', 'off']);

/** Tiny quantity formatter for messages — always Latin digits, never a locale surprise. */
function qty(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 1e6) / 1e6);
}

function shortageMessage(label, warehouse, requested, available) {
  return `نفاد الكمية: «${label}» — المطلوب ${qty(requested)}، المتاح ${qty(available)} في «${warehouse}». تم إتمام البيع وسُجّل الفرق لتصحيح المخزون.`;
}

function lowMessage(label, warehouse, remaining, threshold) {
  const base = `تنبيه مخزون منخفض: «${label}» — المتبقي ${qty(remaining)} في «${warehouse}».`;
  return threshold > 0 ? `${base} (حد التنبيه ${qty(threshold)})` : base;
}

function shortageError(label, warehouse, detail) {
  return Object.assign(
    new Error(`الكمية المتوفرة غير كافية لصنف ${label} في المستودع ${warehouse}${detail || ''}`),
    { statusCode: 409 },
  );
}

/**
 * Apply the sale decrement for one line under the configured policy.
 *
 * Runs INSIDE the caller's transaction, so the check and the write can never
 * interleave with another writer (SQLite single-writer).
 *
 * @param {Object} stmts - prepared statements: selectStockRow, guardedDecr, upsertStock
 * @param {Object} line - { productId, warehouseId, qty, label }
 * @param {Object} policy - { mode, threshold }
 * @param {string[]} [warnings] - collector; Arabic human-readable notes
 * @returns {{ mode: string, shortage: number, remaining: number|null, warning: string|null }}
 * @throws {Error} 409 when mode === 'strict' and stock is short
 */
export function decrementStock(stmts, line, policy, warnings) {
  const mode = policy?.mode === 'strict' || policy?.mode === 'off' ? policy.mode : 'warn';
  const threshold = Number.isFinite(Number(policy?.threshold)) ? Number(policy.threshold) : 0;
  const { productId, warehouseId: wh, qty: sold, label } = line;
  const push = (msg) => {
    if (msg && Array.isArray(warnings)) warnings.push(msg);
    return msg || null;
  };

  if (mode === 'off') {
    stmts.upsertStock.run(productId, wh, -sold);
    return { mode, shortage: 0, remaining: null, warning: null };
  }

  const tracked = stmts.selectStockRow.get(productId, wh);
  const trackedQty = tracked ? Number(tracked.qty) : null;
  const reserved = tracked ? Number(tracked.reserved_qty || 0) : 0;

  // Row exists at zero-or-above: the guarded decrement is the authority.
  if (tracked && trackedQty >= 0) {
    const ch = stmts.guardedDecr.run(-sold, productId, wh, -sold);
    if (ch.changes > 0) {
      const remaining = trackedQty - sold;
      const warning = remaining <= threshold ? lowMessage(label, wh, remaining, threshold) : null;
      return { mode, shortage: 0, remaining, warning: push(warning) };
    }
    const available = Math.max(0, trackedQty - reserved);
    if (mode === 'strict') {
      throw shortageError(label, wh, ` (المتاح ${qty(available)})`);
    }
    // warn: complete the sale honestly — the ledger shows the real negative
    // remainder so a stock adjustment (not a silent clamp) fixes it.
    stmts.upsertStock.run(productId, wh, -sold);
    const remaining = trackedQty - sold;
    return {
      mode,
      shortage: Math.max(0, sold - available),
      remaining,
      warning: push(shortageMessage(label, wh, sold, available)),
    };
  }

  // Row exists but is already negative (legacy artifact) or missing entirely.
  if (mode === 'strict') {
    throw shortageError(label, wh, tracked ? '' : ' (غير مدرج في المخزون)');
  }
  stmts.upsertStock.run(productId, wh, -sold);
  if (!tracked) {
    // Untracked SKU: nothing was measured, so nothing is claimed. Creating the
    // row on first sale is the documented walk-in behaviour (no warning noise).
    return { mode, shortage: 0, remaining: -sold, warning: null };
  }
  const remaining = trackedQty - sold;
  return {
    mode,
    shortage: sold,
    remaining,
    warning: push(shortageMessage(label, wh, sold, 0)),
  };
}

export default { STOCK_MODES, decrementStock };