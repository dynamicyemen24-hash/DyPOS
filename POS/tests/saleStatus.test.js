/**
 * The sale status line, extracted from `POSSale.vue`.
 *
 * ## The defect this pins
 *
 * The template resolved the state with
 * `v-if ready / v-else-if syncing / v-else-if offline / v-else "توجد مشكلة في
 * الاتصال"`. The final `v-else` was the problem: it claimed the connection was
 * broken for ANY value the three branches did not recognise — including a state
 * the page writes itself (`error`) and including `undefined` before the watcher
 * had reported anything.
 *
 * A cashier reading "توجد مشكلة في الاتصال" stops trusting the till. The rule
 * now resolves through a table, and an unknown state SAYS it is unknown rather
 * than borrowing a message it did not earn.
 *
 * These assertions are on the plain function rather than on the mounted page:
 * the chain it replaces was ~40 lines of template inside a 6000-line file,
 * which is exactly the code no suite could reach.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { ref } from "vue"

import {
	saleStateLabel,
	useSaleStatusLabel,
	SALE_STATES,
} from "@/composables/useSaleStatus"

describe("saleStateLabel", () => {
	it("says the Arabic line for every state the page can enter", () => {
		// Every declared state must have text. A state with no label is the same
		// confident-wrong answer wearing a different hat.
		for (const state of SALE_STATES) {
			expect(saleStateLabel(state), state).toMatch(/[\u0600-\u06FF]/)
		}
	})

	it("distinguishes offline from error", () => {
		// They are different facts: one is the design, the other is a fault.
		expect(saleStateLabel("offline")).not.toBe(saleStateLabel("error"))
		expect(saleStateLabel("offline")).toContain("دون اتصال")
	})

	it("never claims a connection fault for a state it does not know", () => {
		// The exact regression: the old `v-else` printed the fault message for
		// every unrecognised value, including `undefined`.
		expect(saleStateLabel("something-new")).not.toContain("مشكلة في الاتصال")
		expect(saleStateLabel(undefined)).not.toContain("مشكلة في الاتصال")
		expect(saleStateLabel(null)).not.toContain("مشكلة في الاتصال")
		expect(saleStateLabel("")).not.toContain("مشكلة في الاتصال")
	})

	it("still reports a real error as an error", () => {
		// The fix must not soften the one case that IS a fault.
		expect(saleStateLabel("error")).toContain("مشكلة في الاتصال")
	})
})

describe("useSaleStatusLabel", () => {
	it("tracks the ref", () => {
		const state = ref("ready")
		const label = useSaleStatusLabel(state)
		expect(label.value).toBe(saleStateLabel("ready"))
		state.value = "offline"
		expect(label.value).toBe(saleStateLabel("offline"))
	})

	it("degrades to the unknown label rather than to empty text", () => {
		const state = ref("ready")
		const label = useSaleStatusLabel(state)
		state.value = "surprise"
		expect(label.value).toBe(saleStateLabel("unknown"))
		expect(label.value).not.toBe("")
	})
})

describe("the page keeps the extraction, not the chain", () => {
	const sale = readFileSync(
		resolve(process.cwd(), "src/pages/POSSale.vue"),
		"utf8",
	)

	it("imports the composable", () => {
		expect(sale).toContain(
			'import { useSaleStatusLabel } from "@/composables/useSaleStatus"',
		)
	})

	it("does not rebuild the four-branch chain", () => {
		// The ratchet half. Putting `v-else-if syncState === …` back would keep
		// the page green while restoring the confident-wrong status line.
		expect(sale).not.toMatch(/v-else-if="\s*syncState/)
		expect(sale).toContain("{{ saleStatusLabel }}")
	})
})
