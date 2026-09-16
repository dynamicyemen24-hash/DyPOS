import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const logCalls = []
vi.mock("@/utils/logger", () => ({
	logger: {
		create: () =>
			new Proxy(
				{},
				{
					get: (_t, prop) => (msg, meta) => {
						logCalls.push({ prop, msg, meta })
					},
				},
			),
	},
}))

import {
	installGlobalErrorBoundary,
	reportError,
	signatureOf,
	shouldThrottle,
} from "@/utils/errorBoundary"

describe("signatureOf", () => {
	it("falls back for nullish values", () => {
		expect(signatureOf(null)).toBe("unknown")
		expect(signatureOf(undefined)).toBe("unknown")
		expect(signatureOf(null, "custom")).toBe("custom")
	})

	it("signs strings and Error instances", () => {
		expect(signatureOf("boom")).toBe("str:boom")
		expect(signatureOf(new Error("broken"))).toBe("Error:broken")
		expect(signatureOf(new TypeError("oops"))).toBe("TypeError:oops")
	})

	it("signs plain objects via message fields", () => {
		expect(signatureOf({ message: "offline" })).toBe("obj:offline")
		expect(signatureOf({ _server_messages: "insufficient stock" })).toBe(
			"obj:insufficient stock",
		)
	})

	it("never throws on non-signable values", () => {
		expect(signatureOf(42)).toBe("unknown")
		expect(signatureOf(Symbol("x"))).toBe("unknown")
	})
})

describe("shouldThrottle", () => {
	let now = 0
	const realDateNow = Date.now

	beforeEach(() => {
		now = 1_000_000
		Date.now = () => now
	})

	afterEach(() => {
		Date.now = realDateNow
	})

	it("allows the first occurrence", () => {
		expect(shouldThrottle("same")).toBe(false)
	})

	it("suppresses identical signatures inside the window", () => {
		shouldThrottle("same")
		expect(shouldThrottle("same")).toBe(true)
	})

	it("allows again after the window expires", () => {
		shouldThrottle("same")
		now += 6000
		expect(shouldThrottle("same")).toBe(false)
	})

	it("does not suppress different signatures", () => {
		shouldThrottle("one")
		expect(shouldThrottle("two")).toBe(false)
	})
})

describe("reportError", () => {
	beforeEach(() => {
		logCalls.length = 0
	})

	it("logs an Error with a boundary prefix and signature", () => {
		const logged = reportError(new Error("disk full"))
		expect(logged).toBe(true)
		expect(logCalls).toHaveLength(1)
		expect(logCalls[0].prop).toBe("error")
		expect(logCalls[0].msg).toContain("[Boundary] disk full")
		expect(logCalls[0].meta.signature).toBe("Error:disk full")
	})

	it("attaches extra context to the entry", () => {
		reportError("xhr failed", { handler: "onerror", origin: "app.js:7" })
		expect(logCalls[0].meta.handler).toBe("onerror")
		expect(logCalls[0].meta.origin).toBe("app.js:7")
	})

	it("returns false and skips logging for duplicate floods", () => {
		reportError(new Error("repeat"))
		const logged = reportError(new Error("repeat"))
		expect(logged).toBe(false)
		expect(logCalls).toHaveLength(1)
	})

	it("never throws for a truthy non-error guard", () => {
		expect(reportError("plain string")).toBe(true)
	})
})

describe("installGlobalErrorBoundary", () => {
	const originalWindow = globalThis.window

	afterEach(() => {
		if (originalWindow === undefined) {
			// biome-ignore lint/performance/noDelete: محاكاة غياب النافذة يتطلب حذف الخاصية فعليًا
			delete globalThis.window
		} else {
			globalThis.window = originalWindow
		}
	})

	it("is a no-op when the window is unavailable", () => {
		// biome-ignore lint/performance/noDelete: محاكاة غياب النافذة يتطلب حذف الخاصية فعليًا
		delete globalThis.window
		expect(installGlobalErrorBoundary()).toBeInstanceOf(Function)
	})

	it("wires and unwires both handlers when a window exists", () => {
		const listeners = new Map()
		globalThis.window = {
			addEventListener: (name, fn) => listeners.set(name, fn),
			removeEventListener: (name) => listeners.delete(name),
		}

		const cleanup = installGlobalErrorBoundary()
		expect(listeners.has("error")).toBe(true)
		expect(listeners.has("unhandledrejection")).toBe(true)

		cleanup()
		expect(listeners.has("error")).toBe(false)
		expect(listeners.has("unhandledrejection")).toBe(false)
	})
})
