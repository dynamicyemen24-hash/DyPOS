import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import LoginErrorBanner from "@/components/common/LoginErrorBanner.vue"

describe("LoginErrorBanner", () => {
	it("renders nothing when error prop is empty", () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "" },
		})
		expect(wrapper.find(".dy-login__error").exists()).toBe(false)
	})

	it("renders error message when provided", () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." },
		})
		expect(wrapper.find(".dy-login__error").exists()).toBe(true)
		expect(wrapper.text()).toContain(
			"البريد الإلكتروني أو كلمة المرور غير صحيحة.",
		)
	})

	it("displays password recovery action button on wrong password error", async () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "كلمة المرور غير صحيحة" },
		})
		expect(wrapper.text()).toContain("استعادة / تغيير كلمة المرور")
		const btn = wrapper
			.findAll("button")
			.find((b) => b.text().includes("استعادة / تغيير كلمة المرور"))
		expect(btn).toBeDefined()
		await btn.trigger("click")
		expect(wrapper.emitted("forgot-password")).toBeTruthy()
	})

	it("displays registration action button on missing user or subscriber error", async () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "المستخدم غير موجود محليًا" },
		})
		expect(wrapper.text()).toContain("تسجيل مشترك جديد / إنشاء حساب")
		const btn = wrapper
			.findAll("button")
			.find((b) => b.text().includes("تسجيل مشترك جديد / إنشاء حساب"))
		expect(btn).toBeDefined()
		await btn.trigger("click")
		expect(wrapper.emitted("register")).toBeTruthy()
	})

	it("emits clear event when close button is clicked", async () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "حدث خطأ ما" },
		})
		const closeBtn = wrapper.find(".dy-login__error-close")
		expect(closeBtn.exists()).toBe(true)
		await closeBtn.trigger("click")
		expect(wrapper.emitted("clear")).toBeTruthy()
	})

	it("displays offline mode action button when isOfflineMode is true", async () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "لا يوجد اتصال", isOfflineMode: true },
		})
		expect(wrapper.text()).toContain("متابعة دون اتصال")
		const btn = wrapper
			.findAll("button")
			.find((b) => b.text().includes("متابعة دون اتصال"))
		expect(btn).toBeDefined()
		await btn.trigger("click")
		expect(wrapper.emitted("offline-login")).toBeTruthy()
	})

	it("displays backend unavailable action button when isBackendUnavailable is true", async () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "خدمة غير متاحة", isBackendUnavailable: true },
		})
		expect(wrapper.text()).toContain("إعادة محاولة الاتصال")
		const btn = wrapper
			.findAll("button")
			.find((b) => b.text().includes("إعادة محاولة الاتصال"))
		expect(btn).toBeDefined()
		await btn.trigger("click")
		expect(wrapper.emitted("retry-backend")).toBeTruthy()
	})

	it("displays quick fix buttons for credential errors", () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "كلمة المرور غير صحيحة" },
		})
		expect(wrapper.text()).toContain("تصحيح البريد الإلكتروني")
		expect(wrapper.text()).toContain("تصحيح كلمة المرور")
		expect(wrapper.text()).toContain("مسح والمحاولة مرة أخرى")
	})

	it("displays contextual error hint for wrong password", () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "كلمة المرور غير صحيحة" },
		})
		expect(wrapper.text()).toContain("تأكد من كتابة كلمة المرور بشكل صحيح")
	})

	it("displays contextual error hint for missing user", () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "المستخدم غير موجود محليًا" },
		})
		expect(wrapper.text()).toContain("تحقق من كتابة البريد الإلكتروني بشكل صحيح")
	})

	it("emits focus-email event when focus email button is clicked", async () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "كلمة المرور غير صحيحة" },
		})
		const btn = wrapper
			.findAll("button")
			.find((b) => b.text().includes("تصحيح البريد الإلكتروني"))
		expect(btn).toBeDefined()
		await btn.trigger("click")
		expect(wrapper.emitted("focus-email")).toBeTruthy()
	})

	it("emits focus-password event when focus password button is clicked", async () => {
		const wrapper = mount(LoginErrorBanner, {
			props: { error: "كلمة المرور غير صحيحة" },
		})
		const btn = wrapper
			.findAll("button")
			.find((b) => b.text().includes("تصحيح كلمة المرور"))
		expect(btn).toBeDefined()
		await btn.trigger("click")
		expect(wrapper.emitted("focus-password")).toBeTruthy()
	})
})
