/**
 * Login context chips — which runtime facts the login page shows.
 *
 * ## Why this moved out of `Login.vue`
 *
 * `Login.vue` sits under the file-size ratchet (`tests/fileSize.test.js`), and
 * mounting the ops panel on it pushed the file past its cap. The ratchet's
 * answer is "extract the behaviour", not "raise the number" — so this went to
 * its own module and the cap moves down instead.
 *
 * ## Why a table and not three `if` blocks
 *
 * The three chips are the same shape with the same icon-plus-label
 * presentation; the only thing that varies is which value is present. Three
 * `if`s in the page meant the ordering was implicit and untested — a fourth
 * runtime fact (the terminal, the tax profile) would have meant a fourth copy.
 *
 * ## Empty is empty
 *
 * A chip is emitted only when the value behind it exists. No placeholder, no
 * "—" standing in for a branch name the session never carried: the panel is
 * context, and a confident blank reads as a real value.
 */
import { computed } from "vue"

/**
 * Runtime facts worth showing before sign-in, in display order.
 * `pick` reads the value from the sources a caller actually has.
 */
export const CONTEXT_FIELDS = Object.freeze([
	{ id: "tenant", icon: "briefcase", pick: (s) => s.tenantName },
	{ id: "branch", icon: "map-pin", pick: (s) => s.branchName },
	// `posName` is the PAGE prop's name and `posProfile` is the session's.
	// They are the same fact under two names, which is why the prop mapping
	// below is explicit rather than a shared key lookup: a naive `s[key]`
	// silently drops the chip for whichever source happens to be empty.
	{ id: "pos", icon: "monitor", pick: (s) => s.posName ?? s.posProfile },
])

/**
 * Build the chips from a flat source object.
 *
 * Exported for the suite: the cases that matter are the absent ones and the
 * empty-string one, and asserting them through a mounted 1800-line page proves
 * nothing that a direct call does not.
 *
 * @param {object} source `{ tenantName, branchName, posProfile }`
 * @returns {{id: string, icon: string, label: string}[]}
 */
export function buildContextItems(source = {}) {
	const items = []
	for (const field of CONTEXT_FIELDS) {
		const raw = field.pick(source)
		// A whitespace-only name is not a name. `"   "` is truthy in JavaScript,
		// so a stray space in a settings row produced a chip whose label was
		// invisible — a blank box the cashier reads as a real value, which is
		// the exact failure this module refuses elsewhere.
		const label = typeof raw === "string" ? raw.trim() : raw
		if (label)
			items.push({ id: field.id, icon: field.icon, label: String(label) })
	}
	return items
}

/**
 * Reactive chips for the login page. Props win over session values, because a
 * deep link can carry a context the session does not have yet.
 *
 * @param {object} sources
 * @param {import("vue").Ref<string|undefined>} [sources.props] page props
 * @param {object} [sources.session] the current session snapshot
 * @returns {import("vue").ComputedRef<object[]>}
 */
export function useLoginContextItems({ props = {}, session = null } = {}) {
	// Props win over session values, because a deep link can carry a context
	// the session does not have yet.
	const resolve = (propKey, sessionKey) =>
		props[propKey] || session?.[sessionKey] || ""

	return computed(() =>
		buildContextItems({
			tenantName: resolve("tenantName", "tenantName"),
			branchName: resolve("branchName", "branchName"),
			posName: resolve("posName", "posProfile"),
		}),
	)
}

export default useLoginContextItems
