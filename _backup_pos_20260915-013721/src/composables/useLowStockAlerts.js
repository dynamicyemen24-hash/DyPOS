/**
 * Low-stock alerting glue for the POS sale page.
 *
 * Wraps the pure helpers in utils/alerts.js with a reactive shell:
 *  - `count` / `outCount` / `lowCount` reflect the CURRENT, undismissed
 *    stock state (computed live from the item source), so a badge or
 *    header indicator can light up whenever inventory is running low.
 *  - `check()` returns only the alerts that are DUE for a notification:
 *    each item is marked with a per-item cooldown afterwards, so repeated
 *    evaluation (loads, refreshes, stock pushes) never spams the cashier
 *    with the same issue.
 *
 * Usage:
 *   const lowStock = useLowStockAlerts({
 *     getItems: () => itemStore.allItems,
 *     threshold: computed(() => settings.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD),
 *     cooldownMs: 10 * 60 * 1000,
 *   });
 *
 *   // after items load / manual refresh:
 *   const due = lowStock.check();
 *   if (due.length) toast(due);
 */

import { computed, ref } from "vue"
import {
	detectLowStockAcross,
	createCooldown,
	DEFAULT_LOW_STOCK_THRESHOLD,
	ALERT_SEVERITIES,
} from "@/utils/alerts"

/**
 * @param {Object} opts
 * @param {Array|Function|import('vue').Ref<Array>} [opts.getItems] - Item source.
 * @param {number|Function|import('vue').Ref<number>} [opts.threshold=DEFAULT_LOW_STOCK_THRESHOLD]
 * @param {number} [opts.cooldownMs=600000] - Per-item silence window (10 min).
 * @param {Function} [opts.now] - Injectable clock for tests.
 */
export function useLowStockAlerts({
	getItems = () => [],
	threshold = DEFAULT_LOW_STOCK_THRESHOLD,
	cooldownMs = 10 * 60 * 1000,
	now,
} = {}) {
	const dismissed = ref(new Set())
	const lastAlertAt = ref(null)
	let cooldown = createCooldown({ cooldownMs, now })

	const readItems = () =>
		typeof getItems === "function" ? getItems() : (getItems?.value ?? [])

	const readThreshold = () =>
		typeof threshold === "object" && threshold != null && "value" in threshold
			? threshold.value
			: typeof threshold === "function"
				? threshold()
				: threshold

	const current = computed(() =>
		detectLowStockAcross([readItems()], {
			lowThreshold: readThreshold(),
			prioritizeByStock: true,
		}),
	)

	const active = computed(() =>
		current.value.filter(
			(alert) => !dismissed.value.has(alert.item_code || alert.name),
		),
	)

	const count = computed(() => active.value.length)

	const outCount = computed(
		() =>
			active.value.filter((alert) => alert.severity === ALERT_SEVERITIES.OUT)
				.length,
	)

	const lowCount = computed(() => count.value - outCount.value)

	/** Return alerts currently due for notification (cooldown-gated). */
	function check() {
		const due = []
		for (const alert of current.value) {
			const key = alert.item_code || alert.name || ""
			if (!cooldown.isReady(key)) continue
			cooldown.mark(key)
			due.push(alert)
		}
		if (due.length) lastAlertAt.value = Date.now()
		return due
	}

	function dismiss(alert) {
		const next = new Set(dismissed.value)
		next.add(alert?.item_code || alert?.name || "")
		dismissed.value = next
	}

	function dismissAll() {
		const next = new Set(
			active.value.map((alert) => alert.item_code || alert.name),
		)
		dismissed.value = next
	}

	function reset() {
		dismissed.value = new Set()
		cooldown = createCooldown({ cooldownMs, now })
		lastAlertAt.value = null
	}

	return {
		alerts: active,
		count,
		outCount,
		lowCount,
		lastAlertAt,
		check,
		dismiss,
		dismissAll,
		reset,
	}
}
