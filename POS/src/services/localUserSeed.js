/**
 * مُهيّئ المستخدم المحلي — أول تشغيل.
 *
 * المشكلة: التطبيق **مستقل** (لا سرور)، فتسجيل الدخول الأول لا يملك
 * حسابًا لينتظره. `Register` existed but a kiosk is often installed by
 * someone who will not register. Result: the first-run screen asks for
 * credentials that cannot exist yet — a wall with no door.
 *
 * الحل: بذر حساب مدير واحد **عند أول تشغيل فقط**، ثم لا يُلمس أبدًا.
 * الشروط المطبَّقة:
 *  - يعمل مرة واحدة (علم في `settings`)، فإعادة التشغيل لا تعيده.
 *  - لا يكتب فوق حساب موجود بنفس البريد.
 *  - كلمة المرور **لا تُخزَّن كنص** — `hashPassword` (PBKDF2-SHA256) نفسها
 *    التي تستخدمها `userRepository`، فالتنسيق واحد والتوثيق واحد.
 *  - لا يصلح كـ«مفتاح خلفي»: كلمة سره **مكتوبة هنا**
 *    ومرئية في المستودع. هو حساب تثبيت جهاز محلي مثله كمثل
 *    `1234`، والقيمة الحقيقية تُغيَّر فور أول دخول.
 *
 * بعد ذلك: الإعداد الأول الحقيقي هو **تغيير كلمة المرور من الإعدادات**،
 * لا من تعديل الكود.
 */

import db from "./db"
import { hashPassword } from "@/repositories/userRepository"
import { logger } from "@/utils/logger"

const log = logger.create("LocalUserSeed")

/** علم يمنع إعادة البذر. */
const SEED_FLAG = "localUserSeeded.v1"

/**
 * حساب التثبيت. **غيّر كلمة المرور بعد أول دخول.**
 * كلمة المرور مثبّتة في المستودع عمدًا: حساب تثبيت جهاز محلي، لا سرّ خادم.
 */
export const DEFAULT_INSTALL_USER = Object.freeze({
	email: "admin@dypos.local",
	password: "DyPOS@2026",
	full_name: "مدير النظام",
	company: "DyPOS",
	role: "ADMIN",
})

/** يقرأ البريد من الإعدادات حتى يمكن تغييره قبل أول تشغيل. */
function readInstallEmail() {
	try {
		return (
			globalThis.localStorage?.getItem("dypos.install.email") ||
			DEFAULT_INSTALL_USER.email
		)
	} catch {
		return DEFAULT_INSTALL_USER.email
	}
}

function readInstallPassword() {
	try {
		return (
			globalThis.localStorage?.getItem("dypos.install.password") ||
			DEFAULT_INSTALL_USER.password
		)
	} catch {
		return DEFAULT_INSTALL_USER.password
	}
}

async function alreadySeeded() {
	try {
		const row = await db.settings.get(SEED_FLAG)
		return Boolean(row?.value)
	} catch (error) {
		log.warn("could not read the seed flag", error)
		// لا نُبذر عند الشك: التكرار يخلق حسابين بنفس البريد.
		return true
	}
}

/**
 * يضمن وجود حساب مدير واحد. آمن للتكرار.
 * @returns {Promise<{created: boolean, email: string}>}
 */
export async function ensureInstallUser() {
	if (await alreadySeeded()) {
		return { created: false, email: readInstallEmail() }
	}

	const email = readInstallEmail()
	try {
		const existing = await db.users.where("email").equals(email).first()
		if (existing) {
			// الحساب موجود بالفعل (سُجل من `/account/register`): نضع
			// العلم فقط، ولا نلمس كلمة مروره.
			await db.settings.put({ key: SEED_FLAG, value: true })
			return { created: false, email }
		}

		const password_hash = await hashPassword(readInstallPassword())
		await db.users.add({
			email,
			full_name: DEFAULT_INSTALL_USER.full_name,
			phone: null,
			company: DEFAULT_INSTALL_USER.company,
			role: DEFAULT_INSTALL_USER.role,
			password_hash,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		await db.settings.put({ key: SEED_FLAG, value: true })
		log.info("local install user created", { email })
		return { created: true, email }
	} catch (error) {
		log.error("local install user could not be created", error)
		return { created: false, email }
	}
}

export default ensureInstallUser
