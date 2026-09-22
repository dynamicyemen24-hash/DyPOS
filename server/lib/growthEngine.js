/** DyPOS Value-Driven Organic Growth Engine v1.31.0 */
import db from '../db/schema.js'
import { v4 as uuid } from 'uuid'

/**
 * Initialize organic growth database tables for synergy, smart receipts, and insights.
 */
export function initGrowthEngineTables() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS store_synergies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        partner_store_name TEXT,
        partner_store_category TEXT,
        offer_text_ar TEXT,
        discount_code TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS merchant_insights (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        metric_key TEXT,
        metric_value TEXT,
        insight_text_ar TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS customer_feedback (
        id TEXT PRIMARY KEY,
        invoice_id TEXT,
        rating INTEGER,
        comment TEXT,
        created_at TEXT
      );
    `)
  } catch (e) {
    // Non-blocking best effort
  }
}

/**
 * Generate Smart Living Receipt Payload with integrated value-adds.
 * @param {Object} invoice - Invoice record
 * @returns {Object} Smart receipt metadata
 */
export function generateSmartLivingReceipt(invoice) {
  let localSynergy = null
  try {
    localSynergy = db.prepare('SELECT partner_store_name, offer_text_ar, discount_code FROM store_synergies WHERE is_active=1 ORDER BY RANDOM() LIMIT 1').get()
  } catch {
    // fallback
  }

  return {
    invoiceId: invoice.id,
    number: invoice.number,
    total: invoice.total,
    createdAt: invoice.created_at,
    loyaltyEarned: Math.floor(Number(invoice.total) / 10),
    feedbackUrl: `https://dypos.store/feedback/${invoice.id}`,
    localSynergy: localSynergy || {
      partner_store_name: 'شركاؤنا المحليون',
      offer_text_ar: 'استمتع بتجربة مميزة في المتاجر المجاورة',
      discount_code: 'DYPOS-VIP'
    },
    subtleBrand: 'مشغل بكفاءة عبر نظام DyPOS الذكي'
  }
}

/**
 * Compute automated merchant growth insight for weekly summary.
 * @param {string} tenantId - Tenant ID
 * @returns {Object} Growth insight summary
 */
export function computeMerchantInsight(tenantId = 'STD') {
  let salesStats = { total_sales: 0, order_count: 0, top_product: 'غير متوفر' }
  try {
    salesStats = db.prepare(`
      SELECT SUM(total) as total_sales, COUNT(*) as order_count 
      FROM invoices 
      WHERE status='PAID' AND datetime(created_at) >= datetime('now', '-7 days')
    `).get() || salesStats

    const topProd = db.prepare(`
      SELECT product_name, SUM(qty) as q 
      FROM invoice_items 
      GROUP BY product_id 
      ORDER BY q DESC LIMIT 1
    `).get()
    if (topProd) salesStats.top_product = topProd.product_name
  } catch {
    // fallback
  }

  const salesVal = Number(salesStats.total_sales || 0).toFixed(2)
  const countVal = Number(salesStats.order_count || 0)

  return {
    period: 'آخر 7 أيام',
    totalSales: salesVal,
    orderCount: countVal,
    topProduct: salesStats.top_product,
    insightText: `حقّق متجرك مبيعات بقيمة ${salesVal} ر.س عبر ${countVal} طلب خلال الأسبوع. المنتج الأكثر طلباً كان (${salesStats.top_product}). استمر في هذا الأداء الرائع!`
  }
}

export default {
  initGrowthEngineTables,
  generateSmartLivingReceipt,
  computeMerchantInsight,
}