/**
 * Offer Cache Operations - extracted from offline.worker.js
 * Handles caching of offers/promotions for offline use
 */
import { logger } from "../utils/logger"

const log = logger.create("OfferCache")

const OFFERS_CACHE_KEY = "offers_cache"
const OFFERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Cache offers for a specific POS profile
 * @param {Array} offers - Array of offer objects
 * @param {string} posProfile - POS profile identifier
 * @returns {Promise<Object>} Result with cached count
 */
export async function cacheOffers(offers, posProfile) {
	if (!Array.isArray(offers)) {
		throw new Error("Offers must be an array")
	}
	const profile = String(posProfile || "default")
	const cacheKey = `${OFFERS_CACHE_KEY}_${profile}`
	const cacheData = {
		offers,
		cachedAt: Date.now(),
		ttl: OFFERS_CACHE_TTL_MS,
	}
	try {
		const db = await import("../services/db").then((m) => m.default)
		await db.settings.put({ key: cacheKey, value: JSON.stringify(cacheData) })
		log.info("Offers cached", { profile, count: offers.length })
		return { cached: offers.length }
	} catch (error) {
		log.error("Failed to cache offers", error)
		throw error
	}
}

/**
 * Get cached offers for a specific POS profile
 * @param {string} posProfile - POS profile identifier
 * @returns {Promise<Array>} Cached offers or empty array
 */
export async function getCachedOffers(posProfile) {
	const profile = String(posProfile || "default")
	const cacheKey = `${OFFERS_CACHE_KEY}_${profile}`
	try {
		const db = await import("../services/db").then((m) => m.default)
		const row = await db.settings.get(cacheKey)
		if (!row?.value) return []
		const cacheData = JSON.parse(row.value)
		if (Date.now() - cacheData.cachedAt > cacheData.ttl) {
			await db.settings.delete(cacheKey)
			return []
		}
		return cacheData.offers || []
	} catch (error) {
		log.warn("Failed to get cached offers", error)
		return []
	}
}

/**
 * Clear cached offers for a specific POS profile
 * @param {string} posProfile - POS profile identifier
 * @returns {Promise<Object>} Result with cleared status
 */
export async function clearOffersCache(posProfile) {
	const profile = String(posProfile || "default")
	const cacheKey = `${OFFERS_CACHE_KEY}_${profile}`
	try {
		const db = await import("../services/db").then((m) => m.default)
		await db.settings.delete(cacheKey)
		log.info("Offers cache cleared", { profile })
		return { cleared: true }
	} catch (error) {
		log.error("Failed to clear offers cache", error)
		throw error
	}
}

export default { cacheOffers, getCachedOffers, clearOffersCache }
