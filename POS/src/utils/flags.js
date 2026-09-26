/**
 * Offline country/language flags — no network, no assets.
 *
 *العقد: the PWA must work 100% offline (see AGENTS.md invariant 8). Flags used to
 * come from `https://flagcdn.com` at runtime, which meant every country and
 * language picker silently rendered an empty box with no connection: the
 * `<img>` failed, and the emoji fallback was unreachable dead code.
 *
 * A flag image is decoration; a national symbol is not something to approximate.
 * So we render the OS flag emoji (drawn by the platform font — zero bytes, zero
 * requests) and always pair it with the ISO 3166-1 alpha-2 code, which stays
 * readable on Windows where flag emoji are not drawn at all.
 */

const GLOBE = "\u{1F310}"

/**
 * Regional indicator symbols: 'US' -> 🇺🇸.
 * Offset 127397 maps ASCII letters onto the U+1F1E6..U+1F1FF block.
 */
export function countryFlagEmoji(countryCode) {
	const code = String(countryCode || "")
		.trim()
		.toUpperCase()
	if (!/^[A-Z]{2}$/.test(code)) return GLOBE
	return String.fromCodePoint(
		...[...code].map((char) => 127397 + char.charCodeAt(0)),
	)
}

/** ISO 3166-1 alpha-2 code, uppercased — the label that always reads. */
export function countryCodeLabel(countryCode) {
	const code = String(countryCode || "")
		.trim()
		.toUpperCase()
	return /^[A-Z]{2}$/.test(code) ? code : ""
}

/**
 * Single display descriptor so every picker renders flags the same way.
 * `hasFlagAsset` is deliberately absent: there is no remote asset any more.
 */
export function flagDescriptor(countryCode) {
	return {
		emoji: countryFlagEmoji(countryCode),
		code: countryCodeLabel(countryCode),
	}
}
