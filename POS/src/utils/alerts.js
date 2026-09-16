/**
 * Proactive operational alerts: low stock, out of stock, and alert
 * throttling so cashiers aren't pestered repeatedly for the same issue.
 *
 * Pure + framework-free; UI layers (toasts / badge hints) consume `check()`.
 */

/** Possible alert severities. */
export const ALERT_SEVERITIES = {
	OUT: "out", // 0 or negative available
	LOW: "low", // positive but under threshold
	SAFE: "safe", // informational, not an alert
}

/**
 * Default low-stock threshold (matches ItemsSelector badge behavior).
 */
export const DEFAULT_LOW_STOCK_THRESHOLD = 10

/**
 * Evaluate a batch of items and produce actionable stock alerts.
 * @param {Array<Object>} items - Items with qty fields.
 * @param {Object} [opts]
 * @param {number} [opts.lowThreshold=10] - Qty at/below = LOW.
 * @param {Function} [opts.getQty] - `(item) => number` (default: actual_qty ?? stock_qty ?? 0).
 * @param {Function} [opts.getName] - `(item) => string` (default: item_name ?? item_code).
 * @param {boolean} [opts.prioritizeByStock=true] - Sort empties first, then by qty asc.
 * @returns {Array<{item_code: string, name: string, qty: number, severity: string}>}
 */
export function detectLowStock(
	items = [],
	{
		lowThreshold = DEFAULT_LOW_STOCK_THRESHOLD,
		getQty,
		getName,
		prioritizeByStock = true,
	} = {},
) {
	const qtyOf = getQty || ((item) => item?.actual_qty ?? item?.stock_qty ?? 0)
	const nameOf = getName || ((item) => item?.item_name || item?.item_code || "")

	const alerts = []
	for (const item of items) {
		const qty = qtyOf(item)
		const severity =
			qty <= 0
				? ALERT_SEVERITIES.OUT
				: qty <= lowThreshold
					? ALERT_SEVERITIES.LOW
					: null
		if (!severity) continue
		alerts.push({
			item_code: item?.item_code ?? "",
			name: nameOf(item),
			qty,
			severity,
		})
	}

	if (prioritizeByStock) {
		const rank = { out: 0, low: 1 }
		alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || a.qty - b.qty)
	}

	return alerts
}

/**
 * Cooldown guard: `mark(key)` sets a timer; `isReady(key)` stays false until
 * the cooldown elapses. Use it to avoid alert fatigue (e.g. same item
 * every 5 minutes).
 * @param {Object} [opts]
 * @param {number} [opts.cooldownMs=300000] - Default 5 min.
 * @param {Function} [opts.now] - Injectable clock for tests.
 * @returns {{ isReady(key:string): boolean, mark(key:string): void, clear(key:string): void }}
 */
export function createCooldown({ cooldownMs = 300000, now = Date.now } = {}) {
	const until = new Map()
	return {
		isReady(key) {
			return !until.has(key) || now() >= until.get(key)
		},
		mark(key) {
			until.set(key, now() + cooldownMs)
		},
		clear(key) {
			until.delete(key)
		},
	}
}

/**
 * Aggregate several item pulls into one alert list (deduplicates by item_code,
 * keeps the worst severity encountered).
 * @param {Array<Array<Object>>} itemBatches
 * @param {Object} opts - Same as detectLowStock.
 */
export function detectLowStockAcross(itemBatches = [], opts = {}) {
	const byCode = new Map()
	for (const batch of itemBatches) {
		for (const alert of detectLowStock(batch, opts)) {
			const existing = byCode.get(alert.item_code)
			if (!existing) {
				byCode.set(alert.item_code, alert)
			} else if (
				alert.severity === ALERT_SEVERITIES.OUT &&
				existing.severity !== ALERT_SEVERITIES.OUT
			) {
				byCode.set(alert.item_code, alert)
			}
		}
	}
	const rank = { out: 0, low: 1 }
	return [...byCode.values()].sort(
		(a, b) => rank[a.severity] - rank[b.severity] || a.qty - b.qty,
	)
}
