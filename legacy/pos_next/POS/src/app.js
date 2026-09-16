// Branding for المنافذ الذكية للبرمجيات (Smart Ports Software)
// Version: 1.16.0
// License: AGPL-3.0

import { createApp } from "vue";
import { createPinia } from "pinia";
import { FrappeUI } from "frappe-ui";
import App from "./App.vue";
import router from "./router";
import "./style.css";

// Company branding configuration
const companyConfig = {
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
    colorBorder: "#E5E7EB",
    colorSuccess: "#059669",
    colorWarning: "#D97706",
    colorError: "#DC2626",
    font: "Cairo, 'DejaVu Sans', 'Inter', sans-serif",
    fontArabic: "Cairo",
    fontEnglish: "Inter",
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
};

// Global configuration
const app = createApp(App);
const pinia = createPinia();

// Provide company config globally
app.provide("companyConfig", companyConfig);
app.provide("appName", "المنافذ الذكية POS");
app.provide("appNameEn", "Smart Ports POS");
app.provide("appVersion", "1.16.0");
app.provide("appPublisher", "المنافذ الذكية للبرمجيات");

// Frappe UI configuration
app.use(FrappeUI, {
    assetsPath: "/assets/frappe-ui/",
    dark: false,
    primaryColor: companyConfig.color,
    font: companyConfig.font,
    components: {
        Dialog: true,
        Toast: true,
        Tooltip: true,
        Avatar: true,
        Badge: true,
    },
});

app.use(pinia);
app.use(router);

app.mount("#app");

// Set document title
document.title = "المنافذ الذكية POS | Smart Ports POS";

// Set meta tags for branding
const setMetaTags = () => {
    const metaTags = [
        { name: "application-name", content: companyConfig.name },
        { name: "author", content: companyConfig.name },
        { name: "description", content: "نقاط البيع الذكية - نظام نقاط بيع متكامل" },
        { name: "keywords", content: "POS, Point of Sale, نقاط البيع, المنافذ الذكية, ERP" },
        { name: "og:title", content: "المنافذ الذكية POS" },
        { name: "og:description", content: "نقاط البيع الذكية - نظام نقاط بيع متكامل" },
        { name: "og:image", content: companyConfig.ogImage },
        { name: "og:url", content: "https://smartports.com" },
        { name: "og:type", content: "website" },
        { name: "og:site_name", content: companyConfig.name },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "المنافذ الذكية POS" },
        { name: "twitter:description", content: "نقاط البيع الذكية" },
        { name: "twitter:image", content: companyConfig.ogImage },
        { name: "theme-color", content: companyConfig.color },
        { name: "msapplication-TileColor", content: companyConfig.color },
        { name: "apple-mobile-web-app-title", content: "SP POS" },
    ];

    metaTags.forEach((tag) => {
        const element = document.createElement("meta");
        Object.entries(tag).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
        document.head.appendChild(element);
    });

    // Add link tags
    const linkTags = [
        { rel: "icon", type: "image/x-icon", href: companyConfig.favicon },
        { rel: "apple-touch-icon", href: "/assets/smart_ports/images/apple-touch-icon.png" },
        { rel: "manifest", href: "/manifest.json" },
    ];

    linkTags.forEach((tag) => {
        const link = document.createElement("link");
        Object.entries(tag).forEach(([key, value]) => {
            link.setAttribute(key, value);
        });
        document.head.appendChild(link);
    });
};

setMetaTags();

// CSS Variables for theming
const setCSSVariables = () => {
    const root = document.documentElement;
    root.style.setProperty("--color-primary", companyConfig.color);
    root.style.setProperty("--color-secondary", companyConfig.colorSecondary);
    root.style.setProperty("--color-accent", companyConfig.colorAccent);
    root.style.setProperty("--color-background", companyConfig.colorBackground);
    root.style.setProperty("--color-text", companyConfig.colorText);
    root.style.setProperty("--color-border", companyConfig.colorBorder);
    root.style.setProperty("--color-success", companyConfig.colorSuccess);
    root.style.setProperty("--color-warning", companyConfig.colorWarning);
    root.style.setProperty("--color-error", companyConfig.colorError);
    root.style.setProperty("--font-family", companyConfig.font);
    root.style.setProperty("--font-arabic", companyConfig.fontArabic);
    root.style.setProperty("--font-english", companyConfig.fontEnglish);
};

setCSSVariables();

// PWA registration — Production-ready Service Worker with smart-ports-v1.16.0
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").then((reg) => {
            console.log("[SW] Registered:", reg.scope);
            // Check for updates
            reg.addEventListener("updatefound", () => {
                const newWorker = reg.installing;
                newWorker.addEventListener("statechange", () => {
                    if (newWorker.state === "activated") {
                        window.dispatchEvent(new Event("sw-updated"));
                    }
                });
            });
        }).catch((err) => console.error("[SW] Registration failed:", err));
    });
    // Register offline sync service worker
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
            if ("sync" in reg) {
                reg.sync.register("sync-mutations").catch(() => {});
                reg.sync.register("sync-pos-sales").catch(() => {});
            }
        });
    }
}

// Offline detection & banner
window.addEventListener("online", () => { window.dispatchEvent(new Event("online")); });
window.addEventListener("offline", () => { window.dispatchEvent(new Event("offline")); });

// Voice POS integration
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        import("./voice-pos.js").catch(() => {});
    });
}

// Barcode Scanner integration
window.addEventListener("load", () => {
    import("./components/BarcodeScanner.tsx").catch(() => {});
});

// Offline Context
window.addEventListener("load", () => {
    import("./lib/offline/OfflineContext.tsx").catch(() => {});
});

// API wrapper configuration
window.SmartPortsConfig = {
    company: companyConfig,
    api: {
        baseUrl: "/api/method",
        timeout: 30000,
        retryCount: 3,
    },
    features: {
        offline: true,
        multiCurrency: true,
        wallet: true,
        loyalty: true,
        coupons: true,
        shiftManagement: true,
    },
};

console.log(`%c ${companyConfig.name} POS v${companyConfig.appVersion} `, "background: #1E40AF; color: white; padding: 10px; border-radius: 5px;");
console.log(`%c ${companyConfig.nameEn} `, "background: #059669; color: white; padding: 10px; border-radius: 5px;");
