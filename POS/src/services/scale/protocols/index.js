/**
 * Protocol registry — the scale HAL's protocol table.
 *
 * Each adapter is an independent standard with its own frame grammar and its
 * own stability semantics, so each lives in its own module and this file only
 * orders them. Adding a vendor means adding one module and one line here; no
 * caller changes.
 *
 * Detection order is NOT alphabetical and that matters: a frame is offered to
 * the most specific grammar first and the catch-all stream parser last. A
 * broad parser tried first would swallow `ST,GS,+  1.234kg` as a bare number
 * and silently drop the stable flag — a weighing scale that reports "12 kg"
 * with no idea whether the load is moving is worse than one that reports
 * nothing at all.
 *
 * Every adapter exposes the same shape:
 *   id           stable machine key
 *   label/labelAr human name (Arabic for the UI, invariant 7)
 *   detect(frame) boolean — cheap pre-filter
 *   parse(frame)  reading object or { ok:false, reason }
 *   needsSettling true when the frame carries NO stability flag
 */
import cas from "./casProtocol"
import mettlerToledo from "./mettlerToledoProtocol"
import stream from "./streamProtocol"

/**
 * Ordered most-specific first. `stream` is the fallback and MUST stay last:
 * it matches a bare number, which is a prefix of every other grammar.
 */
export const PROTOCOLS = Object.freeze([cas, mettlerToledo, stream])

/** Every supported protocol id — used by the settings screen and by tests. */
export const SUPPORTED_PROTOCOL_IDS = Object.freeze(
	PROTOCOLS.map((protocol) => protocol.id),
)

const BY_ID = new Map(PROTOCOLS.map((protocol) => [protocol.id, protocol]))

/**
 * @param {string} id
 * @returns {object|null} the adapter, or null for an unknown id
 */
export function protocolById(id) {
	return BY_ID.get(id) ?? null
}

/**
 * Identify which protocol produced a frame.
 *
 * @param {string} frame
 * @returns {string|null} protocol id, or null when nothing matched
 */
export function detectProtocol(frame) {
	for (const protocol of PROTOCOLS) {
		if (protocol.detect(frame)) return protocol.id
	}
	return null
}

/**
 * Parse a frame with whichever protocol claims it.
 *
 * When `preferredId` is given it is tried first, so a store that KNOWS its
 * scale is not at the mercy of detection order. Detection only decides the
 * fallback; it never overrides an explicit choice.
 *
 * @param {string} frame raw line from the scale
 * @param {object} [options]
 * @param {string} [options.preferredId] protocol id from settings
 * @returns {object} reading — always carries `protocol` and `ok`
 */
export function parseFrame(frame, options = {}) {
	const { preferredId } = options

	const preferred = preferredId ? protocolById(preferredId) : null
	if (preferred) {
		const parsed = preferred.parse(frame)
		if (parsed.ok || parsed.reason !== undefined) {
			// An explicit protocol that cannot read the frame is a fact about
			// the wiring, not a reason to silently re-interpret the bytes as
			// some other vendor's format.
			if (parsed.ok) return { ...parsed, protocol: preferred.id }
			return { ...parsed, protocol: preferred.id }
		}
	}

	const detected = detectProtocol(frame)
	if (!detected) {
		return {
			ok: false,
			reason: "unsupported-protocol",
			raw: typeof frame === "string" ? frame : String(frame ?? ""),
		}
	}

	const adapter = protocolById(detected)
	const parsed = adapter.parse(frame)
	return { ...parsed, protocol: parsed.protocol ?? detected }
}

/**
 * Does a protocol's frame carry a stability flag at all?
 *
 * The HAL needs this at read time, not at parse time: a streaming scale's
 * reading has `stable: false` meaning "the scale did not say", which is a
 * different fact from a CAS frame's `stable: false` meaning "it is moving".
 * Collapsing the two is how a moving load ends up priced.
 *
 * @param {string|null} protocolId
 * @returns {boolean} true when stability must be inferred from repeats
 */
export function needsSettlingFor(protocolId) {
	return protocolById(protocolId)?.needsSettling === true
}

export default {
	PROTOCOLS,
	SUPPORTED_PROTOCOL_IDS,
	protocolById,
	detectProtocol,
	parseFrame,
	needsSettlingFor,
}
