/**
 * Install-account seed — a real proof, not a mock.
 *
 * The seed exists because the app is STANDALONE: first run asks for
 * credentials that cannot exist yet. This asserts the properties that
 * matter — a per-install generated password (never a repository constant),
 * PBKDF2 format, returned exactly ONCE, wrong password rejected, and no
 * duplicate on the second run.
 */
import { beforeEach, describe, expect, it } from "vitest"

import db from "@/services/db"
import {
	DEFAULT_INSTALL_USER,
	ensureInstallUser,
	generateInstallPassword,
} from "@/services/localUserSeed"
import { userRepository } from "@/repositories/userRepository"

describe("local install account", () => {
	beforeEach(async () => {
		await db.open()
		await db.users.clear()
		await db.settings.clear()
	})

	it("carries NO repository password — a constant here is a key anyone can copy", () => {
		expect(DEFAULT_INSTALL_USER.password).toBeNull()
	})

	it("creates one admin account on first run, PBKDF2-hashed", async () => {
		const result = await ensureInstallUser()
		expect(result.created).toBe(true)
		expect(result.email).toBe(DEFAULT_INSTALL_USER.email)

		const row = await db.users.where("email").equals(result.email).first()
		expect(row?.password_hash).toMatch(
			/^pbkdf2-sha256\$\d+\$[0-9a-f]+\$[0-9a-f]+$/,
		)
		expect(row?.role).toBe("ADMIN")
	})

	it("generates 20-character passwords across four classes", () => {
		const samples = new Set(
			Array.from({ length: 30 }, () => generateInstallPassword()),
		)
		// 30 draws, all unique: this is randomness, not a rotation.
		expect(samples.size).toBe(30)
		for (const password of samples) {
			expect(password).toHaveLength(20)
			expect(password).toMatch(/[A-Z]/)
			expect(password).toMatch(/[a-z]/)
			expect(password).toMatch(/[2-9]/)
			expect(password).toMatch(/[!@#$%*\-_=+?]/)
			// No confusable pairs (`O`/`0`, `l`/`1`) — the owner retypes this
			// from a screen, and a shop owner's first sale must not depend on
			// telling `Ol` from `Ol`.
			expect(password).not.toMatch(/[O0l1]/)
		}
	})

	it("authenticates the returned password (not a constant) and rejects a wrong one", async () => {
		const { email, password } = await ensureInstallUser()
		expect(typeof password).toBe("string")
		const ok = await userRepository.authenticate(email, password)
		expect(ok.success).toBe(true)
		expect(ok.user?.email).toBe(email)

		const bad = await userRepository.authenticate(email, "wrong-password")
		expect(bad.success).toBe(false)
	})

	it("returns the password ONCE and never again", async () => {
		const first = await ensureInstallUser()
		expect(first.password).toBeTruthy()
		const second = await ensureInstallUser()
		expect(second.created).toBe(false)
		expect(second.password).toBeNull()
		expect(await db.users.count()).toBe(1)
	})

	it("fails the build if a repository password is reintroduced", async () => {
		const { readFileSync } = await import("node:fs")
		const { resolve } = await import("node:path")
		// NOT `import.meta.url`: vitest serves modules over an http-ish URL, so
		// `new URL(..., import.meta.url)` throws "The URL must be of scheme
		// file". The runner's cwd is POS/.
		const src = readFileSync(
			resolve(process.cwd(), "src/services/localUserSeed.js"),
			"utf8",
		)
		const code = src
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/^\s*\/\/.*$/gm, "")
		// Any quoted string assigned to `password` inside the seed object is
		// the defect wearing a new label.
		expect(code).not.toMatch(/password\s*:\s*["'][^"']+["']/)
	})
})
