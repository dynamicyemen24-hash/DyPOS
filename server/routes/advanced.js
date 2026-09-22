/** DyPOS Advanced Multimodal Search & Subscribers API Routes v1.31.0 */
import { Router } from 'express'
import db from '../db/schema.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { ah } from '../lib/async.js'
import { VERSION } from '../lib/version.js'
import { initAdvancedGrowthTables, executeMultimodalSearch, getActiveSubscriberCampaign } from '../lib/advancedEngine.js'
import { resolveTenantFilter } from '../lib/tenant.js'

const router = Router()

// Initialize advanced tables
initAdvancedGrowthTables()

/**
 * POST /api/advanced/search — Multimodal Smart Search (Voice, Image, Text, Barcode, QR)
 */
router.post('/search', authMiddleware, ah(async (req, res) => {
  const { query, barcode, qr, imageHash, voiceText } = req.body
  let scopeTenant = null
  try {
    scopeTenant = resolveTenantFilter(req).tenantId || null
    if (scopeTenant && req.user?.tenantId && String(scopeTenant) !== String(req.user.tenantId)) {
      throw Object.assign(new Error('غير موجود'), { statusCode: 404 })
    }
    scopeTenant = scopeTenant || req.user?.tenantId || null
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) })
  }
  const results = executeMultimodalSearch({ query, barcode, qr, imageHash, voiceText, tenantId: scopeTenant })

  return res.json({
    success: true,
    count: results.length,
    results,
    version: VERSION
  })
}))

/**
 * GET /api/advanced/acquisition-campaign — Get active subscriber acquisition campaign & offers
 */
router.get('/acquisition-campaign', ah(async (req, res) => {
  const campaign = getActiveSubscriberCampaign()
  return res.json({
    success: true,
    campaign: campaign || {
      campaign_name: 'باقة نمو الأعمال الذكية',
      discount_percentage: 15.0,
      trial_days: 14,
      referral_bonus_sar: 50.0
    },
    version: VERSION
  })
}))

export default router