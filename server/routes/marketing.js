/** DyPOS Marketing API Routes v1.31.0 */
import { Router } from 'express'
import db from '../db/schema.js'
import { v4 as uuid } from 'uuid'
import { authMiddleware, } from '../middleware/auth.js'
import { ah } from '../lib/async.js'
import { VERSION } from '../lib/version.js'

const router = Router()

/**
 * GET /api/marketing/referral — Get user's referral code and stats
 */
router.get('/referral', authMiddleware, ah(async (req, res) => {
  const username = req.user?.username
  if (!username) return res.status(401).json({ error: 'غير مصرح' })

  // Check if referral table exists, otherwise return generated code
  let stats = { totalReferrals: 0, earnings: 0, code: `DYPOS-${username.slice(0, 6).toUpperCase()}` }
  
  try {
    const row = db.prepare('SELECT * FROM marketing_referrals WHERE username=?').get(username)
    if (row) {
      stats = { ...stats, ...row }
    }
  } catch {
    // Table might not exist yet in pre-marketing DBs
  }

  return res.json({
    success: true,
    data: stats,
    version: VERSION
  })
}))

/**
 * POST /api/marketing/referral/track — Track a new referral signup/purchase
 */
router.post('/referral/track', authMiddleware, ah(async (req, res) => {
  const { code, action, refereeId } = req.body
  const username = req.user?.username

  if (!code || !action) {
    return res.status(400).json({ error: 'بيانات غير كافية' })
  }

  const eventId = uuid()
  const timestamp = new Date().toISOString()

  try {
    // Ensure marketing tables exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS marketing_referrals (
        username TEXT PRIMARY KEY,
        code TEXT,
        totalReferrals INTEGER DEFAULT 0,
        earnings REAL DEFAULT 0,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS marketing_events (
        id TEXT PRIMARY KEY,
        username TEXT,
        code TEXT,
        action TEXT,
        referee_id TEXT,
        timestamp TEXT,
        version TEXT
      )
    `)

    db.prepare(`
      INSERT INTO marketing_events (id, username, code, action, referee_id, timestamp, version)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, username || 'system', code, action, refereeId || null, timestamp, VERSION)

  } catch (_e) {
    // Non-blocking log
  }

  return res.status(201).json({
    success: true,
    eventId,
    message: 'تم تسجيل الحدث التسويقي بنجاح',
    version: VERSION
  })
}))

/**
 * GET /api/marketing/badges — Get official version and promotional badges
 */
router.get('/badges', ah(async (_req, res) => {
  return res.json({
    success: true,
    badges: {
      version: VERSION,
      system: 'DyPOS Point of Sale',
      status: 'Production Ready',
      features: [
        'Exact Halala-Integer Accounting',
        'Offline-First PWA with Dexie.js',
        'Smart Referral & Spread System',
        'ZATCA & Multi-Branch Ready'
      ]
    }
  })
}))

export default router