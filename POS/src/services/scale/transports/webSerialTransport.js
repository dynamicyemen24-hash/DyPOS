/**
 * Web Serial transport — USB weighing scales.
 *
 * The port picker is deliberately NOT requested here:
 * `navigator.serial.requestPort` throws unless it runs inside a user gesture,
 * and the PAGE owns that gesture (the connect button). This module receives
 * the already-granted port, which keeps the one rule that cannot be faked
 * — human consent to attach a device — in human hands.
 *
 * Retail scales are near-universally 9600 baud, but it is a parameter
 * because industrial and bench scales are not.
 */
import { createFramePump } from "../transportCore"

/**
 * @param {object} [deps]
 * @param {object} [deps.port] a `SerialPort` the user already granted
 * @param {number} [deps.baudRate]
 * @returns {object} transport
 */
export function createWebSerialTransport({ port, baudRate = 9600 } = {}) {
	let active = port ?? null
	let reader = null
	let decoder = new TextDecoder()
	let reading = false
	const pump = createFramePump("web-serial")

	return {
		id: "web-serial",
		isSupported: () =>
			typeof navigator !== "undefined" && "serial" in navigator,
		subscribe: pump.subscribe,

		/**
		 * @param {object} [options] `{ port, baudRate }`
		 * @returns {Promise<{ port: object, baudRate: number }>}
		 */
		async connect(options = {}) {
			const target = options.port ?? active
			if (!target) {
				throw new Error("لم يتم اختيار منفذ للميزان — يلزم موافقة المستخدم")
			}

			const rate = options.baudRate ?? baudRate
			await target.open({ baudRate: rate })
			active = target
			reading = true
			decoder = new TextDecoder()
			pump.reset()

			reader = target.readable.getReader()

			// Deliberately not awaited: `connect()` resolves once the port is
			// open, and this loop runs for the life of the connection.
			void (async () => {
				try {
					while (reading) {
						const { value, done } = await reader.read()
						if (done) break
						pump.push(decoder.decode(value, { stream: true }))
					}
				} catch {
					// An unplugged cable rejects the pending read. Swallowing it
					// keeps one yanked USB from taking down the sale screen;
					// the HAL reports the drop through its own status.
				} finally {
					reading = false
				}
			})()

			return { port: active, baudRate: rate }
		},

		async disconnect() {
			reading = false
			try {
				await reader?.cancel()
				reader?.releaseLock()
			} catch {
				/* already released */
			}
			reader = null
			try {
				await active?.close()
			} catch {
				/* already closed */
			}
			pump.reset()
		},

		/**
		 * Tare/zero need the vendor's byte sequence, and sending the wrong one
		 * can put some scales into a config mode. Refusing is the safe answer
		 * until a vendor's sequence is configured explicitly.
		 */
		async write() {
			throw new Error("أوامر التصفير غير مفعّلة لهذا الميزان")
		},
	}
}

export default createWebSerialTransport
