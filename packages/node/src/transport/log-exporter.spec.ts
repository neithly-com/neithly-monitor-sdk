import { describe, expect, it, vi } from 'vitest';

const otlpLogCtor = vi.fn();

vi.mock('@opentelemetry/exporter-logs-otlp-http', () => ({
  OTLPLogExporter: class {
    public readonly config: unknown;
    public constructor(config: unknown) {
      otlpLogCtor(config);
      this.config = config;
    }
  },
}));

const { createLogExporter } = await import('./log-exporter.js');

describe('createLogExporter', () => {
  it('targets <endpoint>/v1/logs with Authorization bearer header', () => {
    otlpLogCtor.mockClear();

    createLogExporter({
      publicKey: 'pk-test',
      endpoint: 'https://ingest.neithly.com',
    });

    expect(otlpLogCtor).toHaveBeenCalledTimes(1);
    expect(otlpLogCtor).toHaveBeenCalledWith({
      url: 'https://ingest.neithly.com/v1/logs',
      headers: { Authorization: 'Bearer pk-test' },
    });
  });

  it('trims a trailing slash on the endpoint before composing /v1/logs', () => {
    otlpLogCtor.mockClear();

    createLogExporter({
      publicKey: 'pk-2',
      endpoint: 'https://ingest.neithly.com/',
    });

    expect(otlpLogCtor).toHaveBeenCalledWith({
      url: 'https://ingest.neithly.com/v1/logs',
      headers: { Authorization: 'Bearer pk-2' },
    });
  });

  it('preserves a path prefix on the endpoint', () => {
    otlpLogCtor.mockClear();

    createLogExporter({
      publicKey: 'pk-3',
      endpoint: 'https://api.example.com/monitor',
    });

    expect(otlpLogCtor).toHaveBeenCalledWith({
      url: 'https://api.example.com/monitor/v1/logs',
      headers: { Authorization: 'Bearer pk-3' },
    });
  });
});
