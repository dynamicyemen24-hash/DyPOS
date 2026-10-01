import { describe, expect, it } from "vitest"
import {
	CAPABILITIES,
	composeCapabilities,
	getEnabledCommerceModules,
	getCapabilitiesForIndustry,
	getIndustryProfile,
	recommendIndustryProfiles,
	suggestIndustryProfile,
} from "@/config/industryProfiles"

describe("industry profiles", () => {
	it("provides a safe retail default for unknown profiles", () => {
		expect(getIndustryProfile("unknown").id).toBe("retail")
		expect(getCapabilitiesForIndustry("unknown")).toContain(
			CAPABILITIES.PRODUCT,
		)
	})

	it("composes capabilities for specialist businesses", () => {
		expect(getCapabilitiesForIndustry("tailoring")).toEqual(
			expect.arrayContaining([
				CAPABILITIES.MEASUREMENT,
				CAPABILITIES.WORK_ORDER,
				CAPABILITIES.PRODUCTION,
			]),
		)
		expect(getCapabilitiesForIndustry("pharmacy")).toEqual(
			expect.arrayContaining([
				CAPABILITIES.BATCH_EXPIRY,
				CAPABILITIES.PRESCRIPTION,
			]),
		)
	})

	it("suggests an activity from Arabic onboarding text", () => {
		expect(suggestIndustryProfile("محل خياطة وتطريز").id).toBe("tailoring")
		expect(suggestIndustryProfile("ورشة ميكانيكا سيارات").id).toBe("workshop")
		expect(suggestIndustryProfile("سوق خضار وفواكه ووسيط").id).toBe(
			"produce-market",
		)
	})

	it("composes multiple activities with platform defaults", () => {
		const capabilities = composeCapabilities(["tailoring", "retail"])
		expect(capabilities).toContain(CAPABILITIES.OFFLINE)
		expect(capabilities).toContain(CAPABILITIES.MEASUREMENT)
		expect(capabilities).toContain(CAPABILITIES.PRODUCTION)
	})

	it("returns explainable ranked recommendations", () => {
		const results = recommendIndustryProfiles("محل خياطة وتطريز", 2)
		expect(results[0]).toMatchObject({ id: "tailoring" })
		expect(results[0].matchScore).toBeGreaterThan(0)
	})

	it("exposes only modules backed by the active capability set", () => {
		const modules = getEnabledCommerceModules(composeCapabilities(["salon"]))
		expect(modules.map((module) => module.id)).toEqual(
			expect.arrayContaining(["catalog", "customers", "appointments"]),
		)
		expect(modules.map((module) => module.id)).not.toContain("production")
		const marketModules = getEnabledCommerceModules(
			composeCapabilities(["produce-market"]),
		)
		expect(marketModules.map((module) => module.id)).toContain(
			"third-party-sales",
		)
	})
})
