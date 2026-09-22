/** DyPOS Advanced Multimodal Search & Subscribers API Routes v1.31.0 */
import { Router } from 'express'
import db from '../db/schema.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { ah } from '../lib/async.js'
import { VERSION } from '../lib/version.js'
import { initAdvancedGrowthTables, executeMultimodalSearch, getActiveSubscriberCampaign } from '../lib/advancedEngine.js'

const router = Router()

// Initialize advanced tables
initAdvancedGrowthTables()

/**
 * POST /api/advanced/search — Multimodal Smart Search (Voice, Image, Text, Barcode, QR)
 */
router.post('/search', authMiddleware, ah(async (req, res) => {
  const { query, barcode, qr, imageHash, voiceText } = req.body
  const results = executeMultimodalSearch({ query, barcode, qr, imageHash, voiceText })

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