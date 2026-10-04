/**
 * Shift announcements and device probes — the operational panels.
 *
 * Both modules answer a question a manager asks at opening time, and both
 * share the failure mode this file is written against:
 *
 *   **A confident wrong answer costs more than no answer.**
 *
 * An expired exchange rate that still shows, a printer reported "fine"
 * because nobody asked it, a scale reported "ok" because the browser has the
 * API — each is a row someone trusts and acts on. So every "ok" here must be
 * earned, and `unknown` is a first-class answer.
 */
import { describe, expect, it, vi } from "vitest"

import {
	isActiveAnnouncement,
	normalizeAnnouncement,
	sortAnnouncements,
	useAnnouncements,
	ANNOUNCEMENT_LEVELS,
} from "@/composables/useAnnouncements"

vi.mock("@/utils/qzTray", () => ({
	getQZStatus: vi.fn(() => ({
		connected: true,
		connecting: false,
		printer: "POS-80",
	})),
}))

const {
	DEVICE_KINDS,
	overallDeviceState,
	probeDrawer,
	probePrinter,
	probeScale,
	probeTax,
	runDeviceProbes,
} = await import("@/composables/useDeviceProbes")

const { getQZStatus } = await import("@/utils/qzTray")

describe("normalizeAnnouncement", () => {
	it("accepts a well-formed notice", () => {
		const a = normalizeAnnouncement({
			id: "1",
			text: "سعر الصرف اليوم 3.75",
			level: "info",
		})
		expect(a.text).toBe("سعر الصرف اليوم 3.75")
		expect(a.level).toBe("info")
	})

	it("REJECTS a notice with no text rather than rendering an empty box", () => {
		// An empty row reads to a cashier as "something is wrong here", which
		// is a worse failure than the notice simply not existing.
		expect(normalizeAnnouncement({ id: "2", text: "   " })).toBeNull()
		expect(normalizeAnnouncement({ id: "3" })).toBeNull()
		expect(normalizeAnnouncement(null)).toBeNull()
	})

	it("falls back to info for an unknown level instead of inventing one", () => {
		expect(
			normalizeAnnouncement({ text: "x", level: "apocalyptic" }).level,
		).toBe("info")
	})

	it("truncates absurdly long text rather than breaking the ticker", () => {
		expect(
			normalizeAnnouncement({ text: "ط".repeat(500) }).text.length,
		).toBeLessThanOrEqual(240)
	})

	it("treats an unparseable expiry as undated, not as expired in 1970", () => {
		const a = normalizeAnnouncement({ text: "x", expiresAt: "not-a-date" })
		expect(a.expiresMs).toBeNull()
		expect(isActiveAnnouncement(a)).toBe(true)
	})
})

describe("expiry", () => {
	it("hides an expired notice", () => {
		// A cashier acting on yesterday's exchange rate is a real financial
		// error, so expiry is enforced here rather than trusted to a caller.
		const past = normalizeAnnouncement({
			text: "سعر امبارك",
			expiresAt: "2020-01-01T00:00:00Z",
		})
		expect(isActiveAnnouncement(past)).toBe(false)
	})

	it("is inactive AT the expiry instant, not one tick later", () => {
		// An expiry time is the last moment it is still valid, not the first
		// moment it is dead. The boundary is pinned because `>=` here would
		// keep a notice alive for the entire minute it expires in.
		const at = Date.parse("2020-01-01T00:00:00Z")
		const notice = normalizeAnnouncement({
			text: "سعر",
			expiresAt: "2020-01-01T00:00:00Z",
		})
		expect(isActiveAnnouncement(notice, at)).toBe(false)
		expect(isActiveAnnouncement(notice, at - 1)).toBe(true)
	})

	it("keeps an undated notice forever", () => {
		expect(isActiveAnnouncement(normalizeAnnouncement({ text: "دائم" }))).toBe(
			true,
		)
	})
})

describe("ordering", () => {
	it("puts the most urgent first", () => {
		const rows = [
			{ text: "تعليمات", level: "info", weight: 1, createdMs: 2 },
			{ text: "عاجل", level: "critical", weight: 3, createdMs: 0 },
			{ text: "تنبيه", level: "warning", weight: 2, createdMs: 1 },
		]
		expect(sortAnnouncements(rows).map((r) => r.level)).toEqual([
			"critical",
			"warning",
			"info",
		])
	})

	it("drops an expired notice from the ticker entirely", () => {
		const rows = [
			{
				text: "قديم",
				level: "critical",
				weight: 3,
				createdMs: 2,
				expiresMs: Date.now() - 1000,
			},
			{ text: "سعر اليوم", level: "info", weight: 1, createdMs: 1 },
		]
		// The highest-urgency row was an EXPIRED rate. Sorting alone would
		// put it first; only the filter keeps it off the screen.
		expect(sortAnnouncements(rows).map((r) => r.text)).toEqual(["سعر اليوم"])
	})

	it("never reorders the same input differently between calls", () => {
		// Two same-level notices must not swap places on a re-render, or the
		// cashier re-reads the same screen twice.
		const rows = [
			{ text: "أ", level: "info", weight: 1, createdMs: 1 },
			{ text: "ب", level: "info", weight: 1, createdMs: 1 },
		]
		describe("device probes — never say ok without evidence", () => {
			it("printer is ok only when the bridge is up AND a printer is named", () => {
				getQZStatus.mockReturnValue({
					connected: true,
					connecting: false,
					printer: "POS-80",
				})
				expect(probePrinter().state).toBe("ok")
			})

			it("printer is warn when the local bridge is down", () => {
				getQZStatus.mockReturnValue({
					connected: false,
					connecting: false,
					printer: null,
				})
				expect(probePrinter().state).toBe("warn")
			})

			it("printer is UNKNOWN when the bridge works but nothing is configured", () => {
				// Not "ok": nothing has been printed. The distinction between "not set
				// up" and "working" is the whole point of the `unknown` state.
				getQZStatus.mockReturnValue({
					connected: true,
					connecting: false,
					printer: null,
				})
				expect(probePrinter().state).toBe("unknown")
			})

			it("printer is UNKNOWN when the probe itself throws", () => {
				// Saying "the printer is broken" when we could not even ask is the
				// confident-wrong this module exists to refuse.
				getQZStatus.mockImplementation(() => {
					throw new Error("bridge exploded")
				})
				expect(probePrinter().state).toBe("unknown")
				getQZStatus.mockReturnValue({
					connected: true,
					connecting: false,
					printer: "POS-80",
				})
			})

			it("reads the real getQZStatus shape (singular printer, no promise)", () => {
				// Pinned because the first draft of this probe awaited the snapshot and
				// read `.printers` — both wrong, and both reported a healthy till as
				// having no printers.
				getQZStatus.mockReturnValue({
					connected: true,
					connecting: false,
					printer: "POS-80",
				})
				expect(probePrinter().detail).toContain("POS-80")
			})
		})

		describe("scale probe reuses the HAL verdict", () => {
			const serviceWith = (status, statusText = "") => ({
				state: { value: { status, statusText } },
			})

			it("is ok when the HAL says connected", () => {
				expect(probeScale(serviceWith("connected")).state).toBe("ok")
			})

			it("is warn when the browser cannot read a scale at all", () => {
				expect(probeScale(serviceWith("unsupported")).state).toBe("warn")
			})

			it("is error when the HAL reports a connection failure", () => {
				expect(probeScale(serviceWith("error", "تعذر الاتصال")).state).toBe(
					"error",
				)
			})

			it("is UNKNOWN with no service at all — never a default ok", () => {
				expect(probeScale(null).state).toBe("unknown")
				expect(probeScale(undefined).state).toBe("unknown")
			})
		})

		describe("drawer probe is honest about what it cannot know", () => {
			it("keeps the no-read-back caveat in the text of an ok row", () => {
				getQZStatus.mockReturnValue({
					connected: true,
					connecting: false,
					printer: "POS-80",
				})
				const row = probeDrawer()
				expect(row.state).toBe("ok")
				// The caveat travels WITH the claim, so no later screen can re-read
				// this row as "the drawer reports its own state".
				expect(row.detail).toMatch(/لا تُقرأ/)
			})
		})

		describe("tax probe", () => {
			it("is warn when not configured", () => {
				expect(probeTax({ configured: false }).state).toBe("warn")
			})

			it("is error when a real error was recorded", () => {
				const row = probeTax({ configured: true, lastError: "رفضت الجهة" })
				expect(row.state).toBe("error")
				expect(row.detail).toContain("رفضت الجهة")
			})

			it("is UNKNOWN when configured but never exercised", () => {
				// "Configured" is not "working". Reporting untested as ok is the exact
				// confident-empty this project keeps warning about.
				expect(probeTax({ configured: true }).state).toBe("unknown")
			})

			it("is ok only after a real submission", () => {
				expect(probeTax({ configured: true, submitted: true }).state).toBe("ok")
			})
		})

		describe("runDeviceProbes", () => {
			it("returns one row per device, in a stable order", async () => {
				getQZStatus.mockReturnValue({
					connected: true,
					connecting: false,
					printer: "POS-80",
				})
				const rows = await runDeviceProbes()
				expect(rows.map((r) => r.kind)).toEqual(DEVICE_KINDS.map((k) => k.id))
			})

			it("stamps every row with a parseable check time", async () => {
				getQZStatus.mockReturnValue({
					connected: true,
					connecting: false,
					printer: "POS-80",
				})
				for (const row of await runDeviceProbes()) {
					expect(row.checkedAt, row.kind).toBeTruthy()
					expect(Number.isNaN(Date.parse(row.checkedAt)), row.kind).toBe(false)
				}
			})
		})

		describe("overallDeviceState", () => {
			it("one error outranks healthy devices", () => {
				expect(
					overallDeviceState([
						{ state: "ok" },
						{ state: "ok" },
						{ state: "error" },
						{ state: "ok" },
					]),
				).toBe("error")
			})

			it("never rolls UNKNOWN up to ok", () => {
				expect(
					overallDeviceState([{ state: "ok" }, { state: "unknown" }]),
				).toBe("warn")
			})

			it("is warn for an empty panel, not ok", () => {
				// A panel that checked nothing has told the manager nothing.
				expect(overallDeviceState([])).toBe("warn")
			})

			it("is ok only when every row is genuinely ok", () => {
				expect(overallDeviceState([{ state: "ok" }, { state: "ok" }])).toBe(
					"ok",
				)
			})
		})

		describe("Arabic UX (invariant 7)", () => {
			it("every device kind has an Arabic label", () => {
				for (const kind of DEVICE_KINDS) {
					expect(kind.label, kind.id).toMatch(/[\u0600-\u06FF]/)
				}
			})

			it("every announcement level has an Arabic label", () => {
				for (const level of ANNOUNCEMENT_LEVELS) {
					expect(level.label, level.id).toMatch(/[\u0600-\u06FF]/)
				}
			})

			it("every probe row carries Arabic detail text", () => {
				getQZStatus.mockReturnValue({
					connected: false,
					connecting: false,
					printer: null,
				})
				for (const row of [
					probePrinter(),
					probeScale(null),
					probeDrawer(),
					probeTax({}),
				]) {
					expect(row.detail, row.kind).toMatch(/[\u0600-\u06FF]/)
				}
			})
		})
		expect(sortAnnouncements(rows).map((r) => r.text)).toEqual(
			sortAnnouncements(rows.slice()).map((r) => r.text),
		)
	})
})

describe("useAnnouncements", () => {
	it("reports an EMPTY store as empty rather than inventing one", () => {
		// The AGENTS.md rule applied to announcements: a fabricated rate is
		// worse than no rate, so there is no placeholder and no default text.
		const { isEmpty, headline } = useAnnouncements([])
		expect(isEmpty.value).toBe(true)
		expect(headline.value).toBe("")
	})

	it("survives a malformed row without losing the good ones", () => {
		const { active, isEmpty } = useAnnouncements([
			{ text: "سعر الصرف 3.75", level: "warning" },
			null,
			{ text: "" },
			{ id: "x" },
		])
		expect(isEmpty.value).toBe(false)
		expect(active.value).toHaveLength(1)
	})
})
