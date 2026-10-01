/**
 * كشف Caps Lock أثناء الكتابة في حقل كلمة المرور.
 *
 * لماذا في شاشة الدخول تحديدًا؟ أجهزة نقاط البيع تعمل بلوحات مفاتيح
 * فيزيائية في الغالب، وCaps Lock المفعّل يجعل «كلمة المرور» تُرفض بلا سبب
 * مرئي — وهو أسوأ أشكال خطأ «لماذا لا تُقبل كلمة مرّرتها؟». التلميح يظهر عند
 * الكتابة نفسها (من الحدث) لا بمراقب عام على المستند: لا عمل في الخلفية،
 * ولا حالة عالقة إذا نزل الكاشير عن الجهاز.
 *
 * الحالة على مستوى الوحدة لأنها حقيقة واحدة عن لوحة مفاتيح واحدة، لا
 * حقيقة خاصة بكل نموذج.
 */
import { readonly, ref } from "vue"

const capsLockOn = ref(false)

/**
 * يحدّث الحالة من حدث لوحة مفاتيح.
 *
 * `getModifierState` يقرأ الحالة الفعلية (وليس حالة مفتاح Shift مثلًا)،
 * عمل على المتصفحات الشائعة. إن لم يدعمه المتصفح نُبقي آخر قيمة معروفة
 * بدل أن نُظهر تلميحًا كاذبًا.
 *
 * @param {KeyboardEvent} event
 */
export function trackCapsLock(event) {
	if (typeof event?.getModifierState === "function") {
		capsLockOn.value = event.getModifierState("CapsLock")
	}
}

export function useCapsLock() {
	return {
		capsLockOn: readonly(capsLockOn),
		trackCapsLock,
	}
}
