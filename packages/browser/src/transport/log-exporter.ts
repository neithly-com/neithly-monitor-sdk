import {
  toOtlpLogsRequest,
  type OtlpLogRecord,
  type ShapeOtlpLogRecordInput,
} from '@neithly-com/monitor-core';

/**
 * Metadata needed to wrap log records in the OTLP resource/scope envelope.
 * Mirrors the `meta` argument of `toOtlpLogsRequest`.
 */
export type LogExporterMeta = Pick<
  ShapeOtlpLogRecordInput,
  'release' | 'environment' | 'serviceName' | 'sdkName' | 'sdkVersion'
>;

export interface CreateBrowserLogExporterOptions {
  /** DSN public key — sent as `Authorization: Bearer <publicKey>`. */
  publicKey: string;
  /**
   * Base ingest origin (e.g. `https://ingest.neithly.com`). The exporter
   * POSTs to `<endpoint>/v1/logs`. May include a path prefix; trailing
   * slashes are stripped.
   */
  endpoint: string;
  /** Per-payload resource metadata applied to every send. */
  meta: LogExporterMeta;
  /**
   * Custom fetch implementation. Defaults to `globalThis.fetch`. The exporter
   * does NOT bind `this`, so callers swapping it for a method must pre-bind.
   */
  fetch?: typeof fetch;
}

/** Response surface returned by `send` so callers can decide whether to retry. */
export interface BrowserExporterResult {
  ok: boolean;
  status: number;
}

export interface BrowserLogExporter {
  send(records: OtlpLogRecord[]): Promise<BrowserExporterResult>;
  /** Fully-resolved POST URL (`<endpoint>/v1/logs`). */
  readonly url: string;
}

function joinEndpoint(endpoint: string, suffix: string): string {
  return `${endpoint.replace(/\/+$/, '')}${suffix}`;
}

/**
 * Build a browser-side OTLP log exporter that POSTs `OtlpLogsRequest` JSON
 * to `<endpoint>/v1/logs` using `fetch({ keepalive: true })`.
 *
 * The exporter is stateless beyond its options; multiple instances per app
 * are safe. It does not retry on failure — that is the queue's job.
 */
export function createBrowserLogExporter(
  options: CreateBrowserLogExporterOptions,
): BrowserLogExporter {
  const url = joinEndpoint(options.endpoint, '/v1/logs');
  const fetchImpl = options.fetch ?? globalThis.fetch;

  async function send(
    records: OtlpLogRecord[],
  ): Promise<BrowserExporterResult> {
    const payload = toOtlpLogsRequest(records, options.meta);
    const response = await fetchImpl(url, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.publicKey}`,
      },
      body: JSON.stringify(payload),
    });
    return { ok: response.ok, status: response.status };
  }

  return { send, url };
}
