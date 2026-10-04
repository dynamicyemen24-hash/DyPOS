import { describe, expect, it } from "vitest"
import {
	confirmPasswordError,
	emailValidationError,
	fullNameValidationError,
} from "@/utils/registrationValidation"

describe("registration validation", () => {
	it("accepts an empty or valid email and rejects malformed addresses", () => {
		expect(emailValidationError("")).toBe("")
		expect(emailValidationError("cashier@example.com")).toBe("")
		expect(emailValidationError("not-an-email")).toBe(
			"البريد الإلكتروني غير صالح",
		)
	})

	it("only reports a confirmation error when both values are present and differ", () => {
		expect(confirmPasswordError("secret", "")).toBe("")
		expect(confirmPasswordError("secret", "secret")).toBe("")
		expect(confirmPasswordError("secret", "different")).toBe(
			"كلمتا المرور غير متطابقتين",
		)
	})

	it("requires at least two trimmed characters in a supplied name", () => {
		expect(fullNameValidationError("")).toBe("")
		expect(fullNameValidationError(" A ")).toBe(
			"الاسم يجب أن يكون حرفين على الأقل",
		)
		expect(fullNameValidationError(" Ali ")).toBe("")
	})
})
