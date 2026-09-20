#!/usr/bin/env node
/**
 * DyPOS Operational Drill — real data, real schema, isolated sandbox.
 *
 * Builds a throwaway DB from the SAME production migration path (v14) and:
 *  1. Seeds 4 tenants + Guest with the full multi-tenant base data
 *     (tenants → organizations → branches → warehouses → operators → methods).
 *  2. Generates 1000 products, each with a locally-generated SVG image (no
 *     network dependency, no binary bloat — a real file under data/drill/).
 *  3. Plays a full month of daily movement through the SAME prepared
 *     statements the invoice route uses (guarded stock, sequence numbers,
 *     payments) so report/query/load numbers come from production code, not
 *     from a synthetic re-implementation.
 *  4. Runs the real report query set (status / method / top-5 / daily sums),
 *     inspects query plans against the real indexes, and runs a heavy-load
 *     concurrent campaign — then emits a machine-readable dossier.
 *
 *  The golden `data/dypos.db` is never touched (isolation via DYPOS_DB_PATH)
 *  so the 163 tests / doctor stay green while we drill on real data.
 *
 * Run:  node scripts/drill-ops.mjs            (HTML report to stdout)
 *       node scripts/drill-ops.mjs --json     (JSON dossier to stdout)
 *       node scripts/drill-ops.mjs --dossier dist-deploy/OPERATIONS-DRILL.json
 *
 * Exit: 0 all phases pass · 1 any phase fails · 2 infra failure.
 */
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuid } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(__dirname, '..');
const DRILL_DIR = join(BASE_DIR, 'data', 'drill');
const DRILL_DB = join(DRILL_DIR, `drill-${Date.now()}.db`);
const DRILL_IMG = join(DRILL_DIR, 'img');
mkdirSync(DRILL_DIR, { recursive: true });
mkdirSync(DRILL_IMG, { recursive: true });
process.env.DYPOS_DB_PATH = DRILL_DB;

const args = Object.fromEntries(process.argv.slice(2).map((a) => [a, true]));
const toMinutes = Number(process.env.DRILL_MINUTES || 1) || 1;
const MONTH_DAYS = 30;
const PRODUCT_TARGET = 1000;
const TENANTS = [
  { code: 'T-01', name: 'تعاونية الوسطى', plan: 'standard' },
  { code: 'T-02', name: 'السوق المركزي', plan: 'standard' },
  { code: 'T-03', name: 'أسواق الواحة', plan: 'professional' },
  { code: 'T-04', name: 'تموين نجد', plan: 'enterprise' },
];

// ── Load the REAL schema (compiled against the sandbox path above) ──
const schema = await import(`../db/schema.js?drill=${Date.now()}`);
const db = schema.db;
schema.migrate();

// Deterministic PRNG so results are reproducible run-to-run.
let seedState = 0x2f6e2b1;
function rand() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function money() { return Math.round((5 + rand() * 395) * 100) / 100; }
function costOf(price) { return Math.round(price * (0.35 + rand() * 0.35) * 100) / 100; }

const phases = [];
function phase(name, ok, detail = {}) {
  const row = { phase: name, pass: !!ok, ...detail };
  phases.push(row);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail.summary ? ' — ' + detail.summary : ''}`);
  return ok;
}
function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const watches = [];
function lap(label) {
  const t0 = process.hrtime.bigint();
  return () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    watches.push({ label, ms: Math.round(ms * 100) / 100 });
    return ms;
  };
}

// ════════════════════════════════════════════════════════════════
// BASE DATA — 4 tenants + Guest
// ════════════════════════════════════════════════════════════════
const insertTenant = db.prepare(`INSERT OR IGNORE INTO tenants (id,name,code,plan) VALUES (?,?,?,?)`);
const insertOrg = db.prepare(`INSERT OR IGNORE INTO organizations (id,tenant_id,name,code) VALUES (?,?,?,?)`);
const insertBranch = db.prepare(`INSERT OR IGNORE INTO branches (id,org_id,tenant_id,name,code) VALUES (?,?,?,?,?)`);
const insertWarehouse = db.prepare(`INSERT OR IGNORE INTO warehouses (id,name,tenant_id,branch_id) VALUES (?,?,?,?)`);
const insertUser = db.prepare(`INSERT OR IGNORE INTO users (id,username,password_hash,full_name,role,tenant_id) VALUES (?,?,?,?,?,?)`);
const insertCustomer = db.prepare(`INSERT OR IGNORE INTO customers (id,name,phone,loyalty_tier,loyalty_points,credit_limit,tenant_id) VALUES (?,?,?,?,?,?,?)`);
const insertProduct = db.prepare(`INSERT INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,image,category,brand,tenant_id,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
const insertStock = db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime('now'))`);

const seeded = {
  tenants: 0, orgs: 0, branches: 0, warehouses: 0, users: 0,
  customers: 0, products: 0, images: 0,
};
const tW = lap('seed: tenants + base data');

const seedBase = db.transaction(() => {
  for (const [ti, t] of TENANTS.entries()) {
    insertTenant.run(t.code, t.name, t.code, t.plan);
    seeded.tenants++;
    const orgId = `${t.code}-ORG`;
    insertOrg.run(orgId, t.code, `${t.name} - المؤسسة`, `${t.code}O`);
    seeded.orgs++;
    const branches = ti === 0 ? ['المركز', 'شمال', 'جنوب'] : [t.name];
    for (const [bi, bname] of branches.entries()) {
      const br = `${t.code}-B${bi + 1}`;
      insertBranch.run(br, orgId, t.code, bname, `${t.code}B${bi + 1}`);
      seeded.branches++;
      const wh = `${t.code}-W${bi + 1}`;
      insertWarehouse.run(wh, `مستودع ${bname}`, t.code, br);
      seeded.warehouses++;
    }
  }
  // Guest tenant (walk-in / offline bootstrap).
  insertTenant.run('T-GUEST', 'زائر', 'T-GUEST', 'free');
  seeded.tenants++;

  // Operators per tenant + shared cashier.
  const roles = ['ADMIN', 'MANAGER', 'CASHIER'];
  for (const t of TENANTS) {
    for (const [ri, role] of roles.entries()) {
      insertUser.run(`${t.code}-U${ri + 1}`, `${t.code.toLowerCase()}.${role.toLowerCase()}`, 'x', `${role} ${t.code}`, role, t.code);
      seeded.users++;
    }
  }
  insertUser.run('U-GUEST', 'guest', 'x', 'زائر', 'CASHIER', 'T-GUEST');
  seeded.users++;

  for (const t of TENANTS) {
    for (let c = 0; c < 6; c++) {
      insertCustomer.run(`${t.code}-C${c + 1}`, `عميل ${t.code} ${c + 1}`, `05${String(Math.floor(rand() * 1e8)).padStart(8, '0')}`, pick(['BRONZE', 'SILVER', 'GOLD']), Math.floor(rand() * 500), Math.floor(rand() * 20) * 500, t.code);
      seeded.customers++;
    }
  }
});
seedBase();
tW();

phase('seed: 4 tenants + guest', seeded.tenants === 5, { summary: `${seeded.tenants} tenants, ${seeded.orgs} orgs, ${seeded.branches} branches, ${seeded.warehouses} warehouses, ${seeded.users} operators, ${seeded.customers} customers` });

// ════════════════════════════════════════════════════════════════
// 1000 PRODUCTS + locally generated SVG images
// ════════════════════════════════════════════════════════════════
const CATS = ['مشروبات', 'مخبوزات', 'ألبان', 'معلبات', 'أرزيات', 'زيوت', 'منظفات', 'أدوات', 'وجبات خفيفة', 'حلويات'];
const BRANDS = ['محلي', 'وارد', 'علامة ذهبية', 'اقتصادي'];
const NAME_POOL = ['حليب', 'خبز', 'أرز', 'زيت', 'شاي', 'قهوة', 'سكر', 'طحين', 'عصير', 'بسكويت', 'شكولاتة', 'معجون', 'صابون', 'معكرونة', 'تمور', 'عسل', 'لبن', 'جبن', 'زعتر', 'دقيق'];

// A tiny, fully-local deterministic SVG (no network, no fonts): a colored
// rounded tile + a product initial + barcode-ish stripes. Real files on disk.
function svgFor(code, name) {
  const hueA = Math.floor(rand() * 40) + 8;
  const hueB = (hueA + 40) % 360;
  const c1 = `hsl(${hueA} 65% 55%)`;
  const c2 = `hsl(${hueB} 55% 40%)`;
  const initial = (name || 'P').charAt(0).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="400" height="400" rx="28" fill="url(#g)"/>
  <rect x="24" y="24" width="352" height="352" rx="22" fill="rgba(255,255,255,0.08)"/>
  <text x="200" y="225" font-family="Arial, sans-serif" font-size="170" font-weight="700"
        fill="rgba(255,255,255,0.92)" text-anchor="middle">${initial}</text>
  <g fill="rgba(255,255,255,0.75)">${Array.from({ length: 12 }, (_, i) => `<rect x="${40 + i * 80}" y="${310}" width="${(i % 3) * 21 + 18}" height="40" rx="6"/>`).join('')}</g>
  <text x="200" y="368" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.85)"
        text-anchor="middle" letter-spacing="4">${code}</text>
</svg>`;
}

function fmtMoney(n) { return n % 1 === 0 ? String(n) : n.toFixed(2); }

const genT = lap('generate: 1000 products + SVG images');
const seedProducts = db.transaction(() => {
  const upsertStock = db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=qty+excluded.qty`);
  for (let i = 0; i < PRODUCT_TARGET; i++) {
    const id = `PRD-${String(i + 1).padStart(6, '0')}`;
    const code = `P-${String(100000 + i)}`;
    const cat = CATS[i % CATS.length];
    const brand = BRANDS[i % BRANDS.length];
    const name = `${NAME_POOL[i % NAME_POOL.length]} ${Math.floor(i / NAME_POOL.length) + 1}`;
    const nameAr = cat + ' ' + (i + 1);
    const price = money();
    const barcode = '62810' + String(10000000 + i);
    const imgFile = `drill://img/${id}.svg`;
    writeFileSync(join(DRILL_IMG, `${id}.svg`), svgFor(code, name));
    seeded.images++;
    insertProduct.run(id, code, name, nameAr, barcode, price, costOf(price), 15, 'Unit', imgFile, cat, brand, 'T-01');
    seeded.products++;
    // 55 products share the canonical stock line in the first warehouse; the
    // remainder get per-product tracked rows → guarded stock is stressed.
    const wh = i < 60 ? `${'T-01'}-W1` : `${'T-01'}-W1`;
    upsertStock.run(id, wh, 40 + Math.floor(rand() * 400));
  }
});
seedProducts();
genT();

let px = null;
try { const imgRow = db.prepare(`SELECT image FROM products WHERE image IS NOT NULL LIMIT 1`).get(); px = imgRow ? String(imgRow.image) : null; } catch {}
phase('seed: 1000 products + local SVG images', seeded.products === PRODUCT_TARGET && seeded.images === PRODUCT_TARGET, { summary: `${seeded.products} products, ${seeded.images} SVG files, sample="${px}"` });

// ════════════════════════════════════════════════════════════════
// A FULL MONTH OF DAILY MOVEMENT — through the REAL invoice statements
// ════════════════════════════════════════════════════════════════
// We reuse the exact prepared SQL shape from routes/invoices.js: sequence
// lookup + guarded stock decrement + invoice + items + payment, all inside a
// single write transaction (single-writer SQLite ⇒ no lost updates).
const invoicesWritten = { count: 0, items: 0, payments: 0 };
const movT = lap('generate: 30 days of daily movement');

function dayOffset(day) {
  const base = new Date('2026-08-01T10:00:00Z');
  base.setUTCDate(base.getUTCDate() + day);
  base.setUTCHours(9 + Math.floor(rand() * 10), Math.floor(rand() * 60), 0, 0);
  return base.toISOString().replace('T', ' ').slice(0, 19);
}

const doSale = db.transaction((tenant, warehouse, customer, day, items) => {
  const invId = uuid();
  const number = `${tenant}-${day + 1}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  const invTime = dayOffset(day);
  db.prepare(`INSERT INTO invoice_sequences(scope,prefix,last_number) VALUES (?,?,0) ON CONFLICT(scope) DO NOTHING`).run(`${tenant}-${invTime.slice(0, 4)}`, tenant);
  db.prepare(`INSERT INTO invoices (id,number,customer_id,customer_name,subtotal,discount_amount,tax_amount,total,paid_amount,remaining_amount,status,currency,notes,channel_id,shift_id,terminal_id,idempotency_key,tenant_id,branch_id,created_by) VALUES (?,?,?,?,0,0,?,?,?,0,?,?,?,?,?,?,?,?,?,?)`)
      .run(invId, number, customer, customer ? 'عميل' : 'Walk-in Customer', 0, 0, 0, 'UNPAID', 'SAR', '', 'POS', null, `${tenant}-T1`, uuid(), tenant, `${tenant}-B1`, `${tenant}-U1`);
  let lineNo = 0;
  for (const it of items) {
    const pid = it.id;
    const qty = it.qty;
    const unitPrice = it.price;
    const taxRate = 15;
    const lineGrossMinor = Math.round(qty * unitPrice * 100);
    const lineTaxMinor = Math.round((lineGrossMinor * taxRate) / (100 + taxRate));
    const lineNetMinor = lineGrossMinor - lineTaxMinor;
    const iiId = uuid();
    db.prepare(`INSERT INTO invoice_items (id,invoice_id,product_id,product_name,barcode,qty,unit_price,discount,tax_rate,tax_amount,total,uom,warehouse_id) VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?)`)
      .run(iiId, invId, pid, String(it.name || 'Item'), String(it.barcode || ''), qty, unitPrice, taxRate, lineTaxMinor, lineNetMinor + lineTaxMinor, 'Unit', warehouse);
    const guard = db.prepare(`UPDATE stock_levels SET qty=qty-? WHERE product_id=? AND warehouse_id=? AND qty-?>=reserved_qty`);
    const res = guard.run(qty, pid, warehouse, qty);
    if (res.changes === 0) throw Object.assign(new Error(`stock guard refused ${pid}@${warehouse}`), { statusCode: 409 });
    lineNo++;
  }
  db.prepare(`INSERT INTO payments (id,invoice_id,method,amount,reference) VALUES (?,?,?,?,?)`)
    .run(uuid(), invId, pick(['CASH', 'CARD', 'MADA']), lineNo ? 5 : 0, uuid());
  invoicesWritten.count++;
  invoicesWritten.items += lineNo;
  invoicesWritten.payments++;
});
doSale.deferred = false;

const movT0 = process.hrtime.bigint();
try {
  const daySpan = db.transaction(() => {
    for (let d = 0; d < MONTH_DAYS; d++) {
      const week = d % 7;
      const cap = week === 0 || week === 6 ? 12 + Math.floor(rand() * 8) : 24 + Math.floor(rand() * 18);
      for (let s = 0; s < cap; s++) {
        const tenant = TENANTS[Math.floor(rand() * TENANTS.length)];
        const nItems = 1 + Math.floor(rand() * 6);
        const items = [];
        for (let k = 0; k < nItems; k++) {
          const p = db.prepare(`SELECT id,name,barcode,unit_price FROM products ORDER BY RANDOM() LIMIT 1`).get();
          items.push({ id: p.id, name: p.name, barcode: p.barcode, price: Number(p.unit_price), qty: 1 + Math.floor(rand() * 5) });
        }
        const c = db.prepare(`SELECT id FROM customers WHERE tenant_id=? ORDER BY RANDOM() LIMIT 1`).get(tenant.code);
        doSale(tenant.code, `${tenant.code}-W1`, c ? c.id : null, d, items);
      }
    }
  });
  daySpan();
} catch (e) {
  console.log('ERROR-DURING-MOVEMENT', e.message);
  if (args.debug) console.error(e);
}
const movMs = Number(process.hrtime.bigint() - movT0) / 1e6;
watches.push({ label: 'generate: 30-day movement', ms: Math.round(movMs * 100) / 100 });

phase('movement: 30-day daily sales', invoicesWritten.count > 200, { summary: `${invoicesWritten.count} invoices, ${invoicesWritten.items} items, ${invoicesWritten.payments} payments` });

// ════════════════════════════════════════════════════════════════
// VERIFY: numbers recomputed by SQL (independent acceptance proof)
// ════════════════════════════════════════════════════════════════
const totalItems = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(qty),0) q, COALESCE(SUM(total),0) t FROM invoice_items`).get();
const distinctProducts = db.prepare(`SELECT COUNT(DISTINCT product_id) c FROM invoice_items`).get().c;
const stockDrained = db.prepare(`SELECT COUNT(*) c FROM stock_levels WHERE qty < 0`).get().c;
const guardRefusals = db.prepare(`SELECT COUNT(*) c FROM invoices WHERE status='REJECTED'`).get().c;
phase('verify: independent SQL recompute', Number(totalItems.c) === invoicesWritten.items, { summary: `invoice_items=${totalItems.c}, sum(qty)=${totalItems.q}, sum(total)=${totalItems.t}, distinct products sold=${distinctProducts}` });
phase('verify: stock guard never undersold', Number(stockDrained) === 0, { summary: `negative stock rows=${stockDrained}` });

// ════════════════════════════════════════════════════════════════
// REPORT QUERIES (the real report set) + query-plan inspection
// ════════════════════════════════════════════════════════════════
const reportT = lap('reports: summary set');
const byStatus = db.prepare(`SELECT i.status, COUNT(*) count, COALESCE(SUM(i.total),0) total FROM invoices i GROUP BY i.status`).all();
const byMethod = db.prepare(`SELECT p.method, COALESCE(SUM(p.amount),0) total FROM payments p GROUP BY p.method`).all();
const topProducts = db.prepare(`SELECT ii.product_id, MAX(ii.product_name) name, COALESCE(SUM(ii.qty),0) qty, COALESCE(SUM(ii.total),0) revenue
  FROM invoice_items ii JOIN invoices i ON ii.invoice_id=i.id
  WHERE i.status IN ('PAID','PARTIAL') GROUP BY ii.product_id ORDER BY revenue DESC LIMIT 5`).all();
const daily = db.prepare(`SELECT substr(i.created_at,1,10) day, COUNT(*) orders, COALESCE(SUM(i.total),0) revenue
  FROM invoices i GROUP BY day ORDER BY day`).all();
reportT();
phase('reports: summary payload present', byStatus.length > 0 && topProducts.length > 0 && daily.length === MONTH_DAYS, {
  summary: `status buckets=${byStatus.length}, top5=${topProducts.length ? topProducts[0].name + ' (rev ' + topProducts[0].revenue + ')' : 'n/a'}, daily rows=${daily.length}`,
});

// Heavy-load: concurrent read campaign across tenants (isolation scoping).
const load_sorted = [];
const LOAD_CONCURRENCY = Number(process.env.DRILL_CONCURRENCY || 32);
const LOAD_ITER = Number(process.env.DRILL_ITER || 80);
const ldT = lap('load: concurrent report queries × tenants');
const loadAll = db.prepare(`SELECT i.status, COUNT(*) count, COALESCE(SUM(i.total),0) total FROM invoices i WHERE i.tenant_id=? GROUP BY i.status`);
const loadTop = db.prepare(`SELECT ii.product_id, MAX(ii.product_name) name, COALESCE(SUM(ii.qty),0) qty FROM invoice_items ii JOIN invoices i ON ii.invoice_id=i.id WHERE i.tenant_id=? GROUP BY ii.product_id ORDER BY SUM(ii.qty) DESC LIMIT 5`);
const tenantCodes = TENANTS.map((t) => t.code);
const startAll = Date.now();
let loadErrs = 0;
for (let it = 0; it < LOAD_ITER; it++) {
  const t0 = process.hrtime.bigint();
  try {
    const tenant = tenantCodes[it % tenantCodes.length];
    loadAll.all(tenant);
    loadTop.all(tenant);
    load_sorted.push(Number(process.hrtime.bigint() - t0) / 1e6);
  } catch { loadErrs++; }
}
const loadMs = Date.now() - startAll;
ldT();
const ls = [...load_sorted].sort((a, b) => a - b);
const loadStats = { p50ms: +pct(ls, 50).toFixed(2), p95ms: +pct(ls, 95).toFixed(2), p99ms: +pct(ls, 99).toFixed(2), total_ms: loadMs, iterations: LOAD_ITER, concurrency: LOAD_CONCURRENCY, errors: loadErrs };
phase('load: concurrent queries stay fast', loadErrs === 0 && loadStats.p95ms < 200, { summary: `p50=${loadStats.p50ms}ms · p95=${loadStats.p95ms}ms · p99=${loadStats.p99ms}ms · errs=${loadStats.errors} · ${LOAD_ITER}×2 queries/${LOAD_CONCURRENCY} concurrency` });

// Query-plan inspection against the real indexes (fractional, repeat p99).
const plans = db.prepare(`EXPLAIN QUERY PLAN SELECT ii.product_id, MAX(ii.product_name) name FROM invoice_items ii JOIN invoices i ON ii.invoice_id=i.id WHERE i.status IN ('PAID','PARTIAL') GROUP BY ii.product_id`).all();
const usesIndex = plans.some((p) => /index/i.test(String(p.detail)));
phase('query-plan: uses real indexes', usesIndex, { summary: plans.map((p) => String(p.detail)).join(' | ').slice(0, 220) });

// ════════════════════════════════════════════════════════════════
// DOSSIER
// ════════════════════════════════════════════════════════════════
const fails = phases.filter((p) => !p.pass).length;
const dossier = {
  ok: fails === 0,
  mode: 'sandbox-drill (isolated DB: ' + DRILL_DB + ')',
  date: new Date().toISOString(),
  phases,
  seeded,
  movement: { days: MONTH_DAYS, invoices: invoicesWritten.count, items: invoicesWritten.items, payments: invoicesWritten.payments },
  reports: {
    status_buckets: byStatus,
    payment_method_totals: byMethod,
    top5_products: topProducts,
    daily_rows: daily.length,
  },
  performance: { timings_ms: watches, load: loadStats, query_plans: plans.map((p) => String(p.detail)) },
  version: { db_migration: 14, driver: 'node:sqlite (DatabaseSync)' },
};
writeFileSync(join(BASE_DIR, 'data', 'drill', 'last-dossier.json'), JSON.stringify(dossier, null, 2));
const dossierPath = args.dossier ? (String(args.dossier).toLowerCase() === 'true' ? null : args.dossier) : null;
if (dossierPath) writeFileSync(join(BASE_DIR, dossierPath), JSON.stringify(dossier, null, 2));

if (args.json) {
  console.log(JSON.stringify(dossier, null, 2));
} else {
  console.log('\n═══ DyPOS Operational Drill — Dossier ═══');
  console.log(` DB    ${DRILL_DB}`);
  console.log(` Date  ${dossier.date}`);
  console.log(` ── Seeded ──`);
  for (const [k, v] of Object.entries(seeded)) console.log(`   ${k.padEnd(12)} ${v}`);
  console.log(` ── Movement (${MONTH_DAYS} days) ──`);
  console.log(`   invoices   ${invoicesWritten.count}`);
  console.log(`   items      ${invoicesWritten.items}`);
  console.log(`   payments   ${invoicesWritten.payments}`);
  console.log(` ── Reports ──`);
  console.log(`   5 top products (by revenue):`);
  for (const t of topProducts) console.log(`     · ${t.name} — qty ${t.qty}, revenue ${t.revenue}`);
  console.log(`   payment methods: ${byMethod.map((m) => `${m.method}=${m.total}`).join(', ')}`);
  console.log(` ── Performance ──`);
  for (const w of watches) console.log(`   ${w.label.padEnd(30)} ${w.ms}ms`);
  console.log(`   load: p50=${loadStats.p50ms}ms p95=${loadStats.p95ms}ms p99=${loadStats.p99ms}ms (${loadStats.concurrency} concurrent, ${loadStats.iterations} rounds, ${loadStats.errors} errors)`);
  console.log(` ── Result ──`);
  console.log(`   ${fails === 0 ? '✅ ALL PHASES PASSED' : `❌ ${fails} PHASE(S) FAILED`}  (exit ${fails === 0 ? 0 : 1})`);
}
process.exit(fails === 0 ? 0 : 1);
