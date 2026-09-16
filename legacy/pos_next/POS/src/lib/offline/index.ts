// ═══════════════════════════════════════════════════════════════════════
// Smart Ports Offline Module — Index/Exports v1.16.0
// ═══════════════════════════════════════════════════════════════════════

// Database layer
export { openDB, getAll, getById, put, remove, clear, bulkPut, getPendingSyncs, removeSyncEntry, incrementRetry, getSyncMeta, setSyncMeta, getOfflineStats, getDeviceId, getTenantId, CatalogCache, enqueueOffline, getOfflineQueue, getBackoffDelay, searchProducts, searchCustomers } from "./db";
export type { TableName, SyncMeta, SyncQueueEntry, SyncStatus } from "./db";
export { CATALOG_TTL } from "./db";

// Sync engine
export { syncManager, performFullSync, pushPendingChanges, pullFromServer } from "./sync";
export type { SyncResult, SyncManagerStatus } from "./sync";

// Offline Context (React)
export { OfflineProvider, useOffline } from "./OfflineContext";

// ═══ Quick Setup ═══
export async function setupOffline() {
    const { openDB } = await import("./db");
    const { syncManager } = await import("./sync");
    await openDB();
    syncManager.start();
    console.log("[Smart Ports] Offline system initialized — version 1.16.0");
}

// Auto-setup
if (typeof window !== "undefined") {
    setupOffline().catch(console.error);
}
