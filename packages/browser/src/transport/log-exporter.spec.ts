import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OtlpLogRecord } from '@neithly-com/monitor-core';

import { createBrowserLogExporter } from './log-exporter.js';

function makeRecord(body: string): OtlpLogRecord {
  return {
    timeUnixNano: '1',
    observedTimeUnixNano: '1',
    severityNumber: 9,
    severityText: 'INFO',
    body: { stringValue: body },
    attributes: [],
  };
}

describe('createBrowserLogExporter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response('', { status: 202, statusText: 'Accepted' }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to <endpoint>/v1/logs with bearer auth and JSON body', async () => {
    const exporter = createBrowserLogExporter({
      publicKey: 'pk_test_abc',
      endpoint: 'https://ingest.neithly.com',
      meta: {
        sdkName: '@neithly-com/monitor-browser',
        sdkVersion: '0.0.0',
        environment: 'production',
        release: '1.2.3',
      },
    });

    expect(exporter.url).toBe('https://ingest.neithly.com/v1/logs');

    const result = await exporter.send([makeRecord('hello')]);

    expect(result).toEqual({ ok: true, status: 202 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const [calledUrl, init] = call;
    expect(calledUrl).toBe('https://ingest.neithly.com/v1/logs');
    expect(init).toMatchObject({
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer pk_test_abc',
      },
    });

    const parsed = JSON.parse(init.body as string) as {
      resourceLogs: Array<{
        resource: { attributes: Array<{ key: string }> };
        scopeLogs: Array<{ logRecords: OtlpLogRecord[] }>;
      }>;
    };
    expect(parsed.resourceLogs).toHaveLength(1);
    const first = parsed.resourceLogs[0];
    expect(first).toBeDefined();
    const scope = first?.scopeLogs[0];
    expect(scope?.logRecords).toHaveLength(1);
    expect(scope?.logRecords[0]?.body.stringValue).toBe('hello');
  });

  it('strips trailing slashes on endpoint before appending /v1/logs', () => {
    const exporter = createBrowserLogExporter({
      publicKey: 'pk',
      endpoint: 'https://ingest.neithly.com/monitor//',
      meta: { sdkName: 'x', sdkVersion: '0' },
    });
    expect(exporter.url).toBe('https://ingest.neithly.com/monitor/v1/logs');
  });

  it('honours a custom fetch implementation', async () => {
    const customFetch = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 200 }));

    const exporter = createBrowserLogExporter({
      publicKey: 'pk',
      endpoint: 'https://ingest.neithly.com',
      meta: { sdkName: 'x', sdkVersion: '0' },
      fetch: customFetch as unknown as typeof fetch,
    });

    await exporter.send([makeRecord('m')]);

    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
