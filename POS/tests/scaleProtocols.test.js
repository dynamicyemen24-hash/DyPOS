/**
 * Scale protocol adapters — frames as the vendors actually send them.
 *
 * The point of these tests is NOT "does a regex match a string". It is that
 * a weighing scale's frame carries facts a cashier's money depends on, and
 * each fact has a frame that proves it:
 *
 *   - **stability** — the single fact that decides whether a field may be
 *     written. A protocol that loses it is worse than no protocol.
 *   - **units** — a bare number and a number in pounds are not the same sale.
 *   - **negativity** — a tare offset is not a negative weight, and treating
 *     it as one turns a returned crate into a refund.
 *   - **detection order** — the streaming parser matches a bare number, which
 *     is a prefix of every other grammar. If it ever runs first, `ST,GS,+…`
 *     loses its stable flag and the load gets priced while moving.
 *
 * The frames below are transcribed from vendor documentation, not invented to
 * fit the parser.
 */
import { describe, expect, it } from "vitest"
import cas from "@/services/scale/protocols/casProtocol"
import mettlerToledo from "@/services/scale/protocols/mettlerToledoProtocol"
import stream from "@/services/scale/protocols/streamProtocol"
import {
	detectProtocol,
	needsSettlingFor,
	parseFrame,
	protocolById,
	SUPPORTED_PROTOCOL_IDS,
} from "@/services/scale/protocols"

describe("CAS / Digi Star", () => {
	it("reads a stable gross frame", () => {
		const r = cas.parse("ST,GS,+  1.234kg")
		expect(r.ok).toBe(true)
		expect(r.weightKg).toBeCloseTo(1.234, 9)
		expect(r.stable).toBe(true)
		expect(r.net).toBe(false)
	})

	it("reads a net frame and marks it net", () => {
		const r = cas.parse("WT,GN,+  2.500kg")
		expect(r.net).toBe(true)
		expect(r.stable).toBe(true)
	})

	it("reports motion as unstable — this is what protects the price field", () => {
		// MD = the load is still moving. Filling a quantity here is how a
		// customer is charged for a weight they never settled on.
		expect(cas.parse("ST,MD,+  1.234kg").stable).toBe(false)
		expect(cas.parse("ST,US,+  1.234kg").stable).toBe(false)
	})

	it("surfaces a scale error instead of a weight", () => {
		const r = cas.parse("ST,BT,+  0.000kg")
		expect(r.ok).toBe(true)
		expect(r.error).toBe(true)
		expect(r.stable).toBe(false)
	})

	it("takes stability from the status field alone", () => {
		// The mode field is two characters by the grammar, so a "tare mode"
		// check there would be dead code dressed as a safety rule. Only the
		// status decides readiness.
		expect(cas.parse("ST,GS,+  0.000kg").stable).toBe(true)
	})

	it("keeps weight positive while recording the negative flag", () => {
		// CAS puts the sign of the TARE offset in the sign field. A negative
		// weight is not a thing a scale reports.
		const r = cas.parse("ST,GS,-  1.500kg")
		expect(r.weightKg).toBeCloseTo(1.5, 9)
		expect(r.negative).toBe(true)
	})

	it("converts grams and pounds to kilograms", () => {
		expect(cas.parse("ST,GS,+  512g").weightKg).toBeCloseTo(0.512, 9)
		describe("Mettler-Toledo", () => {
			it("reads the S-prefixed stable frame", () => {
				const r = mettlerToledo.parse("S+0001.234kg")
				expect(r.ok).toBe(true)
				expect(r.weightKg).toBeCloseTo(1.234, 9)
				expect(r.stable).toBe(true)
			})

			it("reads the SI form with a space before the unit", () => {
				expect(mettlerToledo.parse("SI+0012.345 kg").weightKg).toBeCloseTo(
					12.345,
					9,
				)
			})

			it("marks D (dynamic) as unstable", () => {
				expect(mettlerToledo.parse("D+0001.234kg").stable).toBe(false)
			})

			it("marks N as net and stable", () => {
				const r = mettlerToledo.parse("N+0001.234kg")
				expect(r.net).toBe(true)
				expect(r.stable).toBe(true)
			})

			it("accepts a bare number and SAYS the unit was assumed", () => {
				// Configured-over-cable scales emit no unit. Assuming kg is correct for
				// retail, but the HAL must not pretend the scale said "kg".
				const r = mettlerToledo.parse("S+0012.345")
				expect(r.ok).toBe(true)
				expect(r.unit).toBe("kg")
				expect(r.unitAssumed).toBe(true)
			})

			it("does not assume when the unit is present", () => {
				expect(mettlerToledo.parse("S+0000512g").unitAssumed).toBe(false)
			})
		})

		describe("Zebra / Avery streaming", () => {
			it("reads a plain streaming line", () => {
				const r = stream.parse("  12.345 kg")
				expect(r.ok).toBe(true)
				expect(r.weightKg).toBeCloseTo(12.345, 9)
			})

			it("claims NO stability from a bare number", () => {
				// The whole reason `needsSettling` exists: a streaming scale never
				// says "stable", so the HAL must infer it and must not fake it.
				expect(stream.parse("12.345 kg").stable).toBe(false)
				expect(stream.needsSettling).toBe(true)
			})

			it("honours an explicit ST word when the model sends one", () => {
				expect(stream.parse("ST 12.345 kg").stable).toBe(true)
			})

			it("refuses to price a frame the scale marked unstable", () => {
				const r = stream.parse("US 12.345 kg")
				expect(r.stable).toBe(false)
				expect(r.weightKg).toBeNull()
			})

			it("reads a negative stream reading but keeps the magnitude positive", () => {
				const r = stream.parse("-2.000 kg")
				describe("registry and detection order", () => {
					it("identifies each vendor frame", () => {
						expect(detectProtocol("ST,GS,+  1.234kg")).toBe("cas")
						expect(detectProtocol("S+0001.234kg")).toBe("mettler-toledo")
						expect(detectProtocol("  12.345 kg")).toBe("zebra-avery")
					})

					it("never lets the bare-number parser steal a CAS frame", () => {
						// THE regression this pins. `stream` matches a plain number, which is a
						// prefix of every other grammar; tried first it would return
						// stable:false for a frame whose scale explicitly said ST.
						const r = parseFrame("ST,GS,+  1.234kg")
						expect(r.protocol).toBe("cas")
						expect(r.stable).toBe(true)
					})

					it("honours an explicitly configured protocol over detection", () => {
						// A store that KNOWS its scale is not at the mercy of grammar order.
						const r = parseFrame("S+0001.234kg", {
							preferredId: "mettler-toledo",
						})
						expect(r.protocol).toBe("mettler-toledo")
					})

					it("reports an unknown protocol rather than guessing a weight", () => {
						const r = parseFrame("!!garbage!!")
						expect(r.ok).toBe(false)
						expect(r.reason).toBe("unsupported-protocol")
					})

					it("exposes every registered protocol by id", () => {
						for (const id of SUPPORTED_PROTOCOL_IDS) {
							expect(protocolById(id), id).toBeTruthy()
						}
						expect(protocolById("nope")).toBeNull()
					})

					it("marks exactly the frame-less protocol as needing settling", () => {
						expect(needsSettlingFor("zebra-avery")).toBe(true)
						expect(needsSettlingFor("cas")).toBe(false)
						expect(needsSettlingFor("mettler-toledo")).toBe(false)
						expect(needsSettlingFor(null)).toBe(false)
					})

					it("every protocol ships an Arabic label (invariant 7)", () => {
						for (const id of SUPPORTED_PROTOCOL_IDS) {
							const p = protocolById(id)
							expect(p.labelAr, id).toBeTruthy()
							expect(p.labelAr, id).toMatch(/[\u0600-\u06FF]/)
						}
					})
				})
				expect(r.weightKg).toBeCloseTo(2, 9)
				expect(r.negative).toBe(true)
			})
		})
		expect(cas.parse("ST,GS,+  1lb").weightKg).toBeCloseTo(0.45359237, 9)
	})

	it("refuses an unknown status instead of guessing", () => {
		expect(cas.parse("ST,ZZ,+  1.234kg").reason).toBe("cas-unknown-status")
	})

	it("refuses a frame it does not match rather than inventing a weight", () => {
		expect(cas.parse("hello").ok).toBe(false)
		expect(cas.parse("").ok).toBe(false)
	})
})
