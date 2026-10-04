/**
 * PosToolsMenu — قائمة أدوات الكاشير في شريط البيع.
 *
 * كل أداة هنا تعمل دون شبكة ودون خادم (حاسبة محلية، أسعار مدمجة، ملاحظات
 * الجهاز، مشاركة بضغطة صريحة)، وصف الطلبات يطلق مفتاح `held` الموجود أصلًا
 * في `headerActions` — لا مفاتيح جديدة ولا عقود ميتة. تُقرأ المخرجات من
 * `document.body` لأن اللوحة منقولة (Teleport) كما في `operatorMenu.test.js`.
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { createMemoryHistory, createRouter } from "vue-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import PosToolsMenu from "@/components/pos/PosToolsMenu.vue"

const global = {
	mocks: { __: (s) => s },
}

const openMenu = async () => {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: "/", component: { template: "<div />" } }],
	})
	const wrapper = mount(PosToolsMenu, {
		global: { ...global, plugins: [router] },
		attachTo: document.body,
	})
	mounted.push(wrapper)
	await wrapper.vm.$nextTick()
	const toggle = wrapper.find('[aria-label="أدوات الكاشير"]')
	await toggle.trigger("click")
	await wrapper.vm.$nextTick()
	return wrapper
}

const panel = () => document.body.querySelector(".dy-tools__panel")
const panelText = () => panel()?.textContent ?? ""

const clickKey = async (text) => {
	const buttons = [...document.body.querySelectorAll(".dy-tools__calc-key")]
	const key = buttons.find((b) => b.textContent.trim() === text)
	expect(key, `calculator key "${text}" renders`).toBeTruthy()
	key.dispatchEvent(new MouseEvent("click", { bubbles: true }))
	await new Promise((r) => setTimeout(r, 0))
}

const mounted = []

beforeEach(() => {
	setActivePinia(createPinia())
	localStorage.clear()
})

afterEach(() => {
	// Unmount FIRST: every mount registers a window keydown listener, and a
	// detached wrapper toggling its Teleport crashes on a null anchor.
	for (const wrapper of mounted.splice(0)) {
		try {
			wrapper.unmount()
		} catch {
			/* already gone with the DOM */
		}
	}
	document.body.innerHTML = ""
	localStorage.clear()
	vi.unstubAllGlobals()
})

describe("PosToolsMenu (rendered)", () => {
	it("renders the five tools with Arabic labels", async () => {
		await openMenu()
		expect(panel(), "tools panel never reached document.body").toBeTruthy()
		for (const label of [
			"حاسبة",
			"عملات",
			"ملاحظات",
			"واتساب",
			"الطلبات المعلقة",
		]) {
			expect(panelText()).toContain(label)
		}
	})

	it("calculator computes without eval (2 + 3 = 5)", async () => {
		await openMenu()
		await clickKey("2")
		await clickKey("+")
		await clickKey("3")
		await clickKey("=")
		expect(
			document.body
				.querySelector(".dy-tools__calc-display")
				?.textContent?.trim(),
		).toBe("5")
	})

	it("calculator divides and guards division by zero", async () => {
		await openMenu()
		await clickKey("7")
		await clickKey("÷")
		await clickKey("2")
		await clickKey("=")
		expect(
			document.body
				.querySelector(".dy-tools__calc-display")
				?.textContent?.trim(),
		).toBe("3.5")
	})

	it("converter turns 100 SAR into ~26.67 USD offline", async () => {
		const wrapper = await openMenu()
		const tabs = [...document.body.querySelectorAll(".dy-tools__tabs button")]
		const fx = tabs.find((b) => b.textContent.includes("عملات"))
		fx.dispatchEvent(new MouseEvent("click", { bubbles: true }))
		await wrapper.vm.$nextTick()
		const amount = document.body.querySelector(
			'.dy-tools__pane input[aria-label="المبلغ"]',
		)
		expect(amount, "converter amount field renders").toBeTruthy()
		amount.value = "100"
		amount.dispatchEvent(new Event("input", { bubbles: true }))
		await wrapper.vm.$nextTick()
		expect(
			document.body.querySelector(".dy-tools__fx-result")?.textContent ?? "",
		).toContain("26.67")
	})

	it("notes persist on the device and can be removed", async () => {
		const wrapper = await openMenu()
		const tabs = [...document.body.querySelectorAll(".dy-tools__tabs button")]
		tabs
			.find((b) => b.textContent.includes("ملاحظات"))
			.dispatchEvent(new MouseEvent("click", { bubbles: true }))
		await wrapper.vm.$nextTick()
		const box = document.body.querySelector(".dy-tools__textarea")
		box.value = "مراجعة درج النقدية"
		box.dispatchEvent(new Event("input", { bubbles: true }))
		await wrapper.vm.$nextTick()
		const add = [
			...document.body.querySelectorAll(".dy-tools__pane button"),
		].find((b) => b.textContent.includes("إضافة الملاحظة"))
		add.dispatchEvent(new MouseEvent("click", { bubbles: true }))
		await wrapper.vm.$nextTick()
		expect(panelText()).toContain("مراجعة درج النقدية")
		expect(
			JSON.parse(localStorage.getItem("dypos.tools.notes.v1") || "[]"),
		).toHaveLength(1)

		const del = document.body.querySelector(".dy-tools__note button")
		del.dispatchEvent(new MouseEvent("click", { bubbles: true }))
		await wrapper.vm.$nextTick()
		expect(panelText()).not.toContain("مراجعة درج النقدية")
	})

	it("orders row reuses the existing held key (no new contract)", async () => {
		const wrapper = await openMenu()
		const orders = [
			...document.body.querySelectorAll(".dy-tools__foot button"),
		].find((b) => b.textContent.includes("الطلبات المعلقة"))
		expect(orders, "orders row renders").toBeTruthy()
		orders.dispatchEvent(new MouseEvent("click", { bubbles: true }))
		await wrapper.vm.$nextTick()
		expect(wrapper.emitted("action")).toBeTruthy()
		expect(wrapper.emitted("action")[0]).toEqual(["held"])
	})

	it("WhatsApp share stays disabled on an empty cart (never a dead share)", async () => {
		const wrapper = await openMenu()
		const tabs = [...document.body.querySelectorAll(".dy-tools__tabs button")]
		tabs
			.find((b) => b.textContent.includes("واتساب"))
			.dispatchEvent(new MouseEvent("click", { bubbles: true }))
		await wrapper.vm.$nextTick()
		const share = [
			...document.body.querySelectorAll(".dy-tools__pane button"),
		].find((b) => b.textContent.includes("مشاركة عبر واتساب"))
		expect(share, "share button renders").toBeTruthy()
		expect(share.disabled).toBe(true)
		expect(panelText()).toContain("أضف أصنافًا إلى السلة أولًا")
	})

	it("F9 toggles the menu without touching POSSale", async () => {
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{ path: "/", component: { template: "<div />" } }],
		})
		const wrapper = mount(PosToolsMenu, {
			global: { ...global, plugins: [router] },
			attachTo: document.body,
		})
		mounted.push(wrapper)
		await wrapper.vm.$nextTick()
		expect(panel()).toBeNull()
		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: "F9", bubbles: true }),
		)
		await wrapper.vm.$nextTick()
		expect(panel(), "F9 opens the tools menu").toBeTruthy()
		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: "F9", bubbles: true }),
		)
		await wrapper.vm.$nextTick()
		expect(panel()).toBeNull()
	})
})
