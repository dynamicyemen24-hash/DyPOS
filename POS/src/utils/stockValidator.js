import { call } from "frappe-ui"

import { logger } from "@/utils/logger"

const log = logger.create("StockValidation")

/**
 * ============================================================================
 * DyPOS Stock Validation
 * ============================================================================
 *
 * Single source of truth for stock-related validation.
 *
 * Responsibilities:
 * - Determine whether stock validation applies.
 * - Normalize stock quantities safely.
 * - Validate requested quantities.
 * - Read warehouse stock from Frappe.
 * - Produce consistent user-facing messages.
 *
 * This module deliberately does NOT:
 * - mutate cart state
 * - reserve stock
 * - deduct stock
 * - create invoices
 * - perform final server-side validation
 *
 * Final stock enforcement MUST remain server-authoritative.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_STOCK = 0

const MAX_SAFE_QUANTITY = Number.MAX_SAFE_INTEGER

const EMPTY_STRING = ""

const STOCK_FIELDS = Object.freeze(["actual_qty", "stock_qty"])

/* -------------------------------------------------------------------------- */
/* Normalization helpers                                                      */
/* -------------------------------------------------------------------------- */

function isObject(value) {
	return value !== null && typeof value === "object"
}

function isTruthyFlag(value) {
	return value === true || value === 1 || value === "1" || value === "true"
}

function isFalsyFlag(value) {
	return value === false || value === 0 || value === "0" || value === "false"
}

/**
 * Convert a quantity to a safe finite non-negative number.
 *
 * Stock APIs can return:
 * - number
 * - numeric string
 * - null
 * - undefined
 * - malformed values
 */
export function normalizeStockQuantity(value) {
	if (value === null || value === undefined || value === "") {
		return DEFAULT_STOCK
	}

	const quantity = typeof value === "number" ? value : Number(value)

	if (!Number.isFinite(quantity) || quantity < 0) {
		return DEFAULT_STOCK
	}

	return Math.min(quantity, MAX_SAFE_QUANTITY)
}

/**
 * Normalize requested quantity.
 *
 * Unlike stock, a requested quantity must be strictly positive.
 */
export function normalizeRequestedQuantity(value) {
	if (value === null || value === undefined || value === "") {
		return 0
	}

	const quantity = typeof value === "number" ? value : Number(value)

	if (!Number.isFinite(quantity) || quantity <= 0) {
		return 0
	}

	return Math.min(quantity, MAX_SAFE_QUANTITY)
}

/* -------------------------------------------------------------------------- */
/* Stock validation policy                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Determine whether stock validation applies to an item.
 *
 * Priority:
 *
 * 1. Invalid item                         → false
 * 2. Explicit non-stock item              → false
 * 3. Explicit negative-stock permission   → false
 * 4. Serial/batch item                    → false
 * 5. Stock/bundle/stock-data item         → true
 */
export function shouldValidateItemStock(item) {
	if (!isObject(item)) {
		return false
	}

	/**
	 * Explicitly non-stock items never participate in quantity
	 * availability validation.
	 */
	if (isFalsyFlag(item.is_stock_item)) {
		return false
	}

	/**
	 * Item-level negative stock permission overrides local
	 * availability enforcement.
	 */
	if (isTruthyFlag(item.allow_negative_stock)) {
		return false
	}

	/**
	 * Serial and batch controlled items require specialized
	 * validation/selection flows.
	 *
	 * Their availability must not be inferred solely from a
	 * simple aggregate quantity check.
	 */
	if (isTruthyFlag(item.has_serial_no) || isTruthyFlag(item.has_batch_no)) {
		return false
	}

	const hasStockData = STOCK_FIELDS.some(
		(field) => item[field] !== undefined && item[field] !== null,
	)

	return Boolean(
		isTruthyFlag(item.is_stock_item) ||
			isTruthyFlag(item.is_bundle) ||
			hasStockData,
	)
}

/* -------------------------------------------------------------------------- */
/* Quantity resolution                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the best available stock quantity.
 *
 * actual_qty is preferred because it represents the warehouse's
 * actual quantity. stock_qty is retained as a compatibility fallback
 * for existing POS/search payloads.
 */
export function getAvailableStock(item) {
	if (!isObject(item)) {
		return DEFAULT_STOCK
	}

	const actualQty = item.actual_qty

	if (actualQty !== undefined && actualQty !== null && actualQty !== "") {
		return normalizeStockQuantity(actualQty)
	}

	return normalizeStockQuantity(item.stock_qty)
}

/**
 * Resolve warehouse from item or explicit argument.
 */
export function resolveWarehouse(item, warehouse) {
	if (warehouse) {
		return String(warehouse).trim()
	}

	if (!isObject(item)) {
		return EMPTY_STRING
	}

	return String(
		item.warehouse || item.set_warehouse || item.source_warehouse || "",
	).trim()
}

/* -------------------------------------------------------------------------- */
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Check whether requested quantity is available.
 *
 * @returns {{
 *   available: boolean,
 *   actualQty: number,
 *   requestedQty: number,
 *   shortageQty: number,
 *   warehouse: string,
 *   error: string|null
 * }}
 */
export function checkStockAvailability(item, requestedQty, warehouse) {
	const requested = normalizeRequestedQuantity(requestedQty)

	const actualQty = getAvailableStock(item)

	const resolvedWarehouse = resolveWarehouse(item, warehouse)

	/**
	 * Invalid/non-positive requested quantity is not a stock
	 * shortage. The caller owns quantity validation.
	 */
	if (requested <= 0) {
		return {
			available: true,
			actualQty,
			requestedQty: requested,
			shortageQty: 0,
			warehouse: resolvedWarehouse,
			error: null,
		}
	}

	const available = actualQty >= requested

	if (available) {
		return {
			available: true,
			actualQty,
			requestedQty: requested,
			shortageQty: 0,
			warehouse: resolvedWarehouse,
			error: null,
		}
	}

	const shortageQty = Math.max(requested - actualQty, 0)

	return {
		available: false,
		actualQty,
		requestedQty: requested,
		shortageQty,
		warehouse: resolvedWarehouse,
		error: formatStockError(
			item?.item_name || item?.name || item?.item_code || "الصنف",
			requested,
			actualQty,
			resolvedWarehouse,
		),
	}
}

/* -------------------------------------------------------------------------- */
/* Frappe stock API                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Fetch current warehouse stock.
 *
 * IMPORTANT:
 * A network/API failure is NOT converted into zero stock.
 *
 * Zero stock means "server explicitly returned zero".
 * API failure means "stock could not be verified".
 */
export async function getItemStock(itemCode, warehouse) {
	const normalizedItemCode =
		typeof itemCode === "string"
			? itemCode.trim()
			: String(itemCode ?? "").trim()

	const normalizedWarehouse =
		typeof warehouse === "string"
			? warehouse.trim()
			: String(warehouse ?? "").trim()

	if (!normalizedItemCode || !normalizedWarehouse) {
		return {
			success: false,
			available: false,
			quantity: null,
			error: new Error("Item code and warehouse are required."),
		}
	}

	try {
		const result = await call("frappe.client.get_value", {
			doctype: "Bin",
			filters: {
				item_code: normalizedItemCode,
				warehouse: normalizedWarehouse,
			},
			fieldname: "actual_qty",
		})

		/**
		 * Frappe can return null when the Bin does not exist.
		 *
		 * In that case, zero is a legitimate availability result.
		 */
		const quantity =
			result?.actual_qty === undefined || result?.actual_qty === null
				? DEFAULT_STOCK
				: normalizeStockQuantity(result.actual_qty)

		return {
			success: true,
			available: quantity > 0,
			quantity,
			error: null,
		}
	} catch (error) {
		log.warn?.("Failed to fetch item stock", {
			itemCode: normalizedItemCode,
			warehouse: normalizedWarehouse,
			error,
		})

		return {
			success: false,
			available: false,
			quantity: null,
			error,
		}
	}
}

/* -------------------------------------------------------------------------- */
/* Strict stock fetch                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Convenience API for callers that only need the quantity.
 *
 * Unlike the old implementation, this does not silently turn a failed
 * network request into zero.
 *
 * @throws {Error} when stock cannot be verified
 */
export async function requireItemStock(itemCode, warehouse) {
	const result = await getItemStock(itemCode, warehouse)

	if (!result.success) {
		throw result.error || new Error("Unable to verify stock availability.")
	}

	return result.quantity
}

/* -------------------------------------------------------------------------- */
/* Full remote validation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Validate a requested quantity against fresh server stock.
 *
 * Useful immediately before completing a sale.
 */
export async function validateItemStock(item, requestedQty, warehouse) {
	if (!shouldValidateItemStock(item)) {
		return {
			valid: true,
			skipped: true,
			verified: false,
			available: true,
			quantity: null,
			error: null,
		}
	}

	const itemCode = item?.item_code || item?.code || item?.name

	const resolvedWarehouse = resolveWarehouse(item, warehouse)

	const result = await getItemStock(itemCode, resolvedWarehouse)

	if (!result.success) {
		return {
			valid: false,
			skipped: false,
			verified: false,
			available: false,
			quantity: null,
			error: result.error || new Error("تعذر التحقق من توفر المخزون."),
		}
	}

	const check = checkStockAvailability(
		{
			...item,
			actual_qty: result.quantity,
			warehouse: resolvedWarehouse,
		},
		requestedQty,
		resolvedWarehouse,
	)

	return {
		valid: check.available,
		skipped: false,
		verified: true,
		available: check.available,
		quantity: result.quantity,
		requestedQty: check.requestedQty,
		shortageQty: check.shortageQty,
		warehouse: resolvedWarehouse,
		error: check.error ? new Error(check.error) : null,
	}
}

/* -------------------------------------------------------------------------- */
/* Error formatting                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Format a consistent Arabic stock message.
 *
 * User-facing text belongs here so POS components do not invent
 * their own wording.
 */
export function formatStockError(itemName, requested, available, warehouse) {
	const name = String(itemName || "الصنف").trim()

	const requestedQty = normalizeRequestedQuantity(requested)

	const availableQty = normalizeStockQuantity(available)

	const warehouseName = String(warehouse || "المستودع المحدد").trim()

	if (availableQty <= 0) {
		return `الصنف «${name}» غير متوفر حاليًا في «${warehouseName}».`
	}

	return [
		`الكمية المتاحة من «${name}» غير كافية.`,
		`المطلوب: ${formatQuantity(requestedQty)}.`,
		`المتاح: ${formatQuantity(availableQty)}.`,
		`المستودع: «${warehouseName}».`,
	].join("\n")
}

/* -------------------------------------------------------------------------- */
/* Quantity formatting                                                        */
/* -------------------------------------------------------------------------- */

export function formatQuantity(value) {
	const quantity = typeof value === "number" ? value : Number(value)

	if (!Number.isFinite(quantity)) {
		return "0"
	}

	return new Intl.NumberFormat("ar", {
		maximumFractionDigits: 6,
	}).format(quantity)
}

/* -------------------------------------------------------------------------- */
/* Backward-compatible convenience                                           */
/* -------------------------------------------------------------------------- */

/**
 * Simple boolean helper for call sites that only need the answer.
 */
export function hasEnoughStock(item, requestedQty, warehouse) {
	return checkStockAvailability(item, requestedQty, warehouse).available
}
