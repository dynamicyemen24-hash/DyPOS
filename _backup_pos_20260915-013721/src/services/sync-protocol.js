/**
 * SyncProtocol — the two-way sync transport between DyPOS and the DyPOS
 * platform. Handles auth headers, timeouts, retries and HTTP→SyncError
 * mapping so callers can reason about one error vocabulary.
 */

import { SyncError, SyncErrorKind } from "./sync-error.js"

/**
 * Map an HTTP status to the closest SyncErrorKind.
 */
export function kindForStatus(status) {
	switch (status) {
		case 401:
			return SyncErrorKind.AUTH_REVOKED
		case 403:
			return SyncErrorKind.REMOTE_FORBIDDEN
		case 404:
			return SyncErrorKind.REMOTE_NOT_FOUND
		case 409:
			return SyncErrorKind.REMOTE_CONFLICT
		case 408:
		case 425:
		case 429:
		case 500:
		case 502:
		case 503:
		case 504:
			return SyncErrorKind.REMOTE_SERVER_ERROR
		default:
			return null
	}
}

export default class SyncProtocol {
	constructor(config = {}) {
		this.baseUrl = config.baseUrl || ""
		this.apiKey = config.apiKey || ""
		/**
		 * Async provider returning a valid access token (e.g. sync-auth
		 * getValidToken). Errors from the provider propagate to callers.
		 */
		this.tokenProvider =
			typeof config.tokenProvider === "function" ? config.tokenProvider : null
		this.timeout = config.timeout || 15000
		this.retryCount = config.retryCount || 3
		this.retryDelay = config.retryDelay || 1000
	}

	async buildHeaders(headers = {}) {
		const defaultHeaders = {
			"Content-Type": "application/json",
			"X-Platform-Id": "DYPOS",
			"X-Platform-Version": "1.0.0",
			...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
			...headers,
		}

		if (this.tokenProvider) {
			const token = await this.tokenProvider()
			if (token) {
				defaultHeaders.Authorization = `Bearer ${token}`
			}
		}

		return defaultHeaders
	}

	async request(endpoint, options = {}) {
		const { method = "GET", body = null, headers = {}, params = {} } = options
		const url = this.buildUrl(endpoint, params)
		const finalHeaders = await this.buildHeaders(headers)

		try {
			const response = await fetch(url, {
				method,
				headers: finalHeaders,
				body: body ? JSON.stringify(body) : undefined,
				signal: this.createTimeoutSignal(),
			})
			return await this.handleResponse(response, endpoint)
		} catch (error) {
			if (error.name === "AbortError") {
				throw new SyncError(SyncErrorKind.TIMEOUT, endpoint, {
					message: "Request timed out",
				})
			}
			throw error
		}
	}

	async get(endpoint, params = {}) {
		return this.request(endpoint, { method: "GET", params })
	}

	async post(endpoint, body = {}, params = {}) {
		return this.request(endpoint, { method: "POST", body, params })
	}

	async put(endpoint, body = {}, params = {}) {
		return this.request(endpoint, { method: "PUT", body, params })
	}

	async patch(endpoint, body = {}, params = {}) {
		return this.request(endpoint, { method: "PATCH", body, params })
	}

	async delete(endpoint, params = {}) {
		return this.request(endpoint, { method: "DELETE", params })
	}

	buildUrl(endpoint, params = {}) {
		const url = new URL(this.baseUrl + endpoint)
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null) {
				url.searchParams.set(key, String(value))
			}
		})
		return url.toString()
	}

	createTimeoutSignal() {
		const controller = new AbortController()
		setTimeout(() => controller.abort(), this.timeout)
		return controller.signal
	}

	async handleResponse(response, endpoint) {
		const data = await response.json().catch(() => ({}))
		if (!response.ok) {
			const kind = kindForStatus(response.status)
			const code = data.error?.code || data.code || `HTTP_${response.status}`
			throw new SyncError(kind || code, endpoint, {
				statusCode: response.status,
				message: data.error?.message || response.statusText || code,
				details: data,
			})
		}
		return data
	}

	async healthCheck() {
		try {
			const result = await this.get("/api/health")
			return { status: "healthy", ...result }
		} catch (error) {
			return { status: "unhealthy", error: error.message }
		}
	}

	async getSyncStatus() {
		return this.get("/api/sync/status")
	}

	async requestSync(systemId, changes = [], options = {}) {
		const payload = {
			system_id: systemId,
			changes,
			sync_timestamp: options.timestamp || Date.now(),
			metadata: options.metadata || {},
		}
		return this.post("/api/sync/request", payload)
	}

	async resolveConflict(conflictId, resolution) {
		return this.post(`/api/sync/conflicts/${conflictId}/resolve`, resolution)
	}

	async getConfig(scope = "global") {
		const result = await this.get("/api/config", { scope })
		return result.config || result
	}

	async updateConfig(config, scope = "local") {
		return this.put("/api/config", { config, scope })
	}
}
