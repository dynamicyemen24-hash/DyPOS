/**
 * موافقة الربط — الفاصل الوحيد بين العمل المستقل وأي اتصال شبكي.
 *
 * العقد (بلا استثناء، وبلا اعتماد على أي سيرفر):
 *   - الوضع الافتراضي `standalone`: صفر طلبات شبكة. كل شيء يعمل محليًا
 *     (Dexie → البيع → الطباعة)، ولا يخرج أي اتصال إلا بطلب صريح من المستخدم.
 *   - الوضع `linked` لا يُمنح إلا بفعل صريح من المستخدم: تسجيل دخول لسيرفر،
 *     ضغطة «مزامنة الآن»، تفعيل المزامنة التلقائية من مركز المزامنة، أو زر
 *     ربط صريح في الإعدادات. لا شيء آخر — لا حدث `online`، لا مؤقّت،
 *     لا فحص إقلاع — يمنح الموافقة أو يستعمل الشبكة.
 *
 * التخزين localStorage (بلا إطار عمل) ليبقى قابلًا للاستيراد من المحركات
 * والـ workers والاختبارات دون دورات استيراد. `subscribe` يُبقي المحركات
 * والواجهة متزامنة لحظيًا عند تغيير المستخدم للوضع.
 */

export const LINK_MODES = Object.freeze({
	STANDALONE: "standalone",
	LINKED: "linked",
})

export const LINK_REASONS = Object.freeze({
	SERVER_LOGIN: "server-login",
	SYNC_NOW: "sync-now",
	AUTO_TOGGLE: "auto-sync-toggle",
	EXPLICIT_CONNECT: "explicit-connect",
	REVOKED: "revoked",
	DEFAULT: "default",
})

const LINK_CONSENT_KEY = "DyPOS_link_consent"

function readStored() {
	try {
		if (typeof localStorage === "undefined") return null
		const raw = localStorage.getItem(LINK_CONSENT_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw)
		if (parsed && parsed.mode === LINK_MODES.LINKED) return parsed
		return null
	} catch {
		return null
	}
}

/** الوضع الفعّال: مرتبط فقط بموافقة محفوظة صالحة، وإلا مستقل. */
export function getLinkMode() {
	const stored = readStored()
	return stored ? LINK_MODES.LINKED : LINK_MODES.STANDALONE
}

/** بوابة المحركات التلقائية: لا شيء تلقائي دون موافقة. */
export function isLinkEnabled() {
	return getLinkMode() === LINK_MODES.LINKED
}

const listeners = new Set()

function notify(mode, reason) {
	for (const fn of [...listeners]) {
		try {
			fn(mode, reason)
		} catch {
			/* مستمع معطوب لا يعطّل البقية */
		}
	}
}

/* =============================================================================
   متغيرات الأتمتة العامة — يحددها المستخدم النهائي من مركز المزامنة.
   ----------------------------------------------------------------------------
   كل حركة تلقائية لها ثلاثة أوضاع (نموذج ملفات المزامنة المؤسسية):
     - "off"  (افتراضي): لا تعمل تلقائيًا أبدًا — الطلب اليدوي فقط.
     - "auto": تعمل تلقائيًا — لكن فقط بموافقة ربط ممنوحة (linked).
     - "ask"  : لا تعمل تلقائيًا، بل تُسوّق للمستخدم عبر عدّاد المعلق
                 وشارة المزامنة — والضغطة منه هي الطلب.
   بلا موافقة ربط: كل الأوضاع تساوي عمليًا "off". لا استثناءات.
   ============================================================================= */

export const AUTO_MODES = Object.freeze({
	OFF: "off",
	AUTO: "auto",
	ASK: "ask",
})

/** محركات الحركة التلقائية المعروفة (مفاتيح مستقرة للاختبارات والواجهة). */
export const AUTO_TRIGGERS = Object.freeze({
	ON_RECONNECT: "on-reconnect",
	POLL: "poll",
	INITIAL_PULL: "initial-pull",
	PUSH_IMMEDIATE: "push-immediate",
	STREAM: "stream",
})

const AUTO_KEY = "DyPOS_link_automation"

const AUTO_DEFAULTS = Object.freeze({
	mode: AUTO_MODES.OFF,
	[AUTO_TRIGGERS.ON_RECONNECT]: AUTO_MODES.OFF,
	[AUTO_TRIGGERS.POLL]: AUTO_MODES.OFF,
	[AUTO_TRIGGERS.INITIAL_PULL]: AUTO_MODES.OFF,
	[AUTO_TRIGGERS.PUSH_IMMEDIATE]: AUTO_MODES.OFF,
	[AUTO_TRIGGERS.STREAM]: AUTO_MODES.OFF,
	pollIntervalSec: 0,
})

function readAutomation() {
	try {
		if (typeof localStorage === "undefined") return { ...AUTO_DEFAULTS }
		const raw = localStorage.getItem(AUTO_KEY)
		if (!raw) return { ...AUTO_DEFAULTS }
		const parsed = JSON.parse(raw)
		if (!parsed || typeof parsed !== "object") return { ...AUTO_DEFAULTS }
		return { ...AUTO_DEFAULTS, ...parsed }
	} catch {
		return { ...AUTO_DEFAULTS }
	}
}

function writeAutomation(next) {
	try {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(AUTO_KEY, JSON.stringify(next))
		}
	} catch {
		/* التخزين ممتلئ: تبقى لجلسة الذاكرة */
	}
}

/** نسخة عميقة سطحية من متغيرات الأتمتة (للقراءة والعرض). */
export function getAutomation() {
	return { ...readAutomation() }
}

function normalizeAutoMode(value) {
	return value === AUTO_MODES.AUTO || value === AUTO_MODES.ASK
		? value
		: AUTO_MODES.OFF
}

/**
 * ضبط وضع محرك (`auto`|`ask`|`off`) — من مفتاح المستخدم في مركز المزامنة.
 * تفعيل أي وضع غير `off` يمنح أيضًا المفتاح الرئيسي ضمنيًا (لا أتمتة
 * صامتة بلا سيد مفعّل يراه المستخدم)، وإطفاء السيد يعيد الكل لـ `off`.
 */
export function setTriggerMode(trigger, mode) {
	if (!Object.values(AUTO_TRIGGERS).includes(trigger)) return getAutomation()
	const prev = JSON.stringify(readAutomation())
	const next = readAutomation()
	next[trigger] = normalizeAutoMode(mode)
	// تفعيل أي محرك يرفع السيد ضمنيًا — لا أتمتة صامتة بلا سيد يراه المستخدم.
	if (next[trigger] !== AUTO_MODES.OFF) next.mode = AUTO_MODES.AUTO
	writeAutomation(next)
	if (JSON.stringify(next) !== prev) notify(getLinkMode(), `trigger:${trigger}`)
	return { ...next }
}

/**
 * المفتاح الرئيسي للأتمتة (`true` = مفعّلة). إطفاؤه يجمّد كل الحركات
 * التلقائية فورًا ويعيد المحركات لـ `off` — إجراء واحد يوقف كل شيء.
 */
export function setAutomationMaster(on) {
	const prev = JSON.stringify(readAutomation())
	const next = readAutomation()
	next.mode = on ? AUTO_MODES.AUTO : AUTO_MODES.OFF
	if (!on) {
		for (const trigger of Object.values(AUTO_TRIGGERS))
			next[trigger] = AUTO_MODES.OFF
	}
	writeAutomation(next)
	if (JSON.stringify(next) !== prev) notify(getLinkMode(), "automation-master")
	return { ...next }
}

/** الفاصل الزمني للاستطلاع الدوري (ثوانٍ). 0 = افتراضي المحرك. */
export function setPollIntervalSec(seconds) {
	const prev = JSON.stringify(readAutomation())
	const next = readAutomation()
	const n = Number.parseInt(seconds, 10)
	next.pollIntervalSec = Number.isFinite(n) && n >= 5 ? Math.min(n, 3600) : 0
	writeAutomation(next)
	if (JSON.stringify(next) !== prev) notify(getLinkMode(), "poll-interval")
	return { ...next }
}

/**
 * بوابة المحركات التلقائية: تعمل الحركة تلقائيًا فقط عندما:
 *   1) موافقة ربط ممنوحة (linked)، و 2) السيد مفعّل، و 3) المحرك `auto`.
 * وضع `ask` لا يشغّل شيئًا — مهمته إظهار المعلق للمستخدم ليطلب بنفسه.
 */
export function isAutoAllowed(trigger) {
	if (!isLinkEnabled()) return false
	const auto = readAutomation()
	if (auto.mode !== AUTO_MODES.AUTO) return false
	return auto[trigger] === AUTO_MODES.AUTO
}

/** الفاصل الفعّال للاستطلاع (مللي ثانية) — إعداد المستخدم أو افتراضي المحرك. */
export function getPollIntervalMs(fallbackMs) {
	const seconds = Number(readAutomation().pollIntervalSec) || 0
	if (seconds >= 5) return seconds * 1000
	return fallbackMs
}

/**
 * منح/سحب الموافقة — يُستدعى فقط من أفعال المستخدم الصريحة.
 * @param {"standalone"|"linked"} mode
 * @param {string} [reason]
 * @returns {"standalone"|"linked"} الوضع الفعّال بعد الكتابة.
 */
export function setLinkMode(mode, reason = LINK_REASONS.DEFAULT) {
	const next =
		mode === LINK_MODES.LINKED ? LINK_MODES.LINKED : LINK_MODES.STANDALONE
	const prev = getLinkMode()
	try {
		if (typeof localStorage !== "undefined") {
			if (next === LINK_MODES.LINKED) {
				localStorage.setItem(
					LINK_CONSENT_KEY,
					JSON.stringify({
						mode: next,
						reason: String(reason || LINK_REASONS.DEFAULT),
						updatedAt: new Date().toISOString(),
					}),
				)
			} else {
				localStorage.removeItem(LINK_CONSENT_KEY)
			}
		}
	} catch {
		/* التخزين ممتلئ: تبقى الموافقة لجلسة الذاكرة فقط */
	}
	if (next !== prev) notify(next, reason)
	return next
}

/** اشتراك المحركات/الواجهة بتغيّر الوضع. يُرجع دالة إلغاء الاشتراك. */
export function subscribeLinkConsent(fn) {
	if (typeof fn !== "function") return () => {}
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}
