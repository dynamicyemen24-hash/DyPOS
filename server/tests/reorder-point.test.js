import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrateReorderPoint } from "../db/migrations-reorder-point.js";
import { productPatchSchema } from "../middleware/validate.js";

test("v31 adds a defaulted reorder point idempotently", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE products (id TEXT PRIMARY KEY, code TEXT NOT NULL);
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY, description TEXT);
      INSERT INTO products (id, code) VALUES ('p1', 'P-1');
    `);

    const addColumnIfMissing = (table, column, ddl) => {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((entry) => entry.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
      }
    };
    migrateReorderPoint(db, addColumnIfMissing);
    migrateReorderPoint(db, addColumnIfMissing);

    assert.equal(
      db.prepare("SELECT reorder_point FROM products WHERE id='p1'").get()
        .reorder_point,
      0,
    );
    assert.equal(
      db.prepare("SELECT version FROM schema_version").get().version,
      31,
    );
  } finally {
    db.close();
  }
});

test("product API accepts non-negative reorder points and rejects invalid values", () => {
  assert.equal(productPatchSchema.safeParse({ reorderPoint: 12.5 }).success, true);
  assert.equal(productPatchSchema.safeParse({ reorderPoint: -1 }).success, false);
  assert.equal(
    productPatchSchema.safeParse({ reorderPoint: "12" }).success,
    false,
  );
});
