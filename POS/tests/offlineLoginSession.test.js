/**
 * Offline login establishes the guard-visible session — the regression gate.
 *
 * The defect: the login page verified the password correctly (`success: true`)
 * and then wrote `user` onto the Pinia proxy — a readonly computed, so the
 * write died silently. `data/session` (what the router guard reads) stayed
 * logged-out, `goToDashboard` bounced straight back to Login, and the cashier
 * saw a button that "does nothing" after a CORRECT password.
 *
 * The contract from here on: the page path (`attemptLocalLogin`) delegates to
 * the ONE canonical implementation (`data/session#submitLocalLogin`), and this
 * file proves both directions — success flips the real `isLoggedIn` with zero
 * network, and failure leaves it off.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import db from "@/services/db"
import { ensureInstallUser } from "@/services/localUserSeed"
import { session as lowSession, submitLocalLogin } from "@/data/session"
import { attemptLocalLogin } from "@/composables/useLoginRuntime"

describe("offline login session (page path == canonical session)", () => {
	beforeEach(async () => {
		await db.open()
		await db.users.clear()
		await db.settings.clear()
		// Reset the reactive session directly: logout.submit() drags the
		// whole app cleanup (Pinia stores) which has no Pinia here.
		lowSession.user = null
		try {
			localStorage.removeItem("dypos_user_session")
		} catch {
			/* storage unavailable */
		}
		vi.restoreAllMocks()
	})

	it("a correct password flips the guard-visible isLoggedIn (no dead press)", async () => {
		const { email, password } = await ensureInstallUser()
		expect(typeof password).toBe("string")

		const result = await attemptLocalLogin(email, password)

		expect(result.success).toBe(true)
		expect(lowSession.isLoggedIn).toBe(true)
		expect(lowSession.user).toBeTruthy()
	})

	it("canonical and page paths agree — one session, not two", async () => {
		const { email, password } = await ensureInstallUser()

		const direct = await submitLocalLogin(email, password)
		expect(direct.success).toBe(true)
		expect(lowSession.isLoggedIn).toBe(true)

		lowSession.user = null
		try {
			localStorage.removeItem("dypos_user_session")
		} catch {
			/* storage unavailable */
		}
		expect(lowSession.isLoggedIn).toBe(false)

		const viaPage = await attemptLocalLogin(email, password)
		expect(viaPage.success).toBe(true)
		expect(lowSession.isLoggedIn).toBe(true)
	})

	it("a wrong password stays logged out with a named Arabic error", async () => {
		const { email } = await ensureInstallUser()

		const result = await attemptLocalLogin(email, "wrong-password")

		expect(result.success).toBe(false)
		expect(typeof result.error).toBe("string")
		expect(lowSession.isLoggedIn).toBe(false)
	})

	it("the page path touches zero network", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockRejectedValue(new Error("must not be called"))
		const { email, password } = await ensureInstallUser()

		const result = await attemptLocalLogin(email, password)

		expect(result.success).toBe(true)
		expect(fetchSpy).not.toHaveBeenCalled()
	})
})
