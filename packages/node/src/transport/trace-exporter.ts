// Trace exporter wiring — wraps @opentelemetry/exporter-trace-otlp-http with
// the neithly-monitor `Authorization: Bearer <publicKey>` header and routes to
// `<endpoint>/v1/traces`.

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export interface CreateTraceExporterOptions {
  /** Public key from the parsed DSN — used as the bearer token. */
  publicKey: string;
  /** Base ingest endpoint (no trailing `/v1/traces`). */
  endpoint: string;
}

function joinUrl(base: string, suffix: string): string {
  return `${base.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;
}

/**
 * Build an OTLP traces exporter targeting `<endpoint>/v1/traces` with a bearer
 * `Authorization` header derived from the DSN public key.
 */
export function createTraceExporter(
  options: CreateTraceExporterOptions,
): OTLPTraceExporter {
  const url = joinUrl(options.endpoint, 'v1/traces');
  return new OTLPTraceExporter({
    url,
    headers: {
      Authorization: `Bearer ${options.publicKey}`,
    },
  });
}
