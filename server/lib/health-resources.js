/**
 * Host-resource health checks: memory pressure and free disk.
 *
 * These two used to live inline in `server.js`, which pushed that file past its
 * measured size cap. They are extracted here so the cap can move DOWN, and so
 * the reasoning behind the memory verdict has room to be explained — which it
 * badly needed, because the first version of it was wrong in a way that quietly
 * stopped the whole container stack from booting.
 */
import { dirname, join } from "node:path";

/**
 * The budget the compose file reserves for the app (512M). RSS is the pressure
 * signal an orchestrator can act on, and it is comparable across restarts.
 */
const MEMORY_BUDGET_MB = Number(process.env.DYPOS_MEMORY_BUDGET_MB || 512);

/**
 * `heapTotal` is V8's CURRENT allocation target, not a budget. Right after boot
 * it is still small, so `heapUsed / heapTotal` reads ~92% on a process holding
 * 78 MB RSS with 18 MB actually used — a perfectly healthy server declaring
 * itself unhealthy.
 *
 * That is not cosmetic. `docker-compose.yml` health-checks `/api/ready` for a
 * 200, so a freshly started container was marked unhealthy on boot and every
 * sidecar gated on `depends_on: service_healthy` (backup, cloudflared) never
 * launched — the end-to-end deploy stood still with no error anywhere. The
 * ratio only carries meaning once V8 has grown the heap past this floor.
 */
const HEAP_RATIO_FLOOR_MB = 64;

/** Memory pressure. Healthy until RSS hits the budget, or a grown heap saturates. */
export async function memoryCheck() {
  const mem = process.memoryUsage();
  const rssMb = mem.rss / 1048576;
  const heapTotalMb = mem.heapTotal / 1048576;
  const heapUsagePercent = (mem.heapUsed / mem.heapTotal) * 100;

  const overBudget = rssMb >= MEMORY_BUDGET_MB;
  const heapSaturated = heapTotalMb >= HEAP_RATIO_FLOOR_MB && heapUsagePercent >= 90;

  return {
    healthy: !overBudget && !heapSaturated,
    details: {
      rss_mb: Math.round(rssMb),
      heap_mb: Math.round(mem.heapUsed / 1048576),
      heap_usage_percent: Math.round(heapUsagePercent),
      budget_mb: MEMORY_BUDGET_MB,
    },
  };
}

/** Free space on the volume holding the database. */
export async function diskCheck() {
  try {
    const { statfsSync } = await import("node:fs");
    const dataDir = process.env.DYPOS_DB_PATH && process.env.DYPOS_DB_PATH !== ":memory:"
      ? dirname(process.env.DYPOS_DB_PATH)
      : join(__dirname, "..", "data");
    const st = statfsSync(dataDir);
    if (st && typeof st.bfree === "number") {
      return {
        healthy: true,
        details: { free_mb: Math.round((Number(st.bfree) * Number(st.bsize)) / 1048576) },
      };
    }
    return { healthy: true, details: { error: "unavailable" } };
  } catch (e) {
    return { healthy: false, error: e.message };
  }
}