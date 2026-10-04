/**
 * Install credentials card — mounted with a purpose, not a hope.
 *
 * `InstallCredentialsCard` exists because `localUserSeed` mints a password the
 * owner has to read. A generated password nobody can see is an account nobody
 * can enter — the "wall with no door" the seed itself was written to remove.
 * So this gate renders the card and asserts on what an owner would see: an
 * event turns into a readable email + password, and "I saved it" CLEARS the
 * secret from memory (not a CSS hide — a screenshot of the DOM afterwards must
 * contain no password).
 *
 * And the card must be reachable, not imported and forgotten: `Login.vue` is
 * the only shop surface that runs before a working login exists, so the gate
 * asserts the page actually mounts it (the `this.$root` class from 1.44.7).
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

const EMAIL = "admin@dypos.local"
const PASSWORD = "Kx9#mQ2$vT7wL4pR8nZ6"
const EVENT = "dypos:install-credentials"

const Card = (await import("@/components/common/InstallCredentialsCard.vue"))
	.default

beforeEach(() => {
	globalThis.__dyposInstallCredentials = undefined
})

afterEach(() => {
	globalThis.__dyposInstallCredentials = undefined
})

describe("install credentials card", () => {
	it("is silent until first run mints credentials", async () => {
		const wrapper = mount(Card, {
			global: { mocks: { __: (message) => message } },
		})
		await nextTick()
		expect(wrapper.find('[data-testid="install-credentials"]').exists()).toBe(
			false,
		)
		wrapper.unmount()
	})

	it("shows the minted email and password once the seed announces them", async () => {
		const wrapper = mount(Card, {
			global: { mocks: { __: (message) => message } },
			attachTo: document.body,
		})
		globalThis.dispatchEvent(
			new CustomEvent(EVENT, { detail: { email: EMAIL, password: PASSWORD } }),
		)
		await nextTick()

		expect(wrapper.get('[data-testid="install-credentials"]').exists()).toBe(
			true,
		)
		expect(wrapper.get('[data-testid="install-password"]').text()).toBe(
			PASSWORD,
		)
		wrapper.unmount()
	})

	it("'I saved it' CLEARS the secret — the DOM after this holds no password", async () => {
		const wrapper = mount(Card, {
			global: { mocks: { __: (message) => message } },
			attachTo: document.body,
		})
		globalThis.dispatchEvent(
			new CustomEvent(EVENT, { detail: { email: EMAIL, password: PASSWORD } }),
		)
		await nextTick()
		expect(wrapper.get('[data-testid="install-password"]').text()).toBe(
			PASSWORD,
		)

		await wrapper.get('[data-testid="install-dismiss"]').trigger("click")
		await nextTick()

		expect(wrapper.find('[data-testid="install-credentials"]').exists()).toBe(
			false,
		)
		expect(wrapper.html()).not.toContain(PASSWORD)
		wrapper.unmount()
	})

	it("picks up credentials minted before it mounted (offline init is async)", async () => {
		globalThis.__dyposInstallCredentials = { email: EMAIL, password: PASSWORD }
		const wrapper = mount(Card, {
			global: { mocks: { __: (message) => message } },
		})
		await nextTick()
		expect(wrapper.get('[data-testid="install-password"]').text()).toBe(
			PASSWORD,
		)
		wrapper.unmount()
	})

	it("the login page actually mounts it — a card nobody renders is a dead contract", async () => {
		const { readFileSync } = await import("node:fs")
		const { resolve } = await import("node:path")
		const page = readFileSync(
			resolve(process.cwd(), "src/pages/Login.vue"),
			"utf8",
		)
		expect(page).toMatch(/<InstallCredentialsCard\s*\/>/)
		expect(page).toMatch(/InstallCredentialsCard\.vue/)
	})
})
