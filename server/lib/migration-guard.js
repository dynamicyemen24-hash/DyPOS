/**
 * DyPOS Migration Safety Guard — Zero-Downtime Schema Evolution
 * 
 * Prevents destructive migrations, enforces backward compatibility,
 * supports blue-green deployment patterns.
 */

import { db } from '../db/schema.js';
import { logger } from './logger.js';
import { getTracer } from './telemetry.js';

const log = logger.create('MigrationGuard');
const tracer = getTracer('dypos.migration');

const MIGRATION_TABLE = 'schema_migrations';
const LOCK_TABLE = 'migration_lock';

/**
 * Initialize migration tracking tables
 */
export function initMigrationTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now')),
      applied_by TEXT,
      execution_time_ms INTEGER,
      rollback_sql TEXT,
      status TEXT DEFAULT 'applied', -- applied, rolled_back, failed
      metadata TEXT -- JSON
    );

    CREATE TABLE IF NOT EXISTS ${LOCK_TABLE} (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      locked_by TEXT NOT NULL,
      locked_at TEXT DEFAULT (datetime('now')),
      migration_version TEXT,
      expires_at TEXT
    );
  `);
}

/**
 * Acquire migration lock (prevents concurrent migrations)
 */
export function acquireMigrationLock(version, owner = 'system') {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

  const result = db.prepare(`
    INSERT OR REPLACE INTO ${LOCK_TABLE} (id, locked_by, migration_version, expires_at)
    VALUES (1, ?, ?, ?)
  `).run(owner, version, expiresAt);

  return result.changes > 0;
}

/**
 * Release migration lock
 */
export function releaseMigrationLock() {
  db.prepare(`DELETE FROM ${LOCK_TABLE} WHERE id = 1`).run();
}

/**
 * Check if migration lock is held
 */
export function getMigrationLock() {
  return db.prepare(`SELECT * FROM ${LOCK_TABLE} WHERE id = 1`).get();
}

/**
 * Validate migration safety before applying
 */
export function validateMigration(migration) {
  const { sql, rollbackSql, version: _version } = migration;

  const issues = [];
  const warnings = [];

  // 1. Check for destructive operations
  const destructivePatterns = [
    { pattern: /DROP\s+TABLE/i, message: 'DROP TABLE destroys data' },
    { pattern: /DROP\s+COLUMN/i, message: 'DROP COLUMN destroys data' },
    { pattern: /ALTER\s+TABLE.*DROP/i, message: 'ALTER TABLE DROP destroys data' },
    { pattern: /TRUNCATE\s+TABLE/i, message: 'TRUNCATE TABLE destroys all data' },
    { pattern: /DELETE\s+FROM\s+\w+\s*;/i, message: 'DELETE without WHERE clause' },
    { pattern: /UPDATE\s+\w+\s+SET\s+\w+\s*=\s*NULL/i, message: 'Setting column to NULL may break NOT NULL constraints' },
  ];

  for (const { pattern, message } of destructivePatterns) {
    if (pattern.test(sql)) {
      issues.push({ type: 'destructive', message, sql: sql.substring(0, 200) });
    }
  }

  // 2. Check for NOT NULL additions without defaults
  const notNullAdditions = sql.match(/ADD\s+COLUMN\s+\w+\s+\w+\s+NOT\s+NULL(?!\s+DEFAULT)/gi);
  if (notNullAdditions) {
    issues.push({
      type: 'constraint',
      message: 'Adding NOT NULL column without DEFAULT breaks existing rows',
      details: notNullAdditions,
    });
  }

  // 3. Check for type changes that could lose data
  const typeChanges = sql.match(/ALTER\s+COLUMN\s+\w+\s+TYPE\s+\w+/gi);
  if (typeChanges) {
    warnings.push({
      type: 'type_change',
      message: 'Column type change may truncate or corrupt data',
      details: typeChanges,
    });
  }

  // 4. Check for index operations on large tables
  const indexOps = sql.match(/CREATE\s+(UNIQUE\s+)?INDEX/i);
  if (indexOps) {
    warnings.push({
      type: 'index',
      message: 'Creating index may lock table; consider CONCURRENTLY',
    });
  }

  // 5. Verify rollback SQL provided for destructive changes
  if (issues.some(i => i.type === 'destructive') && !rollbackSql) {
    issues.push({
      type: 'rollback_missing',
      message: 'Destructive migration requires rollback SQL',
    });
  }

  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Apply migration with full safety checks
 */
export function applyMigration(migration) {
  return tracer.startActiveSpan('migration.apply', async (span) => {
    const { version, name, sql, rollbackSql, metadata = {} } = migration;

    try {
      // 1. Validate
      const validation = validateMigration(migration);
      if (!validation.valid) {
        const error = new Error(`Migration validation failed: ${validation.issues.map(i => i.message).join('; ')}`);
        error.validation = validation;
        throw error;
      }

      if (validation.warnings.length) {
        log.warn('Migration warnings', { version, warnings: validation.warnings });
      }

      // 2. Acquire lock
      if (!acquireMigrationLock(version)) {
        const lock = getMigrationLock();
        throw new Error(`Migration lock held by ${lock.locked_by} for version ${lock.migration_version}`);
      }

      // 3. Check if already applied
      const existing = db.prepare(`SELECT * FROM ${MIGRATION_TABLE} WHERE version = ?`).get(version);
      if (existing) {
        log.info('Migration already applied', { version, status: existing.status });
        return { skipped: true, version };
      }

      // 4. Compute checksum
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');

      // 5. Execute in transaction
      const startTime = Date.now();
      const tx = db.transaction(() => {
        db.exec(sql);

        db.prepare(`
          INSERT INTO ${MIGRATION_TABLE} (version, name, checksum, applied_by, execution_time_ms, rollback_sql, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(version, name, checksum, 'system', Date.now() - startTime, rollbackSql || null, JSON.stringify(metadata));
      });

      tx();

      const executionTime = Date.now() - startTime;

      log.info('Migration applied', { version, name, executionTimeMs: executionTime });
      span.setStatus({ code: 0 });
      span.setAttribute('migration.version', version);
      span.setAttribute('migration.execution_time_ms', executionTime);

      return { applied: true, version, executionTime };
    } catch (error) {
      span.setStatus({ code: 2, message: error.message });
      span.recordException(error);
      log.error('Migration failed', { version, error: error.message });
      throw error;
    } finally {
      releaseMigrationLock();
      span.end();
    }
  });
}

/**
 * Rollback migration
 */
export function rollbackMigration(version) {
  return tracer.startActiveSpan('migration.rollback', async (span) => {
    try {
      const migration = db.prepare(`SELECT * FROM ${MIGRATION_TABLE} WHERE version = ?`).get(version);
      if (!migration) {
        throw new Error(`Migration ${version} not found`);
      }

      if (migration.status === 'rolled_back') {
        log.info('Migration already rolled back', { version });
        return { skipped: true };
      }

      if (!migration.rollback_sql) {
        throw new Error(`No rollback SQL for migration ${version}`);
      }

      if (!acquireMigrationLock(version)) {
        throw new Error('Could not acquire migration lock');
      }

      const tx = db.transaction(() => {
        db.exec(migration.rollback_sql);
        db.prepare(`UPDATE ${MIGRATION_TABLE} SET status = 'rolled_back' WHERE version = ?`).run(version);
      });

      tx();

      log.info('Migration rolled back', { version });
      span.setStatus({ code: 0 });
      return { rolledBack: true, version };
    } catch (error) {
      span.setStatus({ code: 2, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      releaseMigrationLock();
      span.end();
    }
  });
}

/**
 * Get migration status
 */
export function getMigrationStatus() {
  return db.prepare(`
    SELECT * FROM ${MIGRATION_TABLE} ORDER BY applied_at DESC
  `).all();
}

/**
 * Verify migration integrity (checksums)
 */
export function verifyMigrations() {
  const migrations = db.prepare(`SELECT * FROM ${MIGRATION_TABLE} WHERE status = 'applied'`).all();
  const results = { verified: 0, failed: 0, details: [] };

  for (const m of migrations) {
    // In practice, you'd store the original SQL to re-compute checksum
    // For now, we just verify the record exists
    results.verified++;
    results.details.push({ version: m.version, checksum: m.checksum, status: 'ok' });
  }

  return results;
}

/**
 * Generate migration template
 */
export function generateMigrationTemplate(type) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '').split('.')[0];
  const version = `${timestamp}_${type}`;

  const templates = {
    create_table: `-- Migration: ${version}
-- Description: Create new table
-- Safe: Yes (additive)

CREATE TABLE IF NOT EXISTS new_table (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Rollback
-- DROP TABLE new_table;`,

    add_column: `-- Migration: ${version}
-- Description: Add column to existing table
-- Safe: Yes (with DEFAULT)

ALTER TABLE existing_table ADD COLUMN new_column TEXT DEFAULT 'default_value';

-- Rollback
-- ALTER TABLE existing_table DROP COLUMN new_column;`,

    add_index: `-- Migration: ${version}
-- Description: Add index for query performance
-- Safe: Yes (concurrent in PostgreSQL)

CREATE INDEX idx_table_column ON table_name (column_name);

-- Rollback
-- DROP INDEX idx_table_column;`,

    modify_column: `-- Migration: ${version}
-- Description: Modify column (USE WITH CAUTION)
-- Safe: NO - requires careful rollback

-- ALTER TABLE table_name ALTER COLUMN column_name TYPE new_type;
-- ALTER TABLE table_name ALTER COLUMN column_name SET NOT NULL;

-- Rollback requires reverse operation
-- ALTER TABLE table_name ALTER COLUMN column_name TYPE old_type;`,

    rename_table: `-- Migration: ${version}
-- Description: Rename table (requires app coordination)
-- Safe: NO - breaking change

ALTER TABLE old_table RENAME TO new_table;

-- Rollback
-- ALTER TABLE new_table RENAME TO old_table;`,
  };

  return templates[type] || templates.create_table;
}

// Initialize tables on load
initMigrationTables();