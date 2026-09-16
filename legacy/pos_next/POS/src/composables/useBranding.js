// Brand composable for Smart Ports POS
import { ref, computed } from "vue";
import { call } from "@/utils/apiWrapper";

// Company branding configuration
const branding = ref({
    companyName: "المنافذ الذكية للبرمجيات",
    companyNameEn: "Smart Ports Software",
    shortName: "SP",
    logo: "/assets/smart_ports/images/logo.png",
    favicon: "/assets/smart_ports/images/favicon.ico",
    color: "#1E40AF",
    colorSecondary: "#059669",
    colorAccent: "#DC2626",
    colorBackground: "#F9FAFB",
    colorText: "#1F2937",
    website: "https://smartports.com",
    email: "support@smartports.com",
    phone: "+966-11-000-0000",
    currency: "SAR",
    taxRate: 15,
    rtl: true,
});

/**
 * Get company branding configuration
 * @returns {Object} Branding configuration
 */
export function useBranding() {
    const getCompanyName = () => branding.value.companyName;
    const getCompanyNameEn = () => branding.value.companyNameEn;
    const getLogo = () => branding.value.logo;
    const getColor = () => branding.value.color;
    const getColorSecondary = () => branding.value.colorSecondary;
    const getColorAccent = () => branding.value.colorAccent;
    const getCurrency = () => branding.value.currency;
    const getTaxRate = () => branding.value.taxRate;
    const isRTL = () => branding.value.rtl;

    const getBrandLabel = (key) => {
        const labels = {
            invoice: "فاتورة",
            receipt: "إيصال",
            customer: "عميل",
            item: "منتج",
            payment: "دفع",
            shift: "شيفت",
            report: "تقرير",
            settings: "إعدادات",
            total: "الإجمالي",
            discount: "خصم",
            tax: "ضريبة",
            save: "حفظ",
            cancel: "إلغاء",
            submit: "تأكيد",
            search: "بحث",
            print: "طباعة",
            add: "إضافة",
            edit: "تعديل",
            delete: "حذف",
            view: "عرض",
            close: "إغلاق",
            success: "نجاح",
            error: "خطأ",
            warning: "تحذير",
            offline: "غير متصل",
            online: "متصل",
        };
        return labels[key] || key;
    };

    const getCurrencySymbol = () => {
        const symbols = {
            SAR: "ر.س",
            USD: "$",
            AED: "د.إ",
            EUR: "€",
            EGP: "ج.م",
        };
        return symbols[branding.value.currency] || branding.value.currency;
    };

    const formatNumber = (num, decimals = 2) => {
        return new Intl.NumberFormat("ar-SA", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }).format(num);
    };

    const formatCurrency = (amount, currency = null) => {
        const cur = currency || branding.value.currency;
        const symbol = getCurrencySymbol();
        return `${formatNumber(amount)} ${symbol}`;
    };

    const formatDate = (date) => {
        return new Intl.DateTimeFormat("ar-SA", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date(date));
    };

    const formatDateTime = (date) => {
        return new Intl.DateTimeFormat("ar-SA", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(date));
    };

    return {
        branding,
        getCompanyName,
        getCompanyNameEn,
        getLogo,
        getColor,
        getColorSecondary,
        getColorAccent,
        getCurrency,
        getTaxRate,
        isRTL,
        getBrandLabel,
        getCurrencySymbol,
        formatNumber,
        formatCurrency,
        formatDate,
        formatDateTime,
    };
}

/**
 * Theme composable for dynamic theming
 */
export function useTheme() {
    const setTheme = (theme) => {
        const root = document.documentElement;
        root.style.setProperty("--color-primary", theme.color);
        root.style.setProperty("--color-secondary", theme.colorSecondary);
        root.style.setProperty("--color-accent", theme.colorAccent);
        root.style.setProperty("--color-background", theme.colorBackground);
        root.style.setProperty("--color-text", theme.colorText);
        root.style.setProperty("--color-border", theme.colorBorder);
        root.style.setProperty("--font-family", theme.font);
    };

    const applyDefaultTheme = () => {
        setTheme(branding.value);
    };

    const applyDarkTheme = () => {
        const darkTheme = {
            ...branding.value,
            colorBackground: "#1F2937",
            colorText: "#F9FAFB",
            colorBorder: "#374151",
        };
        setTheme(darkTheme);
    };

    return {
        setTheme,
        applyDefaultTheme,
        applyDarkTheme,
    };
}

/**
 * Print composable for branded receipts
 */
export function usePrint() {
    const printReceipt = async (invoice) => {
        try {
            const result = await call({
                method: "DyPOS.api.print.get_receipt_html",
                args: { invoice_name: invoice.name },
            });

            if (result && result.message) {
                const printWindow = window.open("", "_blank");
                printWindow.document.write(result.message);
                printWindow.document.close();
                printWindow.print();
            }
        } catch (error) {
            console.error("Print error:", error);
        }
    };

    const printInvoice = async (invoice) => {
        await printReceipt(invoice);
    };

    const printPackage = async (packageData) => {
        try {
            const result = await call({
                method: "DyPOS.api.print.get_package_label",
                args: { package_data: packageData },
            });

            if (result && result.message) {
                const printWindow = window.open("", "_blank");
                printWindow.document.write(result.message);
                printWindow.document.close();
                printWindow.print();
            }
        } catch (error) {
            console.error("Package print error:", error);
        }
    };

    return {
        printReceipt,
        printInvoice,
        printPackage,
    };
}

/**
 * Notification composable with branding
 */
export function useBrandingToast() {
    const showBrandingToast = (message, type = "info") => {
        const toastMessages = {
            success: {
                title: "تمت العملية بنجاح ✅",
                message,
                color: "#059669",
            },
            error: {
                title: "حدث خطأ ❌",
                message,
                color: "#DC2626",
            },
            warning: {
                title: "تحذير ⚠️",
                message,
                color: "#D97706",
            },
            info: {
                title: "معلومات ℹ️",
                message,
                color: "#1E40AF",
            },
        };

        const toast = toastMessages[type] || toastMessages.info;
        return toast;
    };

    const showSuccess = (message) => showBrandingToast(message, "success");
    const showError = (message) => showBrandingToast(message, "error");
    const showWarning = (message) => showBrandingToast(message, "warning");
    const showInfo = (message) => showBrandingToast(message, "info");

    return {
        showBrandingToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
    };
}
