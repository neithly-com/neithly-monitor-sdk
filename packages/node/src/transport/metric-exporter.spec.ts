import { describe, expect, it, vi } from 'vitest';

const otlpMetricCtor = vi.fn();

vi.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: class {
    public readonly config: unknown;
    public constructor(config: unknown) {
      otlpMetricCtor(config);
      this.config = config;
    }
  },
}));

const { createMetricExporter } = await import('./metric-exporter.js');

describe('createMetricExporter', () => {
  it('targets <endpoint>/v1/metrics with Authorization bearer header', () => {
    otlpMetricCtor.mockClear();

    createMetricExporter({
      publicKey: 'pk-test',
      endpoint: 'https://ingest.neithly.com',
    });

    expect(otlpMetricCtor).toHaveBeenCalledTimes(1);
    expect(otlpMetricCtor).toHaveBeenCalledWith({
      url: 'https://ingest.neithly.com/v1/metrics',
      headers: { Authorization: 'Bearer pk-test' },
    });
  });

  it('preserves a path prefix on the endpoint', () => {
    otlpMetricCtor.mockClear();

    createMetricExporter({
      publicKey: 'pk-3',
      endpoint: 'https://api.example.com/monitor',
    });

    expect(otlpMetricCtor).toHaveBeenCalledWith({
      url: 'https://api.example.com/monitor/v1/metrics',
      headers: { Authorization: 'Bearer pk-3' },
    });
  });
});
