/**
 * Device probes — one health shape for printer, scale, drawer and tax.
 *
 * Every probe answers the SAME four questions, because a dashboard whose
 * rows disagree in shape is a dashboard nobody trusts:
 *
 *   state     ok | warn | error | unknown   — never a bare boolean
 *   detail    an Arabic sentence a cashier can act on
 *   checkedAt when it was actually probed (not when the panel rendered)
 *   actionable what to do next, when there IS something to do
 *
 * ## The rule that matters most: never report a device as fine on no evidence
 *
 * A probe with no access to the device returns `unknown`, not `ok`. This is
 * the same principle as the AGENTS.md rule that a dashboard must carry its
 * provenance: a confident green row for a printer that was never contacted is
 * worse than a grey row, because it is what a manager trusts at 9pm.
 *
 * `unknown` is therefore a first-class state everywhere below, and the panel
 * renders it visibly rather than folding it into "ok".
 *
 * No probe reaches the network. AGENTS.md invariant 8: nothing here runs at
 * boot without a user asking; the caller invokes `runAll()` from a button.
 */
import { getQZStatus } from "@/utils/qzTray"

/** The four device classes a till actually has, with Arabic labels. */
export const DEVICE_KINDS = Object.freeze([
	{ id: "printer", label: "طابعة الفواتير" },
	{ id: "scale", label: "الميزان" },
	{ id: "drawer", label: "درج النقدية" },
	{ id: "tax", label: "الفوترة الضريبية" },
])

export const DEVICE_STATES = Object.freeze(["ok", "warn", "error", "unknown"])

const STATE_DETAIL = {
	ok: "الجهاز متصل ويعمل",
	warn: "الجهاز متصل ويحتاج انتباهًا",
	error: "تعذر الاتصال بالجهاز",
	unknown: "لم يتم الفحص بعد",
}

function result(
	kind,
	state,
	detail,
	{ actionable = "", checkedAt = null } = {},
) {
	return {
		kind,
		state: DEVICE_STATES.includes(state) ? state : "unknown",
		detail: detail || STATE_DETAIL[state] || STATE_DETAIL.unknown,
		actionable,
		checkedAt,
	}
}

/**
 * Printer probe — via the QZ Tray bridge the till already uses for receipts.
 *
 * Read against `getQZStatus()` as it actually is (`qzTray.js`): a SYNCHRONOUS
 * snapshot with `connected`, `connecting`, `printer` (a single saved name) and
 * `lastError`. There is no printer LIST and no promise, so a probe that
 * `await`ed it or read `.printers` would have reported "no printers" on a
 * perfectly healthy till.
 *
 * The three outcomes are kept distinct because they send a technician to
 * different places:
 *   - bridge down        → the local printing service is not running
 *   - bridge up, no name → nothing is configured yet
 *   - bridge up, named   → configured; whether the CABLE is in is not
 *                         knowable from software, and is not claimed
 *
 * @returns {object} device result
 */
export function probePrinter() {
	const at = new Date().toISOString()
	try {
		const status = getQZStatus()

		if (status?.connecting) {
			return result("printer", "warn", "جارٍ الاتصال بخدمة الطباعة", {
				actionable: "انتظر لحظة ثم أعد الفحص",
				checkedAt: at,
			})
		}
		if (!status?.connected) {
			return result("printer", "warn", "خدمة الطباعة المحلية غير متاحة", {
				actionable: "شغّل برنامج الطباعة على هذا الجهاز ثم أعد الفحص",
				checkedAt: at,
			})
		}
		if (!status.printer) {
			return result(
				"printer",
				"unknown",
				"خدمة الطباعة تعمل لكن لم تُحدَّد طابعة",
				{
					actionable: "اختر الطابعة من إعدادات الأجهزة",
					checkedAt: at,
				},
			)
		}
		return result("printer", "ok", `الطابعة المختارة: ${status.printer}`, {
			checkedAt: at,
		})
	} catch {
		// The probe itself failed. Saying "the printer is broken" when we
		// could not even ask is the confident-wrong this module refuses.
		return result("printer", "unknown", "تعذر فحص الطابعة", {
			actionable: "أعد المحاولة، وتأكد من تشغيل خدمة الطباعة",
			checkedAt: at,
		})
	}
}

/**
 * Scale probe — through the HAL, not by sniffing USB.
 *
 * The scale HAL already answers "is this browser able to read a scale"; the
 * panel reuses that verdict rather than opening its own connection, because
 * two probes for one device is one probe too many to keep honest.
 *
 * @param {object} [scaleService] an `createScaleService()` instance
 * @returns {object} device result (synchronous: a capability probe)
 */
export function probeScale(scaleService) {
	const at = new Date().toISOString()
	if (!scaleService) {
		return result("scale", "unknown", "لم يتم إعداد الميزان بعد", {
			actionable: "اربط الميزان من شاشة البيع",
			checkedAt: at,
		})
	}

	const status = scaleService.state.value?.status
	if (status === "connected") {
		return result("scale", "ok", "الميزان موصول ويبث القراءات", {
			checkedAt: at,
		})
	}
	if (status === "unsupported") {
		return result("scale", "warn", "هذا المتصفح لا يقرأ الميزان مباشرة", {
			actionable: "استخدم جسرًا محليًا من الإعدادات",
			checkedAt: at,
		})
	}
	if (status === "error") {
		return result(
			"scale",
			"error",
			scaleService.state.value?.statusText || "تعذر الاتصال بالميزان",
			{ actionable: "تأكد من توصيل الميزان ثم أعد الربط", checkedAt: at },
		)
	}
	return result("scale", "unknown", "الميزان غير موصول", {
		actionable: "اربط الميزان من شاشة البيع",
		checkedAt: at,
	})
}

/**
 * Cash drawer probe.
 *
 * The drawer has no read-back on almost any till, so "is it closed?" is not
 * answerable from software and this says so rather than guessing. What IS
 * answerable is whether the bridge that pulses it is present — that is the
 * thing that actually fails in the field.
 *
 * @returns {object} device result
 */
export function probeDrawer() {
	const at = new Date().toISOString()
	try {
		const status = getQZStatus()
		if (!status?.connected) {
			return result("drawer", "warn", "تعذر الوصول إلى جسر درج النقدية", {
				actionable: "الدرج يعمل عبر نفس خدمة الطباعة — تأكد من تشغيلها",
				checkedAt: at,
			})
		}
		// Deliberately `ok` with the caveat IN the text: the bridge is
		// available. The caveat travels with the claim so no later screen can
		// re-read this row as "the drawer reports its state".
		return result(
			"drawer",
			"ok",
			"جسر الدرج متاح — لا تُقرأ حالة الدرج عن بُعد",
			{ checkedAt: at },
		)
	} catch {
		return result("drawer", "unknown", "تعذر فحص الدرج", { checkedAt: at })
	}
}

/**
 * Tax / e-invoicing probe — configuration and connectivity.
 *
 * This one is honestly configuration-only: the e-invoice queue state is
 * local, so reporting it as "tax is fine" when no invoice has ever been
 * submitted would be exactly the confident-empty problem. Untested is
 * `unknown`, not `ok`.
 *
 * @param {object} [taxState] `{ configured, submitted, lastError }`
 * @returns {object} device result
 */
export function probeTax(taxState = {}) {
	const at = new Date().toISOString()
	if (!taxState.configured) {
		return result("tax", "warn", "الفوترة الضريبية غير مهيأة", {
			actionable: "أكمل بيانات الفوترة من الإعدادات",
			checkedAt: at,
		})
	}
	if (taxState.lastError) {
		return result("tax", "error", `آخر خطأ في الفوترة: ${taxState.lastError}`, {
			actionable: "راجع سجل الفواتير الضريبية",
			checkedAt: at,
		})
	}
	if (taxState.submitted === true) {
		return result("tax", "ok", "الفوترة الضريبية مهيأة وتمت أول فاتورة", {
			checkedAt: at,
		})
	}
	return result("tax", "unknown", "الفوترة مهيأة ولم تُختبر بفاتورة بعد", {
		actionable: "أرسل فاتورة تجريبية للتأكد من الاتصال",
		checkedAt: at,
	})
}

/**
 * Run every probe and return one row per device.
 *
 * All four probes are synchronous today (`getQZStatus` is a snapshot), so the
 * runner is too — and the function stays `async` on purpose: the printer and
 * tax probes are the two most likely to grow into real I/O, and a caller that
 * already awaits will not break when they do.
 *
 * Every probe RESOLVES to a result rather than throwing, so one failing
 * device can never blank the panel — the other three are still worth showing.
 *
 * @param {object} [context]
 * @param {object} [context.scaleService]
 * @param {object} [context.taxState]
 * @returns {Promise<object[]>} rows, one per DEVICE_KINDS entry, in order
 */
export async function runDeviceProbes(context = {}) {
	const rows = [
		probePrinter(),
		probeScale(context.scaleService),
		probeDrawer(),
		probeTax(context.taxState),
	]

	// Canonical order, independent of the order probes happen to complete.
	return DEVICE_KINDS.map((kind) =>
		rows.find((row) => row.kind === kind.id),
	).filter(Boolean)
}

/**
 * Roll rows up into one banner state.
 *
 * `error` beats `warn` beats `unknown` beats `ok`, so a single failed device
 * is never hidden behind three healthy ones — and `unknown` never rolls up to
 * `ok` either, which is the whole point of having the state.
 *
 * @param {object[]} rows
 * @returns {"ok"|"warn"|"error"}
 */
export function overallDeviceState(rows) {
	if (!Array.isArray(rows) || rows.length === 0) return "warn"
	if (rows.some((r) => r.state === "error")) return "error"
	if (rows.some((r) => r.state === "warn")) return "warn"
	if (rows.some((r) => r.state === "unknown")) return "warn"
	return "ok"
}

export default runDeviceProbes
