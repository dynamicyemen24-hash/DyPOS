/**
 * تفضيلات العرض في شاشة الدخول — اللغة والسِمة.
 *
 * لماذا كومبوزابل مستقل؟ لأن هذه الشاشة هي **أول** شاشة يراها الكاشير،
 * وقلبتُها هنا تسبق أي جلسة: من لا يستطيع تسجيل الدخول أصلاً لا يصل إلى
 * إعدادات المظهر داخل التطبيق. الفكرة أن preferences تُحسم قبل الدخول لا بعده.
 *
 * العقود:
 * - `useLocale()` — يحتفظ بمصدر واحد لحالة اللغة والاتجاه (ويحفظ الاختيار
 *   في `DyPOS_language`)، ويحمّل القاموس المحلي من `public/locales/*.json`
 *   عبر `window.$changeLanguage` — أصلاً محليًا ضمن نطاق التطبيق، فالتبديل
 *   يعمل بلا خادم تمامًا.
 * - `useAppTheme()` — نمط مفرد يطبّق `data-theme`/`data-accent`/`data-density`
 *   على `<html>` ويحفظها ويعزّمها بين التبويبات.
 *
 * لا شيء هنا يطلب الشبكة: `changeLocale` يستدعي محلّل القاموس المحلي فقط،
 * وأي فشل يُعاد إلى العربية (المصدر) بدل إبقاء اختيار غير قابل للتطبيق.
 */
import { computed, readonly, ref } from "vue"

import { useLocale, SUPPORTED_LOCALES } from "@/composables/useLocale"
import { useAppTheme } from "@/composables/useAppTheme"
import { logger } from "@/utils/logger"

const log = logger.create("LoginPreferences")

/** أوضاع السِمة بترتيب العرض: فاتح ثم داكن ثم تلقائي (يتبع النظام). */
const THEME_MODES = ["light", "dark", "system"]

/** عربية أولًا في القائمة — لغة المنتج، لا لغة مَن كتب آخر ترجمة. */
const DEFAULT_LOCALE = "ar"

/** أيقونة كل وضع: أيقونة مرسومة لا نص — التسمية مفاتيح في القاموس. */
const THEME_MODE_ICONS = {
	light: "sun",
	dark: "moon",
	system: "monitor",
}

/** يمنع نقرتين متتاليتين من تداخل تحميلَي قاموس. */
const switching = ref(false)

export function useLoginPreferences() {
	const { locale, dir, isRTL, supportedLocales, changeLocale } = useLocale()
	const {
		mode: themeMode,
		resolvedTheme,
		isDark,
		setMode: setThemeMode,
	} = useAppTheme()

	/**
	 * اللغات المتاحة — مرتّبة ثابتة حتى لا يقفز الترتيب عند تغيّر قائمة
	 * المسموح به، وعربية أولًا لأنها لغة المنتج، واسم كل لغة بلغتها.
	 */
	const localeOptions = computed(() =>
		Object.entries(supportedLocales.value)
			.filter(([code]) => Boolean(SUPPORTED_LOCALES[code]))
			.map(([code, config]) => ({
				value: code,
				label: config.nativeName || config.name || code,
				dir: config.dir,
			}))
			.sort((a, b) =>
				a.value === DEFAULT_LOCALE ? -1 : b.value === DEFAULT_LOCALE ? 1 : 0,
			),
	)

	const themeOptions = computed(() =>
		THEME_MODES.map((value) => ({ value, icon: THEME_MODE_ICONS[value] })),
	)

	/**
	 * تبديل اللغة.
	 *
	 * يفشل بهدوء ويخبر المتصل: `changeLocale` يبتلع خطأ تحميل القاموس
	 * داخليًا، لكن الشاشة يجب أن تعرف أن الاختيار لم يُطبَّق فترى رسالة
	 * بدل قائمة تعرض لغة غير مفعّلة.
	 *
	 * @param {string} code - رمز اللغة، مثال "en"
	 * @returns {Promise<boolean>} هل طُبِّقت اللغة
	 */
	async function setLocale(code) {
		if (!SUPPORTED_LOCALES[code] || switching.value) return false

		switching.value = true
		try {
			await changeLocale(code)
			log.info(`DyPOS login language set to ${code}`)
			return true
		} catch (error) {
			log.warn(`DyPOS login language switch failed (${code})`, error)
			return false
		} finally {
			switching.value = false
		}
	}

	return {
		locale: readonly(locale),
		dir: readonly(dir),
		isRTL: readonly(isRTL),
		localeOptions: readonly(localeOptions),
		setLocale,

		themeMode: readonly(themeMode),
		resolvedTheme: readonly(resolvedTheme),
		isDark: readonly(isDark),
		themeOptions: readonly(themeOptions),
		setThemeMode,
		themeModes: THEME_MODES,

		switching: readonly(switching),
	}
}
