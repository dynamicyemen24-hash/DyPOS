/**
 * DyPOS — Scale Integration Utilities
 * ============================================================================
 *
 * Pure scale parsing and weighing calculations.
 *
 * Responsibilities:
 * - Parse common retail / industrial scale payloads.
 * - Normalize supported units to kilograms.
 * - Detect stability markers.
 * - Convert scale weight to item-UOM quantity.
 * - Calculate weighed-item line totals.
 *
 * Non-responsibilities:
 * - No serial / USB / WebSocket / HID access.
 * - No cart mutation.
 * - No inventory mutation.
 * - No hardware assumptions.
 * - No network access.
 *
 * Supported examples:
 *
 *   ST,GS,+  1.234kg
 *   WT,GS,-  1.234lb
 *   S+0001.234kg
 *   SI+0012.345 kg
 *   +1.234
 *   -12.345
 *   1.234kg
 *   1.234 kg
 *
 * Design principles:
 * - deterministic
 * - side-effect free
 * - strict validation
 * - explicit failure reasons
 * - finite-number guarantees
 * - no silent NaN / Infinity propagation
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const GRAMS_PER_KILOGRAM = 1000

export const KILOGRAMS_PER_POUND = 0.45359237

export const POUNDS_PER_KILOGRAM = 1 / KILOGRAMS_PER_POUND

/**
 * Maximum accepted numeric magnitude.
 *
 * This is deliberately conservative for a POS weighing operation.
 * A physical retail scale should never need an unbounded JavaScript number.
 */
const MAX_WEIGHT_KG = 100_000

/**
 * Maximum raw payload length.
 *
 * Prevents accidentally processing huge serial/socket payloads as a scale
 * reading.
 */
const MAX_READING_LENGTH = 512

/**
 * Supported source units.
 */
const SUPPORTED_UNITS = Object.freeze(["kg", "g", "lb"])

/**
 * Weight token.
 *
 * Important:
 * - Requires an explicit sign OR a plain numeric value.
 * - Supports decimal values.
 * - Does not accept scientific notation.
 * - Supports optional unit.
 *
 * Examples:
 *   +1.234
 *   -12.345
 *   1.234kg
 *   0012.500 kg
 */
const WEIGHT_TOKEN = /([+-]?\s*\d{1,6}(?:\.\d{1,4})?)\s*(kg|lb|g)?/i

/**
 * Explicit stable markers used by several scale protocols.
 */
const STABLE_MARKER = /(?:^|[,\s:])ST(?:[,\s:]|$)/i

/**
 * S / SI protocols.
 *
 * Examples:
 *   S+0001.234kg
 *   SI+0012.345 kg
 */
const S_STABLE_MARKER = /^S(?:I)?\s*[+-]/i

/**
 * Common unstable markers.
 *
 * These are intentionally conservative.
 */
const UNSTABLE_MARKER =
	/(?:^|[,\s:])(US|UNSTABLE|MOTION|MOV|DYNAMIC)(?:[,\s:]|$)/i

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

function normalizeUnit(unit) {
	const normalized = String(unit ?? "kg")
		.trim()
		.toLowerCase()

	return SUPPORTED_UNITS.includes(normalized) ? normalized : null
}

function normalizeNumber(value) {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null
	}

	if (typeof value !== "string" || value.trim() === "") {
		return null
	}

	const normalized = value.trim().replace(/\s+/g, "")

	const number = Number(normalized)

	return Number.isFinite(number) ? number : null
}

function isValidWeightKg(weightKg) {
	return Number.isFinite(weightKg) && weightKg >= 0 && weightKg <= MAX_WEIGHT_KG
}

function normalizeRawReading(text) {
	if (typeof text !== "string") {
		return null
	}

	const raw = text.replace(/\0/g, "").trim()

	if (raw.length === 0 || raw.length > MAX_READING_LENGTH) {
		return null
	}

	return raw
}

function detectStability(raw) {
	if (UNSTABLE_MARKER.test(raw)) {
		return false
	}

	if (STABLE_MARKER.test(raw)) {
		return true
	}

	if (S_STABLE_MARKER.test(raw)) {
		return true
	}

	/**
	 * Bare numeric readings do not claim stability.
	 *
	 * Stability must be established by the transport/scale protocol or by
	 * repeated identical readings in the integration layer.
	 */
	return false
}

function detectSign(rawValue) {
	const normalized = String(rawValue ?? "").replace(/\s+/g, "")

	if (normalized.startsWith("-")) {
		return -1
	}

	return 1
}

function createFailure(reason, extra = {}) {
	return {
		ok: false,
		reason,
		...extra,
	}
}

function createSuccess(payload) {
	return {
		ok: true,
		...payload,
	}
}

/* -------------------------------------------------------------------------- */
/* Scale parsing                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Parse a raw scale reading.
 *
 * @param {string|null|undefined} text
 *
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   weightKg?: number,
 *   unit?: "kg"|"g"|"lb",
 *   stable?: boolean,
 *   negative?: boolean,
 *   raw?: string
 * }}
 */
export function parseScaleReading(text) {
	const raw = normalizeRawReading(text)

	if (raw === null) {
		if (typeof text !== "string") {
			return createFailure("not-a-string")
		}

		if (text.trim() === "") {
			return createFailure("empty")
		}

		return createFailure("reading-too-long")
	}

	const match = raw.match(WEIGHT_TOKEN)

	if (!match) {
		return createFailure("no-weight-token", { raw })
	}

	const [, rawNumber, rawUnit] = match

	const numericText = String(rawNumber).replace(/\s+/g, "")

	const numericValue = Number(numericText)

	if (!Number.isFinite(numericValue)) {
		return createFailure("non-finite", { raw })
	}

	const negative = detectSign(numericText) < 0

	/**
	 * A physical scale reading may expose a negative value after tare/zero
	 * offset. We preserve the information but normalize physical weight to
	 * its absolute magnitude.
	 */
	const absoluteValue = Math.abs(numericValue)

	const unit = normalizeUnit(rawUnit)

	if (!unit) {
		return createFailure("unsupported-unit", {
			raw,
			unit: rawUnit?.toLowerCase() || null,
		})
	}

	const weightKg = convertToKilograms(absoluteValue, unit)

	if (!isValidWeightKg(weightKg)) {
		return createFailure("invalid-weight", {
			raw,
			unit,
		})
	}

	return createSuccess({
		weightKg,
		unit,
		stable: detectStability(raw),
		negative,
		raw,
	})
}

/* -------------------------------------------------------------------------- */
/* Unit conversion                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Convert a weight to kilograms.
 *
 * @param {number|string} weight
 * @param {"kg"|"g"|"lb"} unit
 * @returns {number}
 */
export function convertToKilograms(weight, unit = "kg") {
	const value = normalizeNumber(weight)

	if (value === null || value < 0) {
		return 0
	}

	const normalizedUnit = normalizeUnit(unit)

	switch (normalizedUnit) {
		case "g":
			return value / GRAMS_PER_KILOGRAM

		case "lb":
			return value * KILOGRAMS_PER_POUND

		case "kg":
		default:
			return value
	}
}

/**
 * Convert kilograms to the item's target UOM.
 *
 * @param {number|string} weightKg
 * @param {"kg"|"g"|"lb"} targetUom
 * @returns {number}
 */
export function quantityFromWeight(weightKg, targetUom = "kg") {
	const kg = normalizeNumber(weightKg)

	if (kg === null || kg < 0) {
		return 0
	}

	switch (normalizeUnit(targetUom)) {
		case "g":
			return kg * GRAMS_PER_KILOGRAM

		case "lb":
			return kg / KILOGRAMS_PER_POUND

		case "kg":
		default:
			return kg
	}
}

/* -------------------------------------------------------------------------- */
/* Line calculation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Calculate a weighed item's line total.
 *
 * IMPORTANT:
 * The quantity is NOT rounded before multiplication.
 * Monetary rounding is performed only on the final amount.
 *
 * @param {number|string} weightKg
 * @param {number|string} rate
 * @param {"kg"|"g"|"lb"} targetUom
 * @param {(value:number)=>number} [rounder]
 * @returns {number}
 */
export function weightLineTotal(weightKg, rate, targetUom = "kg", rounder) {
	const normalizedWeight = normalizeNumber(weightKg)

	const normalizedRate = normalizeNumber(rate)

	if (
		normalizedWeight === null ||
		normalizedRate === null ||
		normalizedWeight < 0 ||
		normalizedRate < 0
	) {
		return 0
	}

	const quantity = quantityFromWeight(normalizedWeight, targetUom)

	if (!Number.isFinite(quantity) || quantity < 0) {
		return 0
	}

	const amount = quantity * normalizedRate

	if (!Number.isFinite(amount)) {
		return 0
	}

	const defaultRounder = (value) =>
		Math.round((value + Number.EPSILON) * 100) / 100

	const round = typeof rounder === "function" ? rounder : defaultRounder

	const rounded = round(amount)

	return Number.isFinite(rounded) ? rounded : 0
}

/* -------------------------------------------------------------------------- */
/* Higher-level helpers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Convert a raw scale reading directly into a cart quantity.
 *
 * This is intentionally pure and does not mutate the cart.
 *
 * @param {string} text
 * @param {string} targetUom
 * @returns {{
 *   ok:boolean,
 *   quantity?:number,
 *   weightKg?:number,
 *   unit?:string,
 *   stable?:boolean,
 *   negative?:boolean,
 *   raw?:string,
 *   reason?:string
 * }}
 */
export function quantityFromScaleReading(text, targetUom = "kg") {
	const reading = parseScaleReading(text)

	if (!reading.ok) {
		return reading
	}

	const quantity = quantityFromWeight(reading.weightKg, targetUom)

	if (!Number.isFinite(quantity) || quantity < 0) {
		return createFailure("invalid-quantity", {
			raw: reading.raw,
		})
	}

	return createSuccess({
		quantity,
		weightKg: reading.weightKg,
		unit: reading.unit,
		stable: reading.stable,
		negative: reading.negative,
		raw: reading.raw,
	})
}

/**
 * Parse a reading and calculate its line total.
 *
 * @param {string} text
 * @param {number|string} rate
 * @param {"kg"|"g"|"lb"} targetUom
 * @param {(value:number)=>number} [rounder]
 * @returns {{
 *   ok:boolean,
 *   quantity?:number,
 *   weightKg?:number,
 *   lineTotal?:number,
 *   stable?:boolean,
 *   negative?:boolean,
 *   unit?:string,
 *   raw?:string,
 *   reason?:string
 * }}
 */
export function calculateScaleLine(text, rate, targetUom = "kg", rounder) {
	const reading = parseScaleReading(text)

	if (!reading.ok) {
		return reading
	}

	const quantity = quantityFromWeight(reading.weightKg, targetUom)

	if (!Number.isFinite(quantity) || quantity < 0) {
		return createFailure("invalid-quantity", {
			raw: reading.raw,
		})
	}

	const lineTotal = weightLineTotal(reading.weightKg, rate, targetUom, rounder)

	return createSuccess({
		weightKg: reading.weightKg,
		quantity,
		lineTotal,
		unit: reading.unit,
		stable: reading.stable,
		negative: reading.negative,
		raw: reading.raw,
	})
}

/**
 * Determine whether a parsed reading is safe to use for automatic
 * quantity insertion.
 *
 * Negative readings and unstable readings are rejected.
 *
 * @param {ReturnType<typeof parseScaleReading>} reading
 * @returns {boolean}
 */
export function isUsableScaleReading(reading) {
	return (
		Boolean(reading?.ok) &&
		reading.stable === true &&
		reading.negative !== true &&
		Number.isFinite(reading.weightKg) &&
		reading.weightKg >= 0
	)
}

/**
 * Return only supported scale units.
 */
export function isSupportedScaleUnit(unit) {
	return normalizeUnit(unit) !== null
}

/* -------------------------------------------------------------------------- */
/* Default export                                                             */
/* -------------------------------------------------------------------------- */

export default parseScaleReading
