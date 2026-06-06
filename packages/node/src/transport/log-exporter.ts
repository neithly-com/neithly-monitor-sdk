// Log exporter wiring — wraps @opentelemetry/exporter-logs-otlp-http with the
// neithly-monitor `Authorization: Bearer <publicKey>` header and routes to
// `<endpoint>/v1/logs`.

import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';

export interface CreateLogExporterOptions {
  /** Public key from the parsed DSN — used as the bearer token. */
  publicKey: string;
  /** Base ingest endpoint (no trailing `/v1/logs`). e.g. `https://ingest.neithly.com`. */
  endpoint: string;
}

function joinUrl(base: string, suffix: string): string {
  return `${base.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;
}

/**
 * Build an OTLP logs exporter targeting `<endpoint>/v1/logs` with a bearer
 * `Authorization` header derived from the DSN public key.
 */
export function createLogExporter(
  options: CreateLogExporterOptions,
): OTLPLogExporter {
  const url = joinUrl(options.endpoint, 'v1/logs');
  return new OTLPLogExporter({
    url,
    headers: {
      Authorization: `Bearer ${options.publicKey}`,
    },
  });
}
