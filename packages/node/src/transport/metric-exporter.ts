// Metric exporter wiring — wraps @opentelemetry/exporter-metrics-otlp-http with
// the neithly-monitor `Authorization: Bearer <publicKey>` header and routes to
// `<endpoint>/v1/metrics`.

import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

export interface CreateMetricExporterOptions {
  /** Public key from the parsed DSN — used as the bearer token. */
  publicKey: string;
  /** Base ingest endpoint (no trailing `/v1/metrics`). */
  endpoint: string;
}

function joinUrl(base: string, suffix: string): string {
  return `${base.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;
}

/**
 * Build an OTLP metrics exporter targeting `<endpoint>/v1/metrics` with a
 * bearer `Authorization` header derived from the DSN public key.
 */
export function createMetricExporter(
  options: CreateMetricExporterOptions,
): OTLPMetricExporter {
  const url = joinUrl(options.endpoint, 'v1/metrics');
  return new OTLPMetricExporter({
    url,
    headers: {
      Authorization: `Bearer ${options.publicKey}`,
    },
  });
}
