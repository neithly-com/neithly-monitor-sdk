import { describe, expect, it } from 'vitest';

import { resolveEndpoints } from './endpoints.js';

describe('resolveEndpoints', () => {
  it('resolves https origin to logs/metrics/traces endpoints', () => {
    const endpoints = resolveEndpoints('https://ingest.neithly.com');

    expect(endpoints).toEqual({
      logs: 'https://ingest.neithly.com/v1/logs',
      metrics: 'https://ingest.neithly.com/v1/metrics',
      traces: 'https://ingest.neithly.com/v1/traces',
    });
  });

  it('normalises a trailing slash on a bare origin', () => {
    const endpoints = resolveEndpoints('https://ingest.neithly.com/');

    expect(endpoints.logs).toBe('https://ingest.neithly.com/v1/logs');
    expect(endpoints.metrics).toBe('https://ingest.neithly.com/v1/metrics');
    expect(endpoints.traces).toBe('https://ingest.neithly.com/v1/traces');
  });

  it('normalises multiple trailing slashes on a path prefix', () => {
    const endpoints = resolveEndpoints('https://ingest.neithly.com/monitor///');

    expect(endpoints).toEqual({
      logs: 'https://ingest.neithly.com/monitor/v1/logs',
      metrics: 'https://ingest.neithly.com/monitor/v1/metrics',
      traces: 'https://ingest.neithly.com/monitor/v1/traces',
    });
  });

  it('preserves a path prefix on the origin', () => {
    const endpoints = resolveEndpoints('https://api.example.com/monitor');

    expect(endpoints).toEqual({
      logs: 'https://api.example.com/monitor/v1/logs',
      metrics: 'https://api.example.com/monitor/v1/metrics',
      traces: 'https://api.example.com/monitor/v1/traces',
    });
  });

  it('preserves a multi-segment path prefix', () => {
    const endpoints = resolveEndpoints('https://api.example.com/o/team/ingest');

    expect(endpoints.logs).toBe(
      'https://api.example.com/o/team/ingest/v1/logs',
    );
    expect(endpoints.metrics).toBe(
      'https://api.example.com/o/team/ingest/v1/metrics',
    );
    expect(endpoints.traces).toBe(
      'https://api.example.com/o/team/ingest/v1/traces',
    );
  });

  it('supports localhost with an explicit port (http)', () => {
    const endpoints = resolveEndpoints('http://localhost:4318');

    expect(endpoints).toEqual({
      logs: 'http://localhost:4318/v1/logs',
      metrics: 'http://localhost:4318/v1/metrics',
      traces: 'http://localhost:4318/v1/traces',
    });
  });

  it('throws TypeError on invalid origin', () => {
    expect(() => resolveEndpoints('not-a-url')).toThrow(TypeError);
    expect(() => resolveEndpoints('')).toThrow(TypeError);
  });

  it('rejects an origin with a query string', () => {
    expect(() =>
      resolveEndpoints('https://ingest.neithly.com/?token=abc'),
    ).toThrow(TypeError);

    expect(() =>
      resolveEndpoints('https://ingest.neithly.com/monitor?x=1'),
    ).toThrow(/query string/);
  });

  it('rejects an origin with a hash fragment', () => {
    expect(() =>
      resolveEndpoints('https://ingest.neithly.com/#frag'),
    ).toThrow(TypeError);
  });
});
