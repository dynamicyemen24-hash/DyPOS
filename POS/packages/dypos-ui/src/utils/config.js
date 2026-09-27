/**
 * DyPOS UI Kit — runtime configuration.
 *
 * A tiny, dependency-free replacement for the old third-party `resourceFetcher`
 * config bag. The POS only ever sets ONE key (`resourceFetcher`, wired in
 * src/main.js to the CSRF-aware transport), so the surface stays minimal and
 * documented rather than a generic untyped bag.
 *
 * @type {Record<string, unknown>}
 */
const config = Object.create(null)

/**
 * Set a configuration value.
 * @param {string} key
 * @param {unknown} value
 */
export function setConfig(key, value) {
	config[key] = value
}

/**
 * Read a configuration value (null when unset).
 * @param {string} key
 * @returns {unknown|null}
 */
export function getConfig(key) {
	return config[key] ?? null
}
