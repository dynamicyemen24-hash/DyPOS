/**
 * Barcode scanner wiring gate.
 *
 * The scanner shipped with a dead `window.Instascan` global (invariant 9: no
 * desk globals) and a dependency, `instascan@3.2.1`, that DOES NOT EXIST on npm
 * — `npm ci` in CI died with ETARGET before a single test ran, so the release
 * could not ship at all. Nothing local caught it because `node_modules` was
 * already populated and no test mounts the scanner branch.
 *
 * Two further dead contracts sat behind the same door, and both compile green:
 *
 *   - `POSSale.scanBarcode()` read `this.$root.$emit(...)` inside `<script
 *     setup>`, where `this` is `undefined` — the button would have thrown
 *     `TypeError: Cannot read properties of undefined (reading '$root')`.
 *   - Nothing anywhere listened for `start-scan`, and the search bar rendered
 *     only the scanner's STOP control, so the whole barcode branch could never
 *     be opened.
 *
 * So the gate mounts the scanner and asserts on what a cashier would see: an
 * engine without `BarcodeDetector` reports itself in Arabic instead of showing a
 * black box, a granted camera reaches `scanning`, a detected code is emitted as
 * a STRING (a `{code, format}` object stringifies to "[object Object]" and every
 * lookup would miss), and the tracks are stopped on unmount.
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const BarcodeScanner = (await import("@/components/BarcodeScanner.vue")).default

/** A camera that answers, so the "supported engine" path can be exercised. */
const grantCamera = () => {
	const track = { stop: vi.fn() }
	const stream = { getTracks: () => [track] }
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: { getUserMedia: vi.fn(async () => stream) },
	})
	return { track, stream }
}

function installDetector(detect) {
	class FakeDetector {
		constructor(options) {
			FakeDetector.lastOptions = options
		}

		detect() {
			return detect()
		}
	}
	window.BarcodeDetector = FakeDetector
	return FakeDetector
}

/**
 * Remove the doubles without `delete` (a V8 deopt biome's noDelete flags).
 *
 * `configurable: true` is what lets a later `installDetector` redefine the
 * property — and `writable: true` is what lets the plain `window.x = Fake`
 * assignment succeed. Leaving the default `writable: false` makes every
 * subsequent test in this file throw "Cannot assign to read only property".
 */
function removeDetector() {
	Object.defineProperty(window, "BarcodeDetector", {
		configurable: true,
		writable: true,
		value: undefined,
	})
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		writable: true,
		value: undefined,
	})
}

/** jsdom ships no rAF-callback scheduling; drive the pump deterministically. */
let frames = []
beforeEach(() => {
	frames = []
	vi.stubGlobal("requestAnimationFrame", (cb) => {
		frames.push(cb)
		return frames.length
	})
	vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
	vi.unstubAllGlobals()
	removeDetector()
})

const readScanner = async () => {
	const { readFileSync } = await import("node:fs")
	const { resolve } = await import("node:path")
	// NOT `import.meta.url`: vitest serves modules over an http-ish URL, so
	// `readFileSync(new URL(..., import.meta.url))` throws
	// "The URL must be of scheme file". The runner's cwd is POS/, which is
	// where vitest.config.js anchors the project root.
	return readFileSync(
		resolve(process.cwd(), "src/components/BarcodeScanner.vue"),
		"utf8",
	)
}
describe("BarcodeScanner — no library, no global", () => {
	it("declares no instascan dependency (the version on npm does not exist)", async () => {
		const { default: manifest } = await import("../package.json", {
			with: { type: "json" },
		})
		expect(manifest.dependencies?.instascan).toBeUndefined()
	})

	it("reads no window.Instascan anywhere in shipped code", async () => {
		const src = await readScanner()
		// Strip comments first: the header explains what this file USED to read,
		// so a raw scan matches its own explanation. The claim is about CODE —
		// exactly the gap the old "grep finds it" style of check left open.
		const code = src
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/^\s*\/\/.*$/gm, "")
		expect(code).not.toMatch(/Instascan/)
	})
})

describe("BarcodeScanner — honest degradation", () => {
	it("says so in Arabic when the engine has no BarcodeDetector", async () => {
		removeDetector()
		const wrapper = mount(BarcodeScanner, {
			global: { stubs: { ActionButton: true } },
		})
		await vi.waitFor(() =>
			expect(
				wrapper.get('[data-testid="scan-status"]').attributes("data-state"),
			).toBe("unsupported"),
		)
		// A recovery, not just an error: the cashier is told what to do.
		expect(wrapper.get('[data-testid="scan-status"]').text()).toMatch(
			/خانة البحث/,
		)
		expect(wrapper.find("video").exists()).toBe(false)
		wrapper.unmount()
	})

	it("reports a refused camera as denied and keeps the manual path", async () => {
		installDetector(async () => [])
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: {
				getUserMedia: vi.fn(async () => {
					throw new Error("NotAllowedError")
				}),
			},
		})
		const wrapper = mount(BarcodeScanner, {
			global: { stubs: { ActionButton: true } },
		})
		await vi.waitFor(() =>
			expect(
				wrapper.get('[data-testid="scan-status"]').attributes("data-state"),
			).toBe("denied"),
		)
		expect(wrapper.get('[data-testid="scan-status"]').text()).toMatch(
			/خانة البحث/,
		)
		wrapper.unmount()
	})
})

describe("BarcodeScanner — a granted camera really scans", () => {
	it("reaches scanning and asks only for readable retail formats", async () => {
		grantCamera()
		const Fake = installDetector(async () => [])
		const wrapper = mount(BarcodeScanner, {
			global: { stubs: { ActionButton: true } },
		})
		await vi.waitFor(() =>
			expect(
				wrapper.get('[data-testid="scan-status"]').attributes("data-state"),
			).toBe("scanning"),
		)
		expect(Fake.lastOptions.formats).toContain("ean_13")
		expect(wrapper.find("video").exists()).toBe(true)
		wrapper.unmount()
	})

	it("emits the code as a string, not the {code, format} object", async () => {
		grantCamera()
		installDetector(async () => [
			{ rawValue: "6281000010019", format: "ean_13" },
		])

		const wrapper = mount(BarcodeScanner, {
			global: { stubs: { ActionButton: true } },
			attachTo: document.body,
		})
		await vi.waitFor(() =>
			expect(
				wrapper.get('[data-testid="scan-status"]').attributes("data-state"),
			).toBe("scanning"),
		)

		// Run one frame: the pump is what turns a detected code into a result.
		const pending = frames.splice(0)
		for (const frame of pending) await frame()
		await vi.waitFor(() =>
			expect(wrapper.find('[data-testid="scan-code"]').exists()).toBe(true),
		)

		expect(wrapper.get('[data-testid="scan-code"]').text()).toBe(
			"6281000010019",
		)

		await wrapper.get('[data-testid="scan-confirm"]').trigger("click")
		const emitted = wrapper.emitted("scan-result")
		expect(emitted).toBeTruthy()
		expect(emitted[0]).toEqual(["6281000010019"])
		expect(typeof emitted[0][0]).toBe("string")

		wrapper.unmount()
	})

	it("stops the camera tracks on unmount — a till left open must not hold the camera", async () => {
		const { track } = grantCamera()
		installDetector(async () => [])
		const wrapper = mount(BarcodeScanner, {
			global: { stubs: { ActionButton: true } },
		})
		await vi.waitFor(() =>
			expect(
				wrapper.get('[data-testid="scan-status"]').attributes("data-state"),
			).toBe("scanning"),
		)
		expect(track.stop).not.toHaveBeenCalled()
		wrapper.unmount()
		expect(track.stop).toHaveBeenCalled()
	})
})

describe("useBarcodeScanner — the page flow that used to throw", () => {
	it("opens the scanner through the template ref, never a phantom event", async () => {
		const { useBarcodeScanner } = await import(
			"@/composables/useBarcodeScanner"
		)
		const startScan = vi.fn(async () => "scanning")
		const s = useBarcodeScanner()
		s.barcodeScanner.value = { startScan, stopScan: vi.fn() }

		await s.open()

		expect(startScan).toHaveBeenCalledTimes(1)
		expect(s.scanning.value).toBe(true)
		expect(s.showScanner.value).toBe(true)
	})

	it("notifies and releases both flags when the engine cannot scan", async () => {
		const { useBarcodeScanner } = await import(
			"@/composables/useBarcodeScanner"
		)
		const notify = vi.fn()
		const s = useBarcodeScanner({ notify })
		s.barcodeScanner.value = { startScan: vi.fn(async () => "unsupported") }

		await s.open()

		// Arabic, and it names the recovery — never a silent failure.
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("خانة البحث"),
			"warning",
		)
		expect(s.scanning.value).toBe(false)
		expect(s.showScanner.value).toBe(false)
	})

	it("releases the scanning flag when the ref never binds", async () => {
		const { useBarcodeScanner } = await import(
			"@/composables/useBarcodeScanner"
		)
		const s = useBarcodeScanner()
		await s.open()
		// No spinner left spinning forever over a missing component.
		expect(s.scanning.value).toBe(false)
	})

	it("close() hides the scanner and stops its stream", async () => {
		const { useBarcodeScanner } = await import(
			"@/composables/useBarcodeScanner"
		)
		const stopScan = vi.fn()
		const s = useBarcodeScanner()
		s.barcodeScanner.value = { stopScan }
		s.showScanner.value = true
		s.scanning.value = true

		s.close()

		expect(stopScan).toHaveBeenCalled()
		expect(s.showScanner.value).toBe(false)
		expect(s.scanning.value).toBe(false)
	})

	it("the page no longer reads `this.$root` — it threw on every tap", async () => {
		const { readFileSync } = await import("node:fs")
		const { resolve } = await import("node:path")
		const page = readFileSync(
			resolve(process.cwd(), "src/pages/POSSale.vue"),
			"utf8",
		)
		const code = page
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/^\s*\/\/.*$/gm, "")
		expect(code).not.toMatch(/\$root|start-scan/)
	})
})

describe("BarcodeScanner — no dead emit contract", () => {
	it("declares only the events the page actually binds", async () => {
		const src = await readScanner()
		const code = src
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/^\s*\/\/.*$/gm, "")
		const declared = code.match(/defineEmits\(\[([^\]]*)\]/)?.[1] ?? ""
		expect(declared).not.toMatch(/manual-input-request|scan-state/)
		// And the page binds exactly what the scanner declares — a mismatch here
		// is the dead-contract shape in its purest form.
		const { readFileSync } = await import("node:fs")
		const { resolve } = await import("node:path")
		const page = readFileSync(
			resolve(process.cwd(), "src/pages/POSSale.vue"),
			"utf8",
		)
		expect(page).toMatch(/@scan-result="onBarcodeScan"/)
	})
})
