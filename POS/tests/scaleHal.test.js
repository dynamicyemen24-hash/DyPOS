/**
 * The scale HAL: transports, framing, and the stability rule.
 *
 * The stability rule is the part that decides money, so it is tested with no
 * hardware at all — `evaluateStability` is a pure function precisely so that
 * the thing which decides whether a field may be written can be proven
 * without a device.
 *
 * The transport tests use fake ports and a fake WebSocket rather than
 * mocking the module, so what is exercised is the real read loop, the real
 * frame splitter and the real listener wiring — the parts that break when a
 * USB cable is yanked mid-sale.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	checkTransportContract,
	createFramePump,
	splitFrames,
	TRANSPORT_CONTRACT,
} from "@/services/scale/transportCore"
import {
	availableTransports,
	createTransport,
	createWebSerialTransport,
	createWebSocketTransport,
	SUPPORTED_TRANSPORT_IDS,
} from "@/services/scale/transports"
import {
	createScaleService,
	evaluateStability,
	SCALE_STATUS,
} from "@/services/scale/scaleService"

describe("splitFrames", () => {
	it("splits on CRLF, CR and LF alike", () => {
		expect(splitFrames("", "1\r\n2\r3\n4\n").frames).toEqual([
			"1",
			"2",
			"3",
			"4",
		])
	})

	it("holds back an unterminated tail — it may still be incomplete", () => {
		// This is the load-bearing rule. A USB read boundary lands mid-line
		// constantly, and the bytes after the last terminator CANNOT be
		// declared a frame yet: `12.3` and the `45 kg` that follows it are one
		// weight, not two. Emitting the tail eagerly is how a scale reports
		// 12.3 kg of produce that weighed 12.345.
		const { frames, rest } = splitFrames("", "12.345 kg")
		expect(frames).toEqual([])
		expect(rest).toBe("12.345 kg")
	})

	it("keeps an incomplete frame for the next chunk", () => {
		const first = splitFrames("", "12.3")
		expect(first.frames).toEqual([])
		expect(first.rest).toBe("12.3")

		const second = splitFrames(first.rest, "45 kg\r\n")
		expect(second.frames).toEqual(["12.345 kg"])
	})

	it("discards a runaway buffer instead of growing without bound", () => {
		const { frames, rest } = splitFrames("", "x".repeat(9000))
		expect(frames).toEqual([])
		expect(rest).toBe("")
	})
})

describe("createFramePump", () => {
	it("delivers only terminated frames and unsubscribes cleanly", () => {
		const pump = createFramePump("test")
		const seen = []
		const off = pump.subscribe((frame) => seen.push(frame))

		pump.push("a\rb\nc\n")

		expect(seen).toEqual(["a", "b", "c"])

		off()
		pump.push("d\n")
		expect(seen).toEqual(
			["a", "b", "c"],
			"an unsubscribed listener kept receiving",
		)
	})

	it("joins a frame split across two pushes", () => {
		const pump = createFramePump("test")
		const seen = []
		pump.subscribe((f) => seen.push(f))

		pump.push("12.3")
		pump.push("45 kg\n")

		expect(seen).toEqual(["12.345 kg"])
	})

	it("drops partial state on reset so a reconnect starts clean", () => {
		const pump = createFramePump("test")
		const seen = []
		pump.subscribe((f) => seen.push(f))

		pump.push("12.3")
		pump.reset()
		pump.push("45 kg\n")

		// Without the reset the two halves would have joined into one bogus
		// frame — the classic "first reading after reconnect is wrong".
		expect(seen).toEqual(["45 kg"])
	})
	describe("web serial transport", () => {
		/** A port shaped like the real thing: open/close/readable. */
		function fakePort() {
			const encoder = new TextEncoder()
			let controller = null
			return {
				openedWith: null,
				closed: false,
				async open(options) {
					this.openedWith = options
				},
				readable: {
					getReader: () => ({
						read: () =>
							new Promise((resolve) => {
								controller = resolve
							}),
						cancel: async () => {},
						releaseLock: () => {},
					}),
				},
				async close() {
					this.closed = true
				},
				emit(text) {
					controller?.({ value: encoder.encode(text), done: false })
				},
			}
		}

		it("refuses to connect with no port instead of guessing one", async () => {
			const transport = createWebSerialTransport()
			await expect(transport.connect()).rejects.toThrow(/موافقة المستخدم/)
		})

		it("opens at the retail baud rate and streams frames", async () => {
			const port = fakePort()
			const transport = createWebSerialTransport({ port })
			const frames = []
			transport.subscribe((f) => frames.push(f))

			await transport.connect()
			expect(port.openedWith).toEqual({ baudRate: 9600 })

			port.emit("ST,GS,+  1.234kg\r\n")
			await Promise.resolve()

			expect(frames).toEqual(["ST,GS,+  1.234kg"])
			await transport.disconnect()
		})

		it("honours a configured baud rate", async () => {
			const port = fakePort()
			await createWebSerialTransport({ port, baudRate: 19200 }).connect()
			expect(port.openedWith).toEqual({ baudRate: 19200 })
		})

		it("reports serial support by probing, not by user agent", () => {
			expect(createWebSerialTransport().isSupported()).toBe(
				typeof navigator !== "undefined" && "serial" in navigator,
			)
		})
	})

	describe("websocket bridge transport", () => {
		const sockets = []

		beforeEach(() => {
			sockets.length = 0
			vi.stubGlobal(
				"WebSocket",
				class {
					constructor(url) {
						this.url = url
						this.readyState = 1
						this.listeners = {}
						sockets.push(this)
					}
					addEventListener(type, fn) {
						this.listeners[type] = fn
					}
					send() {}
					close() {}
				},
			)
		})

		afterEach(() => vi.unstubAllGlobals())

		it("refuses to connect with no configured address", async () => {
			// A shipped default would be a hardcoded host — forbidden by the
			// standalone-boot gate, and wrong for every store but one.
			const transport = createWebSocketTransport()
			await expect(transport.connect()).rejects.toThrow(/غير مضبوط/)
			expect(sockets).toHaveLength(0)
		})

		it("connects to the configured address and forwards frames", async () => {
			const transport = createWebSocketTransport({
				url: "ws://scale-bridge/scale",
			})
			const frames = []
			transport.subscribe((f) => frames.push(f))
			describe("evaluateStability — the rule that decides money", () => {
				it("trusts a frame that declares itself stable", () => {
					const v = evaluateStability({ ok: true, stable: true }, 1)
					expect(v.usable).toBe(true)
					expect(v.stability).toBe("reported")
				})

				it("refuses a frame that declares itself moving", () => {
					// The load is on the pan right now. This is the single most
					// important assertion in the file.
					const v = evaluateStability({ ok: true, stable: false }, 99)
					expect(v.usable).toBe(false)
					expect(v.reason).toBe("frame-unstable")
				})

				it("infers settling only for protocols that carry no stability flag", () => {
					const moving = { ok: true, stable: false, needsSettling: true }
					expect(evaluateStability(moving, 2).usable).toBe(false)
					expect(evaluateStability(moving, 3).usable).toBe(true)
					expect(evaluateStability(moving, 3).stability).toBe("inferred")
				})

				it("honours a custom settle threshold", () => {
					const moving = { ok: true, stable: false, needsSettling: true }
					expect(evaluateStability(moving, 5, 6).usable).toBe(false)
					expect(evaluateStability(moving, 6, 6).usable).toBe(true)
				})

				it("refuses an unparsed frame and a scale error", () => {
					expect(evaluateStability({ ok: false }, 9).usable).toBe(false)
					expect(evaluateStability({ ok: true, error: true }, 9).usable).toBe(
						false,
					)
				})
			})

			describe("scale service lifecycle", () => {
				afterEach(() => vi.unstubAllGlobals())

				it("starts idle with an Arabic status", () => {
					const service = createScaleService()
					expect(service.state.value.status).toBe(SCALE_STATUS.IDLE)
					expect(service.state.value.statusText).toMatch(/[\u0600-\u06FF]/)
				})

				it("reports an unsupported browser instead of throwing at the click", async () => {
					const service = createScaleService({ transportId: "web-serial" })
					vi.stubGlobal("navigator", {})

					await expect(service.connect()).rejects.toThrow()
					expect(service.state.value.status).toBe(SCALE_STATUS.UNSUPPORTED)
					expect(service.state.value.statusText).toMatch(/[\u0600-\u06FF]/)
				})

				it("settles a streaming scale only after identical repeats", async () => {
					// End-to-end through a real transport: a Zebra-style scale saying the
					// same weight three times must become writable, and not before.
					const frames = []
					const socket = {
						readyState: 1,
						listeners: {},
						addEventListener(t, fn) {
							this.listeners[t] = fn
						},
						send() {},
						close() {},
					}
					// A class, not a named function expression: the stub is instantiated by
					// the transport and must share ONE listeners object so the test can
					// fire `open`/`message` exactly as the browser would.
					vi.stubGlobal(
						"WebSocket",
						class {
							constructor() {
								this.url = ""
								this.readyState = 1
								this.listeners = socket
							}
							addEventListener(type, fn) {
								socket[type] = fn
							}
							send() {}
							close() {}
						},
					)
					vi.stubGlobal("navigator", {})

					const service = createScaleService({
						transportId: "websocket",
						bridgeUrl: "ws://scale-bridge/scale",
						settleReads: 3,
					})
					service.subscribe((r) => frames.push(r))

					const connecting = service.connect()
					socket.listeners.open()
					await connecting

					socket.listeners.message({ data: "2.000 kg\n" })
					socket.listeners.message({ data: "2.000 kg\n" })
					socket.listeners.message({ data: "2.000 kg\n" })

					expect(frames).toHaveLength(3)
					expect(frames[0].usable).toBe(false)
					expect(frames[1].usable).toBe(false)
					expect(frames[2].usable).toBe(true)
					expect(frames[2].weightKg).toBeCloseTo(2, 9)

					await service.disconnect()
				})

				it("refuses to write a settled NEGATIVE weight", () => {
					const service = createScaleService()
					// A negative weight means the tare went the wrong way. Writing it into
					// a quantity produces a negative line that later arithmetic turns into
					// a refund.
					expect(service.isWritable({ usable: true, negative: true })).toBe(
						false,
					)
					expect(service.isWritable({ usable: true, negative: false })).toBe(
						true,
					)
					expect(service.isWritable({ usable: false, negative: false })).toBe(
						false,
					)
				})
			})

			const connecting = transport.connect()
			sockets[0].listeners.open()
			await connecting

			expect(sockets[0].url).toBe("ws://scale-bridge/scale")

			sockets[0].listeners.message({ data: "12.345 kg\n" })
			expect(frames).toEqual(["12.345 kg"])
		})
	})

	describe("availableTransports", () => {
		it("labels every transport in Arabic for the settings screen", () => {
			for (const entry of availableTransports()) {
				expect(entry.label, entry.id).toMatch(/[\u0600-\u06FF]/)
				expect(typeof entry.supported, entry.id).toBe("boolean")
			}
		})
	})
})

describe("transport contract", () => {
	it("every registered transport fulfils it", () => {
		for (const id of SUPPORTED_TRANSPORT_IDS) {
			const transport = createTransport(id)
			const { ok, missing } = checkTransportContract(transport)
			expect(ok, `${id} missing ${missing.join(",")}`).toBe(true)
		}
	})

	it("rejects an unknown transport id in Arabic", () => {
		expect(() => createTransport("carrier-pigeon")).toThrow(/نقل غير معروف/)
	})

	it("names every member a transport forgot", () => {
		// A transport that forgets `connect` must fail here with the NAME of
		// what is missing, not surface later as "x is not a function" when a
		// cashier presses the button.
		const { ok, missing } = checkTransportContract({ id: "broken" })
		expect(ok).toBe(false)
		expect(missing).toEqual(TRANSPORT_CONTRACT.filter((k) => k !== "id"))
	})
})
