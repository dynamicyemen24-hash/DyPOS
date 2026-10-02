/**
 * Install-account seed — a real proof, not a mock.
 *
 * The seed exists because the app is STANDALONE: first run asks for
 * credentials that cannot exist yet. This asserts the properties that
 * matter — PBKDF2 format, no cleartext, wrong password rejected, and no
 * duplicate on the second run.
 */
import { beforeEach, describe, expect, it } from "vitest"

import db from "@/services/db"
import {
	DEFAULT_INSTALL_USER,
	ensureInstallUser,
} from "@/services/localUserSeed"
import { userRepository } from "@/repositories/userRepository"

describe("local install account", () => {
	beforeEach(async () => {
		await db.open()
		await db.users.clear()
		await db.settings.clear()
	})

	it("creates one admin account on first run, PBKDF2-hashed", async () => {
		const result = await ensureInstallUser()
		expect(result.created).toBe(true)
		expect(result.email).toBe(DEFAULT_INSTALL_USER.email)

		const row = await db.users.where("email").equals(result.email).first()
		expect(row?.password_hash).toMatch(
			/^pbkdf2-sha256\$\d+\$[0-9a-f]+\$[0-9a-f]+$/,
		)
		// The password must never sit in the row as written.
		expect(row?.password_hash).not.toContain(DEFAULT_INSTALL_USER.password)
		expect(row?.role).toBe("ADMIN")
	})

	it("authenticates the install password and rejects a wrong one", async () => {
		const { email } = await ensureInstallUser()
		const ok = await userRepository.authenticate(
			email,
			DEFAULT_INSTALL_USER.password,
		)
		expect(ok.success).toBe(true)
		expect(ok.user?.email).toBe(email)

		const bad = await userRepository.authenticate(email, "wrong-password")
		expect(bad.success).toBe(false)
	})

	it("does not duplicate on the second run", async () => {
		await ensureInstallUser()
		const second = await ensureInstallUser()
		expect(second.created).toBe(false)
		expect(await db.users.count()).toBe(1)
	})
})
