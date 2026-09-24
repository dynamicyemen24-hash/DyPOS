/**
 * DyPOS OpenTelemetry Setup — Production Observability
 * 
 * Provides: distributed tracing, metrics, structured logging correlation
 * Standards: W3C TraceContext, OpenTelemetry semantic conventions
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { trace, context, SpanStatusCode, propagation, metrics as otelMetrics } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { VERSION } from './version.js';
import { logger } from './logger.js';

const log = logger.create('Telemetry');

let telemetryInitialized = false;
let meterProvider = null;
let prometheusExporter = null;

export function initTelemetry() {
  if (telemetryInitialized) {
    log.warn('Telemetry already initialized');
    return;
  }

  const serviceName = process.env.DYPOS_SERVICE_NAME || 'dypos-server';
  const environment = process.env.NODE_ENV || 'development';

  try {
    // 1. Resource identification
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: VERSION,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
      [SemanticResourceAttributes.HOST_NAME]: process.env.HOSTNAME || 'unknown',
      [SemanticResourceAttributes.PROCESS_PID]: process.pid,
    });

    // 2. Trace provider with W3C TraceContext propagation
    const tracerProvider = new NodeTracerProvider({ resource });
    tracerProvider.register({
      propagator: new W3CTraceContextPropagator(),
    });

    // 3. HTTP/Express instrumentations
    registerInstrumentations({
      instrumentations: [
        new HttpInstrumentation({
          // Ignore health checks to reduce noise
          ignoreIncomingPaths: ['/api/health', '/api/ready', '/api/metrics'],
          ignoreOutgoingUrls: [/health/, /ready/],
        }),
        new ExpressInstrumentation({
          // Custom span names for better readability
          requestHook: (span, req) => {
            span.setAttribute('http.route', req.route?.path || req.path);
            span.setAttribute('http.request_id', req.id);
          },
        }),
      ],
      tracerProvider,
    });

    // 4. Metrics with Prometheus exporter
    try {
      prometheusExporter = new PrometheusExporter({
        port: Number(process.env.DYPOS_OTEL_METRICS_PORT) || 9464,
        endpoint: '/metrics',
      }, () => {
        log.info('Prometheus metrics exporter started', { port: prometheusExporter.port });
      });

      meterProvider = new MeterProvider({
        resource,
        readers: [
          new PeriodicExportingMetricReader({
            exporter: prometheusExporter,
            exportIntervalMillis: 15000,
          }),
        ],
      });

      otelMetrics.setGlobalMeterProvider(meterProvider);
    } catch (e) {
      log.warn('Metrics initialization failed', { error: e.message });
    }

    // 5. Custom metrics for business observability (never require() in ESM)
    const meter = meterProvider?.getMeter?.(serviceName)
      || otelMetrics.getMeter(serviceName);

    const invoiceCreated = meter.createCounter('dypos.invoices.created', {
      description: 'Number of invoices created',
      unit: '1',
    });
    const syncOperations = meter.createCounter('dypos.sync.operations', {
      description: 'Sync operations by type and status',
      unit: '1',
    });
    const activeSessions = meter.createUpDownCounter('dypos.sessions.active', {
      description: 'Currently active POS sessions',
      unit: '1',
    });
    const apiLatency = meter.createHistogram('dypos.api.latency', {
      description: 'API request latency',
      unit: 'ms',
    });
    const dbQueryLatency = meter.createHistogram('dypos.db.query_latency', {
      description: 'Database query latency',
      unit: 'ms',
    });
    const errorsTotal = meter.createCounter('dypos.errors.total', {
      description: 'Total errors by type',
      unit: '1',
    });

    global.dyposMetrics = {
      invoiceCreated,
      syncOperations,
      activeSessions,
      apiLatency,
      dbQueryLatency,
      errorsTotal,
    };

    telemetryInitialized = true;
    log.info('OpenTelemetry initialized', { serviceName, environment, version: VERSION });
  } catch (e) {
    // Degraded mode: never crash boot because observability failed.
    log.warn('Telemetry init failed — continuing without OTEL', { error: e.message });
    telemetryInitialized = false;
  }
}

export function getTracer(name = 'dypos') {
  return trace.getTracer(name, VERSION);
}

export function getMeter(name = 'dypos') {
  if (!telemetryInitialized) {
    try { initTelemetry(); } catch { /* degraded: plain no-op meter */ }
  }
  try {
    return otelMetrics.getMeter(name, VERSION);
  } catch {
    return otelMetrics.getMeter(name);
  }
}

/**
 * Wrap async function with tracing
 */
export async function withTrace(spanName, fn, attributes = {}) {
  const tracer = getTracer();
  return tracer.startActiveSpan(spanName, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Extract trace context from headers (for incoming requests)
 */
export function extractTraceContext(headers) {
  return propagation.extract(context.active(), headers);
}

/**
 * Inject trace context into headers (for outgoing requests)
 */
export function injectTraceContext(headers = {}) {
  const carrier = {};
  propagation.inject(context.active(), carrier);
  return { ...headers, ...carrier };
}

/**
 * Create child span for database operations
 */
export async function traceDbOperation(operation, query, fn) {
  const tracer = getTracer('dypos.db');
  return tracer.startActiveSpan(`db.${operation}`, {
    attributes: {
      'db.operation': operation,
      'db.statement': query?.substring(0, 500),
      'db.system': 'sqlite',
    },
  }, async (span) => {
    const start = Date.now();
    try {
      const result = await fn();
      span.setAttribute('db.duration_ms', Date.now() - start);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setAttribute('db.duration_ms', Date.now() - start);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Graceful shutdown
 */
export async function shutdownTelemetry() {
  if (prometheusExporter) {
    await prometheusExporter.shutdown();
  }
  if (meterProvider) {
    await meterProvider.shutdown();
  }
  telemetryInitialized = false;
  log.info('Telemetry shutdown complete');
}

// Auto-initialize in production — opt-in only, never crash boot.
if (
  process.env.NODE_ENV === 'production'
  && process.env.DYPOS_OTEL !== '0'
  && !process.argv.some((a) => a.includes('test'))
) {
  try { initTelemetry(); } catch { /* degrade without OTEL */ }
}