/**
 * Scale service — the hardware abstraction layer.
 *
 * This is the only module the UI talks to. It hides which transport carries
 * the bytes, which vendor's grammar frames them, and how stability is
 * established — and it exposes exactly three things: `connect`, `disconnect`,
 * and a stream of readings.
 *
 * ## The rule that matters most
 *
 * A weight only reaches a form field when it is SAFE, and "safe" is defined
 * here, once, so two screens cannot disagree about it:
 *
 *   - the reading parses, AND
 *   - the frame itself declares stability (`ST`/`GS`), OR the frame carries
 *     none and HAL has seen the SAME value N times in a row (`settleReads`).
 *
 * The second clause is why `needsSettling` exists on a protocol. A streaming
 * scale (Zebra, Avery) never says "stable" — it keeps printing numbers — so
 * the only honest way to know the load has settled is to watch the value stop
 * changing. That is an INFERENCE, labelled as one (`stability: "inferred"`)
 * so a screen can tell the cashier which kind of number they are looking at.
 *
 * A scale that is still moving produces `usable: false` on purpose. Filling
 * a price field from a moving weight is how a customer gets charged for
 * 2.4 kg of produce they put down at 1.9 kg.
 *
 * ## What this service deliberately does not do
 *
 *   - It never connects on its own (AGENTS.md invariant 8).
 *   - It never mutates a cart, an invoice or any store. It emits readings; a
 *     page decides what a reading means for its own field.
 *   - It never assumes a browser can do hardware. Every entry point reports a
 *     reason in Arabic instead of throwing an English stack at a cashier.
 */
import { ref, readonly } from "vue"
import { needsSettlingFor, parseFrame } from "./protocols"
import { availableTransports, createTransport } from "./transports"

/** How many identical consecutive readings count as settled. */
export const DEFAULT_SETTLE_READS = 3

/** Readings further apart than this are different weights, not jitter. */
const SETTLE_EPSILON_KG = 0.001

/** Status values the UI may render; Arabic text ships with each status. */
/**
 * @typedef {object} ScaleSettings
 * @property {string} transportId one of SUPPORTED_TRANSPORT_IDS
 * @property {string} [protocolId] vendor protocol, when the store knows it
 * @property {string} [bridgeUrl] runtime-configured bridge address
 * @property {number} [baudRate]
 * @property {number} [settleReads]
 */

/**
 * Decide whether a weight is safe to put in a field, and why.
 *
 * Split out of the service so the rule is testable with NO hardware at all —
 * this function decides money, so it must not need a device to prove.
 *
 * @param {object} parsed a reading from a protocol adapter
 * @param {number} consecutiveRepeats identical readings seen in a row
 * @param {number} [settleReads] how many repeats count as settled
 * @returns {{ usable: boolean, reason: string, stability: string }}
 */
export function evaluateStability(
	parsed,
	consecutiveRepeats,
	settleReads = DEFAULT_SETTLE_READS,
) {
	if (!parsed?.ok)
		return { usable: false, reason: "unparsed", stability: "none" }
	if (parsed.error)
		return { usable: false, reason: "scale-error", stability: "none" }

	// The scale said so. Trust it and stop.
	if (parsed.stable === true) {
		return { usable: true, reason: "frame-stable", stability: "reported" }
	}

	// The scale said it is NOT stable, and this protocol is one that knows:
	// there is nothing to wait for. A moving load stays unusable.
	if (parsed.needsSettling !== true) {
		return { usable: false, reason: "frame-unstable", stability: "reported" }
	}

	// The protocol carries no stability flag (streaming scales): infer it.
	if (consecutiveRepeats >= settleReads) {
		return { usable: true, reason: "repeat-settled", stability: "inferred" }
	}
	return { usable: false, reason: "still-moving", stability: "none" }
}
export const SCALE_STATUS = Object.freeze({
	IDLE: "idle",
	CONNECTING: "connecting",
	CONNECTED: "connected",
	UNSUPPORTED: "unsupported",
	ERROR: "error",
})

/**
 * Create an isolated scale service.
 *
 * A factory rather than a module singleton: two tests can then hold two
 * services with different settings without one leaking into the other, and a
 * page that unmounts drops its instance entirely.
 *
 * @param {ScaleSettings} [settings]
 * @returns {object} the scale service
 */
export function createScaleService(settings = {}) {
	const state = ref({
		status: SCALE_STATUS.IDLE,
		statusText: "الميزان غير موصول",
		transportId: settings.transportId ?? "web-serial",
		protocolId: settings.protocolId ?? null,
	})

	const reading = ref(null)
	const lastError = ref(null)

	let transport = null
	let unsubscribe = null
	const settleReads = settings.settleReads ?? DEFAULT_SETTLE_READS
	let consecutive = 0
	let previousWeightKg = null
	const listeners = new Set()

	const publish = () => {
		for (const listener of listeners) listener(reading.value)
	}

	function setStatus(status, statusText) {
		state.value = { ...state.value, status, statusText }
	}

	/**
	 * Handle one frame from the transport.
	 * @param {string} frame
	 */
	function handleFrame(frame) {
		const parsed = parseFrame(frame, { preferredId: settings.protocolId })
		// The protocol's own `needsSettling` travels with the reading, so the
		// stability rule stays a pure function of (reading, repeats).
		const enriched = {
			...parsed,
			needsSettling: needsSettlingFor(parsed.protocol),
		}

		if (enriched.ok && Number.isFinite(enriched.weightKg)) {
			const sameAsPrevious =
				previousWeightKg !== null &&
				Math.abs(enriched.weightKg - previousWeightKg) <= SETTLE_EPSILON_KG
			consecutive = sameAsPrevious ? consecutive + 1 : 1
			previousWeightKg = enriched.weightKg
		} else {
			// A frame we could not read breaks the run: garbage between two
			// identical readings must not read as "settled".
			consecutive = 0
			previousWeightKg = null
		}

		reading.value = {
			...enriched,
			...evaluateStability(enriched, consecutive, settleReads),
			at: new Date().toISOString(),
		}
		publish()
	}

	/**
	 * Connect. MUST be called from a user gesture.
	 *
	 * @param {object} [overrides] per-attempt settings
	 * @returns {Promise<object>} the transport descriptor
	 */
	async function connect(overrides = {}) {
		const transportId =
			overrides.transportId ?? settings.transportId ?? "web-serial"
		const options = {
			port: overrides.port ?? settings.port,
			baudRate: overrides.baudRate ?? settings.baudRate,
			url: overrides.bridgeUrl ?? settings.bridgeUrl,
			serviceUuid: overrides.serviceUuid ?? settings.serviceUuid,
			characteristicUuid:
				overrides.characteristicUuid ?? settings.characteristicUuid,
		}

		lastError.value = null
		setStatus(SCALE_STATUS.CONNECTING, "جارٍ الاتصال بالميزان…")

		try {
			transport = createTransport(transportId, options)

			if (!transport.isSupported()) {
				setStatus(
					SCALE_STATUS.UNSUPPORTED,
					"هذا المتصفح لا يدعم هذا النوع من الاتصال",
				)
				throw new Error("النقل غير مدعوم في هذا المتصفح")
			}

			const descriptor = await transport.connect(options)
			unsubscribe = transport.subscribe(handleFrame)
			state.value = { ...state.value, transportId }
			setStatus(SCALE_STATUS.CONNECTED, "الميزان موصول")
			return descriptor
		} catch (error) {
			lastError.value = error?.message ?? "تعذر الاتصال بالميزان"
			setStatus(SCALE_STATUS.ERROR, lastError.value)
			throw error
		}
	}

	async function disconnect() {
		unsubscribe?.()
		unsubscribe = null
		await transport?.disconnect()
		transport = null
		consecutive = 0
		previousWeightKg = null
		reading.value = null
		setStatus(SCALE_STATUS.IDLE, "الميزان غير موصول")
	}

	/**
	 * Subscribe to every reading, settled or not.
	 *
	 * Callers that write to a field must check `usable`; a live display may
	 * show every frame.
	 *
	 * @param {(reading: object|null) => void} listener
	 * @returns {() => void} unsubscribe
	 */
	function subscribe(listener) {
		listeners.add(listener)
		return () => listeners.delete(listener)
	}

	/** Which transports this browser can run — for the settings screen. */
	function available() {
		return availableTransports(settings)
	}

	/**
	 * Whether a reading may be written to a field.
	 *
	 * A negative weight is rejected even when settled: on a scale it means a
	 * tare offset went the wrong way, and writing it into a quantity produces
	 * a negative line that later arithmetic turns into a refund.
	 *
	 * @param {object} value a reading
	 * @returns {boolean}
	 */
	function isWritable(value) {
		return value?.usable === true && value?.negative !== true
	}

	return {
		state: readonly(state),
		reading: readonly(reading),
		lastError: readonly(lastError),
		SCALE_STATUS,
		connect,
		disconnect,
		subscribe,
		available,
		isWritable,
	}
}

export default createScaleService
