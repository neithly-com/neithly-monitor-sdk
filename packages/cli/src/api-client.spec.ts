import { describe, it, expect, vi } from 'vitest';

import { createMonitorClient, ApiError } from './api-client.js';

function jsonResponse(body: unknown, status = 200, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('createMonitorClient', () => {
  it('sends Authorization: Bearer + Accept: application/json on GET', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ok: true }));
    const client = createMonitorClient({
      apiUrl: 'https://api.example.com',
      apiToken: 'secret-token',
      fetch: fetchMock,
    });

    const result = await client.request<{ ok: boolean }>('/v1/releases');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe('https://api.example.com/v1/releases');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer secret-token');
    expect(headers['Accept']).toBe('application/json');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).body).toBeUndefined();
  });

  it('serialises body as JSON and sets Content-Type on POST', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: 'rel_1' }, 201));
    const client = createMonitorClient({
      apiUrl: 'https://api.example.com/',
      apiToken: 'tok',
      fetch: fetchMock,
    });

    const out = await client.request<{ id: string }>('v1/releases', {
      method: 'POST',
      body: { name: '1.0.0' },
    });

    expect(out).toEqual({ id: 'rel_1' });
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe('https://api.example.com/v1/releases');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect((init as RequestInit).body).toBe(JSON.stringify({ name: '1.0.0' }));
  });

  it('throws ApiError on 401 with parsed body and status', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
    const client = createMonitorClient({
      apiUrl: 'https://api.example.com',
      apiToken: 'bad-token',
      fetch: fetchMock,
    });

    let caught: unknown;
    try {
      await client.request('/v1/releases');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const err = caught as ApiError;
    expect(err.code).toBe('API_ERROR');
    expect(err.status).toBe(401);
    expect(err.body).toEqual({ error: 'unauthorized' });
  });

  it('throws ApiError on 500 with text body when content-type is not JSON', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('boom', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        }),
      );
    const client = createMonitorClient({
      apiUrl: 'https://api.example.com',
      apiToken: 'tok',
      fetch: fetchMock,
    });

    let caught: unknown;
    try {
      await client.request('/v1/releases');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(500);
    expect((caught as ApiError).body).toBe('boom');
  });

  it('returns null for 204 No Content responses', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createMonitorClient({
      apiUrl: 'https://api.example.com',
      apiToken: 'tok',
      fetch: fetchMock,
    });

    const result = await client.request('/v1/things/1', { method: 'DELETE' });
    expect(result).toBeNull();
  });
});
