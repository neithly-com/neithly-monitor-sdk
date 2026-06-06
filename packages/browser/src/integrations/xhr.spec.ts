/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Breadcrumb } from '@neithly-com/monitor-core';

import { installXhrInstrumentation } from './xhr.js';

/**
 * Minimal fake XHR that mirrors the surface the instrumentation interacts
 * with: open/send/readyState/status, plus addEventListener/removeEventListener
 * and dispatch helpers used by the tests.
 */
class FakeXHR {
  static DONE = 4;
  readyState = 0;
  status = 0;
  method = '';
  url = '';

  // Match jsdom's XHR DONE constant on the instance too.
  DONE = 4;

  readonly #listeners = new Map<string, Set<EventListener>>();

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  send(_body?: unknown): void {
    /* test driver controls completion via finish() */
  }

  addEventListener(type: string, listener: EventListener): void {
    let bucket = this.#listeners.get(type);
    if (bucket === undefined) {
      bucket = new Set();
      this.#listeners.set(type, bucket);
    }
    bucket.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.#listeners.get(type)?.delete(listener);
  }

  // Test helper: drive the readystatechange flow to DONE with `status`.
  finish(status: number): void {
    this.readyState = FakeXHR.DONE;
    this.status = status;
    const bucket = this.#listeners.get('readystatechange');
    if (bucket !== undefined) {
      for (const listener of [...bucket]) {
        listener.call(this as unknown as XMLHttpRequest, new Event('readystatechange'));
      }
    }
  }
}

describe('installXhrInstrumentation', () => {
  // We swap the global XMLHttpRequest for FakeXHR so the patch operates on a
  // prototype we fully control.
  const RealXHR = globalThis.XMLHttpRequest;

  beforeEach(() => {
     
    (globalThis as any).XMLHttpRequest = FakeXHR;
  });

  afterEach(() => {
     
    (globalThis as any).XMLHttpRequest = RealXHR;
  });

  it('records an info http breadcrumb on a 2xx response', () => {
    const crumbs: Breadcrumb[] = [];
    const uninstall = installXhrInstrumentation((c) => crumbs.push(c));

    const xhr = new (globalThis.XMLHttpRequest as unknown as typeof FakeXHR)();
    xhr.open('GET', 'https://api.example.com/widgets');
    xhr.send();
    xhr.finish(200);

    expect(crumbs).toHaveLength(1);
    const crumb = crumbs[0];
    expect(crumb?.category).toBe('http');
    expect(crumb?.level).toBe('info');
    expect(crumb?.data?.['method']).toBe('GET');
    expect(crumb?.data?.['url']).toBe('https://api.example.com/widgets');
    expect(crumb?.data?.['status_code']).toBe(200);
    expect(typeof crumb?.data?.['duration_ms']).toBe('number');

    uninstall();
  });

  it('records a warning breadcrumb on a 4xx/5xx response', () => {
    const crumbs: Breadcrumb[] = [];
    const uninstall = installXhrInstrumentation((c) => crumbs.push(c));

    const xhr = new (globalThis.XMLHttpRequest as unknown as typeof FakeXHR)();
    xhr.open('post', 'https://api.example.com/oops');
    xhr.send();
    xhr.finish(503);

    expect(crumbs[0]?.level).toBe('warning');
    expect(crumbs[0]?.data?.['method']).toBe('POST');
    expect(crumbs[0]?.data?.['status_code']).toBe(503);

    uninstall();
  });

  it('records an error breadcrumb when status is 0', () => {
    const crumbs: Breadcrumb[] = [];
    const uninstall = installXhrInstrumentation((c) => crumbs.push(c));

    const xhr = new (globalThis.XMLHttpRequest as unknown as typeof FakeXHR)();
    xhr.open('GET', 'https://api.example.com/network-down');
    xhr.send();
    xhr.finish(0);

    expect(crumbs[0]?.level).toBe('error');
    expect(crumbs[0]?.data?.['status_code']).toBe(0);

    uninstall();
  });

  it('uninstaller restores the original prototype methods', () => {
    const beforeOpen = FakeXHR.prototype.open;
    const beforeSend = FakeXHR.prototype.send;

    const uninstall = installXhrInstrumentation(() => undefined);
    expect(FakeXHR.prototype.open).not.toBe(beforeOpen);
    expect(FakeXHR.prototype.send).not.toBe(beforeSend);

    uninstall();
    expect(FakeXHR.prototype.open).toBe(beforeOpen);
    expect(FakeXHR.prototype.send).toBe(beforeSend);
  });
});
