/**
 * Transport contract + frame splitting — the shared language of the HAL.
 *
 * The browser has no single "read my scale" API, so a weighing scale arrives
 * over genuinely different paths. Three invariants hold for ALL of them, and
 * they are the reason this is a layer and not three call sites in a page:
 *
 *   1. **No transport connects itself.** `connect()` is always called from a
 *      user gesture the cashier took. Nothing runs at boot, on an interval,
 *      or on an `online` event — AGENTS.md invariant 8 forbids exactly that,
 *      and `tests/standaloneBoot.test.js` enforces it.
 *   2. **Availability is reported, never assumed.** `isSupported()` is a
 *      feature probe on the live object, not a user-agent sniff. A till that
 *      cannot do USB serial must be told "unsupported", not shown a connect
 *      button that throws on click.
 *   3. **No transport names a host, a port, or an IP.** The bridge URL is
 *      configured at runtime; `tests/standaloneBoot.test.js` fails the build
 *      if any shipped file does otherwise, because a PWA must install on any
 *      machine in any store.
 *
 * Every transport returns the same six members. The HAL above never learns
 * which vendor it is holding.
 */

/** @typedef {() => void} Unsubscribe */

/** A frame the splitter never terminates is dropped, not buffered forever. */
const MAX_BUFFERED_BYTES = 8192

/**
 * Split a byte stream into frames on CR, LF or CRLF.
 *
 * Scales disagree on line endings: CAS emits CR, most USB adapters emit LF,
 * some emit CRLF. Decoding happens in the transport with a streaming
 * `TextDecoder`, so a multi-byte sequence split across two reads is not
 * corrupted here.
 *
 * A scale that never terminates a frame would grow this buffer without bound,
 * so an over-long buffer is discarded with a reset instead of kept.
 *
 * @param {string} buffer accumulated text so far
 * @param {string} chunk newly decoded text
 * @returns {{ frames: string[], rest: string }}
 */
export function splitFrames(buffer, chunk) {
	const combined = `${buffer}${chunk}`
	const parts = combined.split(/\r\n|\r|\n/)

	// Whatever follows the last terminator: an incomplete frame (keep it) or
	// "" (nothing pending).
	const rest = parts.pop() ?? ""

	if (rest.length > MAX_BUFFERED_BYTES) return { frames: [], rest: "" }

	return {
		frames: parts.map((frame) => frame.trim()).filter(Boolean),
		rest,
	}
}

/** The members every transport must expose. */
export const TRANSPORT_CONTRACT = Object.freeze([
	"id",
	"isSupported",
	"connect",
	"disconnect",
	"subscribe",
	"write",
])

/**
 * Assert a transport implements the contract.
 *
 * Checked at construction rather than at click time: a transport missing a
 * member is a wiring bug the cashier should never be the one to find.
 *
 * @param {object} transport
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function checkTransportContract(transport) {
	const missing = []
	for (const key of TRANSPORT_CONTRACT) {
		if (key === "id") {
			if (typeof transport?.[key] !== "string") missing.push(key)
			continue
		}
		if (typeof transport?.[key] !== "function") missing.push(key)
	}
	return { ok: missing.length === 0, missing }
}

/**
 * Shared state for the transports: the listener set and the line splitter.
 *
 * Factored out because the three transports differ in ONE thing — how bytes
 * arrive — and duplicating the buffering logic three times is how the three
 * copies drift apart.
 *
 * @param {string} id transport id
 * @returns {object} shared plumbing for a transport implementation
 */
export function createFramePump(id) {
	const listeners = new Set()
	let buffer = ""

	return {
		id,

		/**
		 * Subscribe to decoded frames.
		 * @param {(frame: string) => void} listener
		 * @returns {Unsubscribe}
		 */
		subscribe(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},

		/**
		 * Feed raw decoded text; complete frames go to every listener.
		 * @param {string} text
		 */
		push(text) {
			const { frames, rest } = splitFrames(buffer, text)
			buffer = rest
			for (const frame of frames) {
				for (const listener of listeners) listener(frame)
			}
		},

		/** Drop partial state on disconnect so a reconnect starts clean. */
		reset() {
			buffer = ""
		},
	}
}
