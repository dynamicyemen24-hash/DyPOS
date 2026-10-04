/**
 * DyPOS Database Schema — SQLite (dev) / PostgreSQL (prod)
 * Single-tenant with multi-terminal support.
 *
 * Production hardening:
 * - checkDbHealth() for deep health checks
 * - db.close() for graceful shutdown
 * - Migration versioning via schema_version table
 */
import Database from './driver.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { migrateInitial } from './migrations-initial.js';
import { initGrowthEngineTables } from '../lib/growthEngine.js';
import { migrateTenancy } from './migrations-tenancy.js';
import { LATE_MIGRATIONS } from './migration-ladder.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DYPOS_DB_PATH || join(__dirname, '..', 'data', 'dypos.db');

/**
 * The schema version is DERIVED, never hand-written.
 *
 * This used to be `const MIGRATION_VERSION = 34; // Increment when schema
 * changes`, and that comment is the whole bug: adding a migration to
 * `migration-ladder.js` without remembering to edit a second, unrelated line
 * left the new migration registered but NEVER RUN — and every green suite said
 * so, because nothing checked the number against the ladder it claims to
 * summarise. `tests/migration-ladder.test.js` now fails the build on that.
 *
 * Deriving it means the ladder is the single source (invariant 5) and a new row
 * cannot be silently skipped.
 */
const MIGRATION_VERSION = LATE_MIGRATIONS.reduce((highest, { version }) => Math.max(highest, version), 0);

function columnExists(table, column) {
	try {
		const rows = db.prepare(`PRAGMA table_info(${table})`).all();
		return rows.some((r) => r.name === column);
	} catch {
		return false;
	}
}

function addColumnIfMissing(table, column, ddl) {
	if (!columnExists(table, column)) {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
	}
}

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// Durability/performance balance suited to a POS write workload.
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
// Bound the WAL file on busy stores (64MB): checkpoints reclaim beyond this
// instead of letting -wal grow without limit during sale storms.
db.pragma('journal_size_limit = 67108864');

export function checkDbHealth() {
	try {
		const result = db.prepare('SELECT 1 as alive').get();
		const version = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
		// Size signals for capacity planning (millions of rows → watch file growth)
		let pageCount = null;
		let pageSize = null;
		try {
			pageCount = db.prepare('PRAGMA page_count').get()?.page_count ?? null;
			pageSize = db.prepare('PRAGMA page_size').get()?.page_size ?? null;
		} catch {
			/* PRAGMA best-effort */
		}
		return {
			healthy: result?.alive === 1,
			type: 'sqlite',
			mode: process.env.DYPOS_READ_ONLY === '1' ? 'tier1-replica' : 'tier1-primary',
			path: DB_PATH,
			migration_version: version?.version || 'unknown',
			migrations_applied: version?.version || 0,
			size_bytes: pageCount != null && pageSize != null ? pageCount * pageSize : undefined,
		};
	} catch (e) {
		return {
			healthy: false,
			type: 'sqlite',
			path: DB_PATH,
			error: e.message,
		};
	}
}

/** Deep integrity check (used by backup verify + admin endpoint). Slow on huge DBs — ADMIN only. */
export function checkIntegrity() {
	const row = db.prepare('PRAGMA integrity_check').get();
	const ok = row && Object.values(row)[0] === 'ok';
	return { ok: !!ok, detail: ok ? 'ok' : JSON.stringify(row).slice(0, 500) };
}

export function migrate() {
	// Create migration version table
	db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT
  )`);

	// Only apply migrations if behind
	const current = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
	const currentVersion = current ? current.version : 0;

	if (currentVersion < 2) {
		migrateInitial(db, addColumnIfMissing, currentVersion);
	}

	// Default warehouse must exist: stock_levels.warehouse_id is a real FK,
	// so any sale/adjust against a fresh DB would fail without this row.
	// (Previously masked because dev DBs were always seeded with W-01.)
	db.prepare(`INSERT OR IGNORE INTO warehouses (id,name) VALUES ('W-01','المستودع الرئيسي')`).run();

	// ── v3: correctness + scale ──
	// Adds columns that invoices.js already writes (currency, channel_id,
	// idempotency_key) + indexes for high-throughput workloads.
	if (currentVersion < 3) {
		addColumnIfMissing('invoices', 'currency', "TEXT NOT NULL DEFAULT 'SAR'");
		addColumnIfMissing('invoices', 'channel_id', "TEXT NOT NULL DEFAULT ''");
		addColumnIfMissing('invoices', 'idempotency_key', 'TEXT');
		db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number ON invoices(number);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idem ON invoices(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_invoices_terminal_created ON invoices(terminal_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_products_active_cat ON products(is_active, category);
      CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
      CREATE INDEX IF NOT EXISTS idx_stock_warehouse ON stock_levels(warehouse_id, product_id);
      CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);
      CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_log(entity_type, status, id);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			3,
			'Invoices currency/channel/idem + scale indexes',
		);
	}

	// ── v4: integration plane — webhooks + delivery outbox ──
	// Outbox pattern: business writes enqueue events in-transaction; a background
	// dispatcher delivers to subscriber systems with retries. No event is lost
	// because a downstream system is down, and sales never block on webhooks.
	if (currentVersion < 4) {
		db.exec(`
      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        events TEXT NOT NULL DEFAULT '["*"]',
        secret TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS webhook_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        entity_type TEXT NOT NULL DEFAULT '',
        entity_id TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL DEFAULT '{}',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'PENDING',
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_status ON webhook_outbox(status, next_attempt_at, id);
      CREATE INDEX IF NOT EXISTS idx_subs_active ON webhook_subscriptions(is_active);
    `);
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			4,
			'Webhooks + outbox',
		);
	}

	// ── v5: functional requirements hardening — customers toggle + voided flag ──
	if (currentVersion < 5) {
		addColumnIfMissing('customers', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
		addColumnIfMissing('invoices', 'voided_at', 'TEXT');
		addColumnIfMissing('invoices', 'voided_by', 'TEXT');
		db.exec(`
      CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);
      CREATE INDEX IF NOT EXISTS idx_products_name_active ON products(is_active, name);
    `);
		// Existing customers: all active
		try {
			db.prepare('UPDATE customers SET is_active=1 WHERE is_active IS NULL').run();
		} catch {
			/* ignore */
		}
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			5,
			'Customers is_active + invoice void fields',
		);
	}

	// ── v6: tamper-evident invoice chain (ZATCA/SAMA foundation) ──
	// chain_hash links each invoice mutation to its predecessor (hash-chained
	// audit trail). Verification needs no new dependency: SHA-256 over
	// prev_hash + invoice_id + number + total + status.
	if (currentVersion < 6) {
		addColumnIfMissing('invoices', 'chain_hash', 'TEXT');
		addColumnIfMissing('invoices', 'chain_prev', 'TEXT');
		db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id TEXT NOT NULL REFERENCES invoices(id),
        prev_hash TEXT NOT NULL DEFAULT 'GENESIS',
        hash TEXT NOT NULL,
        action TEXT NOT NULL DEFAULT 'CREATE',
        total REAL NOT NULL DEFAULT 0,
        number TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_invoice ON invoice_audit(invoice_id, id);
      CREATE TABLE IF NOT EXISTS zatca_settings (
        id TEXT PRIMARY KEY,
        seller_name TEXT NOT NULL DEFAULT '',
        vat_number TEXT NOT NULL DEFAULT '',
        cr_number TEXT NOT NULL DEFAULT '',
        branch_id TEXT NOT NULL DEFAULT '1',
        phase TEXT NOT NULL DEFAULT 'simulation',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_chain ON invoices(chain_hash);
    `);
		db.prepare(`INSERT OR IGNORE INTO zatca_settings (id) VALUES ('default')`).run();
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			6,
			'Invoice hash chain + audit + zatca_settings',
		);
	}

	// ── v7: wallet ledger (canonical money trail) ──
	// Wallet moves previously lived only in customers.wallet_balance (+ a mirror
	// row in loyalty_transactions). The ledger makes every credit/debit/redeem
	// independently auditable with balance_after per row (bank-statement style).
	if (currentVersion < 7) {
		db.exec(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        amount REAL NOT NULL,
        direction TEXT NOT NULL DEFAULT 'credit',
        balance_after REAL NOT NULL DEFAULT 0,
        reference_type TEXT NOT NULL DEFAULT 'MANUAL',
        reference_id TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_wallet_customer ON wallet_transactions(customer_id, created_at DESC);
    `);
		// Backfill from the loyalty mirror (WALLET_CREDIT/WALLET_DEBIT/REDEEM only).
		try {
			const mirrors = db
				.prepare(
					`SELECT id,customer_id,points,amount,type,reference_type,reference_id,note,created_at FROM loyalty_transactions WHERE type IN ('WALLET_CREDIT','WALLET_DEBIT','REDEEM')`,
				)
				.all();
			const ins = db.prepare(
				'INSERT OR IGNORE INTO wallet_transactions (id,customer_id,amount,direction,balance_after,reference_type,reference_id,note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
			);
			for (const m of mirrors) {
				const amt = Math.abs(Number(m.amount) || 0);
				const dir = Number(m.amount) < 0 ? 'debit' : 'credit';
				ins.run(
					`wf-${m.id}`,
					m.customer_id,
					amt,
					dir,
					0,
					m.reference_type || 'MANUAL',
					m.reference_id || '',
					m.note || '',
					'',
					m.created_at || new Date().toISOString(),
				);
			}
		} catch {
			/* backfill best-effort */
		}
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			7,
			'Wallet ledger + backfill',
		);
	}

	// ── v8: multi-tenancy (tenants → organizations → branches) + control fields + trail ──
	// Scoping columns are NULLABLE: legacy single-tenant rows keep working, and
	// DYPOS_REQUIRE_TENANT=1 flips enforcement on (same pattern as REQUIRE_SHIFT).
	migrateTenancy(db, addColumnIfMissing, currentVersion);

	// ── v9: master data — currencies + units of measure (+ seeds) ──
	if (currentVersion < 9) {
		db.exec(`
      CREATE TABLE IF NOT EXISTS currencies (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_ar TEXT NOT NULL DEFAULT '',
        symbol TEXT NOT NULL DEFAULT '',
        decimals INTEGER NOT NULL DEFAULT 2,
        rate_to_base REAL NOT NULL DEFAULT 1,
        is_base INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS uoms (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_ar TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'count',
        factor_to_base REAL NOT NULL DEFAULT 1,
        is_base INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
		const cur = db.prepare(
			'INSERT OR IGNORE INTO currencies (code,name,name_ar,symbol,decimals,rate_to_base,is_base) VALUES (?,?,?,?,?,?,?)',
		);
		cur.run('SAR', 'Saudi Riyal', 'ريال سعودي', 'ر.س', 2, 1, 1);
		cur.run('USD', 'US Dollar', 'دولار أمريكي', '$', 2, 0.26667, 0);
		cur.run('EUR', 'Euro', 'يورو', '€', 2, 0.2451, 0);
		cur.run('AED', 'UAE Dirham', 'درهم إماراتي', 'د.إ', 2, 0.97933, 0);
		cur.run('KWD', 'Kuwaiti Dinar', 'دينار كويتي', 'د.ك', 3, 0.0817, 0);
		cur.run('BHD', 'Bahraini Dinar', 'دينار بحريني', 'د.ب', 3, 0.1004, 0);
		cur.run('QAR', 'Qatari Riyal', 'ريال قطري', 'ر.ق', 2, 0.97087, 0);
		cur.run('EGP', 'Egyptian Pound', 'جنيه مصري', 'ج.م', 2, 12.8, 0);
		const uom = db.prepare(
			'INSERT OR IGNORE INTO uoms (code,name,name_ar,category,factor_to_base,is_base) VALUES (?,?,?,?,?,?)',
		);
		uom.run('Unit', 'Unit', 'قطعة', 'count', 1, 1);
		uom.run('PCS', 'Pieces', 'قطع', 'count', 1, 0);
		uom.run('DOZEN', 'Dozen', 'درزن', 'count', 12, 0);
		uom.run('BOX', 'Box', 'كرتون', 'count', 12, 0);
		uom.run('G', 'Gram', 'جرام', 'weight', 1, 1);
		uom.run('KG', 'Kilogram', 'كيلوجرام', 'weight', 1000, 0);
		uom.run('TON', 'Ton', 'طن', 'weight', 1000000, 0);
		uom.run('ML', 'Milliliter', 'ملليلتر', 'volume', 1, 1);
		uom.run('L', 'Liter', 'لتر', 'volume', 1000, 0);
		uom.run('M', 'Meter', 'متر', 'length', 1000, 0);
		uom.run('CM', 'Centimeter', 'سنتيمتر', 'length', 10, 0);
		uom.run('MM', 'Millimeter', 'ملليمتر', 'length', 1, 1);
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			9,
			'Currencies + UoMs + seeds',
		);
	}

	// ── v10: machine integration + auth recovery + pay idempotency ──
	if (currentVersion < 10) {
		db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'AUDITOR',
        scopes TEXT NOT NULL DEFAULT '[]',
        tenant_id TEXT,
        expires_at TEXT,
        last_used_at TEXT,
        revoked INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_apikeys_hash ON api_keys(key_hash);
      CREATE TABLE IF NOT EXISTS password_resets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_resets_token ON password_resets(token_hash);
    `);
		addColumnIfMissing('payments', 'idempotency_key', 'TEXT');
		db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idem ON payments(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
    `);
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			10,
			'API keys + password resets + payment idempotency',
		);
	}

	// ── v11: billions-scale reads — FTS5 catalog search + low-stock index ──
	// FTS5 is compiled into standard SQLite builds (incl. node:sqlite). Triggers
	// keep the index in lockstep with products; LIKE remains the fallback when
	// FTS is unavailable or the query is a short prefix (index-friendly already).
	if (currentVersion < 11) {
		try {
			db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(name, code, barcode, name_ar, content='products', content_rowid='rowid');
        CREATE TRIGGER IF NOT EXISTS trg_products_fts_ai AFTER INSERT ON products BEGIN
          INSERT INTO products_fts(rowid, name, code, barcode, name_ar) VALUES (new.rowid, new.name, new.code, new.barcode, new.name_ar);
        END;
        CREATE TRIGGER IF NOT EXISTS trg_products_fts_ad AFTER DELETE ON products BEGIN
          INSERT INTO products_fts(products_fts, rowid, name, code, barcode, name_ar) VALUES ('delete', old.rowid, old.name, old.code, old.barcode, old.name_ar);
        END;
        CREATE TRIGGER IF NOT EXISTS trg_products_fts_au AFTER UPDATE ON products BEGIN
          INSERT INTO products_fts(products_fts, rowid, name, code, barcode, name_ar) VALUES ('delete', old.rowid, old.name, old.code, old.barcode, old.name_ar);
          INSERT INTO products_fts(rowid, name, code, barcode, name_ar) VALUES (new.rowid, new.name, new.code, new.barcode, new.name_ar);
        END;
      `);
			// Backfill existing catalog (idempotent: rebuild wipes + reinserts).
			db.exec(`INSERT INTO products_fts(products_fts) VALUES ('rebuild')`);
		} catch {
			// FTS5 unavailable on exotic builds — LIKE fallback stays correct.
		}
		db.exec('CREATE INDEX IF NOT EXISTS idx_stock_qty ON stock_levels(qty);');
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			11,
			'FTS5 catalog + low-stock index',
		);
	}

	// ── v12: webhook dispatcher leader lease (C4) ──
	// Single row (id=1). The dispatcher in lib/webhooks.js acquires it with a
	// heartbeat; only the lease holder delivers the outbox. Prevents duplicate
	// webhook deliveries when several processes open the same SQLite file
	// (multi-instance origin, forked workers, or a stale primary overlapping
	// a fresh one during deploys).
	if (currentVersion < 12) {
		db.exec(`
      CREATE TABLE IF NOT EXISTS dispatcher_lock (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        owner TEXT,
        lease_until TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
		db.prepare('INSERT OR IGNORE INTO dispatcher_lock (id, owner, lease_until) VALUES (1, NULL, NULL)').run();
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			12,
			'webhook dispatcher leader lease',
		);
	}

	// ── v13: payment methods master + business settings (finance campaign) ──
	// payment_methods is user-managed master data (currencies/UoMs pattern):
	// POST /api/invoices and /:id/pay validate the method against ACTIVE rows.
	// business_settings is a validated KV store (country/tax/invoice profile
	// for any-country operation); only allowlisted keys are writable.
	if (currentVersion < 13) {
		db.exec(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_ar TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'OTHER',
        requires_reference INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 100,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS business_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
		const seedPm = db.prepare(
			'INSERT OR IGNORE INTO payment_methods (code,name,name_ar,kind,requires_reference,is_active,sort_order) VALUES (?,?,?,?,?,?,?)',
		);
		seedPm.run('CASH', 'Cash', 'نقدي', 'CASH', 0, 1, 10);
		seedPm.run('CARD', 'Card', 'بطاقة', 'CARD', 1, 1, 20);
		seedPm.run('MADA', 'Mada', 'مدى', 'CARD', 1, 1, 30);
		seedPm.run('WALLET', 'Wallet', 'محفظة', 'WALLET', 0, 1, 40);
		seedPm.run('BANK_TRANSFER', 'Bank transfer', 'تحويل بنكي', 'BANK', 1, 1, 50);
		seedPm.run('OTHER', 'Other', 'أخرى', 'OTHER', 0, 1, 60);
		const seedSet = db.prepare('INSERT OR IGNORE INTO business_settings (key,value) VALUES (?,?)');
		seedSet.run('business_name', '');
		seedSet.run('country_code', 'SA');
		seedSet.run('currency', 'SAR');
		seedSet.run('tax_rate_default', '15');
		seedSet.run('tax_inclusive', '0');
		seedSet.run('invoice_prefix', 'INV');
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			13,
			'payment methods master + business settings',
		);
	}

	// ── v14: fiscal years + gapless invoice sequences (finance campaign) ──
	// Sequential, gapless numbering per (branch-scope, fiscal year) — the
	// e-invoicing norm in every country (ZATCA and equivalents): no gaps, no
	// duplicates. fiscal_years gates posting (CLOSED year → 409/400); the
	// current calendar year is auto-provisioned OPEN so fresh DBs and tests
	// keep working with zero setup.
	if (currentVersion < 14) {
		db.exec(`
      CREATE TABLE IF NOT EXISTS fiscal_years (
        code TEXT PRIMARY KEY,
        starts_on TEXT NOT NULL,
        ends_on TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        closed_by TEXT,
        closed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS invoice_sequences (
        scope TEXT PRIMARY KEY,
        prefix TEXT NOT NULL DEFAULT 'INV',
        last_number INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
		const y = new Date().getUTCFullYear();
		db.prepare(`INSERT OR IGNORE INTO fiscal_years (code,starts_on,ends_on,status) VALUES (?,?,?,'OPEN')`).run(
			String(y),
			`${y}-01-01`,
			`${y}-12-31`,
		);
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			14,
			'fiscal years + gapless invoice sequences',
		);
	}

	// ── v15: invoice_items Arabic name + free-item tracking + version stamp ──
	// Adds `name_ar` (Arabic product name for RTL receipts), `free_qty` (BOGO
	// free count on the paid line), and `is_free_item` (flag for dedicated free
	// rows — DyPOS convention). These columns are written by the server when
	// creating invoices and echoed in GET /invoices/:id for the Arabic UI.
	if (currentVersion < 15) {
		addColumnIfMissing('invoice_items', 'name_ar', "TEXT NOT NULL DEFAULT ''");
		addColumnIfMissing('invoice_items', 'free_qty', 'INTEGER NOT NULL DEFAULT 0');
		addColumnIfMissing('invoice_items', 'is_free_item', 'INTEGER NOT NULL DEFAULT 0');
		addColumnIfMissing('invoices', 'version', 'INTEGER NOT NULL DEFAULT 1');
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			15,
			'invoice_items Arabic name + free-item tracking + version stamp',
		);
	}

	// ── v16: sync tenant isolation + push idempotency + device registry ──
	// Closes three audit gaps without breaking legacy rows:
	// - sync_log.tenant_id: pull filters by tenant scope; legacy NULL rows
	//   stay visible to all (same rule as assertRecordTenant).
	// - sync_log.idempotency_key: UNIQUE (partial) — a retried push batch
	//   returns {deduped:true} instead of re-applying.
	// - devices: minimal registry (register/list/revoke) so a tenant can
	//   see which terminals hold its data and cut off a lost device.
	if (currentVersion < 16) {
		addColumnIfMissing('sync_log', 'tenant_id', 'TEXT');
		addColumnIfMissing('sync_log', 'idempotency_key', 'TEXT');
		db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_idem ON sync_log(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_sync_tenant ON sync_log(tenant_id, status, id);
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        device_id TEXT UNIQUE NOT NULL,
        tenant_id TEXT,
        platform TEXT NOT NULL DEFAULT 'unknown',
        app_version TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        last_sync TEXT,
        registered_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_devices_device ON devices(device_id);`);
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			16,
			'sync tenant isolation + push idempotency + device registry',
		);
	}

	// ── v17: alert notifications inbox (Alertmanager → backend) ──
	// Firing alerts must reach humans with full context, not vanish into a
	// monitoring sidecar nobody watches. Alertmanager POSTs here; the admin
	// console / auditors read via GET /api/admin/alerts. Resolved alerts
	// close the row instead of deleting it (forensic trail preserved).
	if (currentVersion < 17) {
		db.exec(`CREATE TABLE IF NOT EXISTS alert_notifications (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        alertname TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'warning',
        status TEXT NOT NULL DEFAULT 'firing',
        summary TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        starts_at TEXT,
        ends_at TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_status ON alert_notifications(status, severity, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alert_notifications(fingerprint);`);
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			17,
			'alert notifications inbox',
		);
	}

	// ── v18: subscription engine (recurring plans + customer subscriptions) ──
	// Real recurring commerce: plans are master data (ADMIN/MANAGER), customers
	// subscribe to plans, and a billing run advances due subscriptions — paying
	// from the customer wallet when auto_renew allows, otherwise recording a
	// due billing for manual collection. No fake renewals: every charge writes
	// a subscription_billings row (audit) and a canonical wallet ledger entry.
	if (currentVersion < 18) {
		db.exec(`CREATE TABLE IF NOT EXISTS subscription_plans (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        name_ar TEXT NOT NULL DEFAULT '',
        price REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'SAR',
        interval_days INTEGER NOT NULL DEFAULT 30,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_plans_tenant ON subscription_plans(tenant_id, is_active);

      CREATE TABLE IF NOT EXISTS customer_subscriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT '',
        customer_id TEXT NOT NULL REFERENCES customers(id),
        plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
        status TEXT NOT NULL DEFAULT 'active',
        start_date TEXT NOT NULL,
        next_billing_date TEXT NOT NULL,
        last_billed_at TEXT,
        auto_renew INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sub_customer ON customer_subscriptions(customer_id, status);
      CREATE INDEX IF NOT EXISTS idx_sub_next ON customer_subscriptions(status, next_billing_date);
      CREATE INDEX IF NOT EXISTS idx_sub_tenant ON customer_subscriptions(tenant_id, status);

      CREATE TABLE IF NOT EXISTS subscription_billings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL DEFAULT '',
        subscription_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'SAR',
        method TEXT NOT NULL DEFAULT 'due',
        billed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sbill_sub ON subscription_billings(subscription_id, billed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sbill_customer ON subscription_billings(customer_id, billed_at DESC);`);
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			18,
			'subscription engine (plans + customer subscriptions + billings)',
		);
	}

	// ── v19: subscription billing integrity (period-keyed, replay-safe) ──
	// Every subscription charge records the PERIOD it settles (period_start) and
	// how many missed periods were consolidated into it. A partial UNIQUE index
	// makes "bill the same period twice" impossible at the database level even
	// if two billing runs race or a client retries the same request.
	if (currentVersion < 19) {
		try {
			addColumnIfMissing('subscription_billings', 'period_start', 'TEXT');
			addColumnIfMissing('subscription_billings', 'periods_consolidated', 'INTEGER NOT NULL DEFAULT 1');
			// Guard: never let an index build fail the boot. If a legacy database
			// already holds duplicate periods, report it and keep serving.
			const dupes = db
				.prepare(`SELECT subscription_id, period_start, COUNT(*) AS c
          FROM subscription_billings WHERE period_start IS NOT NULL
          GROUP BY subscription_id, period_start HAVING c > 1`)
				.all();
			if (dupes.length === 0) {
				db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sbill_period
            ON subscription_billings(subscription_id, period_start)
            WHERE period_start IS NOT NULL;`);
			} else {
				console.warn(
					`[DyPOS] v19: ${dupes.length} duplicated billing period(s) found — UNIQUE index skipped, review subscription_billings`,
				);
			}
			db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
				19,
				'subscription billing periods (replay-safe charges)',
			);
		} catch (e) {
			console.warn('[DyPOS] v19 migration deferred:', String(e.message).slice(0, 200));
		}
	}

	// ── v20: generic idempotency store (Stripe-style safe retry) ──
	// Every mutating route stores (scope:key) → response for 24h.
	// PRIMARY KEY makes double-execution impossible even across restarts.
	if (currentVersion < 20) {
		try {
			db.exec(`CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        scope TEXT NOT NULL DEFAULT '',
        status INTEGER NOT NULL DEFAULT 200,
        body TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL DEFAULT (datetime('now', '+24 hours'))
      );
      CREATE INDEX IF NOT EXISTS idx_idem_scope ON idempotency_keys(scope, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_idem_expires ON idempotency_keys(expires_at);`);
			try {
				db.prepare(`DELETE FROM idempotency_keys WHERE expires_at < datetime('now')`).run();
			} catch {
				/* fresh DB */
			}
			db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
				20,
				'generic idempotency store (safe retry)',
			);
		} catch (e) {
			console.warn('[DyPOS] v20 migration deferred:', String(e.message).slice(0, 200));
		}
	}

	// ── v21: growth & organic marketing engine (smart receipts, local synergies, insights) ──
	if (currentVersion < 21) {
		try {
			initGrowthEngineTables();
			db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
				21,
				'growth & organic marketing engine (smart receipts, synergies, merchant insights)',
			);
		} catch (e) {
			console.warn('[DyPOS] v21 migration deferred:', String(e.message).slice(0, 200));
		}
	}

	// ── v22: partial returns — cumulative returned qty per invoice line ──
	// Without this, a second (partial or full) return would restock more than
	// was sold. Guarded add-column: pre-v22 DBs gain the column with 0 default.
	if (currentVersion < 22) {
		try {
			addColumnIfMissing('invoice_items', 'returned_qty', 'REAL NOT NULL DEFAULT 0');
			db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
				22,
				'partial returns: returned_qty per invoice line',
			);
		} catch (e) {
			console.warn('[DyPOS] v22 migration deferred:', String(e.message).slice(0, 200));
		}
	}

	// ── v23+: each step records its own schema_version row and is wrapped so a
	// failure is DEFERRED with a warning instead of killing startup.
	for (const step of LATE_MIGRATIONS) {
		if (currentVersion >= step.version) continue;
		try {
			step.run(db, addColumnIfMissing);
		} catch (e) {
			console.warn(`[DyPOS] v${step.version} (${step.note}) deferred:`, String(e.message).slice(0, 200));
		}
	}

	console.log(`[DyPOS] Database migrated (v${MIGRATION_VERSION})`);
}

/**
 * Pre-migration snapshot (rollback insurance for production upgrades).
 * Returns the snapshot path when the database exists but is BEHIND the
 * code's MIGRATION_VERSION, else null (fresh install / current / :memory:).
 * The copy is integrity-verified before it is trusted; failures throw so
 * the caller (entrypoint) can warn loudly — it never blocks the migration
 * itself (availability first, snapshot second).
 */
export function snapshotForMigration(backupDir) {
	if (DB_PATH === ':memory:') return null;
	if (!existsSync(DB_PATH)) return null; // fresh install — nothing to protect
	let current = 0;
	try {
		current = Number(db.prepare('SELECT MAX(version) as v FROM schema_version').get()?.v) || 0;
	} catch {
		current = 0;
	}
	if (current >= MIGRATION_VERSION) return null;
	mkdirSync(backupDir, { recursive: true });
	const snap = join(backupDir, `pre-migrate-v${current}-to-v${MIGRATION_VERSION}-${Date.now()}.db`);
	db.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
	const probe = new DatabaseSync(snap, { readOnly: true });
	try {
		const integ = Object.values(probe.prepare('PRAGMA integrity_check').get())[0];
		if (integ !== 'ok') throw new Error(`integrity_check=${integ}`);
		probe.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
	} finally {
		probe.close();
	}
	return snap;
}

export default db;
export { db, MIGRATION_VERSION };
