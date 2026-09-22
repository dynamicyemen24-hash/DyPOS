/** DyPOS Growth API Routes v1.31.0 */
import { Router } from 'express'
import db from '../db/schema.js'
import { v4 as uuid } from 'uuid'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { ah } from '../lib/async.js'
import { VERSION } from '../lib/version.js'
import { generateSmartLivingReceipt, computeMerchantInsight, initGrowthEngineTables } from '../lib/growthEngine.js'

const router = Router()

// Initialize tables on load
initGrowthEngineTables()

/**
 * GET /api/growth/insight — Get automated merchant growth insight & business intelligence
 */
router.get('/insight', authMiddleware, ah(async (req, res) => {
  const tenantId = req.query.tenant || 'STD'
  const insight = computeMerchantInsight(tenantId)
  return res.json({
    success: true,
    data: insight,
    version: VERSION
  })
}))

/**
 * GET /api/growth/receipt/:invoiceId — Get Smart Living Receipt metadata
 */
router.get('/receipt/:invoiceId', authMiddleware, ah(async (req, res) => {
  const invoiceId = String(req.params.invoiceId).slice(0, 64)
  const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(invoiceId)
  if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' })

  const smartReceipt = generateSmartLivingReceipt(invoice)
  return res.json({
    success: true,
    smartReceipt,
    version: VERSION
  })
}))

/**
 * POST /api/growth/feedback — Submit customer feedback from Smart Receipt
 */
router.post('/feedback', ah(async (req, res) => {
  const { invoiceId, rating, comment } = req.body
  if (!invoiceId || !rating) {
    return res.status(400).json({ error: 'التقييم ورقم الفاتورة مطلوبان' })
  }

  const feedbackId = uuid()
  try {
    db.prepare(`
      INSERT INTO customer_feedback (id, invoice_id, rating, comment, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(feedbackId, invoiceId, Number(rating), String(comment || '').slice(0, 500))
  } catch (e) {
    return res.status(400).json({ error: 'تعذر حفظ التقييم' })
  }

  return res.status(201).json({
    success: true,
    message: 'شكراً لك! تقييمك يساعد المتجر على التحسن المستمر.',
    version: VERSION
  })
}))

/**
 * GET /api/growth/synergies — Get local store synergy cross-promotions
 */
router.get('/synergies', authMiddleware, ah(async (req, res) => {
  let synergies = []
  try {
    synergies = db.prepare('SELECT * FROM store_synergies WHERE is_active=1').all()
    if (synergies.length === 0) {
      // Seed default professional synergy example
      const defaultId = uuid()
      db.prepare(`
        INSERT INTO store_synergies (id, tenant_id, partner_store_name, partner_store_category, offer_text_ar, discount_code, is_active, created_at)
        VALUES (?, 'STD', 'مخبز الحارة العضوي', 'مخبوزات', 'احصل على خصم 10% عند إبراز فاتورة مقهانا', 'DYPOS-BAKERY10', 1, datetime('now'))
      `).run(defaultId)
      synergies = db.prepare('SELECT * FROM store_synergies WHERE is_active=1').all()
    }
  } catch {
    // fallback
  }

  return res.json({
    success: true,
    synergies,
    version: VERSION
  })
}))

export default router