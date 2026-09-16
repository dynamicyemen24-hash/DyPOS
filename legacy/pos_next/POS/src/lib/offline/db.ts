// ═══════════════════════════════════════════════════════════════════════
// Smart Ports IndexedDB Database Layer v1.16.0
// Architecture: Write-through cache with sync queue
// Enhanced: Catalog cache (5min TTL), Barcode index (<1ms), LocalStorage fallback
// ═══════════════════════════════════════════════════════════════════════

const DB_NAME = "smart-ports-pos";
const DB_VERSION = 3;
const CATALOG_TTL = 5 * 60 * 1000; // 5 minutes
const LS_CATALOG_KEY = "smartports_pos_catalog";

// ═══ Catalog Cache with 5min TTL ═══
let _catalogCache: any[] = [];
let _catalogCacheTime = 0;
let _barcodeIndex = new Map<string, any>(); // L1: Map<barcode, item> for <1ms search
let _catalogById = new Map<string, any>(); // L2: tenant-scoped

export class CatalogCache {
    static async load(force = false): Promise<any[]> {
        const now = Date.now();
        if (!force && _catalogCache.length > 0 && (now - _catalogCacheTime) < CATALOG_TTL) {
            return _catalogCache;
        }
        try {
            const all = await getAll("products");
            _catalogCache = all;
            _catalogCacheTime = now;
            _barcodeIndex.clear();
            _catalogById.clear();
            for (const item of all) {
                if (item.barcode) _barcodeIndex.set(String(item.barcode).trim(), item);
                _catalogById.set(String(item.id), item);
            }
            try { localStorage.setItem(LS_CATALOG_KEY, JSON.stringify({ at: now, rows: all })); } catch {}
            return all;
        } catch { return _catalogCache.length > 0 ? _catalogCache : []; }
    }

    static async save(products: any[]) {
        await bulkPut("products", products);
        _catalogCache = products;
        _catalogCacheTime = Date.now();
        _barcodeIndex.clear();
        _catalogById.clear();
        for (const item of products) {
            if (item.barcode) _barcodeIndex.set(String(item.barcode).trim(), item);
            _catalogById.set(String(item.id), item);
        }
        try { localStorage.setItem(LS_CATALOG_KEY, JSON.stringify({ at: Date.now(), rows: products })); } catch {}
    }

    static getByBarcode(barcode: string): any {
        return _barcodeIndex.get(String(barcode).trim()) || null;
    }

    static search(query: string, limit = 60): any[] {
        const q = String(query || '').trim().toLowerCase();
        if (!q || _catalogCache.length === 0) return [];
        const bc = _barcodeIndex.get(q);
        if (bc) return [bc];
        return _catalogCache.filter(p =>
            (p.name || '').toLowerCase().includes(q) ||
            String(p.barcode || '').includes(q) ||
            String(p.id || '').toLowerCase().includes(q)
        ).slice(0, limit);
    }

    static invalidate(pattern?: string) {
        _catalogCache = [];
        _catalogCacheTime = 0;
        _barcodeIndex.clear();
        _catalogById.clear();
        try {
            if (pattern) {
                const keys = Object.keys(localStorage).filter(k => k.includes(pattern));
                keys.forEach(k => localStorage.removeItem(k));
            } else {
                localStorage.removeItem(LS_CATALOG_KEY);
            }
        } catch {}
    }

    static getStats() {
        return {
            cached: _catalogCache.length > 0,
            barcodeIndexSize: _barcodeIndex.size,
            ttlRemaining: Math.max(0, CATALOG_TTL - (Date.now() - _catalogCacheTime)),
            catalogAge: _catalogCacheTime ? Date.now() - _catalogCacheTime : null,
        };
    }
}

// ═══ Offline Queue with Exponential Backoff ═══
export interface OfflineQueueEntry {
    id?: number;
    domain: string;
    action: string;
    data: any;
    status: 'pending' | 'syncing' | 'synced' | 'failed';
    retries: number;
    maxRetries: number;
    timestamp: number;
    lastError?: string;
}

const MAX_BACKOFF = 300000; // 5 minutes

export async function enqueueOffline(entry: Omit<OfflineQueueEntry, 'id' | 'status' | 'retries'>): Promise<number> {
    const fullEntry = { ...entry, status: 'pending' as const, retries: 0, maxRetries: 5, timestamp: Date.now() };
    const id = await runTx("readwrite", "syncQueue", async (store) => {
        const s = store as IDBObjectStore;
        s.put(fullEntry);
        return (s as any).result?.id || Date.now();
    }) as Promise<number>;
    return id || Date.now();
}

export async function getOfflineQueue(): Promise<OfflineQueueEntry[]> {
    const entries = await getPendingSyncs();
    return entries.map(e => ({
        ...e,
        domain: e.tableName,
        action: e.operation,
        data: e.payload,
        status: e.retries >= (e.maxRetries || 5) ? 'failed' : 'pending',
    }));
}

export function getBackoffDelay(retries: number): number {
    return Math.min(1000 * Math.pow(2, retries), MAX_BACKOFF);
}

// ═══ Boolean queries with .filter() not .where().equals() ═══
export async function searchProducts(query: string, filters: Record<string, any> = {}): Promise<any[]> {
    const all = await getAll("products");
    let results = all;
    if (query) {
        const q = query.toLowerCase();
        results = results.filter(p =>
            (p.name || '').toLowerCase().includes(q) ||
            String(p.barcode || '').includes(q) ||
            String(p.id || '').toLowerCase().includes(q)
        );
    }
    if (filters.category) results = results.filter(p => p.category === filters.category);
    if (filters.stockGt) results = results.filter(p => (p.stockQty || 0) > filters.stockGt);
    if (filters.barcode) results = results.filter(p => p.barcode === filters.barcode);
    return results;
}

export async function searchCustomers(query: string): Promise<any[]> {
    const all = await getAll("customers");
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q));
}

export type SyncStatus = "synced" | "pending" | "conflict";

export interface SyncMeta {
  _syncId: string;
  _version: number;
  _syncedAt: number;
  _status: SyncStatus;
  _deviceId: string;
}

export interface SyncQueueEntry {
  id?: number;
  tableName: string;
  recordId: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
  timestamp: number;
  deviceId: string;
  retries: number;
  tenantId?: string;
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const stores = [
        "products", "customers", "categories", "invoices",
        "cart", "payments", "syncQueue", "syncMeta",
        "settings", "tenants", "cashRegisters", "employees",
        "inventoryMovements", "suppliers",
      ];
      for (const name of stores) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
      if (!db.objectStoreNames.contains("syncQueue")) {
        const sq = db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
        sq.createIndex("tableName", "tableName", { unique: false });
        sq.createIndex("timestamp", "timestamp", { unique: false });
      }
      if (!db.objectStoreNames.contains("syncMeta")) {
        db.createObjectStore("syncMeta", { keyPath: "tableName" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { _dbPromise = null; reject(request.error); };
  });
  return _dbPromise;
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateSyncId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getDeviceId(): string {
  let id = localStorage.getItem("sp_device_id");
  if (!id) {
    id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem("sp_device_id", id);
  }
  return id;
}

function getTenantId(): string {
  return localStorage.getItem("sp_tenant_id") || "default";
}

async function runTx<T>(
  mode: IDBTransactionMode,
  storeName: string | string[],
  fn: (stores: IDBObjectStore | IDBObjectStore[]) => IDBRequest<T> | Promise<T>
): Promise<T> {
  const db = await openDB();
  const names = Array.isArray(storeName) ? storeName : [storeName];
  const transaction = db.transaction(names, mode);
  const stores = names.map(n => transaction.objectStore(n));
  const target = stores.length === 1 ? stores[0] : stores;
  try {
    const result = await Promise.resolve(fn(target));
    return await new Promise<T>((resolve, reject) => {
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (e) {
    transaction.abort();
    throw e;
  }
}

export type TableName = "products" | "customers" | "categories" | "invoices" | "cart" | "payments" | "settings" | "tenants" | "cashRegisters" | "employees" | "inventoryMovements" | "suppliers";

type WithSync<T> = T & SyncMeta;

export async function getAll<T>(table: TableName): Promise<WithSync<T>[]> {
  return runTx("readonly", table, (store) => (store as IDBObjectStore).getAll());
}

export async function getById<T>(table: TableName, id: string | number): Promise<WithSync<T> | undefined> {
  return runTx("readonly", table, (store) => (store as IDBObjectStore).get(id));
}

export async function put<T extends { id?: string | number }>(
  table: TableName,
  record: T & Partial<SyncMeta>,
  forceOperation?: "create" | "update"
): Promise<void> {
  const existingRecord = record.id ? await getById(table, record.id) : undefined;
  const operation = forceOperation || (existingRecord ? "update" : "create");
  const enriched = {
    ...record,
    _syncId: record._syncId || generateSyncId(),
    _version: (record._version || 0) + 1,
    _syncedAt: record._syncedAt || 0,
    _status: "pending" as SyncStatus,
    _deviceId: getDeviceId(),
    tenantId: record.tenantId || getTenantId(),
  };
  await runTx("readwrite", table, (store) => (store as IDBObjectStore).put(enriched));
  await enqueueSync(table, String(enriched.id || enriched._syncId), operation, enriched);
}

export async function remove(table: TableName, id: string | number): Promise<void> {
  const existing = await getById(table, id);
  if (existing) {
    await runTx("readwrite", table, (store) => (store as IDBObjectStore).delete(id));
    await enqueueSync(table, String(id), "delete", { id });
  }
}

export async function clear(table: TableName): Promise<void> {
  await runTx("readwrite", table, (store) => (store as IDBObjectStore).clear());
}

export async function bulkPut<T>(table: TableName, records: T[]): Promise<void> {
  return runTx("readwrite", table, (store) => {
    const s = store as IDBObjectStore;
    for (const record of records) {
      const enriched = {
        ...record,
        _syncId: (record as any)._syncId || generateSyncId(),
        _version: (record as any)._version || 0,
        _syncedAt: Date.now(),
        _status: "synced" as SyncStatus,
        _deviceId: getDeviceId(),
        tenantId: getTenantId(),
      };
      s.put(enriched);
    }
  });
}

async function enqueueSync(tableName: string, recordId: string, operation: "create" | "update" | "delete", payload: unknown): Promise<void> {
  const entry: Omit<SyncQueueEntry, "id"> = {
    tableName, recordId, operation, payload,
    timestamp: Date.now(), deviceId: getDeviceId(), retries: 0,
    tenantId: getTenantId(),
  };
  await runTx("readwrite", "syncQueue", (store) => (store as IDBObjectStore).put(entry));
}

export async function getPendingSyncs(): Promise<SyncQueueEntry[]> {
  return runTx("readonly", "syncQueue", (store) => (store as IDBObjectStore).getAll());
}

export async function removeSyncEntry(id: number): Promise<void> {
  await runTx("readwrite", "syncQueue", (store) => (store as IDBObjectStore).delete(id));
}

export async function incrementRetry(id: number): Promise<void> {
  await runTx("readwrite", "syncQueue", (store) => {
    const s = store as IDBObjectStore;
    const req = s.get(id);
    return reqToPromise(req).then((entry) => {
      if (entry) { entry.retries = (entry.retries || 0) + 1; s.put(entry); }
    });
  });
}

export async function getSyncMeta(tableName: string): Promise<{ tableName: string; lastSyncVersion: number; lastSyncAt: number } | undefined> {
  return runTx("readonly", "syncMeta", (store) => (store as IDBObjectStore).get(tableName));
}

export async function setSyncMeta(tableName: string, lastSyncVersion: number): Promise<void> {
  await runTx("readwrite", "syncMeta", (store) => (store as IDBObjectStore).put({ tableName, lastSyncVersion, lastSyncAt: Date.now() }));
}

export async function getOfflineStats(): Promise<Record<TableName, { total: number; pending: number; synced: number }>> {
  const tables: TableName[] = ["products", "customers", "categories", "invoices", "cart", "payments", "settings", "tenants", "cashRegisters", "employees", "inventoryMovements", "suppliers"];
  const stats: Record<string, { total: number; pending: number; synced: number }> = {};
  for (const table of tables) {
    const all = await getAll(table);
    stats[table] = { total: all.length, pending: all.filter(r => r._status === "pending").length, synced: all.filter(r => r._status === "synced").length };
  }
  return stats as Record<TableName, { total: number; pending: number; synced: number }>;
}

export async function seedDefaultData(): Promise<void> {
    // Seed default products if empty
    const products = await getAll("products");
    if (products.length === 0) {
        await bulkPut("products", [
            { id: "default-1", name: "منتج تجريبي", barcode: "0000000000000", unitPrice: 0, stockQty: 0, unitName: "حبة", category: "general" },
        ]);
    }
}

export async function getPendingCount(): Promise<number> {
    const queue = await getOfflineQueue();
    return queue.filter(e => e.status === 'pending').length;
}

export { openDB, getDeviceId, getTenantId, CatalogCache, CATALOG_TTL };
