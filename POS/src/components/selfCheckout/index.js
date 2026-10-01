/**
 * الكاشير الذاتي — نقطة الدخول العامة للحزمة.
 *
 * كل ما يخص الكاشير الذاتي في مجلد واحد: الشاشة، منطقها النقي، والـ
 * composable الذي يملك الحالة. أي أداة ذكية تُضاف لاحقًا (قوائم بصرية،
 * باقات اشتراك، اقتراحات، تحصيل طاولات) تُصدَّر من هنا وتعمل مع الشاشة
 * بلا أن تتكرر الحسابات — لأن `selfCheckoutState.js` هو المرجع الوحيد
 * للحساب والتسميات والخطوات.
 */
export { default as SelfCheckoutScreen } from "./SelfCheckoutScreen.vue"

export {
	SESSION_STATES,
	PAYMENT_METHODS,
	PAYMENT_LABELS,
	PAYMENT_STEPS,
	MAX_TENDER_MINOR,
	buildCartLine,
	addLineToCart,
	setLineQty,
	removeLine,
	toTotalsLines,
	summarizeCart,
	evaluateTender,
	paidSession,
	idleSession,
} from "./selfCheckoutState.js"

export {
	useSelfCheckoutSession,
	buildSelfCheckoutSale,
	SELF_CHECKOUT_FIELDS,
} from "./useSelfCheckoutSession.js"

export {
	BASE_CURRENCY,
	BASE_UOM,
	CURRENCIES,
	UOMS,
	currencyByCode,
	uomByCode,
	currencyPrecision,
	convertAmount,
	convertUomQty,
	formatAmount,
	formatQuantity,
} from "./selfCheckoutMoney.js"
