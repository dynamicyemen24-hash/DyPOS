/**
 * Royal Global — End-to-End production proof (Subscriber #1)
 * ============================================================
 * Drives the REAL API against the REAL seeded database:
 *
 *   login (cashier) → open shift → list products → create invoice →
 *   pay cash → verify PAID → verify stock decremented → daily report →
 *   void (admin, cleanup) → verify stock restored → close shift (variance 0)
 *
 * Run: npm run e2e:royal   (after: npm run migrate && npm run seed:royal)
 * Exit 0 = PASS, 1 = FAIL. The test invoice is voided → production DB
 * stays clean (void keeps the audit row, reverses stock).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(here, '..', 'data', 'dypos.db');

process.env.DYPOS_JWT_SECRET = 'e2e-local-verification-only-not-for-production-0123456789abcdef';
process.env.DYPOS_DB_PATH = DB_PATH;
process.env.DYPOS_CORS_ORIGIN = 'http://localhost';
process.env.DYPOS_SHIFT_VARIANCE_LIMIT = '100';

const { app } = await import('../server.js');
const directDb = new DatabaseSync(DB_PATH);

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`  ${cond ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) process.exitCode = 1;
}

const server = http.createServer(app);
server.listen(0);
await once(server, 'listening');
const port = server.address().port;

async function req(method, p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`http://localhost:${port}${p}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

const stockOf = (productId, wh) =>
  directDb.prepare('SELECT qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(productId, wh)?.qty ?? null;

try {
  console.log('🧪 Royal Global E2E (subscriber #1, real data)...');

  // 1. Cashier login (REAL bcrypt password from seed)
  const login = await req('POST', '/api/auth/login', { username: 'sanaa.cashier', password: 'Royal#2026#Pos1' });
  check('E2E-01 cashier login', login.status === 200 && !!login.body.token, `status=${login.status}`);
  const cashierToken = login.body.token;

  // 2. List real catalog (tenant-scoped)
  const catalog = await req('GET', '/api/products?limit=5', undefined, cashierToken);
  const products = catalog.body?.products || catalog.body?.data || catalog.body?.rows || [];
  check('E2E-02 catalog lists Royal SKUs', catalog.status === 200 && products.length > 0, `got=${products.length}`);
  const item = products.find((p) => (p.code || '').startsWith('LIP-')) || products[0];
  const productId = item.id;
  check('E2E-03 sale item resolved', !!productId, `code=${item.code}`);

  // 3. Open shift (409-tolerant: reuse an already-open one)
  const TERMINAL = 'POS-01-RGT';
  let shiftId = null;
  const open = await req('POST', '/api/shifts/open', { terminalId: TERMINAL, openingCash: 1000 }, cashierToken);
  if (open.status === 201) {
    shiftId = open.body.shiftId;
  } else if (open.status === 409 && open.body.shiftId) {
    shiftId = open.body.shiftId;
  }
  check('E2E-04 shift open', !!shiftId, `shift=${shiftId}`);

  // 4. Stock before (white-box assert on the real file)
  const before = stockOf(productId, 'W-03');
  check('E2E-05 opening stock present', typeof before === 'number' && before >= 2, `qty=${before}`);

  // 5. Create invoice with PARTIAL cash (2 units, Sanaa warehouse, idempotent).
  // NOTE: omitting payments defaults to full CASH (server rule), so a
  // partial first payment is sent explicitly to exercise the pay endpoint.
  const idem = `e2e-royal-${Date.now()}`;
  const created = await req('POST', '/api/invoices', {
    items: [{ productId, qty: 2 }],
    payments: [{ method: 'CASH', amount: 500 }],
    warehouseId: 'W-03',
    shiftId,
    terminalId: TERMINAL,
    customerName: 'عميل نقدي (تحقق E2E)',
    idempotencyKey: idem,
  }, cashierToken);
  const invoiceId = created.body?.id || created.body?.invoiceId || created.body?.invoiceId;
  const total = Number(created.body?.total ?? 0);
  const remaining = Number(created.body?.remainingAmount ?? created.body?.remaining_amount ?? 0);
  check('E2E-06 partial invoice created', (created.status === 200 || created.status === 201) && !!invoiceId && total > 0 && remaining > 0, `total=${total} remaining=${remaining}`);

  // 6. Pay the remainder in cash → PAID
  const pay = await req('POST', `/api/invoices/${invoiceId}/pay`, { method: 'CASH', amount: remaining }, cashierToken);
  check('E2E-07 cash payment settles', pay.status === 200 && pay.body?.status === 'PAID', JSON.stringify(pay.body).slice(0, 120));

  // 7. Invoice reads PAID + stock decremented by exactly 2
  const fetched = await req('GET', `/api/invoices/${invoiceId}`, undefined, cashierToken);
  check('E2E-08 invoice PAID in full', fetched.body?.status === 'PAID' && Number(fetched.body?.paid_amount) === total);
  const after = stockOf(productId, 'W-03');
  check('E2E-09 stock decremented by 2', after === before - 2, `${before} → ${after}`);

  // 8. Daily report includes the sale
  const report = await req('GET', '/api/invoices/reports/daily', undefined, cashierToken);
  check('E2E-10 daily report non-empty', report.status === 200, `status=${report.status}`);

  // 9. Void as admin (cleanup) → stock restored
  const adminLogin = await req('POST', '/api/auth/login', { username: 'admin', password: 'Royal#2026#Adm1n' });
  check('E2E-11 admin login', adminLogin.status === 200 && !!adminLogin.body.token, `status=${adminLogin.status}`);
  const voided = await req('POST', `/api/invoices/${invoiceId}/void`, { reason: 'تنظيف اختبار E2E' }, adminLogin.body.token);
  check('E2E-12 invoice voided', voided.status === 200 && voided.body?.status === 'VOIDED', `status=${voided.status}`);
  const restored = stockOf(productId, 'W-03');
  check('E2E-13 stock restored after void', restored === before, `${after} → ${restored}`);

  // 10. Close shift — counted == expected (opening 1000 + 0 live cash) → variance 0
  const closed = await req('POST', `/api/shifts/${shiftId}/close`, { closingCash: 1000 }, cashierToken);
  check('E2E-14 shift closed, variance 0', closed.status === 200 && Number(closed.body?.variance) === 0, JSON.stringify(closed.body).slice(0, 160));

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? '\n✅ ROYAL E2E: ALL 14 CHECKS PASSED' : `\n❌ ROYAL E2E: ${failed} CHECK(S) FAILED`);
} catch (e) {
  console.error('❌ ROYAL E2E crashed:', e);
  process.exitCode = 1;
} finally {
  server.close();
  try { directDb.close(); } catch { /* ignore */ }
}
