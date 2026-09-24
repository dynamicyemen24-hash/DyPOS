const API_BASE = import.meta.env.VITE_DYPOS_API || "/api"

function authHeaders(extra = {}) {
	const headers = { Accept: "application/json", ...extra }
	const token = localStorage.getItem("dypos_token")
	if (token) headers.Authorization = `Bearer ${token}`
	return headers
}

async function request(path, options = {}) {
	const res = await fetch(`${API_BASE}${path}`, {
		...options,
		headers: authHeaders(options.headers || {}),
	})
	if (res.status === 401) {
		throw new Error("غير مصرح — يرجى تسجيل الدخول")
	}
	const ct = res.headers.get("content-type") || ""
	if (!res.ok) {
		let message = `فشل الطلب (${res.status})`
		try {
			if (ct.includes("application/json")) {
				const data = await res.json()
				if (data?.error) message = data.error
			}
		} catch {
			/* ignore body parse */
		}
		throw new Error(message)
	}
	if (options.raw) return res
	if (ct.includes("application/json")) return res.json()
	return res.text()
}

export function apiGet(path, params) {
	const qs = params
		? `?${new URLSearchParams(
				Object.entries(params).filter(([, v]) => v !== "" && v != null),
			).toString()}`
		: ""
	return request(`${path}${qs}`)
}

export function apiPost(path, body) {
	return request(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body ?? {}),
	})
}

export function apiPostRaw(path, body, contentType) {
	return request(path, {
		method: "POST",
		headers: { "Content-Type": contentType },
		body,
	})
}

export function apiDownload(path, params) {
	const qs = params
		? `?${new URLSearchParams(
				Object.entries(params).filter(([, v]) => v !== "" && v != null),
			).toString()}`
		: ""
	return request(`${path}${qs}`, { raw: true })
}
