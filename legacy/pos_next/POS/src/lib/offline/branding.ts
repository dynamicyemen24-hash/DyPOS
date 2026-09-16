// (c) 2025 المنافذ الذكية للبرمجيات
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

export const formatCurrency = (amount: number, currency = COMPANY.currency) => {
    const symbols: Record<string, string> = {
        SAR: "ر.س", USD: "$", AED: "د.إ", EUR: "€", EGP: "ج.م",
    };
    const symbol = symbols[currency] || currency;
    return new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        .format(amount) + " " + symbol;
};

export const formatNumber = (num: number) => new Intl.NumberFormat("ar-SA").format(num);

export const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

export const formatDateTime = (date: Date) =>
    new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);

export const getBrandLabel = (key: string, lang = "ar") => {
    const labels: Record<string, { ar: string; en: string }> = {
        invoice: { ar: "فاتورة", en: "Invoice" },
        receipt: { ar: "إيصال", en: "Receipt" },
        customer: { ar: "عميل", en: "Customer" },
        item: { ar: "منتج", en: "Item" },
        payment: { ar: "دفع", en: "Payment" },
        shift: { ar: "شيفت", en: "Shift" },
        report: { ar: "تقرير", en: "Report" },
        total: { ar: "الإجمالي", en: "Total" },
        discount: { ar: "خصم", en: "Discount" },
        tax: { ar: "ضريبة", en: "Tax" },
        save: { ar: "حفظ", en: "Save" },
        cancel: { ar: "إلغاء", en: "Cancel" },
        submit: { ar: "تأكيد", en: "Submit" },
        print: { ar: "طباعة", en: "Print" },
        add: { ar: "إضافة", en: "Add" },
        edit: { ar: "تعديل", en: "Edit" },
        delete: { ar: "حذف", en: "Delete" },
        search: { ar: "بحث", en: "Search" },
        offline: { ar: "غير متصل", en: "Offline" },
        online: { ar: "متصل", en: "Online" },
        quickSale: { ar: "بيع سريع", en: "Quick Sale" },
        hold: { ar: "إيقاف", en: "Hold" },
        resume: { ar: "استئناف", en: "Resume" },
    };
    return labels[key]?.[lang] || key;
};

export const getBrandReceiptHTML = (invoice: any) => `
<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>فاتورة - ${invoice.name}</title>
<style>body{font-family:'Cairo',sans-serif;direction:rtl;padding:20px}.header{text-align:center;border-bottom:2px solid ${BRAND_COLORS.primary};padding-bottom:15px;margin-bottom:20px}.company-name{font-size:20px;font-weight:bold;color:${BRAND_COLORS.primary}}.invoice-number{font-size:16px;font-weight:bold;margin-top:10px}.items{margin:20px 0}.item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}.total{font-size:18px;font-weight:bold;border-top:2px solid ${BRAND_COLORS.primary};padding-top:10px;margin-top:10px}.footer{border-top:2px solid ${BRAND_COLORS.primary};margin-top:20px;padding-top:10px;text-align:center;font-size:12px;color:#666}</style></head>
<body><div class="header"><div class="company-name">${COMPANY.name}</div><div class="invoice-number">فاتورة رقم: ${invoice.name}</div></div>
<div class="items">${invoice.items.map((i: any) => `<div class="item"><span>${i.item_name} × ${i.qty}</span><span>${i.amount} ر.س</span></div>`).join('')}</div>
<div class="total">الإجمالي: ${invoice.total} ر.س</div>
<div class="footer"><div>شكراً لتعاملكم مع المنافذ الذكية</div><div>${invoice.posting_date}</div></div></body></html>`;
