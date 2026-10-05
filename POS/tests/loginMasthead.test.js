import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8")
const login = read("src/pages/Login.vue")
const loginStyles = read("src/styles/pages/login.css")
const preferences = read("src/components/common/LoginAppearanceBar.vue")

/**
 * The login masthead: a compact brand bar, a compact identity card, and
 * technical panels (hardware/network diagnostics) that appear when
 * technical mode is enabled.
 */
describe("login masthead", () => {
	it("keeps the masthead compact with language/theme preferences", () => {
		/*
		 * The masthead tag carries a `:class` binding, so it spans several lines:
		 * the class attribute is followed by the conditional classes. Matching
		 * the single-line form reported a missing element that is on screen —
		 * the class IS applied, the ASSUMPTION about formatting was not.
		 */
		expect(login).toMatch(/<section\s+class="dy-login__brand"[\s\S]{0,200}?>/)
		// Accept both :compact binding and static compact attribute
		expect(login).toMatch(
			/<LoginAppearanceBar(\s+[^>]*)?class="dy-login__preferences"/,
		)
		// Technical mode toggle in the brand bar
		expect(login).toMatch(
			/<TechnicalModeToggle\s+class="dy-login__technical-toggle"/,
		)
		expect(loginStyles).toMatch(
			/grid-template-areas:\s*"banner banner"[\s\S]*?"workspace panel"/,
		)
		expect(loginStyles).toMatch(
			/\.dy-login\[dir="ltr"\]\s*\{[\s\S]*?grid-template-areas:[\s\S]*?"panel workspace"/,
		)
		expect(preferences).toMatch(
			/\.dy-login-prefs--compact \.dy-login-prefs__option-face\s*\{\s*min-height:\s*44px/,
		)
	})

	/*
	 * The workspace column hosts the company identity card (LoginWorkspacePanel)
	 * when technical mode is OFF, and technical diagnostics panels
	 * (hardware/network) when technical mode is ON.
	 */
	it("presents technical tools panel when enabled; workspace panel when disabled", () => {
		// Workspace panel present (conditionally rendered when !technicalModeEnabled)
		expect(login).toContain("<LoginWorkspacePanel")
		expect(login).not.toContain("<SystemAboutPanel")
		// Hardware and network diagnostics panels (conditional on technical mode)
		expect(login).toMatch(/<HardwareDiagnosticsPanel/)
		expect(login).toMatch(/<NetworkDiagnosticsPanel/)
		// Version info at bottom of form
		expect(login).toMatch(/<VersionInfo/)
		expect(loginStyles).toMatch(
			/\.dy-login__technical-panel\s*\{[\s\S]*?grid-area:\s*workspace/,
		)
	})

	/*
	 * Structure the page could not afford to lose, each one a real defect
	 * that shipped:
	 *
	 *  - No `<h1>` anywhere: the page's title was an `<h2>`, so a screen-reader
	 *    user navigating by heading met "مرحبًا بك" as the very first heading
	 *    with no document title above it.
	 *  - `window.location.href` to reach registration: a full document reload
	 *    between two pages the router already owns, on a shop connection.
	 */
	it("gives the page exactly one top-level heading", () => {
		// Count on the template with comments stripped: this file's own note
		// about the missing `<h1>` mentions the tag literally, and a comment is
		// not a heading. A gate that fails on its own documentation is a gate
		// people disable.
		// Cut at the REAL <style> tag: this file's header comment mentions
		// "<style scoped>" in prose, and a plain `search` stops there and hands
		// back the comment instead of the template.
		const styleTag = login.search(/^<style[^>]*>/m)
		const template = login.slice(0, styleTag)
		const code = template.replace(/<!--[\s\S]*?-->/g, "")

		expect(code).toMatch(/<h1 class="dy-login__title">/)
		expect((code.match(/<h1[\s>]/g) || []).length).toBe(1)

		// The next level down is still h2 — no skipped rung. Those sub-headings
		// moved into components (`LoginPinForm`, `DyPanel`), so the check reads
		// them there too. Asserting only on the page would have let the whole
		// h2 tier vanish silently when the PIN dialog was extracted.
		const subHeadings = [
			readFileSync(
				resolve(process.cwd(), "src/components/common/LoginPinForm.vue"),
				"utf8",
			),
			readFileSync(
				resolve(process.cwd(), "src/components/common/DyPanel.vue"),
				"utf8",
			),
		]
			// `DyPanel.vue` puts `<script setup>` BEFORE `<template>`, so cutting
			// at the script tag would return an empty string and the h2 tier
			// would look like it had vanished. Cut at whichever block ENDS first.
			.map((file) => {
				const script = file.search(/<script[\s>]/)
				const template = file.search(/<template[\s>]/)
				const cut =
					template === -1
						? script
						: script === -1
							? template
							: Math.min(script, template)
				return cut === -1 ? file : file.slice(cut)
			})
			.map((body) => body.replace(/<!--[\s\S]*?-->/g, ""))
			.join("\n")

		expect(`${code}\n${subHeadings}`).toMatch(/<h2[\s>]/)
	})

	it("moves between login and registration inside the SPA", () => {
		expect(login).toContain(
			'import { goToForgotPassword, goToRegister } from "@/router"',
		)
		expect(login).not.toMatch(/window\.location\.href/)
		expect(login).toMatch(/@click\.prevent="goToRegister"/)

		// And the helper the page now depends on actually exists.
		const router = read("src/router.js")
		expect(router).toMatch(/export function goToRegister\(\)/)
		expect(router).toMatch(/name: ROUTE_NAMES\.REGISTER/)
	})
})
