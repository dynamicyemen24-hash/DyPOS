import { describe, expect, it } from "vitest"

import {
	classifyViewport,
	initDeviceAdaptation,
	isLowSpec,
} from "@/composables/useDevice"

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
