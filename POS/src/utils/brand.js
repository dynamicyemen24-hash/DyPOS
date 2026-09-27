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

/** ما يُكتب داخل الرابط بدل العنوان الكامل الطويل. */
export const COMPANY_WEBSITE_LABEL = "smartportssoft.com"

/** لون شريط المتصفح / واجهة التثبيت — يطابق index.html و manifest. */
export const BRAND_THEME_COLOR = "#1E40AF"

/** خلفية شاشة التثبيت: التطبيق يفتتح فاتحًا افتراضيًا. */
export const BRAND_BACKGROUND_COLOR = "#ffffff"

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
