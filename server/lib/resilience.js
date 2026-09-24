/**
 * DyPOS Resilience Patterns — Circuit Breaker, Retry, Timeout, Bulkhead
 * 
 * Production-grade fault tolerance for external dependencies
 */

import { logger } from './logger.js';
import { getTracer } from './telemetry.js';

const log = logger.create('Resilience');

// ──────────────────────────────────────────────────────────────────────────────
// Circuit Breaker States
// ──────────────────────────────────────────────────────────────────────────────

export const CircuitState = {
  CLOSED: 'closed',     // Normal operation, requests pass through
  OPEN: 'open',         // Failing, requests fail fast
  HALF_OPEN: 'half_open', // Testing if service recovered
};

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();

    // Configurable thresholds
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000; // ms before trying half-open
    this.halfOpenRequests = 0;
    this.maxHalfOpenRequests = options.maxHalfOpenRequests || 3;

    // Metrics
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.totalRejected = 0;

    this.tracer = getTracer('dypos.resilience');
  }

  async execute(operation) {
    this.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.transitionToHalfOpen();
      } else {
        this.totalRejected++;
        const error = new Error(`Circuit breaker ${this.name} is OPEN`);
        error.code = 'CIRCUIT_OPEN';
        error.circuitName = this.name;
        throw error;
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenRequests >= this.maxHalfOpenRequests) {
        this.totalRejected++;
        const error = new Error(`Circuit breaker ${this.name} half-open limit reached`);
        error.code = 'CIRCUIT_HALF_OPEN_LIMIT';
        throw error;
      }
      this.halfOpenRequests++;
    }

    return this.tracer.startActiveSpan(`circuit.${this.name}`, async (span) => {
      span.setAttribute('circuit.name', this.name);
      span.setAttribute('circuit.state', this.state);

      try {
        const result = await operation();
        this.onSuccess();
        span.setStatus({ code: 0 }); // OK
        return result;
      } catch (error) {
        this.onFailure();
        span.setStatus({ code: 2, message: error.message }); // ERROR
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  onSuccess() {
    this.totalSuccesses++;
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  onFailure() {
    this.totalFailures++;
    this.failureCount++;
    this.successCount = 0;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.failureThreshold) {
      this.transitionToOpen();
    }
  }

  transitionToOpen() {
    this.state = CircuitState.OPEN;
    this.lastStateChange = Date.now();
    log.warn('Circuit breaker OPENED', {
      name: this.name,
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
    });
  }

  transitionToHalfOpen() {
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;
    this.halfOpenRequests = 0;
    this.lastStateChange = Date.now();
    log.info('Circuit breaker HALF_OPEN', { name: this.name });
  }

  transitionToClosed() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();
    log.info('Circuit breaker CLOSED', { name: this.name });
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      totalRejected: this.totalRejected,
      uptime: Date.now() - this.lastStateChange,
      lastFailure: this.lastFailureTime,
    };
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenRequests = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────────────────────────────────────

const circuits = new Map();

export function getCircuitBreaker(name, options) {
  if (!circuits.has(name)) {
    circuits.set(name, new CircuitBreaker(name, options));
  }
  return circuits.get(name);
}

export function getAllCircuitStats() {
  const stats = {};
  for (const [name, circuit] of circuits) {
    stats[name] = circuit.getStats();
  }
  return stats;
}

export function resetAllCircuits() {
  for (const circuit of circuits.values()) {
    circuit.reset();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Retry with Exponential Backoff
// ──────────────────────────────────────────────────────────────────────────────

export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 100,
    maxDelay = 5000,
    backoffMultiplier = 2,
    jitter = 0.1,
    retryable = () => true,
    onRetry = (_attempt, _error, _delay) => {},
  } = options;

  let lastError;
  let delay = baseDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !retryable(error)) {
        throw error;
      }

      const jitterAmount = delay * jitter * Math.random();
      const actualDelay = Math.min(delay + jitterAmount, maxDelay);

      onRetry(attempt, error, actualDelay);

      await new Promise(resolve => setTimeout(resolve, actualDelay));
      delay *= backoffMultiplier;
    }
  }

  throw lastError;
}

// ──────────────────────────────────────────────────────────────────────────────
// Timeout Wrapper
// ──────────────────────────────────────────────────────────────────────────────

export function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`${label} timed out after ${ms}ms`);
        error.code = 'TIMEOUT';
        error.timeout = ms;
        reject(error);
      }, ms);
      // Store timer for cleanup
      promise._timeoutTimer = timer;
    }),
  ]).finally(() => {
    if (promise._timeoutTimer) {
      clearTimeout(promise._timeoutTimer);
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Bulkhead (Concurrency Limiter)
// ──────────────────────────────────────────────────────────────────────────────

export class Bulkhead {
  constructor(name, maxConcurrent = 10, maxQueue = 100) {
    this.name = name;
    this.maxConcurrent = maxConcurrent;
    this.maxQueue = maxQueue;
    this.current = 0;
    this.queue = [];
    this.stats = { total: 0, rejected: 0, completed: 0, failed: 0 };
  }

  async execute(fn) {
    this.stats.total++;

    if (this.current >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueue) {
        this.stats.rejected++;
        throw new Error(`Bulkhead ${this.name} queue full`);
      }

      // Wait for slot
      return new Promise((resolve, reject) => {
        this.queue.push({ resolve, reject, fn });
      });
    }

    this.current++;
    try {
      const result = await fn();
      this.stats.completed++;
      return result;
    } catch (error) {
      this.stats.failed++;
      throw error;
    } finally {
      this.current--;
      this.processQueue();
    }
  }

  processQueue() {
    while (this.current < this.maxConcurrent && this.queue.length > 0) {
      const { resolve, reject, fn } = this.queue.shift();
      this.current++;
      fn().then(resolve).catch(reject).finally(() => {
        this.current--;
        this.processQueue();
      });
    }
  }

  getStats() {
    return { ...this.stats, current: this.current, queued: this.queue.length };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Composite Resilience Wrapper
// ──────────────────────────────────────────────────────────────────────────────

export async function resilientCall(fn, options = {}) {
  const {
    circuitBreaker,
    retry,
    timeout,
    bulkhead,
    fallback,
  } = options;

  let operation = fn;

  // Wrap with bulkhead
  if (bulkhead) {
    const bh = bulkhead instanceof Bulkhead ? bulkhead : new Bulkhead(bulkhead.name, bulkhead.maxConcurrent);
    const originalOp = operation;
    operation = () => bh.execute(originalOp);
  }

  // Wrap with timeout
  if (timeout) {
    const originalOp = operation;
    operation = () => withTimeout(originalOp(), timeout.ms, timeout.label);
  }

  // Wrap with retry
  if (retry) {
    const originalOp = operation;
    operation = () => withRetry(originalOp, retry);
  }

  // Wrap with circuit breaker
  if (circuitBreaker) {
    const cb = circuitBreaker instanceof CircuitBreaker ? circuitBreaker : getCircuitBreaker(circuitBreaker.name, circuitBreaker.options);
    const originalOp = operation;
    operation = () => cb.execute(originalOp);
  }

  try {
    return await operation();
  } catch (error) {
    if (fallback) {
      log.info('Executing fallback', { error: error.message });
      return await fallback(error);
    }
    throw error;
  }
}