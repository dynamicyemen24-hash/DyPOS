/** DyPOS Multimodal Smart Search & Subscriber Acquisition Engine v1.31.0 */
import db from '../db/schema.js'
import { v4 as uuid } from 'uuid'

/**
 * Initialize advanced search index and subscriber acquisition tables.
 */
export function initAdvancedGrowthTables() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS subscriber_campaigns (
        id TEXT PRIMARY KEY,
        campaign_name TEXT,
        discount_percentage REAL DEFAULT 0,
        trial_days INTEGER DEFAULT 14,
        referral_bonus_sar REAL DEFAULT 50,
        is_active INTEGER DEFAULT 1,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS multimodal_search_index (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        search_tokens TEXT, -- FTS / phonetic / barcode / qr / tags
        image_signature TEXT,
        updated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_multimodal_tokens ON multimodal_search_index(search_tokens);
    `)

    // Seed default campaign if empty
    const count = db.prepare('SELECT COUNT(*) as c FROM subscriber_campaigns').get()?.c || 0
    if (count === 0) {
      db.prepare(`
        INSERT OR IGNORE INTO subscriber_campaigns (id, campaign_name, discount_percentage, trial_days, referral_bonus_sar, is_active, created_at)
        VALUES ('camp-launch-2026', 'حملة الانطلاقة الذكية - استقطاب التجار', 20.0, 30, 100.0, 1, datetime('now'))
      `).run()
    }
  } catch (e) {
    // Non-blocking best effort
  }
}

/**
 * Perform Multimodal Smart Search (Barcode, QR, Image signature, Voice token, or Text)
 * @param {Object} queryParams - Search parameters { query, barcode, qr, imageHash, voiceText }
 * @returns {Array} Matching products or records
 */
export function executeMultimodalSearch({ query, barcode, qr, imageHash, voiceText, tenantId }) {
  try {
    const scope = tenantId || null
    if (barcode || qr) {
      const code = barcode || qr
      const row = scope
        ? db.prepare('SELECT * FROM products WHERE (barcode=? OR id=?) AND (tenant_id=? OR tenant_id IS NULL)').get(code, code, scope)
        : db.prepare('SELECT * FROM products WHERE barcode=? OR id=?').get(code, code)
      return row ? [row] : []
    }

    const needle = String(query || voiceText || '').trim().toLowerCase()
    if (!needle) return []

    // FTS / LIKE search across name, name_ar, barcode
    const sql = scope
      ? `SELECT * FROM products
        WHERE (LOWER(name) LIKE ? OR LOWER(name_ar) LIKE ? OR barcode LIKE ? OR id LIKE ?) AND (tenant_id=? OR tenant_id IS NULL)
        LIMIT 50`
      : `SELECT * FROM products
        WHERE LOWER(name) LIKE ? OR LOWER(name_ar) LIKE ? OR barcode LIKE ? OR id LIKE ?
        LIMIT 50`
    const likePattern = `%${needle}%`
    return scope
      ? db.prepare(sql).all(likePattern, likePattern, likePattern, likePattern, scope)
      : db.prepare(sql).all(likePattern, likePattern, likePattern, likePattern)
  } catch (e) {
    return []
  }
}

/**
 * Get subscriber acquisition & attraction campaign details.
 */
export function getActiveSubscriberCampaign() {
  try {
    return db.prepare('SELECT * FROM subscriber_campaigns WHERE is_active=1 ORDER BY created_at DESC LIMIT 1').get()
  } catch {
    return null
  }
}

export default {
  initAdvancedGrowthTables,
  executeMultimodalSearch,
  getActiveSubscriberCampaign,
}