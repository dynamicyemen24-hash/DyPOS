/**
 * TranslatedHTML — the only place in the app where a string reaches `v-html`.
 *
 * Two defects, both invisible to a green suite because nothing mounted it:
 *
 *   1. It wrote `containerRef.value.innerHTML` ONCE inside `onMounted`, so a
 *      translated string that changed later (a language switch, settings text
 *      loaded after first paint) stayed frozen on screen — the UI showed the
 *      old words with no error anywhere. A computed re-renders on every prop
 *      change, which is the whole contract of the component.
 *   2. The root carried a bare `:` binding (`:="$attrs"`), a template with no
 *      expression — a half-finished edit left in the file.
 *
 * The sanitizing half is the security boundary: this is the ONLY v-html sink,
 * so a regression that stops calling DOMPurify is an XSS in a POS, not a lint
 * warning. The tests below assert both halves on the real component.
 */
import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import { nextTick } from "vue"

import TranslatedHTML from "@/components/common/TranslatedHTML.vue"

describe("TranslatedHTML", () => {
	it("renders the sanitized string", () => {
		const wrapper = mount(TranslatedHTML, {
			props: { inner: "<b>مرحبًا</b>" },
		})

		expect(wrapper.html()).toContain("<b>مرحبًا</b>")
	})

	it("strips script and event handlers (the XSS boundary)", () => {
		const wrapper = mount(TranslatedHTML, {
			props: {
				inner: '<b onclick="steal()">x</b><script>alert(1)<\/script>',
			},
		})

		const html = wrapper.html()
		expect(html).not.toContain("<script")
		expect(html).not.toContain("onclick")
		expect(html, "the safe markup around it survives").toContain("<b>")
	})

	it("re-renders when the string changes (the mounted() bug)", async () => {
		const wrapper = mount(TranslatedHTML, {
			props: { inner: "الإصدار الأول" },
		})

		expect(wrapper.text()).toContain("الإصدار الأول")

		await wrapper.setProps({ inner: "الإصدار الثاني" })
		await nextTick()

		expect(
			wrapper.text(),
			"a language switch left the previous text on screen",
		).toContain("الإصدار الثاني")
		expect(wrapper.text()).not.toContain("الإصدار الأول")
	})

	it("honours the tag prop and tolerates a missing string", () => {
		const wrapper = mount(TranslatedHTML, {
			props: { tag: "div" },
		})

		expect(wrapper.element.tagName).toBe("DIV")
	})
})
