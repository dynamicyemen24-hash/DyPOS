/**
 * POS header actions & keyboard shortcuts — the two composables that were
 * extracted out of `POSSale.vue` to keep the page under its size cap.
 *
 * Extracting a closure is not a refactor unless the extracted body still
 * *resolves*: the page is 6k lines and nothing in the suite mounts it, so an
 * identifier that stayed behind in the old scope is invisible to every gate and
 * throws only when a cashier presses the key. The pre-fix source had two:
 *
 *   1. `[showHeldSalesPanel, closeHeld]` — `closeHeld` never existed. The array
 *      literal is evaluated when `createKeyboardShortcuts()` runs, i.e. during
 *      `setup()`, so the **whole sale screen** died on open with a
 *      ReferenceError, not just one shortcut.
 *   2. `showSmartDock.value = !showSmartDock.value` in the F8 branch — passed by
 *      the page, never destructured by the composable, so F8 threw while every
 *      other key kept working.
 *
 * And a third, in the page: `@menu-clicked="handleHeaderAction('menu')"` fed a
 * helper that needs `(action, headerActions)`, so the header menu button threw a
 * TypeError on click instead of navigating.
 *
 * The rules below are behavioural where behaviour exists (the composables are
 * plain functions — no DOM, no lifecycle) and source-level only where it does
 * not (the template call site, which needs the SFC compiler to be meaningful).
 */
import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { nextTick, ref } from "vue"

import {
	createHeaderActions,
	handleHeaderAction,
} from "@/composables/usePosHeaderActions"
import { createKeyboardShortcuts } from "@/composables/useKeyboardShortcuts"
import { useConnectionWatch } from "@/composables/useConnectionWatch"

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = resolve(HERE, "..")
const read = (...parts) => readFileSync(join(POS, ...parts), "utf8")

// The header composable imports the router, and the router drags the whole
// offline store chain (Dexie + web workers) into a test that needs one function.
vi.mock("@/router", () => ({ goToWorkScreens: vi.fn() }))

/** A dependency set for `createKeyboardShortcuts` with every slot filled. */
const deps = () => ({
	showShortcutsPanel: ref(false),
	quantityEditor: ref(null),
	showPaymentPanel: ref(false),
	showDiscountPanel: ref(false),
	showCustomerPanel: ref(false),
	showHeldSalesPanel: ref(false),
	showSmartDock: ref(true),
	searchInput: ref(null),
	canCheckout: ref(true),
	cart: ref([{ id: 1 }, { id: 2 }]),
	activeProductIndex: ref(-1),
	closeQuantityEditor: vi.fn(),
	closePayment: vi.fn(),
	handleLogout: vi.fn(),
	openPayment: vi.fn(),
	holdSale: vi.fn(),
	removeItem: vi.fn(),
	allowHold: () => true,
})

/** A KeyboardEvent stand-in — the handler only reads key/shiftKey/target. */
const key = (k, { shiftKey = false, ctrlKey = false, target = {} } = {}) => ({
	key: k,
	shiftKey,
	ctrlKey,
	metaKey: false,
	target,
	preventDefault: vi.fn(),
})

describe("createKeyboardShortcuts", () => {
	it("constructs without throwing — every closer in the stack resolves", () => {
		// The exact pre-fix failure: a ReferenceError thrown by the array literal
		// inside the factory, i.e. during the page's setup().
		expect(() => createKeyboardShortcuts(deps())).not.toThrow()
	})

	it("F8 toggles the smart cashier dock (the ref must actually be bound)", async () => {
		const d = deps()
		const { handleKeydown } = createKeyboardShortcuts(d)

		expect(d.showSmartDock.value).toBe(true)
		await handleKeydown(key("F8"))
		expect(d.showSmartDock.value, "F8 did not reach the dock ref").toBe(false)
		await handleKeydown(key("F8"))
		expect(d.showSmartDock.value).toBe(true)
	})

	it("F2 focuses the search box", async () => {
		const d = deps()
		const focus = vi.fn()
		d.searchInput.value = { focus }
		const { handleKeydown } = createKeyboardShortcuts(d)

		await handleKeydown(key("F2"))
		await nextTick()
		expect(focus).toHaveBeenCalled()
	})

	it("Shift+Escape logs out", async () => {
		const d = deps()
		const { handleKeydown } = createKeyboardShortcuts(d)

		await handleKeydown(key("Escape", { shiftKey: true }))
		expect(d.handleLogout).toHaveBeenCalledTimes(1)
	})

	it("Escape closes the top open overlay, highest priority first", async () => {
		const d = deps()
		d.showHeldSalesPanel.value = true
		d.showPaymentPanel.value = true
		const { handleKeydown } = createKeyboardShortcuts(d)

		await handleKeydown(key("Escape"))
		expect(d.closePayment, "payment outranks held sales").toHaveBeenCalledTimes(
			1,
		)
		expect(d.showHeldSalesPanel.value, "only one overlay per Escape").toBe(true)
	})

	it("Ctrl+Enter takes payment, and only when checkout is possible", async () => {
		const d = deps()
		const { handleKeydown } = createKeyboardShortcuts(d)

		await handleKeydown(key("Enter", { ctrlKey: true }))
		expect(
			d.openPayment,
			"the cashier's fastest path to the till",
		).toHaveBeenCalledTimes(1)

		d.canCheckout.value = false
		await handleKeydown(key("Enter", { ctrlKey: true }))
		expect(
			d.openPayment,
			"an empty cart must not open payment",
		).toHaveBeenCalledTimes(1)

		d.canCheckout.value = true
		d.showPaymentPanel.value = true
		await handleKeydown(key("Enter", { ctrlKey: true }))
		expect(d.openPayment, "payment is already open").toHaveBeenCalledTimes(1)
	})

	it("F4 holds the sale, and only when holding is allowed", async () => {
		const d = deps()
		const { handleKeydown } = createKeyboardShortcuts(d)

		await handleKeydown(key("F4"))
		expect(d.holdSale).toHaveBeenCalledTimes(1)

		d.allowHold = () => false
		const guarded = createKeyboardShortcuts(d)
		await guarded.handleKeydown(key("F4"))
		expect(
			d.holdSale,
			"the cashier lacks the permission",
		).toHaveBeenCalledTimes(1)
	})

	it("Delete removes the highlighted cart line, never while typing", async () => {
		const d = deps()
		d.activeProductIndex.value = 1
		const { handleKeydown } = createKeyboardShortcuts(d)

		await handleKeydown(key("Delete"))
		expect(d.removeItem).toHaveBeenCalledWith({ id: 2 })

		d.activeProductIndex.value = 0
		await handleKeydown(
			key("Delete", { target: document.createElement("input") }),
		)
		expect(
			d.removeItem,
			"Delete inside a text field must stay the field's own delete",
		).toHaveBeenCalledTimes(1)
	})
})

describe("useConnectionWatch", () => {
	it("reconnecting restores online + a ready sync state", () => {
		const isOnline = ref(false)
		const syncState = ref("offline")
		const { handleOnline } = useConnectionWatch(isOnline, syncState)

		handleOnline()

		expect(isOnline.value).toBe(true)
		expect(syncState.value).toBe("ready")
	})

	it("losing the network flips the POS into offline", () => {
		const isOnline = ref(true)
		const syncState = ref("ready")
		const { handleOffline } = useConnectionWatch(isOnline, syncState)

		handleOffline()

		expect(isOnline.value).toBe(false)
		expect(syncState.value).toBe("offline")
	})
})

describe("handleHeaderAction", () => {
	it("runs the action and reports it", () => {
		const run = vi.fn()

		expect(handleHeaderAction("menu", { menu: run })).toBe(true)
		expect(run).toHaveBeenCalledTimes(1)
	})

	it("returns false for an unknown key instead of throwing", () => {
		expect(handleHeaderAction("nope", {})).toBe(false)
	})

	it("survives the one-argument call the template used to make", () => {
		// The pre-fix call site: `handleHeaderAction('menu')` threw a TypeError on
		// the click. The guard is what turns that back into a no-op.
		expect(() => handleHeaderAction("menu")).not.toThrow()
	})
})

describe("createHeaderActions", () => {
	it("maps every header key to a callable", () => {
		const actions = createHeaderActions({
			showHeldSalesPanel: ref(false),
			openReturns: vi.fn(),
			showCustomerPanel: ref(false),
		})

		for (const name of ["held", "returns", "customer", "menu"]) {
			expect(typeof actions[name], `header action "${name}"`).toBe("function")

			describe("the call sites in POSSale.vue", () => {
				const posSale = read("src", "pages", "POSSale.vue")

				it("passes every dependency the composable destructures", () => {
					const factory = read("src", "composables", "useKeyboardShortcuts.js")
					const declared = factory.match(
						/export function createKeyboardShortcuts\(\{([\s\S]*?)\}\)/,
					)
					expect(
						declared,
						"the factory's destructuring block moved",
					).not.toBeNull()

					const names = (block) =>
						block
							.split(",")
							.map((name) => name.trim())
							.filter(Boolean)

					const required = names(declared[1])

					const call = posSale.match(
						/createKeyboardShortcuts\(\{([\s\S]*?)\}\)/,
					)
					expect(call, "POSSale.vue no longer calls the factory").not.toBeNull()

					const passed = new Set(names(call[1]))

					expect(
						required.filter((name) => !passed.has(name)),
						"createKeyboardShortcuts() destructures these, and POSSale.vue does " +
							"not pass them: an unfilled slot is an undefined identifier at " +
							"runtime — a key that throws for the cashier, not a build error.",
					).toEqual([])
				})

				it("gives handleHeaderAction both arguments it needs", () => {
					const calls = [
						...posSale.matchAll(/handleHeaderAction\(([^)]*)\)/g),
					].map((match) => match[1])

					expect(
						calls.length,
						"the header menu stopped calling the helper",
					).toBeGreaterThan(0)

					expect(
						calls.filter((args) => args.split(",").length < 2),
						"handleHeaderAction(action, headerActions) — a one-argument call " +
							"renders a button that throws a TypeError when clicked.",
					).toEqual([])
				})

				it("keeps no dead overlay stack behind the extraction", () => {
					expect(
						posSale,
						"POSSale.vue still builds its own Escape stack; the closer lives in " +
							"useKeyboardShortcuts.js now, and two stacks drift apart silently.",
					).not.toContain("createOverlayCloser([")
				})
			})
		}
	})
})
