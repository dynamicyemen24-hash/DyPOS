// Company information composable
import { ref, computed } from "vue";
import { call } from "@/utils/apiWrapper";

const companyInfo = ref({
    name: "المنافذ الذكية للبرمجيات",
    nameEn: "Smart Ports Software",
    shortName: "SP",
    logo: "/assets/smart_ports/images/logo.png",
    favicon: "/assets/smart_ports/images/favicon.ico",
    color: "#1E40AF",
    colorSecondary: "#059669",
    colorAccent: "#DC2626",
    website: "https://smartports.com",
    email: "support@smartports.com",
    phone: "+966-11-000-0000",
    address: "السعودية",
    currency: "SAR",
    taxRate: 15,
    enableOffline: true,
    enableWallet: true,
    enableLoyalty: true,
    enableCoupons: true,
    multiCurrency: true,
    rtl: true,
});

/**
 * Get company information
 * @returns {Object} Company information
 */
export function useCompanyInfo() {
    const getName = () => companyInfo.value.name;
    const getNameEn = () => companyInfo.value.nameEn;
    const getLogo = () => companyInfo.value.logo;
    const getColor = () => companyInfo.value.color;
    const getColorSecondary = () => companyInfo.value.colorSecondary;
    const getWebsite = () => companyInfo.value.website;
    const getEmail = () => companyInfo.value.email;
    const getPhone = () => companyInfo.value.phone;
    const getCurrency = () => companyInfo.value.currency;
    const getTaxRate = () => companyInfo.value.taxRate;
    const isRTL = () => companyInfo.value.rtl;

    const getCompanyInfo = async () => {
        try {
            const result = await call({
                method: "DyPOS.api.bootstrap.get_company_info",
            });
            if (result && result.message) {
                companyInfo.value = { ...companyInfo.value, ...result.message };
            }
            return companyInfo.value;
        } catch (error) {
            console.error("Failed to load company info:", error);
            return companyInfo.value;
        }
    };

    const setCompanyInfo = (info) => {
        companyInfo.value = { ...companyInfo.value, ...info };
    };

    return {
        companyInfo,
        getName,
        getNameEn,
        getLogo,
        getColor,
        getColorSecondary,
        getWebsite,
        getEmail,
        getPhone,
        getCurrency,
        getTaxRate,
        isRTL,
        getCompanyInfo,
        setCompanyInfo,
    };
}

/**
 * System status composable
 */
export function useSystemStatus() {
    const status = ref({
        isOnline: navigator.onLine,
        isReady: false,
        lastSync: null,
        pendingInvoices: 0,
        systemHealth: "good",
    });

    const checkOnline = () => {
        status.value.isOnline = navigator.onLine;
        return status.value.isOnline;
    };

    const setReady = (ready) => {
        status.value.isReady = ready;
    };

    const setLastSync = (date) => {
        status.value.lastSync = date;
    };

    const setPendingInvoices = (count) => {
        status.value.pendingInvoices = count;
    };

    const setSystemHealth = (health) => {
        status.value.systemHealth = health;
    };

    const getStatus = () => status.value;

    return {
        status,
        checkOnline,
        setReady,
        setLastSync,
        setPendingInvoices,
        setSystemHealth,
        getStatus,
    };
}
