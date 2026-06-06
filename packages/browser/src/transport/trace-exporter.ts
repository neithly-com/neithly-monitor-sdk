/**
 * Browser-side OTLP/HTTP exporter for trace spans.
 *
 * Mirrors `createBrowserLogExporter` but for `/v1/traces`. The core SDK does
 * not yet ship a `toOtlpTracesRequest` helper, so this exporter accepts an
 * already-shaped OTLP `ExportTraceServiceRequest`-compatible payload and
 * stringifies it as-is.
 */

export interface CreateBrowserTraceExporterOptions {
  /** DSN public key — sent as `Authorization: Bearer <publicKey>`. */
  publicKey: string;
  /** Base ingest origin. Trailing slashes are stripped, `/v1/traces` appended. */
  endpoint: string;
  /** Custom fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

export interface BrowserExporterResult {
  ok: boolean;
  status: number;
}

/**
 * OTLP trace payload, as produced by an upstream span processor. Kept as
 * `unknown` here to avoid leaking @opentelemetry types into the browser
 * runtime — the exporter only serialises and POSTs.
 */
export type OtlpTracePayload = Record<string, unknown>;

export interface BrowserTraceExporter {
  send(payload: OtlpTracePayload): Promise<BrowserExporterResult>;
  readonly url: string;
}

function joinEndpoint(endpoint: string, suffix: string): string {
  return `${endpoint.replace(/\/+$/, '')}${suffix}`;
}

export function createBrowserTraceExporter(
  options: CreateBrowserTraceExporterOptions,
): BrowserTraceExporter {
  const url = joinEndpoint(options.endpoint, '/v1/traces');
  const fetchImpl = options.fetch ?? globalThis.fetch;

  async function send(
    payload: OtlpTracePayload,
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
