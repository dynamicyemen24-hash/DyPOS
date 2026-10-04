/**
 * WebSocket bridge transport — the escape hatch that makes this work
 * everywhere.
 *
 * A local process (beside the server, or on the till) owns the real serial
 * port and forwards frames. This is what covers the honest cases a browser
 * cannot: Firefox and Safari tills with no Web Serial, scales that need a
 * vendor handshake before they emit anything, and a scale cabled to another
 * machine in the store.
 *
 * The URL is passed in from settings and is NEVER defaulted to a literal. A
 * shipped default would be a hardcoded host — which fails the standalone-boot
 * gate, and worse, would aim one store's weighing traffic at one address.
 */
import { createFramePump } from "../transportCore"

/**
 * @param {object} [deps]
 * @param {string} [deps.url] runtime-configured bridge URL from settings
 * @returns {object} transport
 */
export function createWebSocketTransport({ url } = {}) {
	let socket = null
	const pump = createFramePump("websocket")

	return {
		id: "websocket",
		isSupported: () => typeof WebSocket !== "undefined",
		subscribe: pump.subscribe,

		/**
		 * @param {object} [options] `{ url }`
		 * @returns {Promise<{ url: string }>}
		 */
		async connect(options = {}) {
			const target = options.url ?? url
			if (!target) {
				throw new Error("عنوان جسر الميزان غير مضبوط في الإعدادات")
			}

			pump.reset()
			socket = new WebSocket(target)

			await new Promise((resolve, reject) => {
				socket.addEventListener("open", resolve, { once: true })
				socket.addEventListener(
					"error",
					() => reject(new Error("تعذر الاتصال بجسر الميزان")),
					{ once: true },
				)
			})

			socket.addEventListener("message", (event) => {
				pump.push(typeof event.data === "string" ? event.data : "")
			})

			return { url: target }
		},

		async disconnect() {
			try {
				socket?.close()
			} catch {
				/* already closed */
			}
			socket = null
			pump.reset()
		},

		/**
		 * The one transport that can send tare/zero, because the bridge owns
		 * the port and can translate it for a configured vendor.
		 * @param {string|ArrayBuffer} bytes
		 */
		async write(bytes) {
			if (!socket || socket.readyState !== 1) {
				throw new Error("جسر الميزان غير متصل")
			}
			socket.send(bytes)
		},
	}
}

export default createWebSocketTransport
