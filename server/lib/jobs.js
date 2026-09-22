/**
 * DyPOS Jobs — tiny in-process background job manager (no dependency).
 *
 * For millions-scale exports: the sync GET /api/export/:entity caps at 10k rows
 * to protect the event loop. Jobs lift the cap to 100k by paging (2000/chunk)
 * with `setImmediate` yields, reporting progress, and holding the finished
 * payload in memory for 10 minutes for download.
 *
 * Single-tenant scope: jobs live per-process. Behind N replicas, clients must
 * use sticky reads or poll the same node (documented in SCALING_MILLIONS.md).
 * Tier-2 evolution: persist jobs in Postgres + object storage (S3).
 */
import crypto from 'crypto';

const MAX_JOBS = 50;
const RESULT_TTL_MS = 10 * 60 * 1000;
const jobs = new Map(); // id -> job

function prune() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (j.finishedAt && now - j.finishedAt > RESULT_TTL_MS) jobs.delete(id);
  }
  while (jobs.size > MAX_JOBS) {
    const first = jobs.keys().next().value;
    if (first === undefined) break;
    jobs.delete(first);
  }
}

export function createJob(kind, params = {}) {
  prune();
  const id = crypto.randomUUID();
  const job = {
    id, kind,
    params,
    status: 'QUEUED', // QUEUED → RUNNING → DONE | FAILED
    progress: { processed: 0, total: null },
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(String(id).slice(0, 64)) || null;
}

export function listJobs() {
  prune();
  return [...jobs.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((j) => ({
      id: j.id, kind: j.kind, status: j.status,
      progress: j.progress, error: j.error,
      createdAt: j.createdAt, finishedAt: j.finishedAt,
      count: j.result?.count ?? null,
    }));
}

/** Run fn(job) in background without blocking the request. */
export function runInBackground(job, fn) {
  job.status = 'RUNNING';
  setImmediate(async () => {
    try {
      await fn(job);
      if (job.status === 'RUNNING') job.status = 'DONE';
    } catch (e) {
      job.status = 'FAILED';
      job.error = String(e.message || 'job failed').slice(0, 300);
    } finally {
      job.finishedAt = Date.now();
    }
  });
  return job;
}
