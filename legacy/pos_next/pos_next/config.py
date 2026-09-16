# Copyright (c) 2025, المنافذ الذكية للبرمجيات
# For license information, please see license.txt

# App metadata
app_name = "DyPOS"
app_title = "POS Next"
app_publisher = "المنافذ الذكية للبرمجيات"
app_description = "نقاط البيع الذكية - نظام نقاط بيع متكامل"
app_icon = "octicon octicon-screen-full"
app_color = "#1E40AF"
app_version = "1.16.0"
app_email = "support@smartports.com"
app_license = "AGPL-3.0"

# App requirements
requirements = []

# Included apps
include_apps = []

# Development settings
dev_server = "http://localhost:8000"

# App icons
icons = {
    "app": "/assets/smart_ports/images/logo.png",
    "pos": "/assets/smart_ports/images/pos-icon.png",
    "receipt": "/assets/smart_ports/images/receipt-icon.png",
}

# Company branding
company = {
    "name": "المنافذ الذكية للبرمجيات",
    "short_name": "SP",
    "email": "support@smartports.com",
    "phone": "+966-11-000-0000",
    "website": "https://smartports.com",
    "address": "السعودية",
    "currency": "SAR",
    "country": "Saudi Arabia",
}

# POS Settings
pos_settings = {
    "default_currency": "SAR",
    "allowed_currencies": ["SAR", "USD", "AED", "EUR", "EGP"],
    "default_locale": "ar",
    "allowed_locales": ["ar", "en"],
    "enable_rtl": True,
    "enable_offline": True,
    "enable_wallet": True,
    "enable_loyalty": True,
    "enable_coupons": True,
    "enable_multi_currency": True,
}

# Print Format settings
print_format = {
    "default_format": "POS Next Receipt",
    "page_width": "80mm",
    "font": "Cairo, DejaVu Sans, Arial",
    "direction": "rtl",
    "company_logo": "/assets/smart_ports/images/logo.png",
    "company_name": "المنافذ الذكية للبرمجيات",
    "company_tagline": "Smart Ports Software | نقاط البيع الذكية",
}

# Workspace settings
workspace = {
    "default_workspace": "DyPOS",
    "home_page": "pos-next",
    "module": "POS Next",
}

# Notifications
notifications = {
    "email": "support@smartports.com",
    "phone": "+966-11-000-0000",
    "sms_provider": "twilio",
}

# Security settings
security = {
    "session_timeout": 30,
    "enable_session_lock": True,
    "password_min_length": 8,
    "enable_2fa": False,
    "allowed_ips": [],
}

# API settings
api = {
    "base_url": "http://localhost:8000",
    "timeout": 30,
    "retry_count": 3,
    "enable_csrf": True,
    "enable_rate_limit": True,
}

# Offline settings
offline = {
    "enabled": True,
    "cache_ttl": 86400,
    "sync_interval": 300,
    "storage_limit": 104857600,
}

# Multi-tenant settings
multi_tenant = {
    "enabled": True,
    "site_per_tenant": True,
    "tenant_pattern": "{company}",
    "default_domain": "localhost",
}

# ZATCA settings (Saudi compliance)
zatca = {
    "enabled": True,
    "phase": 2,
    "integration_type": "Phase2",
    "production_url": "https://api.zatca.gov.sa",
    "test_url": "https://api.zatca.gov.sa/certificate/0000000000000000000000000000000000000000000000000000000000000000",
    "tax_rate": 15,
}

# Reports settings
reports = {
    "sales_vs_shifts": True,
    "payments_cash_control": True,
    "inventory_impact": True,
    "cashier_performance": True,
    "offline_sync": True,
}

# User roles mapping
role_permissions = {
    "DyPOS Cashier": ["read", "write", "submit"],
    "Nexus POS Manager": ["read", "write", "submit", "report", "admin"],
    "DyPOS Manager": ["read", "write", "submit", "report"],
    "System Manager": ["all"],
}

# Theme settings
theme = {
    "primary_color": "#1E40AF",
    "secondary_color": "#059669",
    "accent_color": "#DC2626",
    "background_color": "#F9FAFB",
    "text_color": "#1F2937",
    "border_color": "#E5E7EB",
    "font_family": "Cairo, 'DejaVu Sans', 'Inter', sans-serif",
    "font_arabic": "Cairo",
    "font_english": "Inter",
}

# Branding settings
branding = {
    "company_name": "المنافذ الذكية للبرمجيات",
    "company_name_en": "Smart Ports Software",
    "app_name": "المنافذ الذكية POS",
    "app_name_en": "Smart Ports POS",
    "logo_url": "/assets/smart_ports/images/logo.png",
    "favicon_url": "/assets/smart_ports/images/favicon.ico",
    "og_image": "/assets/smart_ports/images/smart-ports-og.jpg",
    "color_primary": "#1E40AF",
    "color_secondary": "#059669",
    "color_accent": "#DC2626",
    "color_background": "#F9FAFB",
    "color_text": "#1F2937",
    "color_border": "#E5E7EB",
    "color_success": "#059669",
    "color_warning": "#D97706",
    "color_error": "#DC2626",
}

# Feature flags
features = {
    "offline_mode": True,
    "multi_currency": True,
    "wallet_loyalty": True,
    "coupons_offers": True,
    "shift_management": True,
    "barcode_scanning": True,
    "batch_serial": True,
    "multi_warehouse": True,
    "credit_sales": True,
    "partial_payment": True,
    "split_payment": True,
    "print_receipt": True,
    "kitchen_display": False,
    "delivery": True,
    "zatca_compliance": True,
    "multi_tenant": True,
    "real_time_sync": True,
    "session_lock": True,
    "draft_invoices": True,
    "returns_management": True,
}

# Navigation menu
menu = {
    "main": [
        {"label": "الرئيسية", "icon": "home", "url": "/"},
        {"label": "نقاط البيع", "icon": "credit-card", "url": "/pos"},
        {"label": "العملاء", "icon": "users", "url": "/customers"},
        {"label": "المنتجات", "icon": "box", "url": "/items"},
        {"label": "التقارير", "icon": "chart-bar", "url": "/reports"},
        {"label": "الإعدادات", "icon": "settings", "url": "/settings"},
    ],
    "quick": [
        {"label": "فاتورة جديدة", "icon": "plus", "url": "/pos"},
        {"label": "البحث", "icon": "search", "url": "/search"},
        {"label": "سجل المبيعات", "icon": "history", "url": "/sales-history"},
        {"label": "الشيفتات", "icon": "clock", "url": "/shifts"},
        {"label": "المحفظة", "icon": "wallet", "url": "/wallet"},
    ],
}

# Status messages
messages = {
    "invoice_created": "تم إنشاء الفاتورة بنجاح",
    "invoice_saved_offline": "تم حفظ الفاتورة بشكل مؤقت",
    "invoice_synced": "تم مزامنة الفاتورة",
    "shift_opened": "تم فتح الشيفت بنجاح",
    "shift_closed": "تم إغلاق الشيفت بنجاح",
    "payment_success": "تم الدفع بنجاح",
    "payment_failed": "فشل الدفع",
    "item_added": "تم إضافة المنتج",
    "item_removed": "تم إزالة المنتج",
    "customer_added": "تم إضافة العميل",
    "coupon_applied": "تم تطبيق الكوبون",
    "error_occurred": "حدث خطأ",
}

# Labels
labels = {
    "invoice": "فاتورة",
    "invoice_plural": "فواتير",
    "receipt": "إيصال",
    "customer": "عميل",
    "customer_plural": "عملاء",
    "item": "منتج",
    "item_plural": "منتجات",
    "payment": "دفع",
    "payment_plural": "دفعات",
    "shift": "شيفت",
    "shift_plural": "شيفتات",
    "report": "تقرير",
    "report_plural": "تقارير",
    "settings": "إعدادات",
    "cash": "نقدي",
    "card": "بطاقة",
    "total": "الإجمالي",
    "discount": "خصم",
    "tax": "ضريبة",
    "vat": "ضريبة القيمة المضافة",
    "subtotal": "المجموع الفرعي",
    "change": "الباقي",
    "amount": "المبلغ",
    "quantity": "الكمية",
    "price": "السعر",
    "total_amount": "المبلغ الإجمالي",
    "date": "التاريخ",
    "time": "الوقت",
    "cashier": "الصندوق",
    "pos": "نقطة البيع",
    "pos_plural": "نقاط البيع",
    "sales": "المبيعات",
    "sales_plural": "مبيعات",
    "return": "إرجاع",
    "return_plural": "إرجاعات",
    "credit": "ائتمان",
    "debit": "مدين",
    "balance": "الرصيد",
    "search": "بحث",
    "filter": "فلتر",
    "print": "طباعة",
    "save": "حفظ",
    "cancel": "إلغاء",
    "submit": "تأكيد",
    "close": "إغلاق",
    "add": "إضافة",
    "edit": "تعديل",
    "delete": "حذف",
    "view": "عرض",
    "download": "تحميل",
    "upload": "رفع",
    "export": "تصدير",
    "import": "استيراد",
    "refresh": "تحديث",
    "sync": "مزامنة",
    "offline": "غير متصل",
    "online": "متصل",
    "loading": "جاري التحميل",
    "success": "نجاح",
    "warning": "تحذير",
    "error": "خطأ",
    "info": "معلومات",
}

# Currency labels
currency_labels = {
    "SAR": "ر.س",
    "USD": "$",
    "AED": "د.إ",
    "EUR": "€",
    "EGP": "ج.م",
}

# Number formats
number_format = {
    "decimal_separator": ".",
    "thousand_separator": ",",
    "currency_symbol": "ر.س",
    "currency_position": "after",
    "decimal_places": 2,
}

# Date formats
date_format = {
    "default": "YYYY-MM-DD",
    "display": "DD/MM/YYYY",
    "time": "HH:mm:ss",
    "datetime": "DD/MM/YYYY HH:mm:ss",
}

# Timezone
timezone = "Asia/Riyadh"

# Language settings
language = {
    "default": "ar",
    "available": ["ar", "en"],
    "rtl": ["ar"],
    "ltr": ["en"],
    "translation_files": ["ar.json", "en.json"],
}

# Theme variables
css_variables = """
:root {
    --color-primary: #1E40AF;
    --color-secondary: #059669;
    --color-accent: #DC2626;
    --color-background: #F9FAFB;
    --color-text: #1F2937;
    --color-border: #E5E7EB;
    --color-success: #059669;
    --color-warning: #D97706;
    --color-error: #DC2626;
    --font-family: 'Cairo', 'DejaVu Sans', 'Inter', sans-serif;
    --font-arabic: 'Cairo', sans-serif;
    --font-english: 'Inter', sans-serif;
}
"""

# JS configuration
js_config = """
window.SmartPorts = {
    company: {
        name: 'المنافذ الذكية للبرمجيات',
        nameEn: 'Smart Ports Software',
        logo: '/assets/smart_ports/images/logo.png',
        color: '#1E40AF',
        colorSecondary: '#059669',
    },
    pos: {
        enableOffline: true,
        enableWallet: true,
        enableLoyalty: true,
        enableCoupons: true,
        multiCurrency: true,
        defaultCurrency: 'SAR',
    },
    features: {
        offline: true,
        multiTenant: true,
        multiCurrency: true,
        wallet: true,
        loyalty: true,
        coupons: true,
        shiftManagement: true,
    },
};
"""

# API endpoints
api_endpoints = {
    "base_url": "/api/method",
    "pos": "/api/method/DyPOS.api",
    "auth": "/api/method/DyPOS.api.auth",
    "items": "/api/method/DyPOS.api.items",
    "customers": "/api/method/DyPOS.api.customers",
    "invoices": "/api/method/DyPOS.api.invoices",
    "shifts": "/api/method/DyPOS.api.shifts",
    "offline": "/api/method/DyPOS.api.offline",
    "wallet": "/api/method/DyPOS.api.wallet",
    "offers": "/api/method/DyPOS.api.offers",
    "reports": "/api/method/DyPOS.api.reports",
}

# Error messages
errors = {
    "network_error": "خطأ في الشبكة",
    "server_error": "خطأ في الخادم",
    "permission_denied": "لا توجد صلاحية",
    "not_found": "غير موجود",
    "validation_error": "خطأ في التحقق",
    "duplicate_error": "موجود بالفعل",
    "offline_error": "غير متصل بالإنترنت",
    "sync_error": "خطأ في المزامنة",
}