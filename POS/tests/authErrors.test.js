import { describe, expect, it } from "vitest"

import {
	extractAuthStatus,
	normalizeAuthError,
	isAuthExpiryError,
	isAuthForbiddenError,
	isAuthRateLimitedError,
	requiresReauthentication,
} from "@/utils/authErrors"

describe("extractAuthStatus", () => {
	it("returns null for falsy input", () => {
		expect(extractAuthStatus(null)).toBeNull()
		expect(extractAuthStatus(undefined)).toBeNull()
		expect(extractAuthStatus("boom")).toBeNull()
	})

	it("reads the status from each supported error shape", () => {
		expect(extractAuthStatus({ status: 401 })).toBe(401)
		expect(extractAuthStatus({ statusCode: 403 })).toBe(403)
		expect(extractAuthStatus({ httpStatus: 429 })).toBe(429)
		expect(extractAuthStatus({ response: { status: 500 } })).toBe(500)
		expect(extractAuthStatus({ data: { status: 418 } })).toBe(418)
	})
})

describe("normalizeAuthError", () => {
	it("uses a default message when nothing is provided", () => {
		expect(normalizeAuthError()).toBeTruthy()
		expect(normalizeAuthError({})).toBeTruthy()
	})

	it("maps 401 / 403 / 429 to dedicated Arabic messages", () => {
		expect(normalizeAuthError({ status: 401 })).toContain("كلمة المرور")
		expect(normalizeAuthError({ status: 403 })).toContain("صلاحية")
		expect(normalizeAuthError({ status: 429 })).toContain("المحاولات")
	})

	it("reports offline state before falling back to the raw message", () => {
		expect(normalizeAuthError({ message: "x" }, { online: false })).toContain(
			"اتصال",
		)
	})

	it("falls back to the error message when online", () => {
		expect(
			normalizeAuthError({ message: "backend rejected" }, { online: true }),
		).toBe("backend rejected")
		expect(
			normalizeAuthError({ response: { data: { message: "inner" } } }),
		).toBe("inner")
	})
})

describe("re-auth classification", () => {
	it("detects expired sessions", () => {
		expect(isAuthExpiryError({ status: 401 })).toBe(true)
		expect(isAuthExpiryError({ exc_type: "SessionExpired" })).toBe(true)
		expect(isAuthExpiryError({ message: "session expired" })).toBe(true)
		expect(isAuthExpiryError({ status: 403 })).toBe(false)
	})

	it("detects forbidden / throttle responses", () => {
		expect(isAuthForbiddenError({ status: 403 })).toBe(true)
		expect(isAuthForbiddenError({ exc_type: "PermissionError" })).toBe(true)
		expect(isAuthRateLimitedError({ status: 429 })).toBe(true)
	})

	it("aggregates re-auth requirements", () => {
		expect(requiresReauthentication({ status: 401 })).toBe(true)
		expect(requiresReauthentication({ status: 403 })).toBe(true)
		expect(requiresReauthentication({ status: 429 })).toBe(false)
		expect(requiresReauthentication(null)).toBe(false)
	})
})
