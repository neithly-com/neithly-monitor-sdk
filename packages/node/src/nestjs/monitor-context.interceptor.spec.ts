/**
 * Unit tests for {@link MonitorContextInterceptor}.
 *
 * We fake the Nest `ExecutionContext` / `CallHandler` rather than spinning up
 * a full Nest application — the spec covers tag shape, user shape, and the
 * cleanup-on-finalize guarantee in isolation. The full end-to-end (interceptor
 * + module + Nest app) wiring is exercised by `monitor.module.spec.ts`.
 */

import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MonitorContextInterceptor } from './monitor-context.interceptor.js';
import { MonitorService } from './monitor.service.js';

interface FakeAuth {
  readonly sub?: string;
  readonly email?: string;
  readonly teamId?: string;
}

interface FakeRequest {
  readonly method?: string;
  readonly url?: string;
  readonly originalUrl?: string;
  readonly route?: { path?: string };
  readonly headers?: Record<string, string | string[] | undefined>;
  readonly auth?: FakeAuth;
}

function mockContext(req: FakeRequest, type: 'http' | 'rpc' = 'http'): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: <T>(): T => req as unknown as T }),
  } as unknown as ExecutionContext;
}

function mockHandler(stream: Observable<unknown> = of('ok')): CallHandler {
  return { handle: () => stream };
}

describe('MonitorContextInterceptor', () => {
  let monitor: MonitorService;
  let setUser: ReturnType<typeof vi.spyOn>;
  let setTags: ReturnType<typeof vi.spyOn>;
  let interceptor: MonitorContextInterceptor;

  beforeEach(() => {
    monitor = new MonitorService();
    setUser = vi.spyOn(monitor, 'setUser').mockReturnValue();
    setTags = vi.spyOn(monitor, 'setTags').mockReturnValue();
    interceptor = new MonitorContextInterceptor(monitor);
  });

  it('no-ops on non-HTTP transports', async () => {
    const result$ = interceptor.intercept(mockContext({}, 'rpc'), mockHandler(of('ok')));
    await new Promise<void>((resolve) => result$.subscribe({ complete: () => resolve() }));
    expect(setTags).not.toHaveBeenCalled();
    expect(setUser).not.toHaveBeenCalled();
  });

  it('stamps http.method / http.route / http.url / http.request_id', async () => {
    const ctx = mockContext({
      method: 'GET',
      url: '/v1/users/u_1',
      originalUrl: '/v1/users/u_1',
      route: { path: '/v1/users/:id' },
      headers: { 'x-request-id': 'req-abc' },
    });
    const result$ = interceptor.intercept(ctx, mockHandler());
    await new Promise<void>((resolve) => result$.subscribe({ complete: () => resolve() }));
    expect(setTags).toHaveBeenCalledTimes(1);
    expect(setTags).toHaveBeenCalledWith({
      'http.method': 'GET',
      'http.route': '/v1/users/:id',
      'http.url': '/v1/users/u_1',
      'http.request_id': 'req-abc',
    });
  });

  it('falls back to originalUrl when no route template is matched (404)', async () => {
    const ctx = mockContext({
      method: 'GET',
      originalUrl: '/missing',
      headers: {},
    });
    const result$ = interceptor.intercept(ctx, mockHandler());
    await new Promise<void>((resolve) => result$.subscribe({ complete: () => resolve() }));
    expect(setTags).toHaveBeenCalledWith({
      'http.method': 'GET',
      'http.route': '/missing',
      'http.url': '/missing',
    });
  });

  it('sets the user + teamId tag when req.auth is populated', async () => {
    const ctx = mockContext({
      method: 'POST',
      url: '/v1/things',
      auth: { sub: 'u_1', email: 'a@b.c', teamId: 't_1' },
    });
    const result$ = interceptor.intercept(ctx, mockHandler());
    await new Promise<void>((resolve) => result$.subscribe({ complete: () => resolve() }));
    expect(setUser).toHaveBeenCalledWith({ id: 'u_1', email: 'a@b.c' });
    const tagCall = setTags.mock.calls[0]![0] as Record<string, string>;
    expect(tagCall['teamId']).toBe('t_1');
  });

  it('skips the SET-USER call when req.auth is missing (public route)', async () => {
    const ctx = mockContext({ method: 'GET', url: '/health' });
    const result$ = interceptor.intercept(ctx, mockHandler());
    await new Promise<void>((resolve) => result$.subscribe({ complete: () => resolve() }));
    // The only setUser call is the finalize-stage clear (`setUser(null)`),
    // never an actual user identity stamp. The finalize clear is the
    // canonical defense against the cross-request scope leak — keep it on
    // every request, public or not.
    expect(setUser.mock.calls.every((c) => c[0] === null)).toBe(true);
    expect(setTags).toHaveBeenCalledTimes(1);
  });

  it('clears the user on the finalize hook (success path)', async () => {
    const ctx = mockContext({
      method: 'GET',
      url: '/v1/things',
      auth: { sub: 'u_1' },
    });
    const result$ = interceptor.intercept(ctx, mockHandler(of('ok')));
    await new Promise<void>((resolve) => result$.subscribe({ complete: () => resolve() }));
    // First setUser call sets the id; second clears it on finalize.
    expect(setUser).toHaveBeenCalledTimes(2);
    expect(setUser).toHaveBeenNthCalledWith(2, null);
  });

  it('clears the user on the finalize hook (error path)', async () => {
    const ctx = mockContext({
      method: 'GET',
      url: '/v1/things',
      auth: { sub: 'u_1' },
    });
    const result$ = interceptor.intercept(ctx, mockHandler(throwError(() => new Error('boom'))));
    await new Promise<void>((resolve) =>
      result$.subscribe({
        error: () => resolve(),
      }),
    );
    expect(setUser).toHaveBeenCalledTimes(2);
    expect(setUser).toHaveBeenNthCalledWith(2, null);
  });

  it('reads only the first value of a multi-valued x-request-id header', async () => {
    const ctx = mockContext({
      method: 'GET',
      url: '/v1/things',
      headers: { 'x-request-id': ['req-1', 'req-2'] },
    });
    const result$ = interceptor.intercept(ctx, mockHandler());
    await new Promise<void>((resolve) => result$.subscribe({ complete: () => resolve() }));
    const tagCall = setTags.mock.calls[0]![0] as Record<string, string>;
    expect(tagCall['http.request_id']).toBe('req-1');
  });
});
