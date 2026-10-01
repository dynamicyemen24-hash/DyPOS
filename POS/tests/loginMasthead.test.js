import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8")
const login = read("src/pages/Login.vue")
const loginStyles = read("src/styles/pages/login.css")
const preferences = read("src/components/common/LoginAppearanceBar.vue")

describe("login masthead", () => {
	it("places the company identity, safe links, and display preferences above sign-in", () => {
		expect(login).toContain('<section class="dy-login__brand"')
		expect(login).toContain('<figure class="dy-login__brand-card">')
		expect(login).toContain(
			'<LoginAppearanceBar compact class="dy-login__preferences" />',
		)
		expect(login.indexOf('<section class="dy-login__brand"')).toBeLessThan(
			login.indexOf('<section class="dy-login__panel"'),
		)
		expect(loginStyles).toMatch(
			/grid-template-areas:\s*"banner"\s*"brand"\s*"panel"/,
		)
		expect(preferences).toMatch(
			/\.dy-login-prefs--compact \.dy-login-prefs__option-face\s*\{\s*min-height:\s*44px/,
		)
	})
})
