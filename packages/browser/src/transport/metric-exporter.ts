/**
 * Browser-side OTLP/HTTP exporter for metric data points.
 *
 * Mirrors `createBrowserLogExporter` but for `/v1/metrics`. The core SDK does
 * not yet ship a `toOtlpMetricsRequest` helper, so this exporter accepts an
 * already-shaped OTLP `ExportMetricsServiceRequest`-compatible payload and
 * stringifies it as-is.
 */

export interface CreateBrowserMetricExporterOptions {
  /** DSN public key — sent as `Authorization: Bearer <publicKey>`. */
  publicKey: string;
  /** Base ingest origin. Trailing slashes are stripped, `/v1/metrics` appended. */
  endpoint: string;
  /** Custom fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

export interface BrowserExporterResult {
  ok: boolean;
  status: number;
}

export type OtlpMetricPayload = Record<string, unknown>;

export interface BrowserMetricExporter {
  send(payload: OtlpMetricPayload): Promise<BrowserExporterResult>;
  readonly url: string;
}

function joinEndpoint(endpoint: string, suffix: string): string {
  return `${endpoint.replace(/\/+$/, '')}${suffix}`;
}

export function createBrowserMetricExporter(
  options: CreateBrowserMetricExporterOptions,
): BrowserMetricExporter {
  const url = joinEndpoint(options.endpoint, '/v1/metrics');
  const fetchImpl = options.fetch ?? globalThis.fetch;

  async function send(
    payload: OtlpMetricPayload,
  ): Promise<BrowserExporterResult> {
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
