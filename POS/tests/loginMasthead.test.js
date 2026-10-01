import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8")
const login = read("src/pages/Login.vue")
const loginStyles = read("src/styles/pages/login.css")
const preferences = read("src/components/common/LoginAppearanceBar.vue")

describe("login masthead", () => {
	it("keeps the masthead compact and presents the company artwork at showcase scale", () => {
		expect(login).toContain('<section class="dy-login__brand"')
		expect(login).toContain('<figure class="dy-login__brand-card">')
		expect(login).toMatch(
			/<LoginAppearanceBar\s+compact\s+class="dy-login__preferences"\s*\/>/,
		)
		expect(login).toMatch(/<section\s+class="dy-login__showcase"/)
		expect(login.indexOf('<section class="dy-login__panel"')).toBeLessThan(
			login.indexOf('class="dy-login__showcase"'),
		)
		expect(loginStyles).toMatch(
			/grid-template-areas:\s*"banner banner"\s*"brand brand"\s*"panel showcase"/,
		)
		expect(loginStyles).toMatch(
			/\.dy-login\[dir="ltr"\]\s*\{[\s\S]*?grid-template-areas:\s*"banner banner"\s*"brand brand"\s*"showcase panel"/,
		)
		expect(loginStyles).toMatch(
			/\.dy-login__brand-card\s*\{\s*width:\s*min\(100%, 720px\)/,
		)
		expect(loginStyles).toContain("grid-template-areas:")
		expect(preferences).toMatch(
			/\.dy-login-prefs--compact \.dy-login-prefs__option-face\s*\{\s*min-height:\s*44px/,
		)
	})
})
