import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toastMocks = vi.hoisted(() => ({ showWarning: vi.fn() }))

vi.mock("@/composables/useToast", () => ({
	useToast: () => toastMocks,
}))

import {
	classifyViewport,
	initDeviceAdaptation,
	isLowSpec,
} from "@/composables/useDevice"

const hardwareKeys = ["connection", "deviceMemory", "hardwareConcurrency"]
const hardwareDescriptors = new Map()

beforeEach(() => {
	toastMocks.showWarning.mockClear()
	window.__DYPOS_DEVICE_INIT__ = false
	localStorage.removeItem("DyPOS_link_consent")
	for (const key of hardwareKeys) {
		hardwareDescriptors.set(
			key,
			Object.getOwnPropertyDescriptor(navigator, key),
		)
	}
})

afterEach(() => {
	window.__DYPOS_DEVICE_INIT__ = false
	for (const key of hardwareKeys) {
		const descriptor = hardwareDescriptors.get(key)
		if (descriptor) Object.defineProperty(navigator, key, descriptor)
		else delete navigator[key]
	}
	hardwareDescriptors.clear()
})

describe("classifyViewport (pure)", () => {
	it("narrow screens are mobile", () => {
		expect(classifyViewport(375, 5)).toBe("mobile")
		expect(classifyViewport(639, 0)).toBe("mobile")
	})

	it("mid screens are tablet", () => {
		expect(classifyViewport(800, 0)).toBe("tablet")
		expect(classifyViewport(1023, 0)).toBe("tablet")
	})

	it("touch-first wide screens are tablet (iPad-as-Mac)", () => {
		expect(classifyViewport(1024, 5)).toBe("tablet")
		expect(classifyViewport(1180, 5)).toBe("tablet")
	})

	it("wide non-touch screens are desktop", () => {
		expect(classifyViewport(1280, 0)).toBe("desktop")
		expect(classifyViewport(1920, 0)).toBe("desktop")
		expect(classifyViewport(1920, 10)).toBe("desktop")
	})
})

describe("device adaptation feedback", () => {
	it("keeps low-resource adaptation quiet and local", async () => {
		Object.defineProperty(navigator, "connection", {
			configurable: true,
			value: { saveData: true, effectiveType: "4g" },
		})
		Object.defineProperty(navigator, "hardwareConcurrency", {
			configurable: true,
			value: 2,
		})
		Object.defineProperty(navigator, "deviceMemory", {
			configurable: true,
			value: 1,
		})
		const fetch = vi.fn()
		vi.stubGlobal("fetch", fetch)

		await initDeviceAdaptation({ notify: true })

		expect(fetch).not.toHaveBeenCalled()
		expect(toastMocks.showWarning).not.toHaveBeenCalled()
	})
})

describe("non-browser safety", () => {
	it("initDeviceAdaptation never throws outside a browser", async () => {
		const summary = await initDeviceAdaptation({ notify: true })
		expect(summary.deviceType).toBe("desktop")
		expect(Array.isArray(summary.warnings)).toBe(true)
	})

	it("isLowSpec is a boolean ref", () => {
		expect(typeof isLowSpec.value).toBe("boolean")
	})
})
