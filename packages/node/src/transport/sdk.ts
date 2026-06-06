// NodeSDK assembly for neithly-monitor.
//
// `buildNodeSdk` is the entry point used by the higher-level `init()` helper:
// it parses the DSN, resolves the three signal endpoints, wires the bearer
// auth on every exporter, and returns an unstarted `NodeSDK` instance with
// batch processors + a ratio-based trace sampler + the `service.name`,
// `service.version`, `deployment.environment` resource attributes.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import {
  BatchSpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { parseDsn, resolveEndpoints } from '@neithly-com/monitor-core';

import { createLogExporter } from './log-exporter.js';
import { createMetricExporter } from './metric-exporter.js';
import { createTraceExporter } from './trace-exporter.js';

export interface BuildNodeSdkOptions {
  /** Neithly-monitor DSN — `nmk_<env>_<hex>` or raw 64-char hex. */
  dsn: string;
  /** Base ingest origin, e.g. `https://ingest.neithly.com`. */
  endpoint: string;
  /** Service identifier (`service.name`). */
  serviceName: string;
  /** Optional service version (`service.version`). */
  release?: string;
  /** Optional deployment environment override (`deployment.environment.name`). */
  environment?: string;
  /** Trace head-sampling rate (`TraceIdRatioBasedSampler`). Defaults to 1.0. */
  sampling?: number;
}

/**
 * Assemble (but do not start) an OpenTelemetry `NodeSDK` wired for the
 * neithly-monitor ingest. The returned instance must be `.start()`-ed by the
 * caller and `.shutdown()`-ed at process exit.
 */
export function buildNodeSdk(options: BuildNodeSdkOptions): NodeSDK {
  const { publicKey, environment: dsnEnvironment } = parseDsn(options.dsn);
  const endpoints = resolveEndpoints(options.endpoint);

  // `resolveEndpoints` already returns the final `/v1/<signal>` URLs; pass
  // them as the explicit endpoint so the exporter does not append a second
  // suffix.
  const logExporter = createLogExporter({
    publicKey,
    endpoint: stripSignalSuffix(endpoints.logs, '/v1/logs'),
  });
  const traceExporter = createTraceExporter({
    publicKey,
    endpoint: stripSignalSuffix(endpoints.traces, '/v1/traces'),
  });
  const metricExporter = createMetricExporter({
    publicKey,
    endpoint: stripSignalSuffix(endpoints.metrics, '/v1/metrics'),
  });

  const samplingRatio = options.sampling ?? 1;
  const sampler = new TraceIdRatioBasedSampler(samplingRatio);

  const environment = options.environment ?? dsnEnvironment ?? undefined;

  const resourceAttributes: Record<string, string> = {
    [ATTR_SERVICE_NAME]: options.serviceName,
  };
  if (options.release !== undefined) {
    resourceAttributes[ATTR_SERVICE_VERSION] = options.release;
  }
  if (environment !== undefined) {
    resourceAttributes[ATTR_DEPLOYMENT_ENVIRONMENT_NAME] = environment;
  }

  const resource = resourceFromAttributes(resourceAttributes);

  return new NodeSDK({
    resource,
    sampler,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],
    metricReaders: [
      new PeriodicExportingMetricReader({ exporter: metricExporter }),
    ],
  });
}

function stripSignalSuffix(url: string, suffix: string): string {
  return url.endsWith(suffix) ? url.slice(0, -suffix.length) : url;
}
