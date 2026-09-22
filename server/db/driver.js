/**
 * DyPOS SQLite Driver — zero-dependency drop-in replacement for `better-sqlite3`.
 *
 * Backed by Node's built-in `node:sqlite` (DatabaseSync), available since Node 22.5
 * and stable from Node 24 onward. This removes the need for a native build
 * toolchain (Python + MSVC / node-gyp), which makes the app installable and
 * deployable on any Node >=22.5 host, including slim Docker images and Windows
 * machines without Visual Studio Build Tools.
 *
 * The public surface intentionally mirrors the subset of the `better-sqlite3` API
 * that DyPOS uses, so `db.prepare(...).run()/.get()/.all()`, `db.exec()`,
 * `db.pragma()`, `db.transaction()` and `db.close()` all keep working unchanged.
 *
 * Behavioural notes vs. the native binding:
 * - `undefined` and `boolean` bind values are coerced (`null` / `0|1`) instead of
 *   throwing, which is friendlier for optional request fields.
 * - `Date` instances are stored as ISO-8601 strings.
 * - Plain objects/arrays are stored as JSON text.
 *
 * @see https://nodejs.org/api/sqlite.html
 */
import { DatabaseSync } from 'node:sqlite';

/** Minimum Node release that ships `node:sqlite`. */
const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 5;

/**
 * Fail fast with an actionable message when `node:sqlite` is unavailable.
 * @returns {void}
 */
function assertRuntimeSupportsNodeSqlite() {
  const [major, minor] = String(process.versions.node).split('.').map(Number);
  const supported = major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR);
  if (!supported) {
    throw new Error(
      `[DyPOS] Node ${process.versions.node} does not provide the built-in "node:sqlite" module.\n` +
        `        DyPOS requires Node >=${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0 (Node 24 LTS recommended).\n` +
        `        Upgrade Node, or run with an older runtime plus a native SQLite binding.`
    );
  }
}

assertRuntimeSupportsNodeSqlite();

/** @param {unknown} value */
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return false;
  if (value instanceof Map || value instanceof Set) return false;
  return true;
}

/**
 * Normalise a single value for binding to SQLite.
 *
 * `node:sqlite` accepts null, number, bigint, string, Date and typed arrays but
 * rejects `undefined` and `boolean`, while callers frequently hand over
 * `undefined` for optional columns. Coerce those to safe SQLite primitives.
 *
 * @param {unknown} value
 * @returns {null | number | bigint | string | Uint8Array | ArrayBuffer}
 */
function normalizeParam(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint' || typeof value === 'string') return value;
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return value;
  if (value instanceof Date) return value.toISOString();
  // Objects and arrays are stored as JSON text, matching common SQLite usage.
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Normalise a positional argument list.
 *
 * A lone plain object is treated as a named-parameter bag (better-sqlite3 style
 * `:name` / `$name` / `@name` bindings); everything else is treated as
 * positional parameters.
 *
 * @param {unknown[]} params
 * @returns {Array<unknown>}
 */
function normalizeParams(params) {
  if (params.length === 1 && isPlainObject(params[0])) {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, value] of Object.entries(params[0])) out[key] = normalizeParam(value);
    return [out];
  }
  return params.map(normalizeParam);
}

/**
 * A prepared-statement facade mirroring `better-sqlite3`'s Statement API.
 */
class Statement {
  /** @param {import('node:sqlite').StatementSync} stmt */
  constructor(stmt) {
    /** @type {import('node:sqlite').StatementSync} */
    this._stmt = stmt;
  }

  /**
   * Execute the statement and return mutation metadata.
   * @param {...unknown} params
   * @returns {{ changes: number, lastInsertRowid: number }}
   */
  run(...params) {
    const result = this._stmt.run(...normalizeParams(params));
    return {
      changes: Number(result.changes ?? 0),
      lastInsertRowid: Number(result.lastInsertRowid ?? 0),
    };
  }

  /**
   * Execute the statement and return the first row, or `undefined` when empty.
   * @param {...unknown} params
   * @returns {Record<string, unknown> | undefined}
   */
  get(...params) {
    return /** @type {Record<string, unknown> | undefined} */ (this._stmt.get(...normalizeParams(params)));
  }

  /**
   * Execute the statement and return every matching row.
   * @param {...unknown} params
   * @returns {Array<Record<string, unknown>>}
   */
  all(...params) {
    return /** @type {Array<Record<string, unknown>>} */ (this._stmt.all(...normalizeParams(params)));
  }

  /**
   * Lazily stream rows. Provided for parity even though DyPOS currently uses
   * `all()` everywhere.
   * @param {...unknown} params
   */
  iterate(...params) {
    return this._stmt.iterate(...normalizeParams(params));
  }

  /**
   * better-sqlite3 compatibility no-ops. DyPOS does not rely on these, but
   * keeping them prevents `TypeError: stmt.pluck is not a function` for any
   * future call site.
   * @returns {this}
   */
  raw() {
    return this;
  }

  /** @returns {this} */
  pluck() {
    return this;
  }

  /** @returns {this} */
  expand() {
    return this;
  }

  /** @returns {this} */
  safeIntegers() {
    return this;
  }

  /** @returns {this} */
  bind() {
    return this;
  }

  /**
   * Column metadata, when the runtime exposes it.
   * @returns {Array<unknown>}
   */
  columns() {
    const columns = /** @type {{ columns?: () => Array<unknown> }} */ (this._stmt).columns;
    return typeof columns === 'function' ? columns.call(this._stmt) : [];
  }
}

/**
 * Database handle mirroring the `better-sqlite3` constructor surface used by DyPOS.
 */
class Database {
  /**
   * @param {string} path Filesystem path, or `':memory:'` for an in-memory database.
   * @param {{ readonly?: boolean, readOnly?: boolean, timeout?: number, fileMustExist?: boolean }} [options]
   */
  constructor(path = ':memory:', options = {}) {
    /** @type {boolean} */
    this._inTransaction = false;
    /** @type {number} */
    this._savepointSeq = 0;
    /** @type {string} */
    this.name = String(path);

    /** @type {Record<string, unknown>} */
    const nativeOptions = {
      // Match better-sqlite3's default of enforcing declared foreign keys.
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
    };
    if (options.readonly === true || options.readOnly === true) nativeOptions.readOnly = true;
    if (typeof options.timeout === 'number') nativeOptions.timeout = options.timeout;

    /** @type {import('node:sqlite').DatabaseSync} */
    this._db = new DatabaseSync(this.name, nativeOptions);
  }

  /**
   * Read or write a PRAGMA.
   *
   * `PRAGMA name = value` runs via `exec` (it returns no rows and cannot be
   * parameterised); bare pragmas return their result rows.
   *
   * @param {string} source
   * @returns {Array<Record<string, unknown>>}
   */
  pragma(source) {
    const statement = String(source).trim();
    if (statement.includes('=')) {
      this._db.exec(`PRAGMA ${statement}`);
      return [];
    }
    return /** @type {Array<Record<string, unknown>>} */ (this._db.prepare(`PRAGMA ${statement}`).all());
  }

  /**
   * Execute one or more SQL statements without returning rows.
   * @param {string} sql
   * @returns {void}
   */
  exec(sql) {
    this._db.exec(sql);
  }

  /**
   * Compile a statement for repeated execution.
   * @param {string} sql
   * @returns {Statement}
   */
  prepare(sql) {
    return new Statement(this._db.prepare(sql));
  }

  /**
   * Wrap `fn` in an ACID transaction, mirroring `better-sqlite3`.
   *
   * Returns a callable that runs `fn` inside `BEGIN`/`COMMIT` and rolls back on
   * throw. Nested calls use `SAVEPOINT` so an inner failure does not discard
   * outer work.
   *
   * @param {(...args: unknown[]) => unknown} fn
   * @returns {(...args: unknown[]) => unknown} transaction runner
   */
  transaction(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('[DyPOS] db.transaction(fn) requires a function argument');
    }

    const run = (...args) => {
      // Nested transaction: use a savepoint so only inner work is undone.
      if (this._inTransaction) {
        const name = `dypos_sp_${++this._savepointSeq}`;
        this._db.exec(`SAVEPOINT ${name}`);
        try {
          const result = fn(...args);
          this._db.exec(`RELEASE ${name}`);
          return result;
        } catch (error) {
          this._db.exec(`ROLLBACK TO ${name}`);
          this._db.exec(`RELEASE ${name}`);
          throw error;
        }
      }

      // BEGIN IMMEDIATE takes the write reservation up front instead of
      // deferring it to COMMIT. With busy_timeout set, concurrent writers
      // wait at BEGIN (where node:sqlite applies the timeout) rather than
      // failing noisily at COMMIT after all work is done — so a busy moment
      // retries cleanly and a live sale is never dropped on the finish line.
      this._db.exec('BEGIN IMMEDIATE');
      this._inTransaction = true;
      try {
        const result = fn(...args);
        this._db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this._db.exec('ROLLBACK');
        } catch {
          // A failed BEGIN, or an already-rolled-back transaction, is not fatal;
          // surface the original error instead of masking it.
        }
        throw error;
      } finally {
        this._inTransaction = false;
      }
    };

    // better-sqlite3 exposes these variants; DyPOS only needs the default, but
    // keeping them prevents surprises for future call sites.
    run.deferred = run;
    run.immediate = run;
    run.exclusive = run;
    return run;
  }

  /**
   * Close the database. Accepts an optional Node-style callback for parity with
   * `better-sqlite3`, which supports both callback and synchronous usage.
   * @param {(error?: Error | null) => void} [callback]
   * @returns {void}
   */
  close(callback) {
    try {
      this._db.close();
      if (typeof callback === 'function') callback(null);
    } catch (error) {
      if (typeof callback === 'function') return callback(error);
      throw error;
    }
  }

  /** `true` while a transaction started by `transaction()` is open. */
  get inTransaction() {
    return this._inTransaction;
  }

  /** `true` while the underlying handle is still open. */
  get open() {
    return this._db.isOpen !== false;
  }
}

export default Database;
export { Database, Statement, normalizeParam, isPlainObject };