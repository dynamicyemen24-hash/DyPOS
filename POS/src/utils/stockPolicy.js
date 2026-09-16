/**
 * stockPolicy — محرك سياسة البيع المرن عند نفاد المخزون.
 *
 * معيارية تشغيلية (على غرار SAP/Odoo): لا يتوقف البيع عند نفاد المخزون
 * إلا إذا منعت السياسة ذلك. ثلاثة مستويات معيارية لكل متجر — مع تجاوز
 * لكل صنف:
 *
 *   - "block"   : منع البيع بلا مخزون (الافتراضي الأكثر أمانًا للمخازن الحساسة).
 *   - "confirm" : بيع بعد موافقة صريحة من الكاشير (الأكثر شيوعًا تجاريًا).
 *   - "allow"   : بيع تلقائي مع تسجيل التجاوز (للمتاجر سريعة الإيقاع).
 *
 * حدود حماية معيارية أعلى السياسة:
 *   - maxOversellQty  : أقصى تجاوز مسموح للسطر الواحد.
 *   - maxOversellLines: أقصى أسطر متجاوزة للفاتورة الواحدة.
 *
 * مبادئ صارمة:
 *   - المنطق نقي بلا DOM وبلا تبعيات — قابل للاختبار الكامل.
 *   - القرار النهائي يبقى للخادم (server-authoritative)؛ هذه الطبقة تقرر
 *     UX الكاشير وترسل تدقيقًا كاملًا بالتجاوز في حمولة البيع.
 *   - الأصناف غير المتتبعة للمخزون (خدمات/stock == null) تُباع دائمًا.
 */

/** مستويات السياسة المعيارية. */
export const STOCK_POLICY_MODES = Object.freeze(["block", "confirm", "allow"])

/** السياسة المعيارية الافتراضية: بيع بتأكيد الكاشير بلا حدود كمية. */
export const DEFAULT_STOCK_POLICY = Object.freeze({
	mode: "confirm",
	maxOversellQty: null,
	maxOversellLines: null,
})

function isFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value)
}

function normalizeMode(value, fallback) {
	return STOCK_POLICY_MODES.includes(value) ? value : fallback
}

function normalizeLimit(value) {
	if (value === null || value === undefined || value === "") {
		return null
	}

	const limit = Number(value)

	if (!isFiniteNumber(limit) || limit < 0) {
		return null
	}

	return limit
}

/** الكمية المتاحة المطبَّعة: null = صنف غير متتبع للمخزون. */
function normalizeAvailable(value) {
	if (value === null || value === undefined || value === "") {
		return null
	}

	const available = Number(value)

	if (!isFiniteNumber(available) || available < 0) {
		return null
	}

	return available
}

function normalizeRequested(value) {
	const requested = Number(value)

	if (!isFiniteNumber(requested) || requested <= 0) {
		return 0
	}

	return requested
}

/**
 * تطبيع إعدادات سياسة المتجر إلى الصيغة المعيارية.
 * أي قيمة ناقصة أو غير صالحة تعود للمعياري الافتراضي.
 * @param {Object|null} config إعدادات المتجر (settings).
 */
export function normalizeStockPolicy(config) {
	const source = config && typeof config === "object" ? config : {}

	return {
		mode: normalizeMode(source.mode, DEFAULT_STOCK_POLICY.mode),
		maxOversellQty: normalizeLimit(source.maxOversellQty),
		maxOversellLines: normalizeLimit(source.maxOversellLines),
	}
}

/**
 * السياسة الفعلية لصنف معيّن: تجاوز الصنف يتقدم على سياسة المتجر.
 *
 * مفاتيح التجاوز المعيارية على الصنف:
 *   - oversellMode   : "block"|"confirm"|"allow"
 *   - allowOversell  : true → "confirm" (اختصار شائع)، false → "block"
 *   - oversellMaxQty : حد كمي خاص بالصنف
 *
 * @param {Object|null} item صنف (يُقبل الشكل المُطبَّع من normalizeProduct).
 * @param {Object} policy سياسة المتجر المُطبَّعة.
 */
export function resolveItemPolicy(item, policy) {
	const store =
		policy && typeof policy === "object" ? policy : DEFAULT_STOCK_POLICY

	const source = item && typeof item === "object" ? item : {}

	const hasModeOverride =
		STOCK_POLICY_MODES.includes(source.oversellMode) ||
		source.allowOversell === true ||
		source.allowOversell === false

	if (!hasModeOverride && source.oversellMaxQty === undefined) {
		return {
			mode: normalizeMode(store.mode, DEFAULT_STOCK_POLICY.mode),
			maxOversellQty: normalizeLimit(store.maxOversellQty),
			maxOversellLines: normalizeLimit(store.maxOversellLines),
			source: "store",
		}
	}

	return {
		mode: STOCK_POLICY_MODES.includes(source.oversellMode)
			? source.oversellMode
			: source.allowOversell === true
				? "confirm"
				: source.allowOversell === false
					? "block"
					: normalizeMode(store.mode, DEFAULT_STOCK_POLICY.mode),
		maxOversellQty:
			source.oversellMaxQty !== undefined
				? normalizeLimit(source.oversellMaxQty)
				: normalizeLimit(store.maxOversellQty),
		maxOversellLines: normalizeLimit(store.maxOversellLines),
		source: "item",
	}
}

/**
 * قرار البيع لسطر واحد وفق السياسة.
 * @param {{ requested: number, available: number|null, item?: Object|null }} context
 * @param {Object} policy سياسة المتجر المُطبَّعة.
 * @returns {{
 *   action: "sell"|"confirm"|"block",
 *   allowed: boolean,
 *   requiresConfirmation: boolean,
 *   oversellQty: number,
 *   untracked: boolean,
 *   reason: string,
 *   message: string,
 * }}
 */
export function evaluateOversell(context, policy) {
	const effective = resolveItemPolicy(context?.item, policy)

	const requested = normalizeRequested(context?.requested)
	const available = normalizeAvailable(context?.available)

	const base = {
		allowed: true,
		requiresConfirmation: false,
		oversellQty: 0,
		untracked: false,
		reason: "ok",
		message: "",
	}

	// صنف غير متتبع للمخزون (خدمة/وزن/بيانات غائبة) — يُباع دائمًا.
	if (available === null) {
		return { ...base, action: "sell", untracked: true, reason: "untracked" }
	}

	// المطلوب ضمن المتاح — بيع طبيعي.
	if (requested <= available) {
		return { ...base, action: "sell", reason: "in-stock" }
	}

	const oversellQty = Math.round((requested - available) * 1e6) / 1e6

	// سياسة المنع — أو حد كمي أعلى من المسموح.
	const exceedsLimit =
		isFiniteNumber(effective.maxOversellQty) &&
		oversellQty > effective.maxOversellQty

	if (effective.mode === "block" || exceedsLimit) {
		return {
			...base,
			action: "block",
			allowed: false,
			oversellQty,
			reason: exceedsLimit ? "limit-exceeded" : "blocked",
			message: exceedsLimit
				? `تجاوز المخزون (${oversellQty}) يتجاوز الحد المسموح (${effective.maxOversellQty}) لهذا الصنف.`
				: "هذا الصنف لا يُباع بتجاوز المخزون وفق سياسة المتجر.",
		}
	}

	// بيع بتأكيد صريح من الكاشير.
	if (effective.mode === "confirm") {
		return {
			...base,
			action: "confirm",
			requiresConfirmation: true,
			oversellQty,
			reason: "needs-approval",
			message: `المتاح ${available} فقط — إكمال ${requested} يتجاوز المخزون بـ ${oversellQty}.`,
		}
	}

	// بيع تلقائي مع تسجيل التجاوز.
	return {
		...base,
		action: "sell",
		oversellQty,
		reason: "auto-oversell",
		message: `يُباع بتجاوز المخزون (${oversellQty}) وفق سياسة المتجر.`,
	}
}

/**
 * حارس الفاتورة الكاملة قبل الدفع: يجمع أسطر التجاوز ويطبق حد الأسطر.
 * @param {Array<{ productId, name, quantity, stock }>} cart
 * @param {Object} policy سياسة المتجر المُطبَّعة.
 * @returns {{
 *   lines: Array<Object>,
 *   oversellLines: Array<Object>,
 *   blockedLines: Array<Object>,
 *   hasOversell: boolean,
 *   totalOversellQty: number,
 *   requiresConfirmation: boolean,
 *   canProceed: boolean,
 *   invoiceLimitExceeded: boolean,
 *   message: string,
 * }}
 */
export function summarizeCartOversell(cart, policy) {
	const lines = Array.isArray(cart) ? cart : []
	const effective =
		policy && typeof policy === "object" ? policy : DEFAULT_STOCK_POLICY

	const evaluated = lines.map((line) => {
		const decision = evaluateOversell(
			{
				requested: line?.quantity,
				available: line?.stock,
				item: line,
			},
			effective,
		)

		return {
			productId: line?.productId ?? line?.id ?? null,
			name: line?.name || "صنف",
			quantity: normalizeRequested(line?.quantity),
			available: normalizeAvailable(line?.stock),
			...decision,
		}
	})

	const oversellLines = evaluated.filter((line) => line.oversellQty > 0)

	const maxLines = normalizeLimit(effective.maxOversellLines)

	// حد أسطر الفاتورة: تجاوزه يحجب الفاتورة كلها (حماية من مسح متواصل خاطئ).
	const invoiceLimitExceeded =
		isFiniteNumber(maxLines) && oversellLines.length > maxLines

	const blockedLines = evaluated.filter(
		(line) => !line.allowed || (invoiceLimitExceeded && line.oversellQty > 0),
	)

	const totalOversellQty =
		Math.round(
			oversellLines.reduce((sum, line) => sum + line.oversellQty, 0) * 100,
		) / 100

	const canProceed = blockedLines.length === 0

	let message = ""

	if (blockedLines.length) {
		message = invoiceLimitExceeded
			? `أسطر التجاوز (${oversellLines.length}) تتجاوز حد الفاتورة المسموح (${maxLines}).`
			: `لا يمكن إتمام البيع: «${blockedLines[0].name}» ${blockedLines[0].message}`
	} else if (oversellLines.length) {
		message = `الفاتورة تتضمن تجاوز مخزون بـ ${totalOversellQty} وحدة — تتطلب الموافقة وفق السياسة.`
	}

	return {
		lines: evaluated,
		oversellLines,
		blockedLines,
		hasOversell: oversellLines.length > 0,
		totalOversellQty,
		requiresConfirmation: oversellLines.some(
			(line) => line.requiresConfirmation,
		),
		canProceed,
		invoiceLimitExceeded,
		message,
	}
}

/**
 * تدقيق التجاوز لحمولة البيع — يرسل للخادم ليقرر نهائيًا ويسجّل.
 * @param {Object} summary ناتج summarizeCartOversell.
 */
export function buildOversellAudit(summary) {
	const source = summary && typeof summary === "object" ? summary : {}

	if (!source.hasOversell) {
		return null
	}

	return {
		hasOversell: true,
		totalOversellQty: source.totalOversellQty ?? 0,
		requiresConfirmation: source.requiresConfirmation === true,
		lines: (source.oversellLines || []).map((line) => ({
			productId: line.productId,
			name: line.name,
			quantity: line.quantity,
			available: line.available,
			oversellQty: line.oversellQty,
		})),
	}
}

export default {
	STOCK_POLICY_MODES,
	DEFAULT_STOCK_POLICY,
	normalizeStockPolicy,
	resolveItemPolicy,
	evaluateOversell,
	summarizeCartOversell,
	buildOversellAudit,
}
