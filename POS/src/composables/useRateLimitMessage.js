/**
 * The lockout message, with the countdown formatted in ONE place.
 *
 * ## Why `{0}` and not a template literal
 *
 * The Arabic source string IS the dictionary key, so when the message is
 * translated the number has to travel with it: `انتظر 30 ثانية` becomes
 * `Waiting 30 seconds`, never `30 Waiting seconds`. Interpolating with
 * `${…}` before the lookup would bake the digits into the key and leave every
 * other language with English word order — a bug no unit test on the English
 * bundle would show, because the English bundle is the one that would be
 * checked.
 */
import { __ } from "@/utils/translation"

/**
 * @param {number} retryAfterMs milliseconds until the lockout expires
 * @returns {string} the localised message, digits included
 */
export function rateLimitMessage(retryAfterMs) {
	const seconds = String(Math.ceil(Number(retryAfterMs || 0) / 1000))

	return __("محاولات كثيرة جدًا. انتظر {0} ثانية ثم حاول مرة أخرى.", {
		0: seconds,
	})
}

export default rateLimitMessage
