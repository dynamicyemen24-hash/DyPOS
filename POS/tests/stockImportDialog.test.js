/**
 * Stock import/export wiring gate.
 *
 * `StockImportExportDialog` shipped a full import pipeline — `fileInput`,
 * `handleFileSelect`, `validateRows`, `dryRunImport`, `executeImport` — while
 * the template rendered NO `<input type="file">`. The import button called
 * `fileInput.value.click()` on a ref that never bound to an element, so the
 * click was a no-op: the dialog appeared to open a picker-less, silent flow and
 * the whole import surface was unreachable. Nothing failed, because a missing
 * element is not an error in Vue — `if (fileInput.value)` simply skipped.
 *
 * A second, independent defect: `StockCountInstructionsPage` used `<StepCard>`
 * and `<ShortcutKey>` without importing them. Neither is in the global
 * component registry (`main.js` registers only the dypos-ui kit), so Vue
 * compiled them to unknown elements and the steps + shortcuts sections — the
 * entire content of the default tab — rendered empty.
 *
 * Both are dead contracts that compile and mount green, so the gate asserts on
 * RENDERED OUTPUT: a real file input that fires `change`, a preview panel that
 * appears with rows, and resolved `StepCard`/`ShortcutKey` elements.
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

import * as DyPOSUI from "dypos-ui"
import { __ } from "@/utils/translation"

vi.mock("@/utils/restApi", () => ({
	apiGet: vi.fn(async () => []),
	apiPost: vi.fn(async () => ({ created: 1, updated: 0 })),
	apiPostRaw: vi.fn(async () => ({ dryRun: true })),
	apiDownload: vi.fn(async () => ({
		text: async () => "product_code,qty\nPROD-001,5",
	})),
}))

const StockImportExportDialog = (
	await import("@/components/sale/StockImportExportDialog.vue")
).default
const InstructionsPage = (
	await import("@/components/sale/StockCountInstructionsPage.vue")
).default

// `translationPlugin` registers `__` as a global property at boot, and
// `main.js` registers the dypos-ui kit as global components; the test
// environment never boots the app, so both have to be mounted explicitly.
const i18n = {
	mocks: { __ },
	components: { Button: DyPOSUI.Button, FeatherIcon: DyPOSUI.FeatherIcon },
}

const CSV = [
	"product_code,warehouse_id,qty,uom,currency,unit_cost",
	"PROD-001,W-01,10,PCS,SAR,25.50",
	"PROD-002,W-01,oops,PCS,SAR,1.00",
].join("\n")

/**
 * jsdom does not implement `Blob.text()`, so the component takes its
 * `FileReader` fallback — and FileReader completes on a macrotask, which
 * `flushPromises` does not drain. Poll instead of sleeping a fixed amount.
 */
async function settle(predicate, message) {
	for (let i = 0; i < 100; i++) {
		if (predicate()) return
		await new Promise((r) => setTimeout(r, 10))
		await nextTick()
	}
	throw new Error(message)
}

const mountDialog = () => {
	setActivePinia(createPinia())
	return mount(StockImportExportDialog, {
		props: { modelValue: true, warehouses: [], categories: [] },
		global: {
			...i18n,
			// The two real child pages are out of scope here; the dialog's own
			// file input + preview panel live in its template, not theirs.
			stubs: {
				StockCountInstructionsPage: true,
				StockCountItemsTablePage: true,
			},
		},
		attachTo: document.body,
	})
}

describe("stock import dialog — file input wiring", () => {
	let wrapper

	beforeEach(() => {
		document.body.innerHTML = ""
		wrapper = mountDialog()
	})

	it("renders a real <input type=file> the import button can click", async () => {
		const input = wrapper.find('[data-testid="stock-import-file"]')
		expect(input.exists(), "the dialog never rendered a file input").toBe(true)
		expect(input.attributes("type")).toBe("file")

		// The contract under test: the import button must drive THAT input.
		const click = vi.spyOn(input.element, "click")
		await wrapper.vm.handleImportClick()
		expect(click).toHaveBeenCalledTimes(1)
	})

	it("parses a selected CSV into a preview panel with per-row validity", async () => {
		const input = wrapper.find('[data-testid="stock-import-file"]')
		const file = new File([CSV], "count.csv", { type: "text/csv" })

		Object.defineProperty(input.element, "files", {
			value: [file],
			configurable: true,
		})
		await input.trigger("change")
		await settle(
			() => wrapper.vm.previewData !== null,
			"the selected file never produced a preview",
		)

		const preview = wrapper.find('[data-testid="stock-import-preview"]')
		expect(preview.exists(), "previewData had no UI at all").toBe(true)

		const text = preview.text()
		expect(text, "the valid row is counted").toContain("1")
		expect(text, "the invalid row is counted").toContain("1")
		expect(text, "the bad qty is reported, not silently dropped").toContain(
			"qty must be a number",
		)

		// Commit actions are reachable from the preview.
		expect(preview.find("button").exists(), "preview renders no actions").toBe(
			true,
		)
	})

	it("hides the preview again on clear (cancel is not a dead button)", async () => {
		const input = wrapper.find('[data-testid="stock-import-file"]')
		Object.defineProperty(input.element, "files", {
			value: [new File([CSV], "count.csv", { type: "text/csv" })],
			configurable: true,
		})
		await input.trigger("change")
		await settle(
			() => wrapper.vm.previewData !== null,
			"the selected file never produced a preview",
		)

		expect(wrapper.find('[data-testid="stock-import-preview"]').exists()).toBe(
			true,
		)

		await wrapper.vm.clearPreview()
		await nextTick()
		expect(
			wrapper.find('[data-testid="stock-import-preview"]').exists(),
			"cancel left the panel on screen",
		).toBe(false)
	})
})

describe("stock count instructions page — component resolution", () => {
	const mountPage = () => {
		setActivePinia(createPinia())
		return mount(InstructionsPage, {
			props: {
				warehouses: [],
				currencies: [{ code: "SAR", symbol: "ر.س", isBase: true }],
				uoms: [{ code: "PCS", name: "قطعة" }],
				selectedCurrency: "SAR",
				selectedUom: "PCS",
			},
			global: i18n,
		})
	}

	it("resolves <StepCard> instead of rendering an unknown element", () => {
		const wrapper = mountPage()
		const stepCards = wrapper.findAll(".step-card")
		expect(
			stepCards.length,
			"StepCard was never imported — the steps section renders empty",
		).toBeGreaterThan(0)
		// The step title is written directly on the component, so an unresolved
		// `<StepCard>` leaves no trace of it in the DOM at all.
		expect(wrapper.text()).toContain("التحضير قبل الجرد")
	})

	it("resolves <ShortcutKey> instead of rendering an unknown element", () => {
		const wrapper = mountPage()
		const shortcutKeys = wrapper.findAll(".shortcut-key")
		expect(
			shortcutKeys.length,
			"ShortcutKey was never imported — the shortcuts section renders empty",
		).toBeGreaterThan(0)
		expect(wrapper.find(".shortcut-key kbd").text()).toBe("Ctrl+N")
	})
})
