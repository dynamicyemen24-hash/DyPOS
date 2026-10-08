import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8")
const login = read("src/pages/Login.vue")
const styles = read("src/styles/pages/login.css")

describe("login operating shell", () => {
	it("keeps the masthead compact and operational", () => {
		expect(login).toMatch(/<section\s+class="dy-login__brand"/)
		expect(login).toMatch(/<LoginAppearanceBar[^>]*compact/)
		expect(login).toMatch(/<TechnicalModeToggle/)
		expect(styles).toMatch(/\.dy-login__brand\s*\{[\s\S]*?min-height:\s*52px/)
	})

	it("consolidates secondary tools without polluting the primary login path", () => {
		expect(login).toContain('class="dy-login__secondary"')
		expect(login).toContain("أدوات النظام")
		expect(login).toContain("<LoginOnboardingGuide")
		expect(login).toContain("<VersionInfo")
		expect(login).toContain("<InstallCredentialsCard")
		expect(login).not.toContain("<LoginWorkspacePanel")
	})

	it("keeps technical diagnostics conditional and outside the primary form", () => {
		expect(login).toMatch(/<HardwareDiagnosticsPanel v-if="technicalModeEnabled"/)
		expect(login).toMatch(/<NetworkDiagnosticsPanel v-if="technicalModeEnabled"/)
		expect(login).toContain('<LoginPasskeyActions')
	})

	it("uses SPA navigation and one primary authentication action", () => {
		expect(login).toContain('goToPOS')
		expect(login).not.toMatch(/window\.location\.href/)
		const template = login.slice(login.indexOf("<template>"), login.indexOf("</template>"))
		expect((template.match(/class="dy-login__submit"/g) || []).length).toBe(1)
		expect((login.match(/<h1\b/g) || []).length).toBe(1)
	})
})
