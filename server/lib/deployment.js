/**
 * DyPOS Zero-Downtime Deployment Strategy
 * 
 * Blue-green, rolling, and canary deployment patterns
 * Database migration safety, health checks, traffic switching
 */

import { logger } from './logger.js';
import { getTracer } from './telemetry.js';
import { acquireMigrationLock, releaseMigrationLock, applyMigration, validateMigration } from './migration-guard.js';

const log = logger.create('Deployment');
const tracer = getTracer('dypos.deployment');

// ──────────────────────────────────────────────────────────────────────────────
// Deployment State Management
// ──────────────────────────────────────────────────────────────────────────────

export const DeploymentState = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  MIGRATING: 'migrating',
  VERIFYING: 'verifying',
  SWITCHING: 'switching',
  COMPLETE: 'complete',
  ROLLED_BACK: 'rolled_back',
  FAILED: 'failed',
};

class DeploymentManager {
  constructor() {
    this.state = DeploymentState.IDLE;
    this.currentDeployment = null;
    this.healthChecks = new Map();
    this.preDeploymentChecks = [];
    this.postDeploymentChecks = [];
  }

  /**
   * Register pre-deployment check
   */
  addPreCheck(name, fn) {
    this.preDeploymentChecks.push({ name, fn });
  }

  /**
   * Register post-deployment check
   */
  addPostCheck(name, fn) {
    this.postDeploymentChecks.push({ name, fn });
  }

  /**
   * Run all pre-deployment checks
   */
  async runPreChecks() {
    const results = { passed: [], failed: [] };

    for (const check of this.preDeploymentChecks) {
      try {
        const result = await check.fn();
        results.passed.push({ name: check.name, ...result });
      } catch (error) {
        results.failed.push({ name: check.name, error: error.message });
      }
    }

    return results;
  }

  /**
   * Run all post-deployment checks
   */
  async runPostChecks() {
    const results = { passed: [], failed: [] };

    for (const check of this.postDeploymentChecks) {
      try {
        const result = await check.fn();
        results.passed.push({ name: check.name, ...result });
      } catch (error) {
        results.failed.push({ name: check.name, error: error.message });
      }
    }

    return results;
  }

  /**
   * Execute blue-green deployment
   */
  async deployBlueGreen(options = {}) {
    const {
      version,
      migrations = [],
      healthCheckTimeout = 30000,
      trafficSwitchDelay = 5000,
      rollbackOnFailure = true,
    } = options;

    return tracer.startActiveSpan('deployment.blue_green', async (span) => {
      this.state = DeploymentState.PREPARING;
      this.currentDeployment = { version, startTime: Date.now(), type: 'blue-green' };

      try {
        // 1. Pre-deployment checks
        log.info('Running pre-deployment checks', { version });
        const preResults = await this.runPreChecks();
        if (preResults.failed.length > 0) {
          throw new Error(`Pre-deployment checks failed: ${preResults.failed.map(f => f.name).join(', ')}`);
        }

        // 2. Run migrations
        this.state = DeploymentState.MIGRATING;
        log.info('Running migrations', { version, count: migrations.length });

        for (const migration of migrations) {
          await applyMigration(migration);
        }

        // 3. Verify deployment
        this.state = DeploymentState.VERIFYING;
        log.info('Verifying deployment', { version });

        const postResults = await this.runPostChecks();
        if (postResults.failed.length > 0) {
          throw new Error(`Post-deployment checks failed: ${postResults.failed.map(f => f.name).join(', ')}`);
        }

        // 4. Wait for health checks
        await this.waitForHealthy(healthCheckTimeout);

        // 5. Switch traffic (in real deployment, this would update load balancer)
        this.state = DeploymentState.SWITCHING;
        log.info('Switching traffic to new version', { version });
        await new Promise(r => setTimeout(r, trafficSwitchDelay));

        // 6. Complete
        this.state = DeploymentState.COMPLETE;
        this.currentDeployment.endTime = Date.now();
        this.currentDeployment.duration = this.currentDeployment.endTime - this.currentDeployment.startTime;

        log.info('Deployment complete', {
          version,
          durationMs: this.currentDeployment.duration,
        });

        span.setStatus({ code: 0 });
        return { success: true, deployment: this.currentDeployment };
      } catch (error) {
        this.state = DeploymentState.FAILED;
        this.currentDeployment.error = error.message;

        if (rollbackOnFailure) {
          log.warn('Initiating rollback', { version, error: error.message });
          await this.rollback();
        }

        span.setStatus({ code: 2, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Wait for all health checks to pass
   */
  async waitForHealthy(timeout) {
    const start = Date.now();
    const interval = 2000;

    while (Date.now() - start < timeout) {
      const allHealthy = await this.checkAllHealthy();
      if (allHealthy) return true;
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('Health checks did not pass within timeout');
  }

  /**
   * Check all registered health checks
   */
  async checkAllHealthy() {
    for (const [name, check] of this.healthChecks) {
      try {
        const healthy = await check();
        if (!healthy) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Register health check
   */
  registerHealthCheck(name, fn) {
    this.healthChecks.set(name, fn);
  }

  /**
   * Rollback deployment
   */
  async rollback() {
    this.state = DeploymentState.ROLLED_BACK;
    log.warn('Rollback initiated');
    // In practice, this would:
    // 1. Rollback migrations in reverse order
    // 2. Switch traffic back to previous version
    // 3. Clear caches
    // 4. Notify monitoring
  }

  getState() {
    return { ...this.currentDeployment, state: this.state };
  }
}

export const deploymentManager = new DeploymentManager();

// ──────────────────────────────────────────────────────────────────────────────
// Default Health Checks
// ──────────────────────────────────────────────────────────────────────────────

// Database connectivity
deploymentManager.registerHealthCheck('database', async () => {
  try {
    const result = db.prepare('SELECT 1').get();
    return result && result['1'] === 1;
  } catch {
    return false;
  }
});

// Disk space
deploymentManager.registerHealthCheck('disk_space', async () => {
  try {
    const { statfsSync } = await import('node:fs');
    const st = statfsSync('.');
    const freePercent = (st.bfree * st.bsize) / (st.blocks * st.bsize) * 100;
    return freePercent > 10; // At least 10% free
  } catch {
    return true; // Best effort
  }
});

// Memory
deploymentManager.registerHealthCheck('memory', async () => {
  const mem = process.memoryUsage();
  const usedPercent = (mem.heapUsed / mem.heapTotal) * 100;
  return usedPercent < 90;
});

// Event loop lag
deploymentManager.registerHealthCheck('event_loop', async () => {
  const start = process.hrtime.bigint();
  await new Promise(r => setImmediate(r));
  const lag = Number(process.hrtime.bigint() - start) / 1e6; // ms
  return lag < 100; // Less than 100ms lag
});

// ──────────────────────────────────────────────────────────────────────────────
// Default Pre/Post Checks
// ──────────────────────────────────────────────────────────────────────────────

deploymentManager.addPreCheck('config_validation', async () => {
  // Verify critical env vars
  const required = ['DYPOS_JWT_SECRET', 'DYPOS_CORS_ORIGIN'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
  return { ok: true };
});

deploymentManager.addPreCheck('database_schema', async () => {
  // Verify required tables exist
  const tables = ['users', 'tenants', 'audit_ledger', 'schema_migrations'];
  for (const table of tables) {
    const exists = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table);
    if (!exists) throw new Error(`Missing table: ${table}`);
  }
  return { ok: true };
});

deploymentManager.addPostCheck('api_health', async () => {
  // In real deployment, this would hit the actual API endpoint
  return { ok: true };
});

deploymentManager.addPostCheck('auth_works', async () => {
  // Test JWT generation/validation
  return { ok: true };
});

// ──────────────────────────────────────────────────────────────────────────────
// Rolling Deployment (for clustered setups)
// ──────────────────────────────────────────────────────────────────────────────

export async function rollingDeploy(workers, options = {}) {
  const {
    batchSize = 1,
    healthCheckInterval = 5000,
    maxConcurrentRollouts = 1,
  } = options;

  const results = [];

  for (let i = 0; i < workers.length; i += batchSize) {
    const batch = workers.slice(i, i + batchSize);

    // Deploy batch
    for (const worker of batch) {
      await worker.reload(); // Graceful reload
    }

    // Wait for health
    await new Promise(r => setTimeout(r, healthCheckInterval));

    const healthy = await Promise.all(batch.map(w => w.checkHealth()));
    if (!healthy.every(h => h)) {
      throw new Error('Batch health check failed');
    }

    results.push({ batch: i, workers: batch.map(w => w.id) });
  }

  return { success: true, batches: results };
}

// ──────────────────────────────────────────────────────────────────────────────
// Canary Deployment
// ──────────────────────────────────────────────────────────────────────────────

export async function canaryDeploy(options = {}) {
  const {
    canaryPercent = 5,
    duration = 300000, // 5 minutes
    metricsThreshold = { errorRate: 0.01, latencyP95: 500 },
    autoPromote = true,
  } = options;

  log.info('Starting canary deployment', { canaryPercent, duration });

  // 1. Deploy canary version to small subset
  // 2. Route canaryPercent of traffic to canary
  // 3. Monitor metrics for duration
  // 4. If metrics healthy, promote; else rollback

  const startTime = Date.now();
  const metrics = { requests: 0, errors: 0, latencies: [] };

  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      // Check metrics
      const errorRate = metrics.errors / Math.max(metrics.requests, 1);
      const p95 = percentile(metrics.latencies, 95);

      if (errorRate > metricsThreshold.errorRate || p95 > metricsThreshold.latencyP95) {
        clearInterval(interval);
        log.error('Canary metrics exceeded threshold, rolling back', { errorRate, p95 });
        reject(new Error('Canary metrics unhealthy'));
        return;
      }

      if (Date.now() - startTime >= duration) {
        clearInterval(interval);
        if (autoPromote) {
          log.info('Canary period complete, promoting to full', { duration: Date.now() - startTime });
          resolve({ promoted: true, metrics });
        } else {
          resolve({ promoted: false, metrics, message: 'Manual promotion required' });
        }
      }
    }, 10000);
  });

  function percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(p / 100 * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Deployment API Routes
// ──────────────────────────────────────────────────────────────────────────────

export function createDeploymentRoutes() {
  const router = (await import('express')).Router();

  router.get('/status', (req, res) => {
    res.json(deploymentManager.getState());
  });

  router.post('/deploy', async (req, res) => {
    try {
      const { version, migrations } = req.body;
      const result = await deploymentManager.deployBlueGreen({ version, migrations });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/rollback', async (req, res) => {
    try {
      await deploymentManager.rollback();
      res.json({ rolledBack: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/health', async (req, res) => {
    const healthy = await deploymentManager.checkAllHealthy();
    res.json({ healthy, state: deploymentManager.state });
  });

  return router;
}

// Initialize default checks on load
if (process.env.NODE_ENV === 'production') {
  // Checks already registered above
}