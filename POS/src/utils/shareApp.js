/**
 * مشاركة النظام — محلية بالكامل (Web Share أو الحافظة)، بلا أي شبكة.
 *
 * القرارات بأكواد صريحة ليتعامل المتصل بصدق:
 *  - "shared"     تمت المشاركة عبر واجهة الجهاز.
 *  - "dismissed"  أغلق المستخدم واجهة المشاركة — ليست فشلًا، فلا تنبيه.
 *  - "copied"     لا مشاركة في هذا المتصفح فنُسخ الرابط.
 *  - "unsupported" لا مشاركة ولا حافظة — على المتصل إظهار الرابط يدويًا.
 */
export async function shareSystem({ title, text, url } = {}) {
	const nav = globalThis.navigator
	if (nav?.share) {
		try {
			if (!nav.canShare || nav.canShare({ title, text, url })) {
				await nav.share({ title, text, url })
				return "shared"
			}
		} catch (error) {
			if (String(error?.name || "") === "AbortError") return "dismissed"
		}
	}
	try {
		if (nav?.clipboard?.writeText && url) {
			await nav.clipboard.writeText(String(url))
			return "copied"
		}
	} catch {
		/* fall through to unsupported */
	}
	return "unsupported"
}
