/**
 * هوية الشركة والمنتج — المصدر الوحيد لكل سطح يسمّي الجهة المنتجة.
 *
 * قبل هذا الملف كان الاسم والرابط مكرّرين في ثلاثة مواضع لا رابط بينها
 * (ترويسة index.html، manifest في vite.config.js، وتذييل صفحة الدخول) فضلّت
 * ثلاثة أسطر «© … جميع الحقوق محفوظة» تسمّيDxPOS ولا تذكر الشركة ولا تربط
 * موقعها الرسمي. تعديل واحد هنا يعدّلها كلها.
 */

/** اسم المنتج كما يظهر في مثبّت التطبيق وقائمة الانتقال. */
export const APP_NAME = "DyPOS"

/** الوصف المختصر بالعربية (يُستخدم في manifest و og:description). */
export const APP_TAGLINE = "نظام نقاط بيع ذكي"

/** الاسم القانوني للشركة (يظهر في التذييل وفي بطاقة المشاركة). */
export const COMPANY_NAME_AR = "شركة المنافذ الذكية للبرمجيات"

/** الاسم بالإنجليزية (يظهر في og:site_name لأي زبون لا يقرأ العربية). */
export const COMPANY_NAME_EN = "Smart Ports Software"

/** الموقع الرسمي — الوجهة الوحيدة المعتمدة للرابط الخارجي. */
export const COMPANY_WEBSITE = "https://smartportssoft.com/"

/**
 * أصل موقع المنتج العام — النطاق الذي تُنشر عليه الواجهة ويُشار إليه من كل
 * الروابط القانونية والوصفية. لا localhost ولا منافذ تطوير هنا أبدًا.
 */
export const SITE_ORIGIN = "https://dypos.smartportssoft.com"

/**
 * المعرفات الثابتة عبر المنصات — اسم تجاري واحد، وهوية تقنية واحدة لكل منصة
 * بالشكل الذي تفرضه (reverse-DNS حيث يلزم).
 *
 * هذه قيم معلنة لا أسرار: حزمة أندرويد ومعرف iOS ظاهران في المتاجر بعد النشر.
 * ما يحتاج حسابًا خارجيًا (التوقيع، بصمة الشهادة) لا يعيش هنا بل في أسرار CI.
 */
export const APP_DISPLAY_NAME = "DyPOS"
export const ANDROID_PACKAGE = "com.smartportssoft.DyPOS"
export const IOS_BUNDLE_ID = "com.smartportssoft.DyPOS"
export const MSIX_IDENTITY_NAME = "SmartPortsSoftware.DyPOS"

/** لون شريط المتصفح / واجهة التثبيت — يطابق index.html و manifest. */
export const BRAND_THEME_COLOR = "#1E40AF"

/** خلفية شاشة التثبيت: التطبيق يفتتح فاتحًا افتراضيًا. */
export const BRAND_BACKGROUND_COLOR = "#ffffff"

/**
 * برنامج PWA Builder للإغناء — يُشغَّل الباني الموصى به من Microsoft/PWA
 * Builder لإنتاج حزمة Windows عند الطلب من نفس هذا البناء. تكتب هذه القيم
 * في ملف الباني، لا في المستودع — لأن بيانات التوقيع والناشر أسرار حساب.
 *
 * القيم المُدارة هنا (اسم العرض، المعرف، الأيقونات، النطاق) هي القيم نفسها
 * التي تُولَّد لكل بناء محلي. ما يملأ الحقول الخارجية: انظر
 * docs/STORE_SUBMISSION.md «Windows».
 *
 * اللونان معرّفان أعلاه عمدًا: هذا الكائن يُبنى عند تحميل الوحدة، فأي مرجع
 * لاحق (TDZ) يرمي ReferenceError ويكسر كل مستورد للهوية.
 */
export const PWA_BUILDER_WINDOWS = Object.freeze({
	name: "DyPOS",
	packageUrl: `${SITE_ORIGIN}/`,
	startUrl: "/",
	display: "standalone",
	themeColor: BRAND_THEME_COLOR,
	backgroundColor: BRAND_BACKGROUND_COLOR,
})

/** ما يُكتب داخل الرابط بدل العنوان الكامل الطويل. */
export const COMPANY_WEBSITE_LABEL = "smartportssoft.com"

/**
 * بطاقة هوية الشركة (1200×630) — نفس الملف في `public/` و`src/assets/`
 * (الأخير خلفية لوحة الدخول). الجذر-نسبي حتى يبقيه Vite على مسار الأساس
 * الصحيح في البناء المدمج وفي بناء Pages، ويزيده build-pages.mjs رابطًا مطلقًا
 * عند النشر لأن زواحف Open Graph لا تقرأ المسارات النسبية.
 */
export const BRAND_CARD = "/smart-ports-og.jpg"
export const BRAND_CARD_WIDTH = 1200
export const BRAND_CARD_HEIGHT = 630
export const BRAND_CARD_TYPE = "image/jpeg"
