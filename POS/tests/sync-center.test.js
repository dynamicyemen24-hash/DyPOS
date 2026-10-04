/**
 * Sync Center dialog regression: the reachable sync screen.
 *
 * A cashier on a fully-offline device opens the Sync Center from the header,
 * picks a runtime destination (branch/cloud), and syncs — no build-time URL,
 * no redeploy. Heavy layers (posSync store, dypos-ui, queue Dexie) are
 * stubbed; this pins the SCREEN contract: picker → save → sync-now args.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mount } from "@vue/test-utils"

vi.mock("dypos-ui", async (importOriginal) => {
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
import {
	LINK_MODES,
	LINK_REASONS,
	getAutomation,
	getLinkMode,
	setLinkMode,
} from "@/services/link-consent"
import {
	getServiceEndpoint,
	SERVICE_ENDPOINTS,
} from "@/services/runtime-endpoints"

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
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("{}", { status: 200 })),
	)
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

	describe("linkage & automation consent", () => {
		it("shows standalone posture with zero automation by default", async () => {
			const wrapper = openDialog()
			await wrapper.vm.$nextTick()
			await new Promise((r) => setTimeout(r, 30))
			expect(wrapper.text()).toContain("وضع الربط والأتمتة")
			expect(wrapper.text()).toContain("مستقل — صفر اتصال")
			expect(getLinkMode()).toBe(LINK_MODES.STANDALONE)
		})

		it("requires a separate explicit linkage grant before enabling automation", async () => {
			const wrapper = openDialog()
			await wrapper.vm.$nextTick()
			const toggle = wrapper
				.findAll("button")
				.filter((b) => b.text().includes("تفعيل المزامنة التلقائية"))
			expect(toggle.length).toBeGreaterThan(0)
			expect(toggle[0].attributes("disabled")).toBeDefined()
			const grant = wrapper
				.findAll("button")
				.find((button) => button.text().includes("السماح بالاتصال عند الطلب"))
			expect(grant).toBeTruthy()
			await grant.trigger("click")
			await wrapper.vm.$nextTick()
			expect(getLinkMode()).toBe(LINK_MODES.LINKED)
			const enabledToggle = wrapper
				.findAll("button")
				.find((button) => button.text().includes("تفعيل المزامنة التلقائية"))
			expect(enabledToggle.attributes("disabled")).toBeUndefined()
			await enabledToggle.trigger("click")
			await wrapper.vm.$nextTick()
			expect(getAutomation().mode).toBe("auto")
			expect(wrapper.text()).toContain("عند عودة الشبكة")
			expect(wrapper.text()).toContain("إيقاف الأتمتة")
		})

		it("a trigger select persists its mode (auto/ask/off)", async () => {
			const wrapper = openDialog()
			await wrapper.vm.$nextTick()
			const toggle = wrapper
				.findAll("button")
				.filter((b) => b.text().includes("تفعيل المزامنة التلقائية"))
			const grant = wrapper
				.findAll("button")
				.find((button) => button.text().includes("السماح بالاتصال عند الطلب"))
			await grant.trigger("click")
			await toggle[0].trigger("click")
			await wrapper.vm.$nextTick()
			const selects = wrapper.findAll("select")
			expect(selects.length).toBeGreaterThan(0)
			await selects[0].setValue("ask")
			await wrapper.vm.$nextTick()
			expect(Object.values(getAutomation())).toContain("ask")
		})

		it("unlink revokes linkage from an explicit tap", async () => {
			setLinkMode(LINK_MODES.LINKED, LINK_REASONS.SERVER_LOGIN)
			const wrapper = openDialog()
			await wrapper.vm.$nextTick()
			await new Promise((r) => setTimeout(r, 30))
			expect(wrapper.text()).toContain("مرتبط")
			const unlink = wrapper
				.findAll("button")
				.filter((b) => b.text().includes("قطع الربط"))
			expect(unlink.length).toBeGreaterThan(0)
			await unlink[0].trigger("click")
			await wrapper.vm.$nextTick()
			expect(getLinkMode()).toBe(LINK_MODES.STANDALONE)
			expect(wrapper.text()).toContain("مستقل — صفر اتصال")
		})
	})

	it("saves service URLs locally without probing them", async () => {
		const fetchSpy = vi.mocked(fetch)
		const wrapper = openDialog()
		await wrapper.vm.$nextTick()
		const apiInput = wrapper.findAll('input[type="url"]')[0]
		const platformInput = wrapper.findAll('input[type="url"]')[1]
		await apiInput.setValue("https://api.example.test/api")
		await platformInput.setValue("https://platform.example")
		const save = wrapper
			.findAll("button")
			.find((button) => button.text().includes("حفظ العناوين"))
		await save.trigger("click")
		await wrapper.vm.$nextTick()
		expect(getServiceEndpoint(SERVICE_ENDPOINTS.API)).toBe(
			"https://api.example.test/api",
		)
		expect(getServiceEndpoint(SERVICE_ENDPOINTS.PLATFORM)).toBe(
			"https://platform.example",
		)
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("tests the configured API only after the explicit test button is clicked", async () => {
		const fetchSpy = vi.mocked(fetch)
		const wrapper = openDialog()
		await wrapper.vm.$nextTick()
		expect(fetchSpy).not.toHaveBeenCalled()
		const testButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("اختبار API الآن"))
		await testButton.trigger("click")
		await wrapper.vm.$nextTick()
		expect(fetchSpy).toHaveBeenCalledTimes(1)
		expect(fetchSpy.mock.calls[0][0]).toBe("/api/health")
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
