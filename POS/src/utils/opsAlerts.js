/**
 * تنبيهات التشغيل — مركز واحد للحقائق التي تحتاج تدخلًا، لا لوحة زينة.
 *
 * كل تنبيه من مصدر حقيقي محلي (بلا شبكة):
 *  - نفاد وشيك: `productRepository.lowStock()` — الحل في إدارة المخزون.
 *  - مزامنة معلقة/انقطاع: `getSyncStatus()` — الحل في نقطة البيع (مركز المزامنة).
 *  - بيع غير مكتمل: `hasDraft()` — الاستئناف تلقائي في نقطة البيع.
 *
 * القواعد: الفشل في القراءة يُعلن ("تعذّر قراءة التنبيهات") ولا يُقدَّم
 * كصفر مطمئن؛ والفارغ يُعلن ("لا تنبيهات") لا يُخفى القسم بصمت فيبقى
 * المشغّل يتساءل أين ذهب. الدوال محقونة لاختبار كل فرع.
 */
export async function loadOpsAlerts({ lowStockFn, syncFn, draftFn } = {}) {
	try {
		const [low, sync, draft] = await Promise.all([
			Promise.resolve().then(() => lowStockFn()),
			Promise.resolve().then(() => syncFn()),
			Promise.resolve().then(() => draftFn()),
		])
		const lowCount = Array.isArray(low) ? low.length : Number(low?.count ?? 0)
		const pending = Number(sync?.pendingCount ?? 0)
		const online = sync?.isOnline !== false
		const hasUnsent =
			draft === true ||
			(draft &&
				draft !== false &&
				(draft.items?.length > 0 || draft.valid === true))
		const alerts = []
		if (!online) {
			alerts.push({
				id: "offline",
				severity: "info",
				icon: "wifi-off",
				label: "وضع عدم الاتصال",
				detail: "البيع يعمل محليًا والمزامنة مؤجلة",
				to: null,
			})
		} else if (pending > 0) {
			alerts.push({
				id: "sync-pending",
				severity: "warning",
				icon: "refresh-cw",
				label: "عمليات بانتظار المزامنة",
				detail: `${pending > 99 ? "99+" : pending} — تُزامَن من نقطة البيع`,
				to: { name: "POSSale" },
			})
		}
		if (lowCount > 0) {
			alerts.push({
				id: "low-stock",
				severity: lowCount > 10 ? "critical" : "warning",
				icon: "alert-triangle",
				label: "أصناف تحت حد الطلب",
				detail: `${lowCount} — راجع المخزون قبل نفادها`,
				to: { name: "StockManagement" },
			})
		}
		if (hasUnsent) {
			alerts.push({
				id: "unsent-sale",
				severity: "warning",
				icon: "shopping-cart",
				label: "بيع غير مكتمل",
				detail: "يُستأنف تلقائيًا في نقطة البيع",
				to: { name: "POSSale" },
			})
		}
		return { alerts, error: "" }
	} catch {
		return { alerts: [], error: "تعذّر قراءة التنبيهات — أعد التحديث" }
	}
}
