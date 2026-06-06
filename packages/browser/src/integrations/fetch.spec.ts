/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Breadcrumb } from '@neithly-com/monitor-core';

import { installFetchInstrumentation } from './fetch.js';

describe('installFetchInstrumentation', () => {
  const originalFetch = window.fetch;
  let crumbs: Breadcrumb[];

  beforeEach(() => {
    crumbs = [];
  });

  afterEach(() => {
    window.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('records an http breadcrumb on a successful response', async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

    const uninstall = installFetchInstrumentation((c) => crumbs.push(c));

    const res = await window.fetch('https://api.example.com/widgets', { method: 'POST' });
    expect(res.status).toBe(200);

    expect(crumbs).toHaveLength(1);
    const crumb = crumbs[0];
    expect(crumb?.category).toBe('http');
    expect(crumb?.level).toBe('info');
    expect(crumb?.data?.['method']).toBe('POST');
    expect(crumb?.data?.['url']).toBe('https://api.example.com/widgets');
    expect(crumb?.data?.['status_code']).toBe(200);
    expect(typeof crumb?.data?.['duration_ms']).toBe('number');

    uninstall();
    expect(window.fetch).not.toBe(uninstall);
  });

  it('records warning level for 4xx/5xx', async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));

    const uninstall = installFetchInstrumentation((c) => crumbs.push(c));
    await window.fetch('https://api.example.com/fail');
    uninstall();

    expect(crumbs[0]?.level).toBe('warning');
    expect(crumbs[0]?.data?.['status_code']).toBe(500);
  });

  it('records an error breadcrumb with status_code 0 on network failure', async () => {
    const networkErr = new TypeError('Failed to fetch');
    window.fetch = vi.fn().mockRejectedValue(networkErr);

    const uninstall = installFetchInstrumentation((c) => crumbs.push(c));

    await expect(window.fetch('https://api.example.com/down')).rejects.toBe(networkErr);

    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]?.level).toBe('error');
    expect(crumbs[0]?.data?.['status_code']).toBe(0);
    expect(crumbs[0]?.data?.['url']).toBe('https://api.example.com/down');

    uninstall();
  });

  it('uninstaller restores the original fetch', async () => {
    const original = vi.fn().mockResolvedValue(new Response('ok'));
    window.fetch = original;

    const uninstall = installFetchInstrumentation(() => undefined);
    expect(window.fetch).not.toBe(original);

    uninstall();
    expect(window.fetch).toBe(original);
  });

  it('extracts method and url from a Request input', async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));

    const uninstall = installFetchInstrumentation((c) => crumbs.push(c));

    const req = new Request('https://api.example.com/items', { method: 'put' });
    await window.fetch(req);

    expect(crumbs[0]?.data?.['method']).toBe('PUT');
    expect(crumbs[0]?.data?.['url']).toBe('https://api.example.com/items');
    uninstall();
  });

  it('does not throw when the breadcrumb sink throws', async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

    const uninstall = installFetchInstrumentation(() => {
      throw new Error('sink-failure');
    });

    await expect(window.fetch('https://api.example.com/ok')).resolves.toBeDefined();
    uninstall();
  });
});
