// Offline composable - Enhanced for Smart Ports branding
import { ref, computed } from "vue";
import { call } from "@/utils/apiWrapper";
import { offlineWorker } from "@/utils/offline/workerClient";
import { useBranding } from "./useBranding";

const isOffline = ref(!navigator.onLine);
const pendingInvoicesCount = ref(0);
const syncStatus = ref("idle");
const cacheReady = ref(false);
const lastSyncTime = ref(null);

const { getBrandLabel } = useBranding();

/**
 * Enhanced offline composable for Smart Ports POS
 */
export function useOffline() {
    const checkOnline = async () => {
        const online = navigator.onLine;
        isOffline.value = !online;

        if (!online) {
            const ready = await offlineWorker.isCacheReady();
            cacheReady.value = ready;
        }

        return online;
    };

    const getPendingCount = async () => {
        const count = await offlineWorker.getOfflineInvoiceCount();
        pendingInvoicesCount.value = count;
        return count;
    };

    const saveOffline = async (invoiceData) => {
        try {
            const result = await offlineWorker.saveOfflineInvoice(invoiceData);
            await getPendingCount();
            return result;
        } catch (error) {
            console.error("Save offline error:", error);
            throw error;
        }
    };

    const syncPending = async () => {
        try {
            syncStatus.value = "syncing";
            const result = await offlineWorker.syncPendingInvoices();
            await getPendingCount();
            lastSyncTime.value = new Date();
            syncStatus.value = "synced";
            return result;
        } catch (error) {
            syncStatus.value = "error";
            console.error("Sync error:", error);
            throw error;
        }
    };

    const getCacheStats = async () => {
        return await offlineWorker.getCacheStats();
    };

    const clearCache = async () => {
        await offlineWorker.clearAllCache();
        cacheReady.value = false;
        await getPendingCount();
    };

    const setManualOffline = (value) => {
        isOffline.value = value;
    };

    const getStatus = () => ({
        isOffline: isOffline.value,
        pendingInvoices: pendingInvoicesCount.value,
        syncStatus: syncStatus.value,
        cacheReady: cacheReady.value,
        lastSync: lastSyncTime.value,
        isOnline: !isOffline.value,
    });

    return {
        isOffline,
        pendingInvoicesCount,
        syncStatus,
        cacheReady,
        lastSyncTime,
        checkOnline,
        getPendingCount,
        saveOffline,
        syncPending,
        getCacheStats,
        clearCache,
        setManualOffline,
        getStatus,
    };
}

/**
 * Offline notification messages with branding
 */
export function useOfflineMessages() {
    const getOfflineMessage = () => {
        return {
            title: "وضع العمل بدون اتصال 📴",
            message: "أنت الآن في وضع العمل بدون اتصال بالإنترنت",
            color: "#D97706",
        };
    };

    const getOnlineMessage = () => {
        return {
            title: "متصل بالإنترنت ✅",
            message: "تم استعادة الاتصال بالإنترنت",
            color: "#059669",
        };
    };

    const getSyncMessage = () => {
        return {
            title: "جاري المزامنة 🔄",
            message: "جاري مزامنة البيانات...",
            color: "#1E40AF",
        };
    };

    const getSyncCompleteMessage = (count) => {
        return {
            title: "تمت المزامنة ✅",
            message: `${count} فاتورة تم مزامنتها بنجاح`,
            color: "#059669",
        };
    };

    const getCacheReadyMessage = () => {
        return {
            title: "البيانات جاهزة 📦",
            message: "تم تحميل البيانات من الكاش",
            color: "#059669",
        };
    };

    return {
        getOfflineMessage,
        getOnlineMessage,
        getSyncMessage,
        getSyncCompleteMessage,
        getCacheReadyMessage,
    };
}
