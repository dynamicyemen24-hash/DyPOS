/**
 * File-size ratchet.
 *
 * The debt log has carried "PaymentDialog is 3324 lines, POSSale is 2845" as a
 * backlog item for releases — and the numbers moved the wrong way (POSSale is
 * now ~6.3k lines) because nobody measured. A backlog item that is never
 * measured is a wish.
 *
 * So the sizes became a gate. The caps are the current measured values: a file
 * may not grow, and shrinking it is rewarded by lowering the cap in the same
 * commit. That turns "split this file someday" from a memory into a rule the
 * suite enforces on every pull request.
 *
 * Caps only ever move DOWN. If a file genuinely needs to grow, extract the new
 * behaviour into a composable/module first — which is what the cap is asking
 * for in the first place.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")

/** [file, maxLines] — measured, not aspirational. Lower the number when you split. */
const CAPS = [
	// 6374 → 6359: تسجيل الخروج + اختصار Shift+Esc زاد~30 سطرًا، فاستُخرج
	// مسار لوحة المفاتيح إلى utils/gridNavigation.js (مع اختبارات) وسلسلة
	// الإغلاق إلى composables/useOverlayCloser.js. الاتجاه downward فقط.
	["src/pages/POSSale.vue", 6359],
	["src/components/settings/POSSettings.vue", 2092],
	["src/pages/Login.vue", 3406],
	["src/stores/itemSearch.js", 2620],
	["src/components/work/WorkDataGrid.vue", 1188],
]

const countLines = (relPath) => {
	const text = readFileSync(join(ROOT, relPath), "utf8")
	const lines = text.split("\n")
	if (lines[lines.length - 1] === "") lines.pop()
	return lines.length
}

describe("file-size ratchet", () => {
	it("the cap table is not stale (every listed file still exists)", () => {
		expect(CAPS.length).toBeGreaterThan(0)
		for (const [rel] of CAPS) {
			expect(
				() => readFileSync(join(ROOT, rel), "utf8"),
				`${rel} moved`,
			).not.toThrow()
		}
	})

	for (const [rel, cap] of CAPS) {
		it(`${rel} stays at or under ${cap} lines`, () => {
			const actual = countLines(rel)
			expect(
				actual,
				`${rel} is ${actual} lines (cap ${cap}). Extract a composable/module and lower the cap in tests/fileSize.test.js.`,
			).toBeLessThanOrEqual(cap)
		})
	}
})
