/**
 * useScaleField — bind a hardware scale to ONE form field.
 *
 * The composable is deliberately narrow: it owns the connection lifecycle and
 * the write, and it writes **only when the reading is safe**. It does not
 * know what a cart is, what a price is, or what a UOM is — the page owns
 * those. That separation is what lets the same binding serve the POS quantity
 * editor and the third-party sale form without either importing the other.
 *
 * Two rules the page inherits for free:
 *
 *   - **Nothing connects until the user asks.** The service is created lazily
 *     and `connect()` is only ever called from `connectNow()`, which the UI
 *     binds to a click. AGENTS.md invariant 8 forbids a boot probe, and this
 *     is the shape that keeps the promise.
 *   - **Nothing is written while the load moves.** `applyWeight` gates on
 *     `service.isWritable`, so a moving scale cannot overwrite a number the
 *     cashier typed by hand.
 *
 * The page gets a plain ref for the current weight to render next to the
 * field, which is what makes a scale usable at the counter: the cashier sees
 * the number arrive before it lands in the box.
 */
import { computed, onBeforeUnmount, readonly, ref } from "vue"
// The scale service lives under `services/scale/`, not beside this composable.
// `./scaleService` resolved to nothing, so the whole POS bundle failed to build.
import { createScaleService, SCALE_STATUS } from "@/services/scale/scaleService"
import { quantityFromWeight } from "@/utils/scale"

/**
 * @param {object} options
 * @param {import("vue").Ref<number|string>} options.target the bound field
 * @param {import("vue").Ref<string>} [options.uom] target unit for the field
 * @param {object} [options.settings] scale settings from the store
 * @param {boolean} [options.autoConnect] never set true outside a gesture
 * @returns {object} binding API
 */
export function useScaleField({
	target,
	uom,
	settings = {},
	autoConnect = false,
}) {
	const service = createScaleService(settings)

	const liveWeightKg = ref(null)
	const liveStable = ref(false)
	const lastWrite = ref(null)
	const writes = ref(0)

	const unsubscribe = service.subscribe((reading) => {
		liveWeightKg.value = Number.isFinite(reading?.weightKg)
			? reading.weightKg
			: null
		liveStable.value = reading?.usable === true

		if (service.isWritable(reading)) applyWeight(reading)
	})

	/**
	 * Write a settled reading into the bound field.
	 *
	 * The unit conversion goes through `scale.js` (the single owner of unit
	 * maths). A second kg→UOM implementation here would be the duplicated
	 * currency formatter the debt log already paid for once.
	 *
	 * @param {object} reading
	 * @returns {boolean} whether the field was written
	 */
	function applyWeight(reading) {
		if (!service.isWritable(reading)) return false

		const unit = uom?.value || "kg"
		const converted = quantityFromWeight(reading.weightKg, unit)
		if (!Number.isFinite(converted) || converted < 0) return false

		target.value = converted
		lastWrite.value = {
			weightKg: reading.weightKg,
			quantity: converted,
			unit,
			protocol: reading.protocol,
			stability: reading.stability,
			at: reading.at,
		}
		writes.value += 1
		return true
	}

	/** Call from a click handler. Never from a watcher or on mount. */
	async function connectNow(overrides) {
		await service.connect(overrides)
	}

	async function disconnect() {
		await service.disconnect()
		liveWeightKg.value = null
		liveStable.value = false
	}

	onBeforeUnmount(() => {
		unsubscribe()
		void service.disconnect()
	})

	if (autoConnect) {
		// A caller asking for this has a gesture it is responsible for; the
		// pages in this repo do not set it.
		void connectNow()
	}

	const status = computed(() => service.state.value.status)
	const statusText = computed(() => service.state.value.statusText)
	const isConnected = computed(
		() => service.state.value.status === SCALE_STATUS.CONNECTED,
	)
	const isUnsupported = computed(
		() => service.state.value.status === SCALE_STATUS.UNSUPPORTED,
	)

	return {
		service,
		status,
		statusText,
		isConnected,
		isUnsupported,
		liveWeightKg: readonly(liveWeightKg),
		liveStable: readonly(liveStable),
		lastWrite: readonly(lastWrite),
		writeCount: readonly(writes),
		connectNow,
		disconnect,
		applyWeight,
	}
}

export default useScaleField
