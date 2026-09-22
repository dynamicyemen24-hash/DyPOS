/** DyPOS Marketing & Referral System v1.33.0 — single source: server/lib/version.js */
import { logger } from "@/utils/logger"

const log = logger.create("Marketing")

const MARKETING_VERSION = "1.33.0"

/**
 * Generate a unique referral code for a user (zero-dependency: native crypto).
 * @param {string} userId - User ID
 * @param {string} prefix - Optional prefix for the code
 * @returns {string} Unique referral code (6 characters)
 */
export function generateReferralCode(userId, prefix = 'DYPOS') {
  const uniqueId = randomId().replace(/-/g, "").slice(0, 8).toUpperCase()
  return `${prefix}-${uniqueId.slice(0, 6)}`
}

function randomId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
  } catch {
    // fall through to Math.random fallback below
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Validate a referral code format
 * @param {string} code - Referral code to validate
 * @returns {boolean} Whether the code is valid
 */
export function isValidReferralCode(code) {
  return /^DYPOS-[A-Z0-9]{6}$/.test(code)
}

/**
 * Parse a referral code to extract user ID components
 * @param {string} code - Referral code
 * @returns {object} Parsed code components
 */
export function parseReferralCode(code) {
  const match = code.match(/^DYPOS-([A-Z0-9]{6})$/)
  if (!match) return null
  return {
    prefix: 'DYPOS',
    code: match[1],
    generated: new Date().toISOString(),
  }
}

/**
 * Track a referral event with full metadata
 * @param {Object} options - Tracking options
 * @param {string} options.referrerId - ID of the referring user
 * @param {string} options.refereeId - ID of the referred user
 * @param {string} options.code - Referral code used
 * @param {string} options.action - Action type (signup, purchase, etc.)
 * @param {Object} options.metadata - Additional metadata
 * @returns {Object} Tracked event record
 */
export function trackReferral({
  referrerId,
  refereeId,
  code,
  action,
  metadata = {},
}) {
  const event = {
    id: randomId(),
    referrerId,
    refereeId,
    code,
    action,
    timestamp: new Date().toISOString(),
    metadata,
    version: MARKETING_VERSION,
  }
  // Structured log (no console): visible in DyPOS logger, silent in production.
  log.debug("Referral event tracked", { code, action })
  return event
}

/**
 * Get referral rewards based on action type and tier
 * @param {string} action - The action that triggered the reward
 * @param {number} tier - Referral tier level
 * @returns {Object} Reward details
 */
export function getReferralReward(action, tier = 1) {
  const rewards = {
    signup: {
      tier1: { credit: 10, label: '10 SAR credit for signup' },
      tier2: { credit: 20, label: '20 SAR credit for signup' },
      tier3: { credit: 50, label: '50 SAR credit for signup' },
    },
    firstPurchase: {
      tier1: { credit: 50, label: '50 SAR on first purchase' },
      tier2: { credit: 100, label: '100 SAR on first purchase' },
      tier3: { credit: 200, label: '200 SAR on first purchase' },
    },
    recurring: {
      tier1: { percentage: 5, label: '5% commission' },
      tier2: { percentage: 10, label: '10% commission' },
      tier3: { percentage: 15, label: '15% commission' },
    },
  }

  const actionKey = action.toLowerCase()
  const reward = rewards[actionKey] ? rewards[actionKey][`tier${tier}`] : null

  return reward || {
    credit: 0,
    label: 'No reward configured for this action',
  }
}

/**
 * Generate shareable link for DyPOS
 * @param {Object} options - Share options
 * @param {string} options.baseUrl - Base URL of the DyPOS instance
 * @param {string} options.referrerId - Referrer's user ID
 * @param {string} options.platform - Platform (web, ios, android)
 * @returns {string} Shareable referral link
 */
export function generateShareableLink({
  baseUrl,
  referrerId,
  platform = 'web',
}) {
  const code = generateReferralCode(referrerId)
  const params = new URLSearchParams({
    ref: code,
    source: platform,
    v: MARKETING_VERSION,
  }).toString()

  return `${baseUrl}?${params}`
}

/**
 * Get marketing analytics summary for a user
 * @param {Object} options - Analytics options
 * @param {string} options.userId - User ID
 * @param {number} options.period - Days period (30, 90, 365)
 * @returns {Object} Marketing analytics summary
 */
export function getMarketingAnalytics({
  userId,
  period = 30,
}) {
  // In production, this would fetch from backend analytics
  // For now, return structured template
  return {
    userId,
    period,
    generated: new Date().toISOString(),
    referrals: {
      total: 0,
      successful: 0,
      pending: 0,
    },
    earnings: {
      total: 0,
      pending: 0,
      paid: 0,
    },
    conversionRate: 0,
    topPerformers: [],
  }
}

/**
 * Format money for display in marketing materials
 * @param {number} amount - Amount in SAR
 * @param {Object} options - Formatting options
 * @param {string} options.currency - Currency code (default: "SAR")
 * @returns {string} Formatted money string
 */
export function formatMarketingMoney(amount, { currency = 'SAR' } = {}) {
  return `${amount.toFixed(2)} ${currency}`
}

/**
 * Generate promotional badge/HTML for websites
 * @param {Object} options - Badge options
 * @param {string} options.text - Badge text
 * @param {string} options.color - Background color
 * @param {string} options.size - Size (small, medium, large)
 * @returns {string} HTML badge code
 */
export function generatePromotionalBadge({
  text = 'DyPOS - Point of Sale System',
  color = '#0066CC',
  size = 'medium',
}) {
  const sizes = {
    small: { width: '120', height: '30' },
    medium: { width: '200', height: '50' },
    large: { width: '300', height: '70' },
  }

  const { width, height } = sizes[size] || sizes.medium

  return `<a href="https://dypos.com" target="_blank" style="display:inline-block;background:${color};color:#fff;padding:${height/4}px ${width/10}px;font-size:14px;font-family:Arial,sans-serif;font-weight:bold;text-decoration:none;border-radius:4px;" title="DyPOS POS System">
    ${text}
  </a>`
}

/**
 * Get version badges for marketing materials
 * @returns {Object} Version badge information
 */
export function getVersionBadges() {
  return {
    current: MARKETING_VERSION,
    label: 'Current Version',
    color: '#4CAF50',
    releaseDate: '2026-09-22',
    features: [
      'Final cashier campaign: integer money arithmetic',
      'Live cart autosave + crash recovery',
      'Auto cash-drawer kick + recent invoices widget',
      'Smart self-update feed (no forced reload)',
    ],
  }
}

export default {
  generateReferralCode,
  isValidReferralCode,
  parseReferralCode,
  trackReferral,
  getReferralReward,
  generateShareableLink,
  getMarketingAnalytics,
  formatMarketingMoney,
  generatePromotionalBadge,
  getVersionBadges,
}