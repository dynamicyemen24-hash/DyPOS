// Offline branding utilities for Smart Ports POS
// Version: 1.16.0
// License: AGPL-3.0

export const COMPANY = {
    name: "المنافذ الذكية للبرمجيات",
    nameEn: "Smart Ports Software",
    shortName: "SP",
    logo: "/assets/smart_ports/images/logo.png",
    favicon: "/assets/smart_ports/images/favicon.ico",
    ogImage: "/assets/smart_ports/images/smart-ports-og.jpg",
    color: "#1E40AF",
    colorSecondary: "#059669",
    colorAccent: "#DC2626",
    colorBackground: "#F9FAFB",
    colorText: "#1F2937",
    website: "https://smartports.com",
    email: "support@smartports.com",
    phone: "+966-11-000-0000",
    address: "السعودية",
    currency: "SAR",
    taxRate: 15,
    rtl: true,
};

export const BRAND_COLORS = {
    primary: "#1E40AF",
    primaryLight: "#3B82F6",
    primaryDark: "#1E3A8A",
    secondary: "#059669",
    secondaryLight: "#10B981",
    secondaryDark: "#047857",
    accent: "#DC2626",
    accentLight: "#EF4444",
    accentDark: "#B91C1C",
    warning: "#D97706",
    warningLight: "#F59E0B",
    warningDark: "#B45309",
    success: "#059669",
    successLight: "#10B981",
    successDark: "#047857",
    error: "#DC2626",
    errorLight: "#EF4444",
    errorDark: "#B91C1C",
};

export const BRAND_CSS = `
    :root {
        --brand-primary: ${BRAND_COLORS.primary};
        --brand-secondary: ${BRAND_COLORS.secondary};
        --brand-accent: ${BRAND_COLORS.accent};
        --brand-warning: ${BRAND_COLORS.warning};
        --brand-success: ${BRAND_COLORS.success};
        --brand-error: ${BRAND_COLORS.error};
        --brand-bg: ${COMPANY.colorBackground};
        --brand-text: ${COMPANY.colorText};
        --brand-font: 'Cairo', 'DejaVu Sans', 'Inter', sans-serif;
    }

    .brand-header {
        background-color: var(--brand-primary);
        color: white;
        padding: 15px;
        text-align: center;
    }

    .brand-logo {
        max-width: 60px;
        margin: 0 auto 10px;
    }

    .brand-title {
        font-size: 18px;
        font-weight: bold;
        color: var(--brand-primary);
    }

    .brand-footer {
        border-top: 2px solid var(--brand-primary);
        padding-top: 10px;
        text-align: center;
        font-size: 10px;
        color: #666;
        margin-top: 15px;
    }

    .brand-invoice {
        font-family: var(--brand-font);
        direction: rtl;
    }

    .brand-print-area {
        width: 80mm;
        margin: 0 auto;
        padding: 10px;
    }

    .brand-total {
        font-size: 14px;
        font-weight: bold;
        border-top: 2px solid var(--brand-primary);
        padding-top: 8px;
        margin-top: 8px;
    }

    .brand-offline-badge {
        background-color: var(--brand-warning);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 10px;
    }

    .brand-online-badge {
        background-color: var(--brand-success);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 10px;
    }
`;

export const getBrandCSS = () => BRAND_CSS;

export const getCompanyInfo = () => COMPANY;

export const getBrandColors = () => BRAND_COLORS;

export const formatCurrency = (amount, currency = COMPANY.currency) => {
    const symbols = {
        SAR: "ر.س",
        USD: "$",
        AED: "د.إ",
        EUR: "€",
        EGP: "ج.م",
    };
    const symbol = symbols[currency] || currency;
    return new Intl.NumberFormat("ar-SA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount) + " " + symbol;
};

export const formatNumber = (num) => {
    return new Intl.NumberFormat("ar-SA").format(num);
};

export const formatDate = (date) => {
    return new Intl.DateTimeFormat("ar-SA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(date));
};

export const formatDateTime = (date) => {
    return new Intl.DateTimeFormat("ar-SA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(date));
};

export const getBrandLabel = (key, lang = "ar") => {
    const labels = {
        ar: {
            invoice: "فاتورة",
            receipt: "إيصال",
            customer: "عميل",
            item: "منتج",
            payment: "دفع",
            shift: "شيفت",
            report: "تقرير",
            total: "الإجمالي",
            discount: "خصم",
            tax: "ضريبة",
            save: "حفظ",
            cancel: "إلغاء",
            submit: "تأكيد",
            print: "طباعة",
            add: "إضافة",
            edit: "تعديل",
            delete: "حذف",
            search: "بحث",
            offline: "غير متصل",
            online: "متصل",
        },
        en: {
            invoice: "Invoice",
            receipt: "Receipt",
            customer: "Customer",
            item: "Item",
            payment: "Payment",
            shift: "Shift",
            report: "Report",
            total: "Total",
            discount: "Discount",
            tax: "Tax",
            save: "Save",
            cancel: "Cancel",
            submit: "Submit",
            print: "Print",
            add: "Add",
            edit: "Edit",
            delete: "Delete",
            search: "Search",
            offline: "Offline",
            online: "Online",
        },
    };

    return labels[lang]?.[key] || key;
};

export const getBrandReceiptHTML = (invoice) => `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <title>فاتورة - ${invoice.name}</title>
        <style>
            body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; }
            .header { text-align: center; border-bottom: 2px solid ${BRAND_COLORS.primary}; padding-bottom: 15px; margin-bottom: 20px; }
            .company-name { font-size: 20px; font-weight: bold; color: ${BRAND_COLORS.primary}; }
            .invoice-number { font-size: 16px; font-weight: bold; margin-top: 10px; }
            .items { margin: 20px 0; }
            .item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            .total { font-size: 18px; font-weight: bold; border-top: 2px solid ${BRAND_COLORS.primary}; padding-top: 10px; margin-top: 10px; }
            .footer { border-top: 2px solid ${BRAND_COLORS.primary}; margin-top: 20px; padding-top: 10px; text-align: center; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="company-name">${COMPANY.name}</div>
            <div class="invoice-number">فاتورة رقم: ${invoice.name}</div>
        </div>
        <div class="items">
            ${invoice.items.map(item => `
                <div class="item">
                    <span>${item.item_name} × ${item.qty}</span>
                    <span>${item.amount} ر.س</span>
                </div>
            `).join('')}
        </div>
        <div class="total">الإجمالي: ${invoice.total} ر.س</div>
        <div class="footer">
            <div>شكراً لتعاملكم مع المنافذ الذكية</div>
            <div>${invoice.posting_date}</div>
        </div>
    </body>
    </html>
`;
