/**
 * useOperatorMenu — قائمة المشغّل behind the cashier chip.
 *
 * Why a composable and not three lines in the page: the page is already at its
 * file-size cap, and the ratchet's answer to "the page must grow" is "extract
 * the behaviour" — not "raise the number". The state and the action dispatch
 * are one concern, so they live together here, and the page keeps only the ref
 * and the two template bindings.
 *
 * Every destination below already exists in the app. The menu's job is to make
 * the chip honest, not to invent features.
 */
import { ref } from "vue"
import { goToLogin, goToSettings, goToWorkScreens } from "@/router"
import { terminateSession } from "@/utils/auth"

export function useOperatorMenu() {
	const showOperatorMenu = ref(false)

	function openOperatorMenu() {
		showOperatorMenu.value = true
	}

	function closeOperatorMenu() {
		showOperatorMenu.value = false
	}

	/**
	 * @param {"work"|"settlements"|"settings"|"logout"} key
	 * @returns {Promise<void>|void} logout resolves after the session ends
	 */
	async function onOperatorAction(key) {
		closeOperatorMenu()
		if (key === "work") goToWorkScreens()
		else if (key === "settlements") goToWorkScreens("settlements")
		else if (key === "settings") goToSettings()
		else if (key === "logout") {
			await terminateSession()
			goToLogin()
		}
	}

	return {
		showOperatorMenu,
		openOperatorMenu,
		closeOperatorMenu,
		onOperatorAction,
	}
}
