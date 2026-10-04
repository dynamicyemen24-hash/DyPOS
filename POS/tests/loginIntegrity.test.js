import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
/**
 * No supervisor credential may exist in the client bundle.
 *
 * ## This gate exists because the removal was incomplete, twice
 *
 * An earlier round deleted the `super` branch inside `selectMethod()` and wrote
 * a paragraph explaining why a credential must never live in a client bundle.
 * `superLogin()` survived that round as a standalone function, still writing
 * `supervisor@dypos.local` / `SuperAdmin2025!` into the form and submitting —
 * so the lesson was documented and the literal was still shipped.
 *
 * That is the whole reason this is a gate and not a note: a comment saying "we
 * removed this" is not a state, and the next round reads the comment.
 *
 * ## Scope
 *
 * `src/` and `packages/` only — the bundle that reaches a browser. Comments are
 * stripped first, because the file that explains this defect must mention the
 * credential to be convincing, and a gate that trips on its own documentation
 * gets deleted instead of fixed.
 */
const ROOTS = ["src", "packages"]
const LITERAL = /SuperAdmin2025|supervisor@dypos\.local|superLogin\s*\(/g

function walk(dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = resolve(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === "node_modules") continue
			walk(full, out)
			continue
		}
		if (!/\.(vue|js|mjs|ts)$/.test(entry.name)) continue
		out.push(full)
	}
	return out
}

describe("no supervisor credential in the client bundle", () => {
	it("finds no literal, no helper and no address", () => {
		const offenders = []

		for (const root of ROOTS) {
			for (const file of walk(resolve(process.cwd(), root))) {
				const text = readFileSync(file, "utf8")
					.replace(/<!--[\s\S]*?-->/g, " ")
					.replace(/\/\*[\s\S]*?\*\//g, " ")
					.replace(/\/\/.*$/gm, " ")

				for (const m of text.matchAll(LITERAL)) {
					const line = text.slice(0, m.index).split("\n").length
					offenders.push(
						`${file.replace(`${process.cwd()}\\`, "")}:${line} ${m[0]}`,
					)
				}
			}
		}

		expect(
			offenders,
			[
				"A client bundle must never carry a supervisor credential.",
				"Anyone holding assets/ would have it, and rotating means a release.",
				"If a build shipped one, rotate the credential SERVER-side — deleting",
				"the source does not un-leak what was already deployed.",
				...offenders,
			].join(" "),
		).toEqual([])
	})

	it("needs no exception mechanism to pass", () => {
		// A gate that can be silenced is a gate that will be. The walk above has
		// no allowlist, no `.skip`, and no environment branch, and that is
		// deliberate: the only correct fix for a hit is to delete the credential.
		//
		// Comments are stripped first — this very test has to be able to NAME
		// the escape hatches it forbids, and a gate that trips on its own
		// documentation is a gate people disable.
		const source = readFileSync(
			resolve(process.cwd(), "tests/loginIntegrity.test.js"),
			"utf8",
		)
			.replace(/<!--[\s\S]*?-->/g, " ")
			.replace(/\/\*[\s\S]*?\*\//g, " ")
			.replace(/\/\/.*$/gm, " ")

		expect(source).not.toMatch(/\.skip\(/)
		expect(source).not.toMatch(/\bALLOWLIST\b/)
		expect(source).not.toMatch(/process\.env/)
	})
})
