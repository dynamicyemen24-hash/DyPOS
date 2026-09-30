/**
 * POS Keyboard Shortcuts — extracted from POSSale.vue.
 * Keeps POSSale.vue under file-size cap.
 */
import { nextTick } from "vue"
import { createOverlayCloser } from "./useOverlayCloser.js"

/**
 * Creates keyboard shortcut handler for POS.
 * @param {Object} deps - Dependencies
 * @param {Ref<boolean>} deps.showShortcutsPanel
 * @param {Ref<any>} deps.quantityEditor
 * @param {Ref<boolean>} deps.showPaymentPanel
 * @param {Ref<boolean>} deps.showDiscountPanel
 * @param {Ref<boolean>} deps.showCustomerPanel
 * @param {Ref<boolean>} deps.showHeldSalesPanel
 * @param {Ref<boolean>} deps.showSmartDock
 * @param {Ref<any>} deps.searchInput
 * @param {Ref<boolean>} deps.canCheckout
 * @param {Ref<any[]>} deps.cart
 * @param {Ref<number>} deps.activeProductIndex
 * @param {Function} deps.closeQuantityEditor
 * @param {Function} deps.closePayment
 * @param {Function} deps.handleLogout
 * @param {Function} deps.openPayment
 * @param {Function} deps.holdSale
 * @param {Function} deps.removeItem
 * @param {() => boolean} deps.allowHold — getter, not a snapshot: the prop changes at runtime
 * @returns {{ handleKeydown: (event: KeyboardEvent) => Promise<void> }}
 */
export function createKeyboardShortcuts({
	showShortcutsPanel,
	quantityEditor,
	showPaymentPanel,
	showDiscountPanel,
	showCustomerPanel,
	showHeldSalesPanel,
	showSmartDock,
	searchInput,
	canCheckout,
	cart,
	activeProductIndex,
	closeQuantityEditor,
	closePayment,
	handleLogout,
	openPayment,
	holdSale,
	removeItem,
	allowHold,
}) {
	/**
	 * يغلق علمًا منطقيًا — نفس دالة `setFalse` التي كانت في POSSale.vue قبل
	 * استخراج هذا الملف. لا يُستورد Vue هنا: النتيجة دالة خالصة تُستدعى بـ ref.
	 */
	const setFalse = (flag) => () => {
		flag.value = false
	}

	const overlays = createOverlayCloser([
		[showShortcutsPanel, setFalse(showShortcutsPanel)],
		[() => Boolean(quantityEditor.value), closeQuantityEditor],
		[showPaymentPanel, closePayment],
		[showDiscountPanel, setFalse(showDiscountPanel)],
		[showCustomerPanel, setFalse(showCustomerPanel)],
		[showHeldSalesPanel, setFalse(showHeldSalesPanel)],
	])

	async function focusSearch() {
		await nextTick()
		searchInput.value?.focus?.()
	}

	async function handleKeydown(event) {
		const target = event.target

		const isTyping =
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement

		/*
		 * F2 — البحث
		 */
		if (event.key === "F2") {
			event.preventDefault()
			await focusSearch()
			return
		}

		/*
		 * F8 — إظهار/إخفاء الكاشير الذكي
		 */
		if (event.key === "F8") {
			event.preventDefault()
			showSmartDock.value = !showSmartDock.value
			return
		}

		/*
		 * ? — مساعدة الاختصارات (يعمل مع Shift+؟ العربية)
		 */
		if ((event.key === "?" || event.key === "؟") && !isTyping) {
			event.preventDefault()
			showShortcutsPanel.value = !showShortcutsPanel.value
			return
		}

		/*
		 * Shift + Esc — تسجيل الخروج
		 */
		if (event.key === "Escape" && event.shiftKey) {
			event.preventDefault()
			handleLogout()
			return
		}

		/*
		 * Escape — إغلاق overlay
		 */
		if (event.key === "Escape") {
			overlays.closeFirstOpen()
			return
		}

		/*
		 * Ctrl/Cmd + Enter — الدفع (يعمل حتى من داخل حقل البحث لسرعة الكاشير)
		 */
		if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
			if (canCheckout.value && !showPaymentPanel.value) {
				event.preventDefault()
				openPayment()
			}
		}

		/*
		 * F4 — تعليق البيع
		 */
		if (event.key === "F4" && allowHold()) {
			event.preventDefault()
			holdSale()
		}

		/*
		 * Delete — حذف العنصر المحدد
		 */
		if (event.key === "Delete" && activeProductIndex.value >= 0 && !isTyping) {
			const item = cart.value[activeProductIndex.value]

			if (item) {
				removeItem(item)
			}
		}
	}

	return { handleKeydown }
}
