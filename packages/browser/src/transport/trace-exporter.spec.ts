import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBrowserTraceExporter } from './trace-exporter.js';

describe('createBrowserTraceExporter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response('', { status: 202 }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to <endpoint>/v1/traces with bearer auth, keepalive, and JSON body', async () => {
    const exporter = createBrowserTraceExporter({
      publicKey: 'pk_test',
      endpoint: 'https://ingest.neithly.com',
    });

    expect(exporter.url).toBe('https://ingest.neithly.com/v1/traces');

    const payload = { resourceSpans: [{ scopeSpans: [] }] };
    const result = await exporter.send(payload);

    expect(result).toEqual({ ok: true, status: 202 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const [calledUrl, init] = call;
    expect(calledUrl).toBe('https://ingest.neithly.com/v1/traces');
    expect(init).toMatchObject({
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer pk_test',
      },
    });
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });
});
