import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DYPOS_DB_PATH=':memory:';

test('v41 reference foundation provisions global POS master data idempotently', async () => {
 const { db, migrate, MIGRATION_VERSION } = await import('../db/schema.js');
 migrate();
 assert.equal(MIGRATION_VERSION, 41);
 const count=(table)=>Number(db.prepare('SELECT COUNT(*) AS c FROM '+table).get().c);
 assert.ok(count('ref_countries') >= 240, 'ISO alpha-2 country catalog should be comprehensive');
 assert.ok(count('ref_currencies') >= 150, 'ISO/current ICU currency catalog should be comprehensive');
 assert.ok(count('business_activities') >= 20);
 assert.ok(count('activity_product_classes') >= 30);
 assert.ok(count('activity_services') >= 15);
 assert.ok(count('business_sectors') >= 8);
 assert.ok(count('settings_definitions') >= 15);
 assert.ok(count('account_template_lines') >= 12);
 assert.ok(count('opening_balance_template_lines') >= 6);
 assert.ok(count('onboarding_templates') >= 20);
 assert.equal(db.prepare("SELECT COUNT(*) AS c FROM ref_countries WHERE code_alpha2='YE'").get().c,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS c FROM ref_currencies WHERE code='YER'").get().c,1);
 migrate();
 assert.equal(MIGRATION_VERSION,41);
});
