# 🧭 حزمة العلامة التجارية - المنافذ الذكية للبرمجيات

## معلومات عامة

| البند | القيمة |
|-------|--------|
| **الشركة** | المنافذ الذكية للبرمجيات |
| **الاسم بالإنجليزية** | Smart Ports Software |
| **التطبيق** | المنافذ الذكية POS |
| **الإصدار** | 1.16.0 |
| **الرخصة** | AGPL-3.0 |
| **اللغات** | العربية + الإنجليزية |
| **اتجاه النص** | RTL |
| **العملة** | ر.س (SAR) |
| **الضرائب** | 15% ضريبة القيمة المضافة |

## الألوان

```
Primary:    #1E40AF (أزرق داكن)
Secondary:  #059669 (أخضر)
Accent:     #DC2626 (أحمر)
Background: #F9FAFB (رمادي فاتح)
Text:       #1F2937 (أسود داكن)
```

## هيكل الملفات

```
D:\SulationDy\DyPOS\DyPOS\
├── DyPOS\
│   ├── hooks.py              ← دوال التثبيت والترحيل
│   ├── config.py             ← إعدادات التكوين
│   ├── setup.py              ← سكربت الإعداد
│   ├── manifest.json         ← بيانات التطبيق
│   ├── doctype\
│   │   ├── pos_settings\     ← إعدادات POS
│   │   └── pos_profile\      ← ملفات تعريف POS
│   ├── workspace\
│   │   └── DyPOS\
│   │       └── DyPOS.json  ← لوحة التحكم
│   ├── print_format\
│   │   ├── DyPOS_receipt\ ← إيصال
│   │   └── DyPOS_eod_report\ ← تقرير نهاية اليوم
│   └── custom\
│       ├── pos_profile.json  ← حقول مخصصة
│       └── pos_closing_shift.json
├── POS\
│   ├── src\
│   │   ├── app.js            ← نقطة الدخول
│   │   ├── theme.css         ← ألوان السمة
│   │   ├── lang\
│   │   │   ├── ar.json       ← الترجمة العربية
│   │   │   └── en.json       ← الترجمة الإنجليزية
│   │   ├── composables\
│   │   │   ├── useBranding.js ← دالة العلامة التجارية
│   │   │   ├── useCompanyInfo.js ← معلومات الشركة
│   │   │   └── useOffline.js  ← الوضع الأوفلاين
│   │   └── utils\
│   │       └── offline\
│   │           └── branding.js ← أدوات العلامة التجارية
│   └── public\
│       └── manifest.json     ← PWA manifest
```

## التثبيت

### 1. تثبيت التطبيق
```bash
# في بيئة Frappe
bench --site [site_name] install-app DyPOS
```

### 2. تثبيت العلامة التجارية
```bash
# يتم تلقائياً بعد التثبيت عبر hooks.py
```

### 3. التحقق
```bash
# تحقق من الإعداد
bench --site [site_name] console
> import frappe
> frappe.get_doc("Company", "المنافذ الذكية للبرمجيات")
```

## الاستخدام

### الوصول إلى العلامة التجارية
```javascript
import { useBranding } from '@/composables/useBranding'

const { getCompanyName, getColor, formatCurrency } = useBranding()
```

### الطباعة المخصصة
```javascript
import { usePrint } from '@/composables/useBranding'

const { printReceipt } = usePrint()
await printReceipt(invoice)
```

### الترجمة
```javascript
import { __ } from '@/lang'

const label = __('invoice') // 'فاتورة'
```

## التكامل مع ZATCA

لتفعيل الامتثال السعودي:
```bash
bench --site [site_name] install-app zatca_integration
```

## الدعم الفني

- **البريد**: support@smartports.com
- **الموقع**: https://smartports.com
- **الهاتف**: +966-11-000-0000
- **العنوان**: السعودية

## حقوق النشر

© 2025 المنافذ الذكية للبرمجيات. جميع الحقوق محفوظة.
مرخص بموجب رخصة AGPL-3.0.
