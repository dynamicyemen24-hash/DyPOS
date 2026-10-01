import { computed, ref } from "vue"
import { defineStore } from "pinia"
import {
	DEFAULT_INDUSTRY_ID,
	composeCapabilities,
	getCapabilitiesForIndustry,
	getIndustryProfile,
	recommendIndustryProfiles,
} from "@/config/industryProfiles"

const STORAGE_KEY = "dypos.industry-profile.v2"

function readStoredIds() {
	try {
		const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
		const parsed = stored ? JSON.parse(stored) : null
		return Array.isArray(parsed) && parsed.length
			? parsed
			: [DEFAULT_INDUSTRY_ID]
	} catch {
		return [DEFAULT_INDUSTRY_ID]
	}
}

export const useIndustryProfileStore = defineStore("industryProfile", () => {
	const industryIds = ref(readStoredIds())
	const industryId = computed(() => industryIds.value[0] || DEFAULT_INDUSTRY_ID)
	const profile = computed(() => getIndustryProfile(industryId.value))
	const profiles = computed(() => industryIds.value.map(getIndustryProfile))
	const capabilities = computed(() => composeCapabilities(industryIds.value))
	const recommendations = ref([])

	function setIndustry(id) {
		const next = getIndustryProfile(id)
		industryIds.value = [next.id]
		persist()
		return next
	}

	function setIndustries(ids) {
		const next = [...new Set(ids.map((id) => getIndustryProfile(id).id))]
		industryIds.value = next.length ? next : [DEFAULT_INDUSTRY_ID]
		persist()
		return profiles.value
	}

	function persist() {
		try {
			globalThis.localStorage?.setItem(
				STORAGE_KEY,
				JSON.stringify(industryIds.value),
			)
		} catch {
			// Local persistence is optional; the active session remains usable.
		}
	}

	function suggest(text) {
		recommendations.value = recommendIndustryProfiles(text)
		return recommendations.value
	}

	function hasCapability(capability) {
		return capabilities.value.includes(capability)
	}

	return {
		industryId,
		industryIds,
		profile,
		profiles,
		capabilities,
		recommendations,
		setIndustry,
		setIndustries,
		suggest,
		hasCapability,
	}
})

export default useIndustryProfileStore
