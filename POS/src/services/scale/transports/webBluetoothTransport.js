/**
 * Web Bluetooth transport — BLE and classic SPP weighing scales.
 *
 * On the custom characteristic: many BLE scales expose a manufacturer
 * service, so the UUID is CONFIGURATION, not a constant. Guessing one would
 * connect to the right device and read nothing at all — a failure that looks
 * like "the scale is broken" and is not. The HAL passes it from settings.
 */
import { createFramePump } from "../transportCore"

/**
 * @param {object} [deps]
 * @param {string} [deps.serviceUuid] vendor service UUID
 * @param {string} [deps.characteristicUuid] vendor notify characteristic
 * @returns {object} transport
 */
export function createWebBluetoothTransport({
	serviceUuid,
	characteristicUuid,
} = {}) {
	let device = null
	let decoder = new TextDecoder()
	const pump = createFramePump("bluetooth")

	return {
		id: "bluetooth",
		isSupported: () =>
			typeof navigator !== "undefined" && "bluetooth" in navigator,
		subscribe: pump.subscribe,

		/**
		 * @param {object} [options] `{ device, serviceUuid, characteristicUuid }`
		 * @returns {Promise<{ device: object, service: string }>}
		 */
		async connect(options = {}) {
			const service = options.serviceUuid ?? serviceUuid
			if (!service) {
				throw new Error("معرّف خدمة البلوتوث غير مضبوط في إعدادات الميزان")
			}

			device =
				options.device ??
				device ??
				(await navigator.bluetooth.requestDevice({
					filters: options.filters ?? [{ services: [service] }],
					optionalServices: [service],
				}))

			const server = await device.gatt.connect()
			const gattService = await server.getPrimaryService(service)
			const characteristic = await gattService.getCharacteristic(
				options.characteristicUuid ?? characteristicUuid,
			)

			pump.reset()
			decoder = new TextDecoder()

			characteristic.addEventListener("characteristicvaluechanged", (event) => {
				pump.push(decoder.decode(event.target.value, { stream: true }))
			})

			await characteristic.startNotifications()
			return { device, service }
		},

		async disconnect() {
			try {
				if (device?.gatt?.connected) device.gatt.disconnect()
			} catch {
				/* already disconnected */
			}
			device = null
			pump.reset()
		},

		async write() {
			throw new Error("أوامر التصفير غير مفعّلة لهذا الميزان")
		},
	}
}

export default createWebBluetoothTransport
