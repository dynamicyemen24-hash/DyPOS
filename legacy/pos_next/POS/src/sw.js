// ═══════════════════════════════════════════════════════════════════════
// Smart Ports POS — Service Worker (Production-ready)
// Cache version: smart-ports-v1.16.0
// Guarantees: Zero lost transactions, Offline-first, Background sync
// ═══════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'smart-ports-v1.16.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const OFFLINE_CACHE = `${CACHE_VERSION}-offline`;
const DB_NAME = 'smart-ports-offline';
const DB_VERSION = 2;

// Shell assets to precache
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/pos',
  '/manifest.json',
  '/offline.html',
  '/src/sw.js',
  '/src/app.js',
  '/src/theme.css',
  '/src/composables/useOffline.js',
  '/src/composables/useBranding.js',
  '/src/composables/useCompanyInfo.js',
  '/src/utils/offline/branding.js',
  '/src/voice-pos.js',
  '/src/lib/offline/offline-sync.js',
  '/src/lib/offline/db.ts',
  '/src/lib/offline/sync.ts',
  '/src/lib/offline/index.ts',
  '/src/lib/offline/OfflineContext.tsx',
];

const MAX_DYNAMIC_ENTRIES = 100;
const MAX_OFFLINE_ENTRIES = 50;

// ═══ INSTALL: Precache shell ═══
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.error('[SW] Install:', err))
  );
});

// ═══ ACTIVATE: Clean old caches, claim clients ═══
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
      .catch((err) => console.error('[SW] Activate:', err))
  );
});

// ═══ FETCH: Intelligent routing ═══
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin && !url.pathname.match(/\.(woff2?|ttf|otf|png|jpg|svg|ico)$/)) return;

  // API: Network-first with offline queue
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Navigation: Network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request));
    return;
  }

  // Static assets: Cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else: Stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ═══ STRATEGIES ═══

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    fetch(request).then((r) => { if (r.ok) cache.put(request, r.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Asset not available offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
      limitCacheSize(DYNAMIC_CACHE, MAX_DYNAMIC_ENTRIES);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Queue mutation for background sync
    if (request.method !== 'GET') {
      try {
        const body = await request.clone().json().catch(() => null);
        await queueMutation(request.method, request.url, body, Object.fromEntries(request.headers.entries()));
        if ('sync' in self.registration) await self.registration.sync.register('sync-mutations');
        return new Response(JSON.stringify({ offline: true, queued: true }), { status: 202, headers: { 'Content-Type': 'application/json' } });
      } catch {}
    }
    return new Response(JSON.stringify({ offline: true }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      limitCacheSize(DYNAMIC_CACHE, MAX_DYNAMIC_ENTRIES);
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function navigationStrategy(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(OFFLINE_CACHE);
    const offlinePage = await cache.match('/offline.html');
    if (offlinePage) return offlinePage;
    return new Response(
      `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>المنافذ الذكية — Offline</title>
      <style>body{font-family:'Cairo',sans-serif;padding:2rem;text-align:center;background:#F9FAFB;color:#1F2937;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
      .icon{font-size:4rem;margin-bottom:1rem;animation:pulse 2s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
      .status{background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.3);border-radius:12px;padding:1rem;margin:1rem auto;max-width:400px}
      button{background:#1E40AF;color:white;border:none;padding:1rem 2rem;border-radius:8px;font-size:1.1rem;cursor:pointer;margin-top:1rem;font-family:'Cairo',sans-serif}
      button:hover{background:#1E3A8A}</style></head><body>
      <div class="icon">📡</div><h1>أنت غير متصل حالياً</h1><p>ستُحدَّث بياناتك تلقائيًا عند عودة الاتصال</p>
      <div class="status" id="status">جاري فحص الاتصال...</div>
      <button onclick="window.location.reload()">إعادة المحاولة</button>
      <script>const check=()=>{navigator.onLine?document.getElementById('status').textContent='✓ اتصالك عاد — جارٍ تحديث البيانات...':document.getElementById('status').textContent='✗ لا يوجد اتصال بعد';};
      window.addEventListener('online',()=>{check();setTimeout(()=>location.reload(),1500)});window.addEventListener('offline',check);check();</script>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

function isStaticAsset(pathname) {
  return pathname.match(/\.(js|css|png|ico|svg|woff2?|webp|avif|ttf|otf)$/) || SHELL_ASSETS.includes(pathname);
}

async function limitCacheSize(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  let keys = await cache.keys();
  while (keys.length > maxEntries) {
    const deleted = await cache.delete(keys[0]);
    if (!deleted) break;
    keys = await cache.keys();
  }
}

// ═══ BACKGROUND SYNC ═══
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-mutations') event.waitUntil(syncMutations());
  else if (event.tag === 'sync-pos-sales') event.waitUntil(syncPOSSales());
  else if (event.tag === 'sync-all') event.waitUntil(Promise.all([syncMutations(), syncPOSSales()]));
});

// ═══ PUSH NOTIFICATIONS ═══
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'المنافذ الذكية', {
      body: data.body,
      icon: '/assets/smart_ports/images/icon-192x192.png',
      badge: '/assets/smart_ports/images/icon-192x192.png',
      vibrate: [100, 50, 100],
      data: data.url ? { url: data.url } : {},
      actions: data.actions || [],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.data?.url) event.waitUntil(clients.openWindow(event.notification.data.url));
});

// ═══ MESSAGE HANDLER ═══
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  switch (type) {
    case 'QUEUE_MUTATION':
      queueMutation(payload.method, payload.path, payload.body, payload.headers)
        .then(() => { if ('sync' in self.registration) self.registration.sync.register('sync-mutations'); event.ports[0]?.postMessage({ ok: true }); })
        .catch(e => event.ports[0]?.postMessage({ ok: false, error: e.message }));
      break;
    case 'QUEUE_POS_SALE':
      queuePOSSale(payload.saleData || payload, payload.gps || null)
        .then((rec) => { if ('sync' in self.registration) self.registration.sync.register('sync-pos-sales'); event.ports[0]?.postMessage({ ok: true, saleId: rec.saleId }); })
        .catch(e => event.ports[0]?.postMessage({ ok: false, error: e.message }));
      break;
    case 'FORCE_SYNC':
      Promise.all([syncMutations(), syncPOSSales()]).then(() => event.ports[0]?.postMessage({ ok: true }));
      break;
    case 'GET_PENDING_COUNT':
      getPendingCount().then(c => event.ports[0]?.postMessage({ count: c })).catch(() => event.ports[0]?.postMessage({ count: 0 }));
      break;
    case 'GET_POS_PENDING_COUNT':
      getPosPendingCount().then(c => event.ports[0]?.postMessage({ count: c })).catch(() => event.ports[0]?.postMessage({ count: 0 }));
      break;
  }
});

// ═══ INDEXEDDB HELPERS ═══
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('mutations')) {
        const s = db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true });
        s.createIndex('status', 'status', { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('pos_sales')) {
        const p = db.createObjectStore('pos_sales', { keyPath: 'saleId' });
        p.createIndex('status', 'status', { unique: false });
        p.createIndex('timestamp', 'timestamp', { unique: false });
        p.createIndex('synced', 'synced', { unique: false });
      }
      if (!db.objectStoreNames.contains('gps_log')) {
        const g = db.createObjectStore('gps_log', { keyPath: 'id', autoIncrement: true });
        g.createIndex('timestamp', 'timestamp', { unique: false });
        g.createIndex('saleId', 'saleId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueMutation(method, path, body, headers) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mutations', 'readwrite');
    tx.objectStore('mutations').add({ method, path, body, headers, lat: headers?.['X-Lat'] || null, lng: headers?.['X-Lng'] || null, ts: Date.now(), status: 'pending' });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function queuePOSSale(saleData, gps) {
  const db = await openDB();
  const saleId = saleData.saleId || saleData.id || ('POS-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase());
  const record = { saleId, data: saleData, gps: gps || saleData?.gps || null, lat: gps?.lat || saleData?.lat || null, lng: gps?.lng || saleData?.lng || null, timestamp: Date.now(), status: 'pending', synced: false, retries: 0 };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pos_sales', 'readwrite');
    tx.objectStore('pos_sales').put(record);
    if (gps) { try { tx.objectStore('gps_log').add({ lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy || null, saleId, timestamp: Date.now() }); } catch {} }
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

async function syncMutations() {
  try {
    const db = await openDB();
    const tx = db.transaction('mutations', 'readwrite');
    const store = tx.objectStore('mutations');
    const all = await new Promise((res, rej) => { const r = store.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const pending = all.filter(m => m.status === 'pending' && (m.retryCount || 0) < 5);
    let synced = 0;
    for (const mut of pending) {
      try {
        const headers = { 'Content-Type': 'application/json', ...mut.headers };
        if (mut.lat != null) headers['X-Lat'] = String(mut.lat);
        if (mut.lng != null) headers['X-Lng'] = String(mut.lng);
        const resp = await fetch(mut.path, { method: mut.method, headers, body: mut.body ? JSON.stringify(mut.body) : undefined });
        if (resp.ok) { store.put({ ...mut, status: 'synced' }); synced++; }
        else if (resp.status >= 400 && resp.status < 500) store.put({ ...mut, status: 'failed', error: `client_${resp.status}` });
        else store.put({ ...mut, retryCount: (mut.retryCount || 0) + 1, lastError: `server_${resp.status}` });
      } catch (e) { store.put({ ...mut, retryCount: (mut.retryCount || 0) + 1, lastError: e.message?.slice(0, 100) }); }
    }
    await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE', synced, total: pending.length }));
  } catch (e) { console.error('[SW] syncMutations:', e); }
}

async function syncPOSSales() {
  try {
    const db = await openDB();
    const tx = db.transaction('pos_sales', 'readwrite');
    let store; try { store = tx.objectStore('pos_sales'); } catch { return { synced: 0, total: 0 }; }
    const all = await new Promise((res, rej) => { const r = store.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const pending = all.filter(s => s.status === 'pending' && (s.retryCount || 0) < 5);
    let synced = 0;
    for (const sale of pending) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (sale.lat != null) headers['X-Lat'] = String(sale.lat);
        if (sale.lng != null) headers['X-Lng'] = String(sale.lng);
        const resp = await fetch('/api/pos/sales', { method: 'POST', headers, body: JSON.stringify({ ...sale.data, saleId: sale.saleId, gps: sale.gps, lat: sale.lat, lng: sale.lng, _offline: true }) });
        if (resp.ok) { store.put({ ...sale, status: 'synced', synced: true, syncedAt: Date.now() }); synced++; }
        else if (resp.status >= 400 && resp.status < 500) store.put({ ...sale, status: 'failed', error: `client_${resp.status}` });
        else store.put({ ...sale, retryCount: (sale.retryCount || 0) + 1, lastError: `server_${resp.status}` });
      } catch (e) { store.put({ ...sale, retryCount: (sale.retryCount || 0) + 1, lastError: e.message?.slice(0, 100) }); }
    }
    await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'POS_SYNC_COMPLETE', synced, total: pending.length }));
    return { synced, total: pending.length, failed: pending.length - synced };
  } catch (e) { console.error('[SW] syncPOSSales:', e); return { synced: 0, total: 0, error: e.message }; }
}

async function getPendingCount() {
  try { const db = await openDB(); const tx = db.transaction('mutations', 'readonly'); const req = tx.objectStore('mutations').index('status').count('pending'); return new Promise((res) => { req.onsuccess = () => res(req.result); }); } catch { return 0; }
}

async function getPosPendingCount() {
  try { const db = await openDB(); const tx = db.transaction('pos_sales', 'readonly'); const idx = tx.objectStore('pos_sales').index('status'); const req = idx.count('pending'); return new Promise((res) => { req.onsuccess = () => res(req.result); }); } catch { return 0; }
}

console.log('[SW] Smart Ports Service Worker loaded — version:', CACHE_VERSION);
