/**
 * DyPOS Loyalty — single source of truth for points → tier → wallet conversion.
 * Earn rule (historic): floor(total / 10) points per PAID invoice.
 * Redeem rule (v1.6.0): points → wallet at DYPOS_LOYALTY_RATE (default 0.1 SAR/pt).
 * Tiers (auto, VIP stays manual):
 *   PLATINUM ≥1000 · GOLD ≥500 · SILVER ≥200 · else BRONZE
 */
import db from '../db/schema.js';

export const LOYALTY_RATE = Number(process.env.DYPOS_LOYALTY_RATE || 0.1);

export function tierFor(points) {
  const p = Number(points) || 0;
  if (p >= 1000) return 'PLATINUM';
  if (p >= 500) return 'GOLD';
  if (p >= 200) return 'SILVER';
  return 'BRONZE';
}

/** Recompute tier unless VIP (manual). Returns new tier or null. */
export function recalcTier(customerId) {
  try {
    const row = db.prepare('SELECT loyalty_points, loyalty_tier FROM customers WHERE id=?').get(customerId);
    if (!row) return null;
    if (String(row.loyalty_tier).toUpperCase() === 'VIP') return 'VIP';
    const next = tierFor(row.loyalty_points);
    if (next !== row.loyalty_tier) {
      db.prepare(`UPDATE customers SET loyalty_tier=?,updated_at=datetime('now') WHERE id=?`).run(next, customerId);
      return next;
    }
    return row.loyalty_tier;
  } catch {
    return null;
  }
}

export default { LOYALTY_RATE, tierFor, recalcTier };
