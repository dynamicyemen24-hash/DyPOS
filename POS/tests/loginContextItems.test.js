/**
 * The login context chips, extracted from `Login.vue`.
 *
 * ## Why the assertion style matters here
 *
 * The original code was three `if` blocks inside an ~1800-line page. Nothing
 * could test it without mounting that page, so nothing tested it, and the
 * ordering was implicit. After the extraction the whole rule — which chips
 * appear, in what order, and when one is skipped — is a plain function, and
 * the cases below are the ones a mounted page would have made expensive:
 * the absent values and the empty string.
 *
 * The last test is the ratchet: the page must not grow the logic back.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
	buildContextItems,
	useLoginContextItems,
	CONTEXT_FIELDS,
} from "@/composables/useLoginContextItems"

describe("buildContextItems", () => {
	it("emits all three chips in display order when everything is present", () => {
		const items = buildContextItems({
			tenantName: "شركة المنارة",
			branchName: "فرع الرياض",
			posName: "كاشير 1",
		})
		expect(items.map((i) => i.id)).toEqual(["tenant", "branch", "pos"])
		expect(items[0]).toMatchObject({ icon: "briefcase", label: "شركة المنارة" })
	})

	it("skips a chip whose value is absent, and never shows a placeholder", () => {
		// No branch name in the session means NO branch chip — not a chip with a
		// dash in it. A blank that looks like a value is worse than no chip.
		const items = buildContextItems({
			tenantName: "شركة المنارة",
			posName: "كاشير 1",
		})
		expect(items.map((i) => i.id)).toEqual(["tenant", "pos"])
		expect(items.find((i) => i.id === "branch")).toBeUndefined()
	})

	it("treats an empty string as absent", () => {
		expect(
			buildContextItems({ tenantName: "", branchName: "   ", posName: "" }),
		).toEqual([])
	})

	it("survives a completely empty source", () => {
		expect(buildContextItems()).toEqual([])
		expect(buildContextItems({})).toEqual([])
	})

	it("accepts either name for the POS fact", () => {
		// The page prop is `posName` and the session key is `posProfile`.
		// Confining either name to one source silently drops the chip.
		expect(buildContextItems({ posName: "كاشير 1" }).map((i) => i.id)).toEqual([
			"pos",
		])
		expect(
			buildContextItems({ posProfile: "كاشير 2" }).map((i) => i.id),
		).toEqual(["pos"])
	})

	it("labels with the value itself, so the chip never invents text", () => {
		const items = buildContextItems({ tenantName: "شركة المنارة" })
		expect(items[0].label).toBe("شركة المنارة")
	})
})

describe("useLoginContextItems", () => {
	it("prefers page props over session values", () => {
		// A deep link can carry a context the session does not have yet; the
		// session must not overwrite it with the stale value.
		const items = useLoginContextItems({
			props: { branchName: "فرع جدة" },
			session: { branchName: "فرع الرياض" },
		}).value
		expect(items.find((i) => i.id === "branch").label).toBe("فرع جدة")
	})

	it("falls back to the session when the prop is absent", () => {
		const items = useLoginContextItems({
			props: {},
			session: { branchName: "فرع الرياض", posProfile: "كاشير 3" },
		}).value
		expect(items.map((i) => i.id)).toEqual(["branch", "pos"])
		expect(items.find((i) => i.id === "pos").label).toBe("كاشير 3")
	})

	it("works with neither props nor session", () => {
		expect(useLoginContextItems().value).toEqual([])
		expect(useLoginContextItems({}).value).toEqual([])
	})
})

describe("the page keeps the extraction, not the logic", () => {
	const login = readFileSync(
		resolve(process.cwd(), "src/pages/Login.vue"),
		"utf8",
	)

	it("imports the composable", () => {
		expect(login).toContain(
			'import { useLoginContextItems } from "@/composables/useLoginContextItems"',
		)
	})

	it("does not rebuild the chip list inline", () => {
		// The ratchet half: putting the three `if` blocks back would keep the
		// page green again while making the rules untestable.
		expect(login).not.toMatch(/if \(context(tenant|branch|pos)Name\.value\)/)
		expect(login).not.toMatch(/const contextTenantName = computed/)
	})
})

describe("CONTEXT_FIELDS is the whole list, declared once", () => {
	it("carries an id and an icon for each field", () => {
		for (const field of CONTEXT_FIELDS) {
			expect(field.id, field.id).toBeTruthy()
			expect(field.icon, field.id).toBeTruthy()
			expect(typeof field.pick, field.id).toBe("function")
		}
	})
})
