import Dexie from "dexie"
import { logger } from "../logger"

/** @type {import('../logger').Logger} */
const log = logger.create("OfflineDB")

/**
 * @fileoverview IndexedDB persistence layer for DyPOS offline functionality.
 *
 * This module provides:
 * - Auto-versioned Dexie database with schema migration
 * - Offline caching for items, customers, stock, prices
 * - Queue management for offline invoices and payments
 * - Settings persistence and translation cache
 *
 * Schema changes are auto-detected via hash comparison and trigger version bumps.
 *
 * @module db
 * @see {@link https://dexie.org/} Dexie.js documentation
 */

/** @type {Dexie} Main database instance */
export const db = new Dexie("DyPOS_offline")

/**
 * Database schema definition.
 * Modify this object to change the schema - version will auto-increment.
 *
 * Index notation:
 * - `&` = unique primary key
 * - `++` = auto-increment primary key
 * - `*` = multi-entry index (array field)
 * - `[a+b]` = compound index
 *
 * @constant {Object}
 */
const CURRENT_SCHEMA = {
	// Key-value store for settings and metadata
	settings: "&key",

	// Invoice queue for offline submissions
	// offline_id is a unique UUID for deduplication across syncs
	invoice_queue: "++id, &offline_id, timestamp, synced",

	// Items cache with searchable fields
	// variant_of index allows querying variants by their template item
	// brand index allows efficient brand-based filtering in offline mode
	items:
		"&item_code, item_name, item_group, variant_of, has_variants, brand, *barcodes",

	// Customers cache
	customers: "&name, customer_name, mobile_no, email_id",

	// Price list cache
	item_prices: "&[price_list+item_code], price_list, item_code",

	// Local stock cache
	stock: "&[item_code+warehouse], item_code, warehouse",

	// Payment methods cache
	payment_methods: "&mode_of_payment, pos_profile",

	// Sales persons cache
	sales_persons: "&name, pos_profile",

	// Payment queue for offline payments
	payment_queue: "++id, timestamp, synced",

	// Drafts (already handled by draftManager, but keeping for consistency)
	drafts: "++id, draft_id, timestamp",

	// Translations cache for offline language support
	translations: "&locale, timestamp",

	// Promotional offers cache for offline use
	// Indexed by name (unique), filterable by pos_profile
	offers: "&name, pos_profile, apply_on, valid_upto",

	// Invoice history cache for offline viewing
	// Stores submitted invoices for offline access
	invoice_history: "&name, pos_profile, posting_date, customer",

	// Unpaid invoices cache for offline viewing
	// Stores invoices with outstanding amounts for partial payment management
	unpaid_invoices: "&name, pos_profile, outstanding_amount, customer",

	// One-time-per-customer offer redemptions cache.
	// Keyed by customer; `rules` is an array of redeemed Pricing Rule names.
	// Populated from the server when a customer is selected (online) and
	// appended on offline checkout, so the offline offer engine can mirror
	// the server-side one-time gate in apply_offers.
	one_time_redemptions: "&customer",

	// ** ZATCA Compliance Tables **
	// ZATCA audit trail - tracks all invoices for ZATCA compliance
	zatca_audit_trail: "++id, invoice_id, timestamp, hash_value, status",
	// ZATCA registration tracking
	zatca_registration:
		"&registration_id, company_id, registration_date, validity_end",
	// Invoice validity period tracking
	invoice_validity:
		"++id, invoice_id, validity_start, validity_end, qr_code_hash",
	// Daily sales summary for ZATCA reporting
	daily_sales_summary:
		"&pos_profile, date, total_sales, invoice_count, tax_amount",
	// ZATCA compliance settings per company
	zatca_settings: "&company_id, enable_zalina, enable_sfd, tax_regime",
}

/**
 * Generates a 32-bit hash of the schema for change detection.
 * Uses djb2 algorithm for fast, deterministic hashing.
 * @param {Object} schema - Schema object to hash
 * @returns {number} Positive 32-bit integer hash
 * @private
 */
function getSchemaHash(schema) {
	const schemaString = JSON.stringify(schema)
	let hash = 0
	for (let i = 0; i < schemaString.length; i++) {
		const char = schemaString.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash // Convert to 32-bit integer
	}
	return Math.abs(hash)
}

/**
 * Determines the current schema version using localStorage tracking.
 * Compares stored hash against current schema hash to detect changes.
 * Auto-increments version when schema changes are detected.
 *
 * @returns {number} Current schema version number
 * @private
 */
function getSchemaVersion() {
	const schemaHash = getSchemaHash(CURRENT_SCHEMA)
	const storedHash = localStorage.getItem("DyPOS_schema_hash")
	const storedVersion = Number.parseInt(
		localStorage.getItem("DyPOS_schema_version") || "1",
	)

	if (storedHash !== schemaHash.toString()) {
		// Schema changed, increment version
		const newVersion = storedVersion + 1
		log.info(
			`Schema changed detected. Upgrading from v${storedVersion} to v${newVersion}`,
		)
		localStorage.setItem("DyPOS_schema_hash", schemaHash.toString())
		localStorage.setItem("DyPOS_schema_version", newVersion.toString())
		return newVersion
	}

	return storedVersion
}

// Apply schema with auto-versioning
const schemaVersion = getSchemaVersion()
log.debug(`Initializing database with schema version: ${schemaVersion}`)
db.version(schemaVersion).stores(CURRENT_SCHEMA)

/**
 * Opens the database connection.
 * Called automatically on module import.
 * @returns {Promise<boolean>} True if opened successfully
 */
export const initDB = async () => {
	try {
		await db.open()
		log.success("DyPOS offline database initialized")
		return true
	} catch (error) {
		log.error("Failed to initialize offline database:", error)
		return false
	}
}

/**
 * Verifies database health and attempts recovery if needed.
 * Handles VersionError and InvalidStateError by recreating the database.
 * @returns {Promise<boolean>} True if database is healthy or recovered
 */
export const checkDBHealth = async () => {
	try {
		await db.settings.get("health_check")
		return true
	} catch (error) {
		log.error("Database health check failed:", error)

		// Try to reopen
		try {
			if (db.isOpen()) {
				db.close()
			}
			await db.open()
			log.info("Database reopened successfully")
			return true
		} catch (reopenError) {
			log.error("Failed to reopen database:", reopenError)

			// If corrupted, recreate
			if (
				reopenError.name === "VersionError" ||
				reopenError.name === "InvalidStateError"
			) {
				log.warn("Database appears corrupted, recreating...")
				try {
					await Dexie.delete("DyPOS_offline")
					await db.open()
					log.success("Database recreated successfully")
					return true
				} catch (recreateError) {
					log.error("Failed to recreate database:", recreateError)
					return false
				}
			}
			return false
		}
	}
}

/**
 * Retrieves a setting value from the database.
 * @param {string} key - Setting key to retrieve
 * @param {*} [defaultValue=null] - Value to return if key not found
 * @returns {Promise<*>} Stored value or defaultValue
 */
export const getSetting = async (key, defaultValue = null) => {
	try {
		const result = await db.settings.get(key)
		return result ? result.value : defaultValue
	} catch (error) {
		log.error(`Error getting setting ${key}:`, error)
		return defaultValue
	}
}

/**
 * Stores a setting value in the database.
 * @param {string} key - Setting key
 * @param {*} value - Value to store (must be IndexedDB-serializable)
 * @returns {Promise<void>}
 */
export const setSetting = async (key, value) => {
	try {
		await db.settings.put({ key, value })
	} catch (error) {
		log.error(`Error setting ${key}:`, error)
	}
}

/**
 * Get the cached one-time-per-customer redeemed Pricing Rule names for a customer.
 * @param {string} customer - Customer name
 * @returns {Promise<string[]>} Redeemed rule names (empty array if none/unknown)
 */
export const getOneTimeRedemptions = async (customer) => {
	if (!customer) return []
	try {
		const row = await db.one_time_redemptions.get(customer)
		return Array.isArray(row?.rules) ? row.rules : []
	} catch (error) {
		log.error(`Error reading one-time redemptions for ${customer}:`, error)
		return []
	}
}

/**
 * Replace the cached redeemed rule names for a customer (used after a server fetch).
 * @param {string} customer - Customer name
 * @param {string[]} rules - Redeemed Pricing Rule names
 * @returns {Promise<void>}
 */
export const setOneTimeRedemptions = async (customer, rules = []) => {
	if (!customer) return
	try {
		await db.one_time_redemptions.put({
			customer,
			rules: Array.from(new Set(rules)),
		})
	} catch (error) {
		log.error(`Error saving one-time redemptions for ${customer}:`, error)
	}
}

/**
 * Append redeemed rule names for a customer (used on offline checkout), merging
 * with whatever is already cached.
 * @param {string} customer - Customer name
 * @param {string[]} rules - Newly redeemed Pricing Rule names
 * @returns {Promise<string[]>} The merged list of redeemed rule names
 */
export const addOneTimeRedemptions = async (customer, rules = []) => {
	if (!customer || !rules.length) return await getOneTimeRedemptions(customer)
	try {
		const existing = await getOneTimeRedemptions(customer)
		const merged = Array.from(new Set([...existing, ...rules]))
		await db.one_time_redemptions.put({ customer, rules: merged })
		return merged
	} catch (error) {
		log.error(`Error appending one-time redemptions for ${customer}:`, error)
		return await getOneTimeRedemptions(customer)
	}
}

/**
 * Clear all cached data (items, customers, stock, etc.)
 * Preserves critical data like invoices, drafts, and settings
 * @param {Object} options - Options for clearing
 * @param {boolean} options.preserveInvoices - Keep invoice queue (default: true)
 * @param {boolean} options.preserveDrafts - Keep drafts (default: true)
 * @param {boolean} options.preserveSettings - Keep settings (default: true)
 * @returns {Promise<Object>} - Status of cleared tables
 */
export const clearCachedData = async (options = {}) => {
	const {
		preserveInvoices = true,
		preserveDrafts = true,
		preserveSettings = true,
	} = options

	const results = {
		items: 0,
		customers: 0,
		stock: 0,
		item_prices: 0,
		payment_methods: 0,
		sales_persons: 0,
		invoices: 0,
		payments: 0,
		drafts: 0,
		settings: 0,
	}

	try {
		// Always clear these cache tables
		results.items = await db.items.clear()
		results.customers = await db.customers.clear()
		results.stock = await db.stock.clear()
		results.item_prices = await db.item_prices.clear()
		results.payment_methods = await db.payment_methods.clear()
		results.sales_persons = await db.sales_persons.clear()

		// Conditionally clear invoice and payment queues
		if (!preserveInvoices) {
			results.invoices = await db.invoice_queue.clear()
			results.payments = await db.payment_queue.clear()
		}

		// Conditionally clear drafts
		if (!preserveDrafts) {
			results.drafts = await db.drafts.clear()
		}

		// Conditionally clear settings
		if (!preserveSettings) {
			results.settings = await db.settings.clear()
		}

		log.info("Cached data cleared:", results)
		return { success: true, cleared: results }
	} catch (error) {
		log.error("Error clearing cached data:", error)
		return { success: false, error: error.message, cleared: results }
	}
}

/**
 * NUCLEAR OPTION: Delete entire database and recreate
 * Use with caution - clears EVERYTHING including invoices and drafts
 * @returns {Promise<boolean>} - Success status
 */
export const nukeDatabase = async () => {
	try {
		log.warn("NUKING DATABASE - All data will be lost!")

		// Close database connection
		if (db.isOpen()) {
			db.close()
		}

		// Delete entire database
		await Dexie.delete("DyPOS_offline")

		// Clear localStorage schema tracking
		localStorage.removeItem("DyPOS_schema_hash")
		localStorage.removeItem("DyPOS_schema_version")

		// Recreate database
		await db.open()

		log.success("Database nuked and recreated successfully")
		return true
	} catch (error) {
		log.error("Error nuking database:", error)
		return false
	}
}

/**
 * Clear browser cache and localStorage (POS-specific data only)
 * @returns {Object} - Status of cleared data
 */
export const clearBrowserCache = () => {
	const results = {
		localStorage: 0,
		sessionStorage: 0,
	}

	try {
		// Clear POS-specific localStorage items
		const keysToRemove = []
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i)
			if (key?.startsWith("DyPOS_") || key?.startsWith("frappe_")) {
				keysToRemove.push(key)
			}
		}

		keysToRemove.forEach((key) => {
			localStorage.removeItem(key)
			results.localStorage++
		})

		// Clear sessionStorage
		const sessionKeys = []
		for (let i = 0; i < sessionStorage.length; i++) {
			const key = sessionStorage.key(i)
			if (key?.startsWith("DyPOS_") || key?.startsWith("frappe_")) {
				sessionKeys.push(key)
			}
		}

		sessionKeys.forEach((key) => {
			sessionStorage.removeItem(key)
			results.sessionStorage++
		})

		log.info("Browser cache cleared:", results)
		return { success: true, cleared: results }
	} catch (error) {
		log.error("Error clearing browser cache:", error)
		return { success: false, error: error.message, cleared: results }
	}
}

// Initialize database on import
initDB()

/**
 * Performance monitoring for database operations
 * Tracks operation duration and frequency
 */
export const performanceMonitor = {
	operationCounts: new Map(),
	startTime: new Map(),

	startOperation(operationName) {
		this.startTime.set(operationName, performance.now())
		if (!this.operationCounts.has(operationName)) {
			this.operationCounts.set(operationName, 0)
		}
		this.operationCounts.set(
			operationName,
			this.operationCounts.get(operationName) + 1,
		)
	},

	endOperation(operationName) {
		const start = this.startTime.get(operationName)
		if (start) {
			const duration = performance.now() - start
			log.debug(`${operationName} completed in ${duration.toFixed(2)}ms`)
			this.startTime.delete(operationName)
			return duration
		}
		return 0
	},

	getStats() {
		const stats = {}
		for (const [name, count] of this.operationCounts) {
			stats[name] = { count }
		}
		return stats
	},
}

/**
 * Exponential growth handler for database operations
 * Handles rapid data growth while maintaining performance
 * @param {number} currentCount - Current number of records
 * @param {number} threshold - Threshold before cleanup trigger
 * @param {Function} cleanupCallback - Function to execute when threshold exceeded
 * @returns {Object} - Growth status and next action
 */
export const exponentialGrowthHandler = {
	/**
	 * Check if growth requires intervention
	 * @param {number} currentCount - Current record count
	 * @param {number} growthRate - Records per time period
	 * @param {Object} options - Configuration options
	 * @returns {boolean} - True if cleanup needed
	 */
	needsIntervention(currentCount, growthRate, options = {}) {
		const {
			threshold = options.threshold || 50000,
			timeWindow = options.timeWindow || 86400,
		} = options
		return currentCount > threshold || growthRate > threshold / timeWindow
	},

	/**
	 * Calculate optimal batch size for operations
	 * @param {number} totalCount - Total records to process
	 * @returns {number} - Recommended batch size
	 */
	calculateBatchSize(totalCount) {
		if (totalCount <= 1000) return totalCount
		if (totalCount <= 10000) return 500
		if (totalCount <= 100000) return 100
		return 50
	},
}

/**
 * Saudi compliance data retention utility
 * Ensures data retention per ZATCA/SFDA regulations
 * @param {Object} options - Retention configuration
 * @param {number} options.invoiceRetentionDays - Days to retain invoices (default: 10 years per ZATCA)
 * @param {number} options.auditRetentionDays - Days to retain audit records (default: 10 years)
 * @param {number} options.cacheTtl - Cache time-to-live in days (default: 30)
 */
export const complianceRetention = {
	defaultInvoiceRetention: 3650, // 10 years per ZATCA
	defaultAuditRetention: 3650, // 10 years per ZATCA
	defaultCacheTtl: 30, // 30 days

	/**
	 * Calculate expiry date for data retention
	 * @param {number} ttlDays - Time to live in days
	 * @returns {Date} - Expiry date
	 */
	calculateExpiryDate(ttlDays = this.defaultCacheTtl) {
		const expiry = new Date()
		expiry.setDate(expiry.getDate() + ttlDays)
		return expiry
	},

	/**
	 * Check if data should be cleaned up based on retention policy
	 * @param {Date} timestamp - Data timestamp
	 * @param {number} ttlDays - Time to live in days
	 * @returns {boolean} - True if data should be removed
	 */
	shouldRemoveData(timestamp, ttlDays = this.defaultCacheTtl) {
		const expiry = this.calculateExpiryDate(ttlDays)
		return new Date(timestamp) < expiry
	},

	/**
	 * Get retention policy for specific data type
	 * @param {string} dataType - Type of data ('invoice', 'audit', 'cache')
	 * @returns {Object} - Retention configuration
	 */
	getRetentionPolicy(dataType) {
		const policies = {
			invoice: { ttl: this.defaultInvoiceRetention, minKeep: 3650 },
			audit: { ttl: this.defaultAuditRetention, minKeep: 3650 },
			cache: { ttl: this.defaultCacheTtl, minKeep: 1 },
		}
		return policies[dataType] || policies.cache
	},
}
