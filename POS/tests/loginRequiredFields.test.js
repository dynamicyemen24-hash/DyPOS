import { describe, expect, it, vi } from "vitest"
import { ref } from "vue"
import { useLoginRequiredFields } from "../src/composables/useLoginRequiredFields"

function createFields(emailValue = "", passwordValue = "") {
	const email = ref(emailValue)
	const password = ref(passwordValue)
	const emailInput = ref({ focus: vi.fn() })
	const passwordInput = ref({ focus: vi.fn() })

	return {
		email,
		password,
		emailInput,
		passwordInput,
		...useLoginRequiredFields({ email, password, emailInput, passwordInput }),
	}
}

describe("login required fields", () => {
	it("announces and focuses the first missing field", () => {
		const fields = createFields()

		expect(fields.emailMissing.value).toBe(false)
		expect(fields.passwordMissing.value).toBe(false)
		expect(fields.validate()).toBe(false)
		expect(fields.emailMissing.value).toBe(true)
		expect(fields.passwordMissing.value).toBe(true)
		expect(fields.emailInput.value.focus).toHaveBeenCalledOnce()
		expect(fields.passwordInput.value.focus).not.toHaveBeenCalled()
	})

	it("focuses the password when the email is present", () => {
		const fields = createFields("cashier@example.test")

		expect(fields.validate()).toBe(false)
		expect(fields.emailMissing.value).toBe(false)
		expect(fields.passwordMissing.value).toBe(true)
		expect(fields.passwordInput.value.focus).toHaveBeenCalledOnce()
	})

	it("clears validation state after both fields are provided", () => {
		const fields = createFields()
		fields.validate()

		fields.email.value = "cashier@example.test"
		fields.password.value = "local-secret"

		expect(fields.validate()).toBe(true)
		expect(fields.emailMissing.value).toBe(false)
		expect(fields.passwordMissing.value).toBe(false)
	})
})
