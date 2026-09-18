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

export default ah;
