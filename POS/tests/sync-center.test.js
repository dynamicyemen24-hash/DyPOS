/**
 * Sync Center dialog regression: the reachable sync screen.
 *
 * A cashier on a fully-offline device opens the Sync Center from the header,
 * picks a runtime destination (branch/cloud), and syncs — no build-time URL,
 * no redeploy. Heavy layers (posSync store, frappe-ui, queue Dexie) are
 * stubbed; this pins the SCREEN contract: picker → save → sync-now args.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mount } from "@vue/test-utils"

vi.mock("frappe-ui", async (importOriginal) => {
	const { h } = await import("vue")
	return {
		Dialog: {
			name: "Dialog",
			props: ["modelValue", "options"],
			setup(_, { slots }) {
				return () => h("div", { class: "dlg" }, slots["body-content"]?.())
			},
		},
		Button: {
			name: "Button",
			props: ["loading", "variant"],
			setup(_, { slots }) {
				return () => h("button", { class: "btn" }, slots.default?.())
			},
		},
	}
})

const syncPendingTo = vi.fn(async () => ({
	success: 1,
	failed: 0,
	skipped: 0,
	errors: [],
}))

vi.mock("@/stores/posSync", () => ({
	usePOSSyncStore: () => ({
		isOffline: false,
		isSyncing: false,
		syncPendingTo,
	}),
}))

// The dialog reads the queue through the real Dexie module, which hangs
// under jsdom (no IndexedDB). The queue layer itself is covered by
// sync-queue-destinations.test.js with a fake table.
vi.mock("@/utils/offline/sync", () => ({
	getOfflineInvoices: vi.fn(async () => []),
}))

vi.mock("@/utils/offline/sync", () => ({
	getOfflineInvoices: vi.fn(async () => []),
}))

import SyncCenterDialog from "@/components/sale/SyncCenterDialog.vue"
import { getOfflineInvoices } from "@/utils/offline/sync"
import {
	saveDestination,
	setDestinationToken,
} from "@/services/sync-destinations"

const i18n = {
	install(app) {
		app.config.globalProperties.__ = (s) => s
		// Like translationPlugin: script-side __() resolves via window.
		try {
			window.__ = (s) => s
		} catch {
			/* ignore */
		}
	},
}

function openDialog(props = {}) {
	return mount(SyncCenterDialog, {
		props: { modelValue: true, ...props },
		global: { plugins: [i18n] },
	})
}

beforeEach(() => {
	localStorage.clear()
	syncPendingTo.mockClear()
	vi.mocked(getOfflineInvoices).mockReset()
	vi.mocked(getOfflineInvoices).mockResolvedValue([])
})

describe("SyncCenterDialog", () => {
	it("lists the built-in local destination and empty pending", async () => {
		const wrapper = openDialog()
		await wrapper.vm.$nextTick()
		await new Promise((r) => setTimeout(r, 50))
		expect(wrapper.text()).toContain("الخادم الحالي")
		expect(wrapper.text()).toContain("لا فواتير معلقة لهذه الوجهة")
	})

	it("saves a branch, selects it, and syncs to it with its token", async () => {
		const created = saveDestination({
			name: "فرع العليا",
			kind: "branch",
			baseUrl: "http://10.0.0.5:3001",
			username: "cashier",
		})
		expect(created.ok).toBe(true)
		setDestinationToken(created.destination.id, "tok")

		const wrapper = openDialog()
		await wrapper.vm.$nextTick()
		await new Promise((r) => setTimeout(r, 30))
		expect(wrapper.text()).toContain("فرع العليا")

		// Inject one pending invoice for the branch BEFORE selecting it,
		// so the selection reload picks it up, then sync now.
		vi.mocked(getOfflineInvoices).mockResolvedValueOnce([
			{
				id: 3,
				timestamp: Date.now(),
				data: { customer: "عميل" },
				syncedTo: {},
			},
		])
		// Select the branch card (second destination button).
		const cards = wrapper.findAll("button").filter((b) => {
			const t = b.text()
			return t.includes("فرع العليا")
		})
		expect(cards.length).toBeGreaterThan(0)
		await cards[0].trigger("click")
		await wrapper.vm.$nextTick()
		await new Promise((r) => setTimeout(r, 30))

		const syncBtns = wrapper
			.findAll("button")
			.filter((b) => b.text().includes("مزامنة الآن"))
		expect(syncBtns.length).toBeGreaterThan(0)
		await syncBtns[0].trigger("click")
		await wrapper.vm.$nextTick()
		await new Promise((r) => setTimeout(r, 50))

		expect(syncPendingTo).toHaveBeenCalledTimes(1)
		const [dest, token] = syncPendingTo.mock.calls[0]
		expect(dest.baseUrl).toBe("http://10.0.0.5:3001")
		expect(token).toBe("tok")
	})

	it("form validates before saving (no junk destinations)", async () => {
		const wrapper = openDialog()
		await wrapper.vm.$nextTick()
		const addBtns = wrapper
			.findAll("button")
			.filter((b) => b.text().includes("وجهة جديدة"))
		await addBtns[0].trigger("click")
		await wrapper.vm.$nextTick()

		const saveBtns = wrapper
			.findAll("button")
			.filter((b) => b.text().trim() === "حفظ")
		await saveBtns[0].trigger("click")
		await wrapper.vm.$nextTick()
		// Empty name + empty URL → validation error, nothing persisted.
		expect(
			JSON.parse(localStorage.getItem("DyPOS_sync_destinations") || "[]"),
		).toEqual([])
	})
})
