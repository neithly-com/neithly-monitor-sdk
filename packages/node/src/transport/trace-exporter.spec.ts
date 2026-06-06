import { describe, expect, it, vi } from 'vitest';

const otlpTraceCtor = vi.fn();

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: class {
    public readonly config: unknown;
    public constructor(config: unknown) {
      otlpTraceCtor(config);
      this.config = config;
    }
  },
}));

const { createTraceExporter } = await import('./trace-exporter.js');

describe('createTraceExporter', () => {
  it('targets <endpoint>/v1/traces with Authorization bearer header', () => {
    otlpTraceCtor.mockClear();

    createTraceExporter({
      publicKey: 'pk-test',
      endpoint: 'https://ingest.neithly.com',
    });

    expect(otlpTraceCtor).toHaveBeenCalledTimes(1);
    expect(otlpTraceCtor).toHaveBeenCalledWith({
      url: 'https://ingest.neithly.com/v1/traces',
      headers: { Authorization: 'Bearer pk-test' },
    });
  });

  it('trims a trailing slash on the endpoint', () => {
    otlpTraceCtor.mockClear();

    createTraceExporter({
      publicKey: 'pk-2',
      endpoint: 'https://ingest.neithly.com/',
    });

    expect(otlpTraceCtor).toHaveBeenCalledWith({
      url: 'https://ingest.neithly.com/v1/traces',
      headers: { Authorization: 'Bearer pk-2' },
    });
  });
});
