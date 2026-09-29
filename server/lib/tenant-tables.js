/**
 * The tenant-scope registry — the list of tables that carry a `tenant_id`.
 *
 * ## Why this is data, not router logic
 *
 * `routes/method.js` is capped by `tests/fileSize.test.js` and grows with every
 * doctype, so the SET moved here. It is a fact about the DATABASE, not about
 * HTTP: the same answer is needed by the method router, the REST routes and the
 * offline mirror, and a set that only the router can see is a set the other two
 * quietly disagree with.
 *
 * ## The failure this prevents
 *
 * A table missing from this set is treated by the generic list plane as having
 * no tenant dimension, so `dypos.client.get_list` answers with EVERY tenant's
 * rows and no test anywhere fails — the query is correct SQL over a table that
 * was simply never declared. That is how `GET /api/offers` once leaked every
 * tenant's promotions, and how `opening_balances` would have leaked every
 * tenant's outstanding customer debt the same way.
 *
 * ## Invariant
 *
 * A table carrying `tenant_id` MUST appear here, and a table that does not carry
 * the column MUST NOT (the scoped `WHERE tenant_id=?` would throw "no such
 * column" and the list would answer 500). When a migration adds the column, add
 * the table here in the same change — `db/schema.js` is the other half of that
 * pair, and neither file can be trusted alone.
 *
 * NULL `tenant_id` means "legacy global row" and stays visible to every tenant,
 * which is the compatibility rule `assertRecordTenant` also applies.
 */
export const TENANT_TABLES = new Set([
  'products', 'customers', 'invoices', 'stock_levels', 'shifts', 'offers', 'coupons',
  'expenses', 'audit_trail', 'sync_log', 'webhook_outbox', 'user_sessions', 'users',
  'settings', 'hardware_devices', 'store_synergies', 'merchant_insights', 'customer_feedback',
  'payment_methods', 'business_settings', 'currencies', 'uoms',
  'fiscal_years', 'invoice_sequences', 'subscription_plans', 'customer_subscriptions',
  'subscription_billings', 'alert_notifications', 'devices', 'api_keys',
  'password_resets', 'idempotency_keys', 'dispatcher_lock',
  // Money a customer already owed: with this entry missing, the generic list
  // plane would answer an Opening Balance query with EVERY tenant's balances.
  'opening_balances',
]);

/** Whether `table` is tenant-scoped, i.e. its queries must carry a tenant clause. */
export function tenantColumnKnown(table) {
  return TENANT_TABLES.has(String(table));
}

export default { TENANT_TABLES, tenantColumnKnown };
