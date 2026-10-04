/**
 * useShiftOps — the data behind `ShiftOpsPanel`, and nothing else.
 *
 * Two responsibilities, both local:
 *   - WHICH announcement is on screen → the announcements list
 *   - whether the device panel is open  → a boolean the user toggles
 *
 * ## The announcements come from IndexedDB, never from the network
 *
 * `getSetting` reads the local Dexie settings table. That is deliberate on
 * both counts AGENTS.md cares about:
 *
 *   - **Invariant 8 (standalone-first).** A fetch here would be a request on
 *     a screen the cashier opens without asking for one. The login page is the
 *     first thing that paints; it must render from local state.
 *   - **The notice is shift copy, not reference data.** It is authored in the
 *     settings screen and read at the till, exactly like the tax profile.
 *
 * ## A missing or malformed value is EMPTY, not a default notice
 *
 * `getSetting` returns the default on any failure, and the row it returns is
 * whatever was stored. So the array is validated here rather than trusted: a
 * settings row that is a string, an object, or a JSON blob that will not parse
 * yields `[]`, and the ticker then hides itself. There is deliberately NO
 * placeholder — AGENTS.md's "an empty list is not a measurement" applied to
 * announcements means a fabricated exchange rate is worse than no rate at all.
 */
import { onMounted, ref } from "vue"

import { getSetting } from "@/utils/offline/db"

/** Settings key holding the shift announcements array. */
export const ANNOUNCEMENTS_KEY = "shift_announcements"

/**
 * Coerce a stored value into an array of announcement rows.
 *
 * Exported for the suite: the interesting cases are the ones a settings screen
 * can actually produce — a JSON string from a text field, a single object from
 * a "one notice" quick-add, and an object where an array was expected.
 *
 * @param {unknown} stored
 * @returns {object[]}
 */
export function parseAnnouncements(stored) {
	let value = stored

	// A textarea holding one JSON array arrives as a string.
	if (typeof value === "string") {
		const text = value.trim()
		if (!text) return []
		try {
			value = JSON.parse(text)
		} catch {
			// Unparseable is NOT a single notice. A half-written `[{"text":` is
			// a settings mistake, and showing it as text would put JSON on the
			// cashier's screen at 9am.
			return []
		}
	}

	if (Array.isArray(value)) return value
	// A lone object is a legitimate "one notice" row.
	if (value && typeof value === "object") return [value]
	return []
}

export function useShiftOps() {
	const announcements = ref([])
	const opsOpen = ref(false)

	/**
	 * Read the announcements once, on mount.
	 *
	 * `parseAnnouncements` never throws, and `getSetting` already swallows its
	 * own failures, so there is no error state to render — the honest outcome
	 * of an unreadable notice is simply no notice.
	 */
	async function load() {
		announcements.value = parseAnnouncements(
			await getSetting(ANNOUNCEMENTS_KEY, []),
		)
	}

	onMounted(load)

	function toggleOps() {
		opsOpen.value = !opsOpen.value
	}

	return { announcements, opsOpen, toggleOps, load }
}

export default useShiftOps
