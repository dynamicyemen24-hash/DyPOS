/**
 * Schema verification helper — prints every table, index and view created by migrate().
 * Run: node scripts/verify-schema.mjs
 */
process.env.DYPOS_DB_PATH = process.env.DYPOS_DB_PATH || ':memory:';

const { db, migrate, checkDbHealth } = await import('../db/schema.js');

migrate();

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r) => r.name);

const indexes = db
  .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r) => r.name);

const triggers = db
  .prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")
  .all()
  .map((r) => r.name);

console.log('HEALTH:', JSON.stringify(checkDbHealth()));
console.log(`TABLES (${tables.length}):`);
for (const t of tables) console.log(`  - ${t}`);
console.log(`INDEXES (${indexes.length}):`);
for (const i of indexes) console.log(`  - ${i}`);
console.log(`TRIGGERS (${triggers.length}):`);
for (const t of triggers) console.log(`  - ${t}`);

db.close();
