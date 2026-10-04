/**
 * Shift announcements — the store's live instructions, on a ticker.
 *
 * What this is for: a cashier who starts a shift must learn today's exchange
 * rate, the delivery cutoff, and the returns policy WITHOUT opening three
 * screens. Those facts change per shift, so they cannot live in a compiled
 * translation table.
 *
 * Two decisions that shape everything else:
 *
 *   1. **Announcements are data, and empty is a valid state.** A store with
 *      no announcements configured gets an empty array and a hidden ticker —
 *      never a placeholder that reads like an instruction. AGENTS.md's
 *      "an empty list is not a measurement" applies to announcements too: a
 *      fabricated rate is worse than no rate.
 *
 *   2. **A URL in an announcement is never rendered as a link.** An
 *      announcement is operational copy authored in the settings screen; if it
 *      ever became HTML or a link, every cashier's till would be one click
 *      from a phishing page. It is rendered as text, always.
 *
 * Priority: higher wins, and ties break on recency, so a same-day override
 * ("rate changed an hour ago") is what the cashier actually sees.
 */
import { computed, ref } from "vue"

/** How urgent a notice is, and the Arabic label that says so. */
export const ANNOUNCEMENT_LEVELS = Object.freeze([
	{ id: "critical", label: "عاجل", weight: 3 },
	{ id: "warning", label: "تنبيه", weight: 2 },
	{ id: "info", label: "تعليمات", weight: 1 },
])

const LEVEL_WEIGHT = new Map(ANNOUNCEMENT_LEVELS.map((l) => [l.id, l.weight]))

/** Longest text we will put on screen without truncating. */
const MAX_LENGTH = 240

/**
 * Normalise one announcement, or return null when it is unusable.
 *
 * Rejecting is deliberate: a row with no text renders as an empty box that
 * the cashier reads as "something is wrong here" — the failure mode this
 * whole module exists to avoid.
 *
 * @param {object} raw
 * @returns {object|null}
 */
export function normalizeAnnouncement(raw) {
	if (!raw || typeof raw !== "object") return null

	const text = String(raw.text ?? raw.message ?? "").trim()
	if (!text) return null

	const level = ANNOUNCEMENT_LEVELS.some((l) => l.id === raw.level)
		? raw.level
		: "info"

	// A clock we cannot parse is an announcement we cannot expire, so it is
	// treated as undated rather than as "expires at the epoch".
	const expiresAt = raw.expiresAt ?? raw.expires_at ?? null
	const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN

	return {
		id: String(raw.id ?? text.slice(0, 32)),
		text: text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text,
		level,
		weight: LEVEL_WEIGHT.get(level),
		expiresMs: Number.isFinite(expiresMs) ? expiresMs : null,
	}
}

/**
 * Is this announcement still worth showing?
 *
 * An expired notice is worse than none: a cashier acting on yesterday's
 * exchange rate is a real financial error, so expiry is enforced here rather
 * than trusted to the caller.
 *
 * The nullish check is deliberate and load-bearing. Rows reach this function
 * from two places — `normalizeAnnouncement` (which always sets `expiresMs`,
 * possibly to `null`) and hand-built rows in tests and callers. A strict
 * `=== null` test would classify a row that simply HAS no expiry key as
 * expired, and the ticker would silently show nothing at all — which reads as
 * "no announcements configured" and hides a live instruction from the shift.
 *
 * @param {object} announcement
 * @param {number} [now]
 * @returns {boolean}
 */
export function isActiveAnnouncement(announcement, now = Date.now()) {
	if (!announcement) return false
	if (announcement.expiresMs == null) return true
	return announcement.expiresMs > now
}

/**
 * Order announcements for display: most urgent first, then newest first.
 *
 * The secondary sort matters more than it looks — two "warning" notices from
 * the same morning must not display in an arbitrary order that changes on
 * every re-render, or the cashier re-reads the same screen twice.
 *
 * @param {object[]} announcements already normalized
 * @param {number} [now]
 * @returns {object[]}
 */
export function sortAnnouncements(announcements, now = Date.now()) {
	return announcements
		.filter((a) => isActiveAnnouncement(a, now))
		.slice()
		.sort((a, b) => {
			if (b.weight !== a.weight) return b.weight - a.weight
			return (b.createdMs ?? 0) - (a.createdMs ?? 0)
		})
}

/**
 * Create the announcements store for one screen.
 *
 * A factory, like the scale service: the login page and a work screen can
 * each hold their own without one leaking announcements into the other.
 *
 * @param {object[]} [initial]
 * @returns {object}
 */
export function useAnnouncements(initial = []) {
	const raw = ref(Array.isArray(initial) ? initial : [])

	const active = computed(() => {
		const normalized = raw.value.map(normalizeAnnouncement).filter(Boolean)
		// `createdMs` is stamped here rather than trusted from the row, so a
		// settings typo cannot make a stale notice outrank a fresh one.
		const stamped = normalized.map((a, index) => ({ ...a, createdMs: index }))
		return sortAnnouncements(stamped)
	})

	const isEmpty = computed(() => active.value.length === 0)
	const headline = computed(() => active.value[0]?.text ?? "")

	return { active, isEmpty, headline, raw }
}

export default useAnnouncements
