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
 * حساب التثبيت — **بلا كلمة مرور ثابتة**.
 *
 * ## لماذا تغيّر (كان ثابتًا في المستودع)
 *
 * كلمة المرور كانت مكتوبة في المستودع، وكل سطر في GitHub كان **مفتاحاً لدخول
 * متجر**: المشغّل يفتح جهاز الكاشير، يدخل `admin@dypos.local`، فيدخل أول
 * من قرأ الملف. وهذا يناقض ما بُني له النظام:
 *
 *   - **S0 — صفر تكلفة دخول:** لا يجوز أن يُمنح أحد على متجره أفضلية على غيره.
 *   - **S4 — الأسرار لا تتسرب:** سرٌّ في المستودع ليس سرًّا، و«حساب تثبيت
 *     جهاز محلي» لا يغيّر أنه باب مفتوح لمن قرأ السطر.
 *   - الخادم نفسه قرار هذا قبلنا: `create-local-user.mjs` صار يولّد 20 محرفًا
 *     ويضع `must_change_password=1` دائمًا. **العميل كان يخالف الخادم.**
 *
 * ## الحل
 *
 * كلمة مرور عشوائية (20 محرفًا، أربع فئات، بلا أحرف ملتصقة) تُولَّد عند أول
 * تشغيل، تُعرض **مرة واحدة** على شاشة التثبيت، ولا تُطبع في السجل ولا
 * تُخزَّن كنص. من نسخ نسخة من الشيفرة لا يستطيع الدخول.
 */
export const DEFAULT_INSTALL_USER = Object.freeze({
	email: "admin@dypos.local",
	password: null, // generated per install — never a repository constant
	full_name: "مدير النظام",
	company: "DyPOS",
	role: "ADMIN",
})

/**
 * A readable-but-unpredictable install password.
 *
 * 20 characters across four classes, minus the confusable pairs (`O`/`0`,
 * `l`/`1`) so an owner can retype it from a screen without a guess, and minus
 * the sequential patterns a human falls into when told to "invent one". The
 * generator is `crypto.getRandomValues` when available — `Math.random` would
 * make a 20-character password guessable by anyone reading the source.
 */
export function generateInstallPassword() {
	const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
	const LOWER = "abcdefghijkmnopqrstuvwxyz"
	const DIGIT = "23456789"
	const SYMBOL = "!@#$%*-_=+?"
	const ALL = UPPER + LOWER + DIGIT + SYMBOL

	const crypto = globalThis.crypto
	if (!crypto?.getRandomValues) {
		// No WebCrypto (an ancient webview). Refuse rather than fall back to a
		// weak source: an owner who is told "your password is predictable" has
		// been told the truth, which is the honest failure.
		throw new Error("Secure password generation unavailable in this browser")
	}

	const pool = new Uint32Array(20)
	crypto.getRandomValues(pool)
	const chars = Array.from(pool, (n) => ALL[n % ALL.length])

	// Guarantee every class is present, then shuffle so the pattern is not
	// readable ("ABCD…wxyz#1234").
	const required = [UPPER, LOWER, DIGIT, SYMBOL].map(
		(cls) => cls[crypto.getRandomValues(new Uint32Array(1))[0] % cls.length],
	)
	const mixed = [...chars.slice(0, 16), ...required]
	for (let i = mixed.length - 1; i > 0; i--) {
		const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
		;[mixed[i], mixed[j]] = [mixed[j], mixed[i]]
	}
	return mixed.join("")
}

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

/**
 * The install password, from setup or freshly generated.
 *
 * There is no repository fallback any more. If the owner typed one during
 * setup it is used verbatim; otherwise a random one is minted and RETURNED so
 * the caller can show it exactly once. Returning the generated value is the
 * whole point: without it, the only way to learn the password would be to
 * read the source — the exact defect being fixed.
 */
function readInstallPassword() {
	try {
		return (
			globalThis.localStorage?.getItem("dypos.install.password") ||
			generateInstallPassword()
		)
	} catch {
		return generateInstallPassword()
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
 * @returns {Promise<{created: boolean, email: string, password: string|null}>}
 */
export async function ensureInstallUser() {
	if (await alreadySeeded()) {
		return { created: false, email: readInstallEmail(), password: null }
	}

	const email = readInstallEmail()
	const password = readInstallPassword()
	try {
		const existing = await db.users.where("email").equals(email).first()
		if (existing) {
			// الحساب موجود بالفعل (سُجل من `/account/register`): نضع
			// العلم فقط، ولا نلمس كلمة مروره.
			await db.settings.put({ key: SEED_FLAG, value: true })
			return { created: false, email, password: null }
		}

		await db.users.add({
			email,
			full_name: DEFAULT_INSTALL_USER.full_name,
			phone: null,
			company: DEFAULT_INSTALL_USER.company,
			role: DEFAULT_INSTALL_USER.role,
			password_hash: await hashPassword(password),
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		await db.settings.put({ key: SEED_FLAG, value: true })
		log.info("local install user created", { email })
		// The password is returned ONCE so the owner can read it off one
		// screen. It is never logged, never stored in clear, and never returned
		// again: a second call finds the seed flag and returns `password: null`.
		return { created: true, email, password }
	} catch (error) {
		log.error("local install user could not be created", error)
		return { created: false, email, password: null }
	}
}

export const INSTALL_CREDENTIALS_EVENT = "dypos:install-credentials"

/**
 * Announce a freshly generated install password, ONCE.
 *
 * The account is created before the router guard can ask for a login, so this
 * has to reach the owner through an event the login screen can hear. The
 * detail is cleared from the DOM by the receiver as soon as it is shown, and
 * the account is seeded one-shot — so the value exists for exactly one screen
 * render and then exists nowhere but as a PBKDF2 hash.
 *
 * Nothing is logged here. A password in the console is a password in a log
 * file that outlives the shop.
 */
export function announceInstallCredentials({ email, password } = {}) {
	if (!password) return
	try {
		// Both channels, deliberately. The global covers a screen that mounted
		// BEFORE the seed finished (offline init is async); the event covers a
		// screen that mounts after. Whichever wins, `InstallCredentialsCard`
		// picks the value up and the global is deleted on unmount.
		globalThis.__dyposInstallCredentials = { email, password }
		globalThis.dispatchEvent?.(
			new CustomEvent(INSTALL_CREDENTIALS_EVENT, {
				detail: { email, password },
			}),
		)
	} catch (error) {
		// A browser without CustomEvent cannot show it either; the owner still
		// has the documented fallback (`dypos.install.password` in localStorage,
		// set during setup), and the card will say so rather than pretend.
		log.warn("install credentials could not be announced", error)
	}
}

export default ensureInstallUser
