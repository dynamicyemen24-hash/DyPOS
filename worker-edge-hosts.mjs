/**
 * Hostnames that resolve back to the DyPOS API edge worker itself.
 *
 * Lives in its own module so it can be imported by the Node test runner.
 * `worker-api.js` is a Cloudflare Worker ES module; importing it from the test
 * suite loads it as CommonJS and dies on the first `export` token, which took
 * the whole security suite down with it.
 */
export const DYPOS_EDGE_HOSTS = Object.freeze([
	"dypos.smartportssoft.com",
	"dypos-api.smartportssoft.com",
]);

/**
 * True when the configured upstream is this very worker.
 *
 * Compared on hostname, not full origin, because the same edge answers on
 * several names — the custom domain and the workers.dev alias — and an alias
 * that loops back here is exactly as fatal as an exact match. Proxying to it
 * returns a flat 503 for the whole API with no upstream in the logs, which is
 * the worst possible failure to diagnose.
 *
 * @param {string} requestHost hostname serving this request
 * @param {URL} backend parsed BACKEND_URL
 * @returns {boolean}
 */
export function isSelfProxy(requestHost, backend) {
	if (!backend || !requestHost) return false;
	return DYPOS_EDGE_HOSTS.includes(backend.hostname) || backend.hostname === requestHost;
}
