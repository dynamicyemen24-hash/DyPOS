/**
 * DyPOS Async Guard — every async route handler MUST be wrapped.
 *
 * Express 4 does not catch rejected promises from `async (req, res)` handlers:
 * an unexpected throw (DB lock, OOM-adjacent, driver edge) would leave the
 * request hanging until client timeout — at billions of requests, "rare"
 * becomes "constant". `ah()` forwards rejections to the central error
 * middleware, which returns a stable 500 JSON { error, req_id }.
 *
 * Usage: router.get('/', ah(async (req, res) => { ... }))
 */
export function ah(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const LOCK_RE = /(SQLITE_BUSY|SQLITE_LOCKED|database is locked)/i;

/**
 * True when a thrown error is a SQLite lock collision (another writer/process
 * holds the reservation). These are transient, retryable conditions — they
 * must surface as 503 + Retry-After so the POS can retry, never as a
 * permanent 400 that drops a sale.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isSqliteLockError(err) {
  return Boolean(err && typeof err.message === 'string' && LOCK_RE.test(err.message));
}

/**
 * Consistent status for a caught route error. SQLite locks map to 503
 * (retryable); everything else keeps its explicit statusCode or 400.
 * @param {unknown} err
 * @param {number} fallback
 * @returns {number}
 */
export function mapErrorStatus(err, fallback = 400) {
  if (isSqliteLockError(err)) return 503;
  return err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : fallback;
}

export default ah;
