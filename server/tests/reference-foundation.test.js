import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DYPOS_DB_PATH=':memory:';

test('v41 reference foundation provisions global POS master data idempotently', async () => {
 const { db, migrate, MIGRATION_VERSION } = await import('../db/schema.js');
 const { LATE_MIGRATIONS } = await import('../db/migration-ladder.js');
 const highest = LATE_MIGRATIONS.reduce((h, { version }) => Math.max(h, version), 0);
 migrate();
 // The ladder grew past 41 (v42-v56: the reference-data domain migrations sit
 // above this foundation). Pin the promise to the ladder itself, never a
 // literal — the "increment when schema changes" comment this file replaced is
 // exactly how a gate starts passing over a migration that never ran.
 assert.equal(MIGRATION_VERSION, highest);
 const count=(table)=>Number(db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c);
 assert.ok(count('ref_countries') >= 240, 'ISO alpha-2 country catalog should be comprehensive');
 assert.ok(count('ref_currencies') >= 150, 'ISO/current ICU currency catalog should be comprehensive');
 assert.ok(count('business_activities') >= 20);
 assert.ok(count('activity_product_classes') >= 30);
 assert.ok(count('activity_services') >= 15);
 assert.ok(count('business_sectors') >= 8);
 assert.ok(count('settings_definitions') >= 15);
 assert.ok(count('account_template_lines') >= 12);
 assert.ok(count('opening_balance_template_lines') >= 6);
 assert.ok(count('activity_onboarding_profiles') >= 20);
 assert.equal(db.prepare("SELECT COUNT(*) AS c FROM ref_countries WHERE code_alpha2='YE'").get().c,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS c FROM ref_currencies WHERE code='YER'").get().c,1);
 migrate();
 assert.equal(MIGRATION_VERSION, highest);
});
