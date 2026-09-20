import {
	deleteDraft,
	getDraftsCount,
	saveDraft,
	getAllDrafts,
	updateDraft,
} from "@/utils/draftManager"
import { useToast } from "@/composables/useToast"
import { logger } from "@/utils/logger"
import { defineStore } from "pinia"
import { ref } from "vue"

export const usePOSDraftsStore = defineStore("posDrafts", () => {
	const log = logger.create("POSDrafts")
	// Use custom toast
	const { showSuccess, showError, showWarning } = useToast()

	// State
	const draftsCount = ref(0)
	const drafts = ref([])

	// Actions
	async function updateDraftsCount() {
		try {
			draftsCount.value = await getDraftsCount()
		} catch (error) {
			log.error("Error getting drafts count:", error)
		}
	}

	async function loadDrafts() {
		try {
			drafts.value = await getAllDrafts()
			draftsCount.value = drafts.value.length
		} catch (error) {
			log.error("Error loading drafts:", error)
		}
	}

	async function saveDraftInvoice(
		invoiceItems,
		customer,
		posProfile,
		appliedOffers = [],
		draftId = null,
	) {
		if (invoiceItems.length === 0) {
			showWarning(__("Cannot save an empty cart as draft"))
			return null
		}

		try {
			const draftData = {
				pos_profile: posProfile,
				customer: customer,
				items: invoiceItems,
				applied_offers: appliedOffers, // Save applied offers
			}

			let savedDraft
			if (draftId) {
				savedDraft = await updateDraft(draftId, draftData)
			} else {
				savedDraft = await saveDraft(draftData)
			}

			await loadDrafts() // Refresh drafts list and count

			showSuccess(__("Invoice saved as draft successfully"))

			return savedDraft
		} catch (error) {
			log.error("Error saving draft:", error)
			showError(__("Failed to save draft"))
			return null
		}
	}

	async function loadDraft(draft) {
		try {
			showSuccess(__("Draft invoice loaded successfully"))

			return {
				items: draft.items || [],
				customer: draft.customer,
				applied_offers: draft.applied_offers || [], // Restore applied offers
			}
		} catch (error) {
			log.error("Error loading draft:", error)
			showError(__("Failed to load draft"))
			throw error
		}
	}

	async function deleteDraftById(draftId) {
		try {
			await deleteDraft(draftId)
			await loadDrafts() // Refresh drafts list and count
			showSuccess(__("Draft deleted successfully"))
		} catch (error) {
			log.error("Error deleting draft:", error)
			showError(__("Failed to delete draft"))
		}
	}

	return {
		// State
		draftsCount,
		drafts,

		// Actions
		updateDraftsCount,
		loadDrafts,
		saveDraftInvoice,
		loadDraft,
		deleteDraft: deleteDraftById,
	}
})
