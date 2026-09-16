/**
 * smartCashier — محرك الذكاء التشغيلي لشاشة الكاشير (منطق نقي بلا تبعيات).
 *
 * يتعلم DyPOS من تشغيل المتجر نفسه:
 *   - كل عملية بيع مكتملة تُغذّي مصفوفة «يُشترى غالبًا مع» (Co-purchase).
 *   - كل صنف يضيفه الكاشير يرفع نقاط البيع السريع (Quick-Sell).
 *   - كل ذلك يعمل دون اتصال ويُخزَّن محليًا بأمان.
 *
 * المحرك غير مرتبط بـ Vue، ويقبل مخزنًا مُحقنًا (storage) ليكون قابلًا
 * للاختبار بالكامل ومتوافقًا مع البيئات التي لا يوجد فيها localStorage.
 */

const STORAGE_KEY = "dypos-smart-cashier-v1"
const STATE_VERSION = 1

/** أقصى عدد أصناف يتم تتبعها (حماية من التضخم مع كتالوجات 65K+). */
const MAX_TRACKED_PRODUCTS = 600

/** أقصى روابط «يُشترى مع» لكل صنف — نحتفظ بالأقوى. */
const MAX_PAIRS_PER_PRODUCT = 40

/** أقصى سجل مبيعات محفوظ للاستدلال (فواتير). */
const MAX_SALES_LOG = 300

/** فئات نقدية افتراضية — تُستخدم عند عدم تمرير فئات المتجر الفعلية. */
const DEFAULT_CASH_UNITS = [1, 5, 10, 20, 50, 100, 200, 500]

/** أقصى اقتراحات نقدية تُعرض للكاشير. */
const MAX_TENDER_SUGGESTIONS = 4

/** أقل عدد مرات لتعلّم «الفئة المعتادة» في المتجر. */
const MIN_TENDER_LEARNING = 2

/** أقل عدد عمليات مشتركة لتعتبر رابطة «فرصة رف» جديرة بالعرض. */
const MIN_PAIR_OPPORTUNITY = 3

const DEFAULT_OPTIONS = {
	lowStockThreshold: 5,
	highQuantityThreshold: 20,
	highDiscountRatio: 0.25,
}

function pairKey(firstId, secondId) {
	return firstId < secondId
		? `${firstId}|${secondId}`
		: `${secondId}|${firstId}`
}

function isFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value)
}

function normalizeId(value) {
	if (value === null || value === undefined) {
		return null
	}

	const id = String(value).trim()

	return id || null
}

function emptyState() {
	return {
		version: STATE_VERSION,
		/** { [id]: { id, name, sold, soldQty, uses, lastSoldAt, lastUseAt } } */
		products: {},
		/** { "a|b": count } — زوج مرتّب معجميًا. */
		pairs: {},
		/** سجل فواتير مختصر للاستدلال اللحظي. */
		salesLog: [],
		/** { "50": 12 } — عدد مرات استخدام كل فئة نقدية (تعلم تدفق النقد). */
		tenders: {},
	}
}

function load(storage) {
	if (!storage || typeof storage.getItem !== "function") {
		return emptyState()
	}

	try {
		const raw = storage.getItem(STORAGE_KEY)

		if (!raw) {
			return emptyState()
		}

		const parsed = JSON.parse(raw)

		if (!parsed || parsed.version !== STATE_VERSION) {
			return emptyState()
		}

		return {
			version: STATE_VERSION,
			products:
				parsed.products && typeof parsed.products === "object"
					? parsed.products
					: {},
			pairs:
				parsed.pairs && typeof parsed.pairs === "object" ? parsed.pairs : {},
			salesLog: Array.isArray(parsed.salesLog) ? parsed.salesLog : [],
			tenders:
				parsed.tenders && typeof parsed.tenders === "object"
					? parsed.tenders
					: {},
		}
	} catch {
		// بيانات تالفة أو متصفح يحجب القراءة — نبدأ من جديد بأمان.
		return emptyState()
	}
}

/**
 * إنشاء محرك الكاشير الذكي.
 * @param {Object} [options]
 * @param {Storage|null} [options.storage] مخزن دائم (localStorage) — اختياري.
 * @param {() => number} [options.now] مولّد الوقت — للاختبارات.
 * @param {number} [options.maxTrackedProducts]
 * @param {number[]} [options.cashUnits] فئات النقد الفعلية في المتجر.
 */
export function createSmartCashierEngine({
	storage = null,
	now = () => Date.now(),
	maxTrackedProducts = MAX_TRACKED_PRODUCTS,
	cashUnits = DEFAULT_CASH_UNITS,
} = {}) {
	let state = load(storage)

	/**
	 * عدّاد فواتير مستقر — يولّد معرّفات فريدة لسجل المبيعات حتى تتساوى
	 * الطوابع الزمنية، ويميز فواتير كل طرفية عند دمج التعلّم.
	 */
	let saleCounter = state.salesLog.reduce((max, sale) => {
		const match = typeof sale?.id === "string" ? sale.id.match(/-(\d+)$/) : null

		return match ? Math.max(max, Number(match[1]) || 0) : max
	}, 0)

	function persist() {
		if (!storage || typeof storage.setItem !== "function") {
			return
		}

		try {
			storage.setItem(STORAGE_KEY, JSON.stringify(state))
		} catch {
			/* التخزين ممتلئ أو محجوب — المحرك يستمر بالذاكرة فقط */
		}
	}

	/* ==========================================================================
	 * التتبع
	 * ======================================================================== */

	function ensureProduct(id, name) {
		const key = normalizeId(id)

		if (!key) {
			return null
		}

		if (!state.products[key]) {
			state.products[key] = {
				id: key,
				name: name || "",
				sold: 0,
				soldQty: 0,
				uses: 0,
				lastSoldAt: 0,
				lastUseAt: 0,
			}
		}

		const entry = state.products[key]

		if (name && entry.name !== name) {
			entry.name = name
		}

		return entry
	}

	/**
	 * تسجيل إضافة صنف إلى السلة من الكاشير (تتبع الاستخدام).
	 * @param {{ id: string, name?: string }} product
	 */
	function recordInteraction(product) {
		const id = normalizeId(product?.id)

		if (!id) {
			return
		}

		const entry = ensureProduct(id, product?.name)

		if (!entry) {
			return
		}

		entry.uses += 1
		entry.lastUseAt = now()

		pruneProducts()
		persist()
	}

	/**
	 * تسجيل عملية بيع مكتملة — يغذي الارتباطات والأكثر مبيعًا.
	 * @param {Array<{ productId: string, quantity?: number, unitPrice?: number, name?: string }>} items
	 * @param {{ total?: number }} [meta]
	 */
	function recordSale(items, meta = {}) {
		const lines = (Array.isArray(items) ? items : [])
			.map((item) => ({
				id: normalizeId(item?.productId ?? item?.id),
				name: item?.name,
				quantity: Math.max(1, Number(item?.quantity || 1)),
			}))
			.filter((item) => item.id)

		if (!lines.length) {
			return
		}

		const timestamp = now()
		const uniqueIds = [...new Set(lines.map((line) => line.id))]

		for (const line of lines) {
			const entry = ensureProduct(line.id, line.name)

			if (!entry) {
				continue
			}

			entry.sold += 1
			entry.soldQty += line.quantity
			entry.lastSoldAt = timestamp
		}

		for (let a = 0; a < uniqueIds.length; a += 1) {
			for (let b = a + 1; b < uniqueIds.length; b += 1) {
				const key = pairKey(uniqueIds[a], uniqueIds[b])

				state.pairs[key] = (state.pairs[key] || 0) + 1
			}
		}

		saleCounter += 1

		state.salesLog.push({
			id: `${timestamp}-${saleCounter}`,
			at: timestamp,
			total: isFiniteNumber(meta?.total) ? meta.total : null,
			items: lines.reduce((sum, line) => sum + line.quantity, 0),
		})

		if (state.salesLog.length > MAX_SALES_LOG) {
			state.salesLog = state.salesLog.slice(-MAX_SALES_LOG)
		}

		prunePairs()
		pruneProducts()
		persist()
	}

	/* ==========================================================================
	 * التقليم (Prune)
	 * ======================================================================== */

	function pruneProducts() {
		const keys = Object.keys(state.products)

		if (keys.length <= maxTrackedProducts) {
			return
		}

		// نحتفظ بالأصناف الأكثر نشاطًا (مبيعات + استخدام) والأحدث.
		const scored = keys.map((key) => {
			const entry = state.products[key]

			const score =
				entry.sold * 3 +
				entry.uses +
				Math.max(entry.lastSoldAt, entry.lastUseAt) / 1e12

			return { key, score }
		})

		scored.sort((a, b) => b.score - a.score)

		const keep = new Set(
			scored.slice(0, maxTrackedProducts).map((item) => item.key),
		)

		for (const key of keys) {
			if (!keep.has(key)) {
				delete state.products[key]
			}
		}
	}

	function prunePairs() {
		// نجمع الروابط حسب الصنف ونحتفظ بالأقوى فقط لكل صنف.
		const byProduct = new Map()

		for (const key of Object.keys(state.pairs)) {
			const [first, second] = key.split("|")
			const count = state.pairs[key]

			for (const self of [first, second]) {
				if (!byProduct.has(self)) {
					byProduct.set(self, [])
				}

				byProduct.get(self).push({
					key,
					count,
				})
			}
		}

		const keepKeys = new Set()

		for (const links of byProduct.values()) {
			links.sort((a, b) => b.count - a.count)

			for (const link of links.slice(0, MAX_PAIRS_PER_PRODUCT)) {
				keepKeys.add(link.key)
			}
		}

		for (const key of Object.keys(state.pairs)) {
			if (!keepKeys.has(key)) {
				delete state.pairs[key]
			}
		}
	}

	/* ==========================================================================
	 * البيع السريع — Quick-Sell
	 * ======================================================================== */

	/**
	 * درجة شعبية صنف (مبيعات + استخدام، باضمحلال زمني).
	 * تُستخدم لترتيب نتائج البحث الذكي: «الأسرع بيعًا أولًا» عند تعادل الصلة.
	 * @param {{ id?: string }|string} product
	 * @returns {number}
	 */
	function getPopularityScore(product) {
		const id = normalizeId(typeof product === "string" ? product : product?.id)

		if (!id) {
			return 0
		}

		const stats = state.products[id]

		if (!stats) {
			return 0
		}

		const recencyDays = Math.max(
			0,
			(now() - Math.max(stats.lastSoldAt, stats.lastUseAt)) / 86400000,
		)

		return (stats.sold * 3 + stats.uses) / (1 + recencyDays * 0.15)
	}

	/**
	 * الأصناف الأسرع للبيع بناءً على سلوك الكاشير الفعلي.
	 * @param {Array<Object>} catalog
	 * @param {number} [limit]
	 * @returns {Array<{ product: Object, score: number, reason: string }>}
	 */
	function getQuickSell(catalog, limit = 6) {
		const items = Array.isArray(catalog) ? catalog : []

		return items
			.map((product) => {
				const id = normalizeId(product?.id)

				const stats = id ? state.products[id] : null

				if (!stats) {
					return null
				}

				const score = getPopularityScore(product)

				if (score <= 0) {
					return null
				}

				const reason =
					stats.sold > 0 ? `مبيعات سريعة (${stats.sold} عملية)` : "مُستخدَم بكثرة"

				return { product, score, reason }
			})
			.filter(Boolean)
			.sort((a, b) => b.score - a.score)
			.slice(0, Math.max(0, limit))
	}

	/* ==========================================================================
	 * البيع المتقاطع — «يُشترى غالبًا مع»
	 * ======================================================================== */

	/**
	 * اقتراح أصناف مكمّلة لسلة الكاشير.
	 * @param {Array<{ productId?: string, id?: string }>} cart
	 * @param {Array<Object>} catalog
	 * @param {number} [limit]
	 * @returns {Array<{ product: Object, score: number, reason: string }>}
	 */
	function suggestCrossSell(cart, catalog, limit = 6) {
		const cartIds = (Array.isArray(cart) ? cart : [])
			.map((item) => normalizeId(item?.productId ?? item?.id))
			.filter(Boolean)

		const items = Array.isArray(catalog) ? catalog : []

		if (!cartIds.length || !items.length) {
			return []
		}

		const cartSet = new Set(cartIds)

		const scored = []

		for (const product of items) {
			const id = normalizeId(product?.id)

			if (!id || cartSet.has(id)) {
				continue
			}

			let score = 0
			let matchedWith = null
			let matchedCount = 0

			for (const cartId of cartIds) {
				const count = state.pairs[pairKey(cartId, id)] || 0

				if (count > 0) {
					score += count

					if (count > matchedCount) {
						matchedCount = count
						matchedWith = state.products[cartId]?.name || cartId
					}
				}
			}

			// دعم خفيف للأكثر مبيعًا حتى تظهر اقتراحات منذ أول يوم.
			const stats = state.products[id]

			if (stats && stats.sold > 0) {
				score += Math.min(stats.sold, 10) * 0.3
			}

			if (score <= 0) {
				continue
			}

			const reason =
				matchedCount > 0
					? `يُشترى غالبًا مع «${matchedWith}»`
					: "الأكثر مبيعًا لديك"

			scored.push({ product, score, reason })
		}

		return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(0, limit))
	}

	/* ==========================================================================
	 * التنبيهات الذكية
	 * ======================================================================== */

	/**
	 * تنبيهات تشغيلية تظهر للكاشير في اللحظة المناسبة فقط.
	 * @param {Array<Object>} cart
	 * @param {{ discountAmount?: number, subtotal?: number, lowStockThreshold?: number }} [context]
	 * @returns {Array<{ id: string, severity: "info"|"warning"|"danger", title: string, message: string }>}
	 */
	function getAlerts(cart, context = {}) {
		const options = { ...DEFAULT_OPTIONS, ...context }

		const lines = (Array.isArray(cart) ? cart : []).map((item) => ({
			id: normalizeId(item?.productId ?? item?.id),
			name: item?.name || "صنف",
			quantity: Number(item?.quantity || 0),
			stock: item?.stock,
			unitPrice: Number(item?.unitPrice || 0),
		}))

		const alerts = []

		const lowStockLines = lines.filter(
			(line) =>
				isFiniteNumber(line.stock) &&
				line.quantity > 0 &&
				line.stock <= options.lowStockThreshold,
		)

		for (const line of lowStockLines.slice(0, 3)) {
			alerts.push({
				id: `low-stock-${line.id}`,
				severity: line.stock <= 0 ? "danger" : "warning",
				title: line.stock <= 0 ? "المخزون نفد" : "مخزون منخفض",
				message: `«${line.name}» المتبقي ${line.stock} والسلة تحوي ${line.quantity}.`,
			})
		}

		// الكمية الكبيرة: تجاوز عتبة العدد، أو تجاوز مخزون فعلي متبقٍ.
		// خطوط النفاد/الانخفاض تُبلَّغ أعلاه — لا نكررها هنا.
		const highQuantity = lines.filter((line) => {
			if (line.quantity >= options.highQuantityThreshold) {
				return true
			}

			return (
				isFiniteNumber(line.stock) &&
				line.stock > 0 &&
				line.quantity > line.stock
			)
		})

		for (const line of highQuantity.slice(0, 2)) {
			alerts.push({
				id: `high-qty-${line.id}`,
				severity: "warning",
				title: "كمية كبيرة",
				message: `«${line.name}» بكمية ${line.quantity} — تأكد من صحة العدد.`,
			})
		}

		const uniqueNames = new Set(lines.map((line) => line.name))
		const distinctIds = new Set(lines.map((line) => line.id).filter(Boolean))

		if (lines.length >= 6 && uniqueNames.size === 1 && distinctIds.size >= 2) {
			alerts.push({
				id: "duplicate-heavy",
				severity: "info",
				title: "سلة مكررة",
				message: "السلة تحوي صنفًا واحدًا مكررًا — قد يكون مسحًا متكررًا بالخطأ.",
			})
		}

		const computedSubtotal = lines.reduce(
			(sum, line) => sum + line.quantity * line.unitPrice,
			0,
		)

		const subtotal = isFiniteNumber(options.subtotal)
			? options.subtotal
			: computedSubtotal

		const discount = isFiniteNumber(options.discountAmount)
			? Math.abs(options.discountAmount)
			: 0

		if (subtotal > 0 && discount / subtotal >= options.highDiscountRatio) {
			alerts.push({
				id: "high-discount",
				severity: "warning",
				title: "خصم مرتفع",
				message: `الخصم يبلغ ${Math.round((discount / subtotal) * 100)}% من السلة.`,
			})
		}

		return alerts
	}

	/* ==========================================================================
	 * الرؤى اللحظية
	 * ======================================================================== */

	function startOfDay(timestamp) {
		const date = new Date(timestamp)

		date.setHours(0, 0, 0, 0)

		return date.getTime()
	}

	/**
	 * نبض النوبة من مبيعات اليوم الفعلية.
	 * @returns {{ invoicesToday: number, revenueToday: number|null, avgBasket: number|null, peakHour: number|null, invoicesPerHour: number|null }}
	 */
	function getShiftPulse() {
		const todayStart = startOfDay(now())

		const today = state.salesLog.filter((sale) => sale.at >= todayStart)

		const revenueValues = today
			.map((sale) => sale.total)
			.filter((total) => isFiniteNumber(total) && total >= 0)

		let peakHour = null
		let peakCount = 0
		const hourCounts = new Map()

		for (const sale of today) {
			const hour = new Date(sale.at).getHours()
			const count = (hourCounts.get(hour) || 0) + 1

			hourCounts.set(hour, count)

			if (count > peakCount) {
				peakCount = count
				peakHour = hour
			}
		}

		let invoicesPerHour = null

		if (today.length >= 2) {
			const spanHours = Math.max(
				0.25,
				(today[today.length - 1].at - today[0].at) / 3600000,
			)

			invoicesPerHour = Math.round((today.length / spanHours) * 10) / 10
		}

		const revenueTotal = revenueValues.reduce((sum, value) => sum + value, 0)

		return {
			invoicesToday: today.length,
			revenueToday: revenueValues.length
				? Math.round(revenueTotal * 100) / 100
				: null,
			avgBasket: revenueValues.length
				? Math.round((revenueTotal / revenueValues.length) * 100) / 100
				: null,
			peakHour,
			invoicesPerHour,
		}
	}

	/* ==========================================================================
	 * اتجاه الساعات — Hourly Trend
	 * تعلّم ساعات الذروة من مبيعات اليوم الفعلية، لتجهيز الرف والكاشير
	 * قبل الذروة بدل منتصفها.
	 * ======================================================================== */

	/**
	 * توزيع فواتير وإيرادات اليوم على الساعات (0–23) مع ساعة الذروة.
	 * @returns {{ hours: Array<{hour:number, invoices:number, revenue:number}>, peakHour: number|null, peakInvoices: number, invoicesToday: number }}
	 */
	function getHourlyTrend() {
		const todayStart = startOfDay(now())

		const today = state.salesLog.filter((sale) => sale.at >= todayStart)

		const hours = []

		for (let hour = 0; hour < 24; hour += 1) {
			hours.push({ hour, invoices: 0, revenue: 0 })
		}

		for (const sale of today) {
			const bucket = hours[new Date(sale.at).getHours()]

			bucket.invoices += 1

			if (isFiniteNumber(sale.total)) {
				bucket.revenue += sale.total
			}
		}

		for (const bucket of hours) {
			bucket.revenue = Math.round(bucket.revenue * 100) / 100
		}

		let peak = null

		for (const bucket of hours) {
			if (bucket.invoices > 0 && (!peak || bucket.invoices > peak.invoices)) {
				peak = bucket
			}
		}

		return {
			hours,
			peakHour: peak ? peak.hour : null,
			peakInvoices: peak ? peak.invoices : 0,
			invoicesToday: today.length,
		}
	}

	/* ==========================================================================
	 * فرص الرف — Shelf Opportunities
	 * أقوى ارتباطات «يُشترى معًا» في المتجر: فرص عرض تجميعي للمالك،
	 * وترتيب أرفف يقلّل زمن الكاشير.
	 * ======================================================================== */

	/**
	 * أقوى أزواج ارتباط مسجّلة (بحدٍّ أدنى) لعرضها كفرص تجميع.
	 * @param {Array<Object>} [catalog] الكتالوج الحالي — يُقيّد النتائج إليه إن مُرّر.
	 * @param {number} [limit=6]
	 * @returns {Array<{ productA: {id,name}, productB: {id,name}, count: number }>}
	 */
	function getPairOpportunities(catalog, limit = 6) {
		const items = Array.isArray(catalog) ? catalog : []

		const catalogIds = new Set(
			items.map((product) => normalizeId(product?.id)).filter(Boolean),
		)

		const nameOf = (id) => state.products[id]?.name || id

		const entries = []

		for (const key of Object.keys(state.pairs)) {
			const count = state.pairs[key]

			if (count < MIN_PAIR_OPPORTUNITY) {
				continue
			}

			const [first, second] = key.split("|")

			if (
				catalogIds.size &&
				(!catalogIds.has(first) || !catalogIds.has(second))
			) {
				continue
			}

			entries.push({
				productA: { id: first, name: nameOf(first) },
				productB: { id: second, name: nameOf(second) },
				count,
			})
		}

		return entries
			.sort((a, b) => b.count - a.count)
			.slice(0, Math.max(0, limit))
	}

	/* ==========================================================================
	 * مزامنة التعلّم — Learnings Sync
	 * تصدير/استيراد حالة التعلّم لدمج خبرة الطرفيات (كاشير ← خادم ← بقية
	 * الكاشيرات)، فتتعلّم كل طرفية من كل الفروع فورًا.
	 * ======================================================================== */

	/** لقطة حالة التعلّم الكاملة — قابلة للتسلسل JSON مباشرة. */
	function exportState() {
		return JSON.parse(JSON.stringify(state))
	}

	/**
	 * دمج حالة تعلّم قادمة من طرفية أخرى.
	 * @param {Object|null} remote ناتج exportState من طرفية أخرى.
	 * @param {{ mode?: "merge"|"replace" }} [options]
	 * @returns {{ merged: boolean, products: number, pairs: number, sales: number }}
	 */
	function importState(remote, options = {}) {
		const result = { merged: false, products: 0, pairs: 0, sales: 0 }

		if (!remote || typeof remote !== "object") {
			return result
		}

		const replace = options.mode === "replace"

		if (replace) {
			state = emptyState()
		}

		const remoteProducts =
			remote.products && typeof remote.products === "object"
				? remote.products
				: {}

		for (const key of Object.keys(remoteProducts)) {
			const remoteEntry = remoteProducts[key]

			if (!remoteEntry || typeof remoteEntry !== "object") {
				continue
			}

			const id = normalizeId(remoteEntry.id ?? key)

			if (!id) {
				continue
			}

			const entry = ensureProduct(id, remoteEntry.name)

			if (!entry) {
				continue
			}

			entry.sold += Math.max(0, Math.round(Number(remoteEntry.sold) || 0))
			entry.soldQty += Math.max(0, Math.round(Number(remoteEntry.soldQty) || 0))
			entry.uses += Math.max(0, Math.round(Number(remoteEntry.uses) || 0))
			entry.lastSoldAt = Math.max(
				entry.lastSoldAt,
				Number(remoteEntry.lastSoldAt) || 0,
			)
			entry.lastUseAt = Math.max(
				entry.lastUseAt,
				Number(remoteEntry.lastUseAt) || 0,
			)

			result.products += 1
		}

		const remotePairs =
			remote.pairs && typeof remote.pairs === "object" ? remote.pairs : {}

		for (const key of Object.keys(remotePairs)) {
			const count = Math.round(Number(remotePairs[key]))

			if (!isFiniteNumber(count) || count <= 0) {
				continue
			}

			const [first, second] = key.split("|")

			const idA = normalizeId(first)
			const idB = normalizeId(second)

			if (!idA || !idB) {
				continue
			}

			const cleanKey = pairKey(idA, idB)

			state.pairs[cleanKey] = (state.pairs[cleanKey] || 0) + count

			result.pairs += 1
		}

		const remoteSales = Array.isArray(remote.salesLog) ? remote.salesLog : []

		const saleKey = (sale) =>
			typeof sale?.id === "string" && sale.id
				? sale.id
				: `${sale?.at}|${sale?.total}|${sale?.items}`

		const seen = new Set(state.salesLog.map((sale) => saleKey(sale)))

		for (const sale of remoteSales) {
			if (!isFiniteNumber(sale?.at)) {
				continue
			}

			const dedupeKey = saleKey(sale)

			if (seen.has(dedupeKey)) {
				continue
			}

			seen.add(dedupeKey)

			state.salesLog.push({
				id: typeof sale.id === "string" && sale.id ? sale.id : dedupeKey,
				at: sale.at,
				total: isFiniteNumber(sale.total) ? sale.total : null,
				items: Math.max(1, Math.round(Number(sale.items) || 1)),
			})

			result.sales += 1
		}

		if (state.salesLog.length > MAX_SALES_LOG) {
			state.salesLog = state.salesLog.slice(-MAX_SALES_LOG)
		}

		state.salesLog.sort((a, b) => a.at - b.at)

		const remoteTenders =
			remote.tenders && typeof remote.tenders === "object" ? remote.tenders : {}

		for (const unit of Object.keys(remoteTenders)) {
			const count = Math.round(Number(remoteTenders[unit]))

			if (!isFiniteNumber(count) || count <= 0) {
				continue
			}

			state.tenders[unit] = (state.tenders[unit] || 0) + count
		}

		pruneProducts()
		prunePairs()
		persist()

		result.merged = true

		return result
	}

	/**
	 * مؤشر صحة السلة الحالية (0–100).
	 * يخفض النقاط: سطر واحد، كميات شاذة، خصم مرتفع، مخزون منخفض.
	 */
	function getCartHealth(cart, context = {}) {
		const lines = Array.isArray(cart) ? cart : []

		if (!lines.length) {
			return null
		}

		let health = 100

		if (lines.length === 1) {
			health -= 10
		}

		for (const alert of getAlerts(lines, context)) {
			if (alert.severity === "danger") {
				health -= 25
			} else if (alert.severity === "warning") {
				health -= 15
			} else {
				health -= 5
			}
		}

		return Math.max(0, Math.min(100, health))
	}

	/* ==========================================================================
	 * النقد الذكي — Smart Cash Tender
	 * يقترح الفئات الورقية الأسرع للتحصيل ويتعلم عادات النقد في المتجر.
	 * ======================================================================== */

	/** فئات المتجر مرتّبة تصاعديًا وبلا قيم غير صالحة. */
	function normalizedUnits(units) {
		return (Array.isArray(units) ? units : cashUnits)
			.map((unit) => Number(unit))
			.filter((unit) => isFiniteNumber(unit) && unit > 0)
			.sort((a, b) => a - b)
	}

	/** أكبر فئة لا تتجاوز المبلغ — تحويل المبلغ المستلم إلى فئة. */
	function denominate(value, units) {
		let matched = units[0]

		for (const unit of units) {
			if (unit <= value + 1e-9) {
				matched = unit
			}
		}

		return matched
	}

	/** الفئة النقدية الأكثر استخدامًا في المتجر (بعد تعلّم كافٍ). */
	function getLearnedUnit(units) {
		let best = null
		let bestCount = 0

		for (const unit of units) {
			const count = Number(state.tenders[String(unit)] || 0)

			if (count > bestCount) {
				bestCount = count
				best = unit
			}
		}

		return bestCount >= MIN_TENDER_LEARNING ? best : null
	}

	/**
	 * تعلّم الفئة النقدية المستلمة فعليًا — يبني «الفئة المعتادة» للمتجر.
	 * @param {number} amount المبلغ النقدي المستلم.
	 * @returns {number|null} الفئة المُتعلَّمة.
	 */
	function learnTender(amount) {
		const value = Number(amount)

		if (!isFiniteNumber(value) || value <= 0) {
			return null
		}

		const units = normalizedUnits()

		if (!units.length) {
			return null
		}

		const unit = denominate(value, units)
		const key = String(unit)

		state.tenders[key] = (state.tenders[key] || 0) + 1

		persist()

		return unit
	}

	/**
	 * اقتراح الفئات النقدية الأسرع لتحصيل مبلغ معيّن.
	 * @param {number} total المبلغ المطلوب.
	 * @param {{ units?: number[], limit?: number }} [options]
	 * @returns {Array<{ amount: number, change: number, source: "exact"|"learned"|"round", label: string }>}
	 */
	function suggestCashTender(total, options = {}) {
		const value = Number(total)

		if (!isFiniteNumber(value) || value <= 0) {
			return []
		}

		const units = normalizedUnits(options.units)

		if (!units.length) {
			return []
		}

		const limit = Math.max(1, Number(options.limit) || MAX_TENDER_SUGGESTIONS)
		const suggestions = []
		const seen = new Set()

		const add = (amount, source, label) => {
			const rounded = Math.round(amount * 100) / 100

			// لا نقترح أقل من المطلوب، ولا نكرر المبالغ.
			if (rounded < value - 0.005 || seen.has(rounded)) {
				return
			}

			seen.add(rounded)

			suggestions.push({
				amount: rounded,
				change: Math.round((rounded - value) * 100) / 100,
				source,
				label,
			})
		}

		// 1) الأدق: المبلغ كما هو (إن كان الكاشير يحمل الفكة).
		add(value, "exact", "المبلغ كاملًا")

		// 2) الفئة المعتادة في هذا المتجر — تُتعلَّم من التحصيل الفعلي.
		const learned = getLearnedUnit(units)

		if (learned) {
			add(
				Math.ceil(value / learned - 1e-9) * learned,
				"learned",
				`المعتاد ${learned}`,
			)
		}

		// 3) أقرب الفئات الورقية الأعلى من المبلغ.
		for (const unit of units) {
			if (suggestions.length >= limit) {
				break
			}

			add(Math.ceil(value / unit - 1e-9) * unit, "round", `فئة ${unit}`)
		}

		return suggestions.slice(0, limit)
	}

	function reset() {
		state = emptyState()
		persist()
	}

	return {
		recordInteraction,
		recordSale,
		getQuickSell,
		getPopularityScore,
		suggestCrossSell,
		getAlerts,
		getShiftPulse,
		getCartHealth,
		suggestCashTender,
		learnTender,
		getHourlyTrend,
		getPairOpportunities,
		exportState,
		importState,
		reset,
		/** للفحص/التشخيص فقط */
		_export: () => state,
	}
}

export default createSmartCashierEngine
