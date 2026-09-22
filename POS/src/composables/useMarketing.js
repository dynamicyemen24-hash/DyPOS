/** DyPOS Marketing Composable v1.33.0 — single source: server/lib/version.js */
import { ref } from 'vue'
import {
  generateReferralCode,
  generateShareableLink,
  getMarketingAnalytics,
  getVersionBadges,
  trackReferral,
  getReferralReward,
} from '@/utils/marketing'
import { useToast } from '@/composables/useToast'

export function useMarketing() {
  const { showSuccess, showError } = useToast()
  const loading = ref(false)
  const analytics = ref(null)

  /**
   * Generate referral link for current user
   * @param {string} userId - User ID
   * @returns {string} Shareable link
   */
  function getReferralLink(userId) {
    const baseUrl = window.location.origin
    return generateShareableLink({
      baseUrl,
      referrerId: userId,
      platform: 'pos-web',
    })
  }

  /**
   * Copy referral link to clipboard
   * @param {string} userId - User ID
   */
  async function copyReferralLink(userId) {
    try {
      const link = getReferralLink(userId)
      await navigator.clipboard.writeText(link)
      showSuccess('تم نسخ رابط الإحالة بنجاح')
      return true
    } catch (error) {
      showError('فشل نسخ الرابط')
      return false
    }
  }

  /**
   * Load marketing analytics for a user
   * @param {string} userId - User ID
   */
  async function loadAnalytics(userId) {
    loading.value = true
    try {
      // In production, fetch from backend API
      analytics.value = getMarketingAnalytics({ userId, period: 30 })
    } catch (error) {
      showError('فشل تحميل تحليلات التسويق')
    } finally {
      loading.value = false
    }
  }

  /**
   * Record a referral event from POS
   * @param {Object} data - Referral data
   */
  function recordReferral(data) {
    const event = trackReferral(data)
    showSuccess('تم تسجيل الإحالة بنجاح')
    return event
  }

  return {
    loading,
    analytics,
    getReferralLink,
    copyReferralLink,
    loadAnalytics,
    recordReferral,
    getReferralReward,
    getVersionBadges,
  }
}

export default useMarketing