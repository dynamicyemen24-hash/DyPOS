import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { ah } from '../lib/async.js';

const router = Router();

const AR_TRANSLATIONS = {
  "DyPOS يتطلب JavaScript — فعّله ثم أعد التحميل.": "DyPOS يتطلب JavaScript — فعّله ثم أعد التحميل.",
  "Skip to main content": "تخطي إلى المحتوى الرئيسي",
  "Dismiss": "إغلاق",
  "Cart is empty": "السلة فارغة",
  "Please select a customer": "الرجاء اختيار عميل",
  "Add items to the cart before applying an offer.": "أضف أصنافاً للسلة قبل تطبيق عرض.",
  "Your cart doesn't meet the requirements for this offer.": "سلتك لا تستوفي متطلبات هذا العرض.",
  "Offer applied successfully": "تم تطبيق العرض بنجاح",
  "Failed to apply offer. Please try again.": "فشل تطبيق العرض. حاول مرة أخرى.",
  "Offer has been removed from cart": "تم إزالة العرض من السلة",
  "Failed to update cart after removing offer.": "فشل تحديث السلة بعد إزالة العرض.",
  "Offline: {0} applied": "بدون إنترنت: تم تطبيق {0}",
  "Offer removed: {0}. Cart no longer meets requirements.": "تم إزالة العرض: {0}. السلة لم تعد تستوفي المتطلبات.",
  "{0} applied successfully": "تم تطبيق {0} بنجاح",
  "Discount has been removed from cart": "تم إزالة الخصم من السلة",
  "Merged into {0} (Total: {1})": "تم الدمج في {0} (الإجمالي: {1})",
  "Unit changed to {0}": "تم تغيير الوحدة إلى {0}",
  "{0} updated": "تم تحديث {0}",
  "Failed to update item. Please try again.": "فشل تحديث الصنف. حاول مرة أخرى.",
  "Requested quantity ({0}) exceeds available stock ({1})": "الكمية المطلوبة ({0}) تتجاوز المخزون المتاح ({1})",
  "Select Item Variant": "اختيار متغير الصنف",
  "Select Unit of Measure": "اختيار وحدة القياس",
  "Choose a variant of this item:": "اختر متغيراً لهذا الصنف:",
  "Select the unit of measure for this item:": "اختر وحدة القياس لهذا الصنف:",
  "Add to Cart": "أضف إلى السلة",
  "Discount (%)": "خصم (%)",
  "Discount Amount": "مبلغ الخصم",
  "Subtotal": "المجموع الفرعي",
  "Total": "الإجمالي",
  "Quantity": "الكمية",
  "Price": "السعر",
  "Item": "الصنف",
  "Customer": "العميل",
  "Payment": "الدفع",
  "Cash": "نقدي",
  "Card": "بطاقة",
  "Print": "طباعة",
  "Save": "حفظ",
  "Cancel": "إلغاء",
  "Confirm": "تأكيد",
  "Delete": "حذف",
  "Edit": "تعديل",
  "Search": "بحث",
  "Loading...": "جاري التحميل...",
  "No results found": "لا توجد نتائج",
  "Error": "خطأ",
  "Success": "نجاح",
  "Warning": "تنبيه",
  "Info": "معلومات",
  "Yes": "نعم",
  "No": "لا",
  "OK": "موافق",
  "Close": "إغلاق",
  "Print Receipt": "طباعة الفاتورة",
  "Invoice": "فاتورة",
  "Return": "مرتجع",
  "Exchange": "استبدال",
  "Refund": "استرداد",
  "Credit": "آجل",
  "Paid": "مدفوع",
  "Pending": "معلق",
  "Completed": "مكتمل",
  "Draft": "مسودة",
  "Open": "مفتوح",
  "Closed": "مغلق",
  "Shift": "ورديّة",
  "Open Shift": "فتح وردية",
  "Close Shift": "إغلاق وردية",
  "Opening Amount": "مبلغ الافتتاح",
  "Closing Amount": "مبلغ الإغلاق",
  "Sales Total": "إجمالي المبيعات",
  "Cash Difference": "فرق النقدية",
  "Products": "المنتجات",
  "Categories": "الأقسام",
  "Stock": "المخزون",
  "Low Stock": "مخزون منخفض",
  "Out of Stock": "نفد المخزون",
  "Settings": "الإعدادات",
  "Profile": "الملف الشخصي",
  "Logout": "تسجيل خروج",
  "Login": "تسجيل دخول",
  "Username": "اسم المستخدم",
  "Password": "كلمة المرور",
  "Remember Me": "تذكرني",
  "Forgot Password?": "نسيت كلمة المرور؟",
  "Reset Password": "إعادة تعيين كلمة المرور",
  "New Password": "كلمة مرور جديدة",
  "Confirm Password": "تأكيد كلمة المرور",
  "Language": "اللغة",
  "Arabic": "العربية",
  "English": "الإنجليزية",
  "Theme": "السمة",
  "Light": "فاتح",
  "Dark": "داكن",
  "System": "النظام",
  "Notifications": "الإشعارات",
  "No notifications": "لا توجد إشعارات",
  "Mark all as read": "تعيين الكل كمقروء",
  "Sync": "مزامنة",
  "Synced": "تمت المزامنة",
  "Pending Sync": "مزامنة معلقة",
  "Offline Mode": "وضع عدم الاتصال",
  "Online": "متصل",
  "Offline": "غير متصل",
  "Version": "الإصدار",
  "Build": "البناء",
  "Last Sync": "آخر مزامنة",
  "never": "أبداً",
  "just now": "الآن",
  "minutes ago": "منذ دقائق",
  "hours ago": "منذ ساعات",
  "days ago": "منذ أيام",
};

const ALLOWED_LOCALES = ['ar', 'en'];

const LOCALE_NAMES = {
  ar: { native: 'العربية', english: 'Arabic' },
  en: { native: 'English', english: 'English' }
};

function getTranslations(locale = 'ar') {
  if (locale === 'ar') {
    return AR_TRANSLATIONS;
  }
  return {};
}

router.get('/get_app_translations', ah(async (req, res) => {
  const locale = req.query.locale || 'ar';
  const translations = getTranslations(locale);
  res.json({ message: translations });
}));

router.get('/get_allowed_locales', ah(async (_req, res) => {
  res.json({ message: ALLOWED_LOCALES });
}));

router.get('/get_user_language', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  const locale = user?.preferred_locale || 'ar';
  res.json({ message: locale });
}));

router.get('/get_locale_names', ah(async (_req, res) => {
  res.json({ message: LOCALE_NAMES });
}));

export default router;