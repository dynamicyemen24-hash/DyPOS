import { describe, expect, it } from "vitest"

import {
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	getPasswordStrength,
	isPasswordAcceptable,
	validatePassword,
} from "@/utils/passwordPolicy"

describe("passwordPolicy — length rules (NIST SP 800-63B)", () => {
	it("rejects passwords shorter than the NIST minimum", () => {
		const result = validatePassword("Sh0rt!")
		expect(result.valid).toBe(false)
		expect(result.errors.join(" ")).toContain("أحرف على الأقل")
	})

	it("rejects passwords longer than the maximum (DoS guard)", () => {
		const result = validatePassword("a".repeat(PASSWORD_MAX_LENGTH + 1))
		expect(result.valid).toBe(false)
	})

	it("accepts a strong, sufficiently long password", () => {
		const result = validatePassword("Gorilla-Tango#2024-Mist")
		expect(result.valid).toBe(true)
		expect(result.errors).toHaveLength(0)
	})

	it("exports the minimum and maximum length constants", () => {
		expect(PASSWORD_MIN_LENGTH).toBe(8)
		expect(PASSWORD_MAX_LENGTH).toBe(128)
	})
})

describe("passwordPolicy — breach list", () => {
	it("rejects well-known compromised passwords", () => {
		expect(validatePassword("Password1").valid).toBe(false)
		expect(validatePassword("qwerty123").valid).toBe(false)
		expect(validatePassword("iloveyou1").valid).toBe(false)
	})

	it("rejects common passwords regardless of case", () => {
		expect(validatePassword("P@SSW0RD").valid).toBe(false)
	})
})

describe("passwordPolicy — sequence and repetition", () => {
	it("rejects sequential keyboard/numeric runs", () => {
		expect(validatePassword("MyAbcd2024!x").valid).toBe(false)
		expect(validatePassword("Secure1234!z").valid).toBe(false)
	})

	it("rejects long single-character repetition", () => {
		const result = validatePassword("Aaaaaaaa1!b")
		expect(result.valid).toBe(false)
		expect(result.errors.some((e) => e.includes("متكررة"))).toBe(true)
	})
})

describe("passwordPolicy — user-specific checks", () => {
	it("rejects the email local-part as password content", () => {
		const result = validatePassword("mohamed.2024", {
			email: "mohamed@company.com",
		})
		expect(result.valid).toBe(false)
		expect(result.errors.join(" ")).toContain("بريدك")
	})

	it("rejects the user's own name inside the password", () => {
		const result = validatePassword("Ahmed2024!x", {
			fullName: "Ahmed Ali",
		})
		expect(result.valid).toBe(false)
		expect(result.errors.join(" ")).toContain("اسمك")
	})

	it("allows strong passwords unrelated to the user", () => {
		expect(
			validatePassword("Kite-Volt-9#Lamp", {
				email: "mohamed@company.com",
				fullName: "Ahmed Ali",
			}).valid,
		).toBe(true)
	})
})

describe("passwordPolicy — strength scoring", () => {
	it("returns an empty strength for empty input", () => {
		const strength = getPasswordStrength("")
		expect(strength.level).toBe(0)
		expect(strength.percent).toBe(0)
	})

	it("scores longer mixed passwords higher than simple ones", () => {
		const weak = getPasswordStrength("Abc12345")
		const strong = getPasswordStrength("Kite-Volt-9#Lamp-Mist!")
		expect(strong.level).toBeGreaterThan(weak.level)
	})

	it("clamps the level between 0 and 5", () => {
		const strength = getPasswordStrength(
			"Kite-Volt-9#Lamp-Mist-2024-!@#$%^&*()",
		)
		expect(strength.level).toBeGreaterThanOrEqual(0)
		expect(strength.level).toBeLessThanOrEqual(5)
	})
})

describe("passwordPolicy — isPasswordAcceptable", () => {
	it("mirrors the validity result of validatePassword", () => {
		expect(isPasswordAcceptable("password1")).toBe(false)
		expect(isPasswordAcceptable("Kite-Volt-9#Lamp")).toBe(true)
	})

	it("accepts a short-but-valid password with only warnings", () => {
		expect(isPasswordAcceptable("Xy!9mQr2")).toBe(true)
	})
})

describe("passwordPolicy — input robustness", () => {
	it("handles non-string input gracefully", () => {
		const result = validatePassword(null)
		expect(result.valid).toBe(false)
		expect(result.errors.length).toBeGreaterThan(0)
	})

	it("never throws for empty user info", () => {
		expect(() => validatePassword("Kite-Volt-9#Lamp", {})).not.toThrow()
		expect(() => validatePassword("Kite-Volt-9#Lamp", undefined)).not.toThrow()
	})
})

describe("passwordPolicy — entropy estimation", () => {
	it("provides entropy alongside validation", () => {
		const result = validatePassword("Kite-Volt-9#Lamp")
		expect(result.entropy).toBeGreaterThan(0)
	})

	it("reports zero entropy for empty input", () => {
		expect(validatePassword("").entropy).toBe(0)
	})
})
