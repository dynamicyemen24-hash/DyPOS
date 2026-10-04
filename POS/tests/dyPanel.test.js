/**
 * DyPanel — the login screen's one surface.
 *
 * ## Why this gate exists
 *
 * The screen used to carry its layout in three `grid-template-areas`
 * vocabularies at once (the root, the masthead, and ad-hoc rules per block),
 * and `.dy-login__context-item` was declared TWICE with conflicting rules — so
 * the winner depended on source order, which is the exact defect class
 * AGENTS.md records for the legacy design-token layer.
 *
 * A panel component that merely exists would not have prevented that. These
 * tests mount it and assert on rendered structure.
 *
 * ## Accessibility is part of the contract, not a footnote
 *
 * A visible `title` MUST be the accessible name (`aria-labelledby`): a panel
 * named only by `aria-label` while its visible text says something else is the
 * WCAG "label in name" failure, and on a login screen the panel names are the
 * only thing telling a screen-reader user which block they are in.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { mount } from "@vue/test-utils"

import DyPanel from "@/components/common/DyPanel.vue"

const POS = resolve(process.cwd())

describe("DyPanel renders a real surface", () => {
	it("renders its title as a heading and its body", () => {
		const wrapper = mount(DyPanel, {
			props: { title: "حالة الجهاز" },
			slots: { default: "<p>محتوى</p>" },
		})
		expect(wrapper.find("h2").text()).toBe("حالة الجهاز")
		expect(wrapper.find(".dy-panel__body").text()).toContain("محتوى")
	})

	it("names the region by its VISIBLE title, not by aria-label", () => {
		const wrapper = mount(DyPanel, {
			props: { title: "حالة الجهاز", ariaLabel: "اسم آخر" },
		})
		const region = wrapper.find("section")
		const labelledBy = region.attributes("aria-labelledby")
		expect(labelledBy).toBeTruthy()
		// The name the assistive tech reads must BE the visible heading.
		expect(wrapper.find(`#${labelledBy}`).text()).toBe("حالة الجهاز")
		// Passing both would otherwise produce a name contradicting the text.
		expect(region.attributes("aria-label")).toBeUndefined()
	})

	it("falls back to aria-label only when there is no visible title", () => {
		const wrapper = mount(DyPanel, { props: { ariaLabel: "لوحة التشغيل" } })
		expect(wrapper.find("section").attributes("aria-label")).toBe(
			"لوحة التشغيل",
		)
		expect(wrapper.find("h2").exists()).toBe(false)
	})

	it("gives each panel a distinct heading id", () => {
		// Two panels sharing an id make `aria-labelledby` point at the wrong
		// title — and the failure is silent. Both panels are mounted inside ONE
		// parent so the app instance (and therefore `useId`'s counter) is shared,
		// which is exactly the production situation this guards.
		const host = mount({
			components: { DyPanel },
			template: `
				<div>
					<DyPanel title="أ" />
					<DyPanel title="ب" />
				</div>
			`,
		})

		const ids = host.findAll("h2").map((h) => h.attributes("id"))
		expect(ids).toHaveLength(2)
		expect(ids[0]).toBeTruthy()
		expect(ids[0]).not.toBe(ids[1])

		// Each region must point at ITS OWN heading.
		const labelled = host
			.findAll("section")
			.map((s) => s.attributes("aria-labelledby"))
		expect(labelled.sort()).toEqual(ids.sort())
	})
})
/**
 * Read the panel's root class list.
 *
 * Both obvious helpers are wrong here, and both were tried:
 *
 *  - `wrapper.classes()` returns [] because the root class binding compiles to
 *    an ARRAY (`:class="[…]"`), which that helper does not normalise.
 *  - `wrapper.attributes()` reads the FIRST node, which is the leading HTML
 *    comment in the template — hence the empty string, and a `toContain`
 *    failing on `undefined` rather than on a missing class.
 *
 * So the root element is queried by its own stable class. A green test is then
 * evidence about the DOM rather than about a helper.
 */
const classesOf = (wrapper) =>
	wrapper.find(".dy-panel").attributes("class") || ""

describe("DyPanel is flexible without a per-case stylesheet", () => {
	it("exposes span as a modifier, so a grid needs no new area name", () => {
		expect(classesOf(mount(DyPanel, { props: { span: "half" } }))).toContain(
			"dy-panel--half",
		)
		expect(classesOf(mount(DyPanel, { props: { span: "full" } }))).toContain(
			"dy-panel--full",
		)
	})

	it("applies tone, flush and raised as flags", () => {
		const classes = classesOf(
			mount(DyPanel, { props: { tone: "glass", flush: true, raised: false } }),
		)
		expect(classes).toContain("dy-panel--glass")
		expect(classes).toContain("dy-panel--flush")
		expect(classes).not.toContain("dy-panel--raised")
	})

	it("keeps an unknown span as its own class rather than silently falling back", () => {
		// Vue only warns on a validator miss, and still renders the prop. A
		// silent fallback to `full` would place a panel at the wrong width with
		// nothing logged, so the typo stays visible in the DOM.
		expect(classesOf(mount(DyPanel, { props: { span: "quarter" } }))).toContain(
			"dy-panel--quarter",
		)
	})

	it("orders panels without reordering the DOM", () => {
		const style = mount(DyPanel, { props: { order: 3 } })
			.find(".dy-panel")
			.attributes("style")
		expect(style).toContain("order: 3")
	})

	it("renders actions and footer slots only when provided", () => {
		const bare = mount(DyPanel)
		expect(bare.find(".dy-panel__actions").exists()).toBe(false)
		expect(bare.find(".dy-panel__foot").exists()).toBe(false)

		const full = mount(DyPanel, {
			slots: { actions: "<b>فحص</b>", footer: "<small>تذييل</small>" },
		})
		expect(full.find(".dy-panel__actions").text()).toBe("فحص")
		expect(full.find(".dy-panel__foot").text()).toBe("تذييل")
	})

	it("shows the actions bar even with NO title", () => {
		// The header used to be gated on `title || $slots.header`, so an
		// actions slot without a heading rendered NOTHING — a button the
		// caller passed and never saw. The actions are what the caller asked
		// for, so they show.
		const wrapper = mount(DyPanel, { slots: { actions: "<b>فحص</b>" } })
		expect(wrapper.find(".dy-panel__head").exists()).toBe(true)
		expect(wrapper.find(".dy-panel__actions").text()).toBe("فحص")
		expect(wrapper.find(".dy-panel__title").exists()).toBe(false)
	})
})
