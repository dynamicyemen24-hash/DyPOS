/**
 * DyPOS Feature Flag Routes.
 *
 * GET  /api/features        → public-safe exposed allowlist only (billing and
 *                             pricing gated flags are NEVER leaked).
 * PUT  /api/features/:name  → ADMIN-only (requireRole guard as in routes/admin.js).
 *
 * Mounted by the orchestrator via registerObservability(app) / registerFeatures(app)
 * on the `/api` prefix. For GET to stay public in the real server.js chain it must
 * be mounted BEFORE the shared authMiddleware blocks (server.js registers
 * `app.use('/api', authMiddleware, ...)` for the protected routers).
 */
import { Router } from "express"
import { requireRole } from "../middleware/auth.js"
import { listFeatures, setFeatureFlag, cacheTtlMs } from "../lib/features.js"

const router = Router()
const mountedApps = new WeakSet()

router.get("/features", (_req, res) => {
	const exposed = listFeatures().filter((f) => f.exposed)
	return res.json({
		features: exposed.map((f) => ({
			name: f.name,
			enabled: f.enabled,
			source: f.source,
			default: f.default,
			note: String(f.note || "").slice(0, 200),
		})),
		ttl_seconds: Math.max(1, Math.round(cacheTtlMs() / 1000)),
	})
})

router.put("/features/:name", requireRole("ADMIN"), (req, res) => {
	let result
	try {
		result = setFeatureFlag(req.params.name, req.body?.enabled, req.body?.note)
	} catch (e) {
		if (e instanceof TypeError) {
			return res.status(400).json({ error: "اسم الميزة أو قيمتها غير صالح" })
		}
		return res
			.status(500)
			.json({ error: String(e?.message || e).slice(0, 200) })
	}
	req.audit?.("features.update", { flag: result.flag, enabled: result.enabled })
	return res.json({
		flag: result.flag,
		enabled: result.enabled,
		source: result.source,
		default: result.default,
		overridden_by_env: result.overridden_by_env,
		note: String(result.note || "").slice(0, 300),
	})
})

/**
 * Idempotent router mount onto `/api`. Safe to call on the shared server app
 * (returns false on repeat) and on a bare app.
 * @param {import('express').Express} app
 * @returns {boolean} true when mounted by this call
 */
export function registerFeatures(app) {
	if (!app || typeof app.use !== "function" || mountedApps.has(app))
		return false
	app.use("/api", router)
	mountedApps.add(app)
	return true
}

export default router
