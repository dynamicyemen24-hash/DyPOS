/**
 * v34 migration — record protection (حماية السجلات: بلا حذف فيزيائي).
 *
 * Rule: no business record is ever physically deleted. Invoices already retire
 * through `status` (`VOIDED`/`RETURNED` + who/when), products/customers through
 * `is_active`, coupons/offers through `is_active` — but `expenses` and
 * `opening_balances` had NO status column at all, so their DELETE endpoints
 * destroyed financial history (a P&L line, an opening position) with one call.
 *
 * This migration gives both tables the same professional shape invoices carry:
 * `status` (`POSTED` live, `VOIDED` retired) plus `voided_at` / `voided_by` /
 * `void_reason`. Voiding flips the flag; lists and reports read only `POSTED`
 * by default while supervisors keep the full register through the trail and
 * explicit filters. Existing rows backfill to `POSTED` via the column DEFAULT.
 *
 * Out of scope on purpose (ephemeral protocol hygiene, not business records):
 * `passkey_challenges`, `idempotency_keys` expiry and delivered `webhook_outbox`
 * rows are short-lived transport artifacts — pruning them is the queue working,
 * not history being rewritten. Each is documented at its call site.
 */
export function migrateRecordProtection(
	db,
	addColumnIfMissing,
	{ version = 34, description = 'record protection: void status for expenses + opening balances' } = {},
) {
	// A table that does not exist yet has nothing to protect: `expenses` is
	// created lazily by its route (which ships the same columns for fresh
	// installs), so skipping it here is correct — not a silent failure. The
	// version is still recorded because there is nothing left to apply.
	const tables = new Set(
		db
			.prepare("SELECT name FROM sqlite_master WHERE type='table'")
			.all()
			.map((r) => r.name),
	);
	if (tables.has('expenses')) {
		addColumnIfMissing('expenses', 'status', "TEXT NOT NULL DEFAULT 'POSTED'");
		addColumnIfMissing('expenses', 'voided_at', 'TEXT');
		addColumnIfMissing('expenses', 'voided_by', 'TEXT');
		addColumnIfMissing('expenses', 'void_reason', 'TEXT');
	}
	if (tables.has('opening_balances')) {
		addColumnIfMissing('opening_balances', 'status', "TEXT NOT NULL DEFAULT 'POSTED'");
		addColumnIfMissing('opening_balances', 'voided_at', 'TEXT');
		addColumnIfMissing('opening_balances', 'voided_by', 'TEXT');
		addColumnIfMissing('opening_balances', 'void_reason', 'TEXT');
	}
	if (tables.has('expenses')) {
		db.exec('CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status, date DESC);');
	}
	if (tables.has('opening_balances')) {
		db.exec('CREATE INDEX IF NOT EXISTS idx_opening_status ON opening_balances(status, fiscal_year);');
	}
	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateRecordProtection;
