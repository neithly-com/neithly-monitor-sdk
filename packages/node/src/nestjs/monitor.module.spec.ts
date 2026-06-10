/**
 * End-to-end wiring tests for {@link MonitorModule.forRoot}.
 *
 * Boots a real Nest application via `@nestjs/testing` + the Express adapter,
 * hits routes with `supertest`, and asserts:
 *  - `MonitorService` is injectable in user controllers / providers;
 *  - the global `MonitorContextInterceptor` is wired and runs on every
 *    incoming HTTP request (we observe it through a `MonitorService` spy);
 *  - `disabled: true` skips `init()` but still provides the service;
 *  - an empty DSN with `disabled` falsy is a hard failure (boot-time guard).
 *
 * SDK state is reset between specs so the idempotency guard in `forRoot()`
 * doesn't false-positive across test cases.
 */

import 'reflect-metadata';
import { Controller, Get, Inject, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetStateForTest, isInitialised } from '../api/state.js';
import { MonitorModule } from './monitor.module.js';
import { MonitorService } from './monitor.service.js';

@Controller()
class PingController {
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }
}

/**
 * Provider that demonstrates `MonitorService` is reachable from the consumer
 * DI tree (the canonical proof of cross-module export).
 */
@Controller()
class WhoamiController {
  // Explicit token to keep this spec runnable under esbuild (vitest default)
  // which does NOT emit `design:paramtypes` decorator metadata.
  constructor(@Inject(MonitorService) readonly monitor: MonitorService) {}

  @Get('whoami')
  whoami(): { hasMonitor: boolean } {
    return { hasMonitor: this.monitor instanceof MonitorService };
  }
}

@Module({ controllers: [PingController, WhoamiController] })
class PingModule {}

type ImportEntry = NonNullable<Parameters<typeof Test.createTestingModule>[0]['imports']>[number];

async function bootstrap(
  imports: ImportEntry[],
): Promise<{ app: NestExpressApplication; close: () => Promise<void> }> {
  const moduleRef = await Test.createTestingModule({ imports }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(new ExpressAdapter());
  await app.init();
  return { app, close: () => app.close() };
}

describe('MonitorModule.forRoot', () => {
  let close: (() => Promise<void>) | null = null;

  beforeEach(() => {
    _resetStateForTest();
  });

  afterEach(async () => {
    if (close !== null) {
      await close();
      close = null;
    }
    vi.restoreAllMocks();
  });

  it('initialises the SDK exactly once with the provided DSN', async () => {
    const { app, close: closeApp } = await bootstrap([
      MonitorModule.forRoot({
        dsn: 'nmk_dev_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        env: 'test',
        serviceName: 'svc-test',
      }),
      PingModule,
    ]);
    close = closeApp;
    expect(isInitialised()).toBe(true);
    void app;
  });

  it('provides MonitorService for injection in user code', async () => {
    const { app, close: closeApp } = await bootstrap([
      MonitorModule.forRoot({
        dsn: 'nmk_dev_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        serviceName: 'svc-test',
      }),
      PingModule,
    ]);
    close = closeApp;
    // Hitting the controller route is the most honest proof that
    // `MonitorService` was injectable: if DI hadn't resolved, Nest would have
    // failed to instantiate the controller and the route would 500.
    const res = await request(app.getHttpServer() as Parameters<typeof request>[0]).get('/whoami');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasMonitor: true });
  });

  it('wires the global context interceptor — every request hits setTags', async () => {
    const { app, close: closeApp } = await bootstrap([
      MonitorModule.forRoot({
        dsn: 'nmk_dev_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        serviceName: 'svc-test',
      }),
      PingModule,
    ]);
    close = closeApp;
    // Spy the interceptor's seam THROUGH the actual singleton instance Nest
    // resolved — that's the same instance the global APP_INTERCEPTOR uses.
    const monitor = app.get(MonitorService);
    const setTags = vi.spyOn(monitor, 'setTags');
    const res = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/ping')
      .set('x-request-id', 'req-ping');
    expect(res.status).toBe(200);
    expect(setTags).toHaveBeenCalled();
    const call = setTags.mock.calls[0]![0] as Record<string, string>;
    expect(call['http.method']).toBe('GET');
    expect(call['http.url']).toBe('/ping');
    expect(call['http.request_id']).toBe('req-ping');
  });

  it('skips init when disabled: true is set, but still provides the service', async () => {
    const { app, close: closeApp } = await bootstrap([
      MonitorModule.forRoot({ dsn: '', disabled: true }),
      PingModule,
    ]);
    close = closeApp;
    expect(isInitialised()).toBe(false);
    expect(app.get(MonitorService)).toBeInstanceOf(MonitorService);
  });

  it('rejects empty dsn unless disabled is true', () => {
    expect(() => MonitorModule.forRoot({ dsn: '' })).toThrowError(/`dsn` is required/);
  });

  it('is idempotent across multiple Nest apps in the same process', async () => {
    // First boot — initialises.
    const first = await bootstrap([
      MonitorModule.forRoot({
        dsn: 'nmk_dev_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        serviceName: 'first',
      }),
      PingModule,
    ]);
    await first.close();
    expect(isInitialised()).toBe(true);

    // Second boot — must NOT throw "init called more than once" because we
    // gate the call inside forRoot on `isInitialised()`. Console.warn proves
    // the no-op path was hit; we verify it WASN'T (i.e. no second init).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const second = await bootstrap([
      MonitorModule.forRoot({
        dsn: 'nmk_dev_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        serviceName: 'second',
      }),
      PingModule,
    ]);
    close = second.close;
    // No "init() called more than once" warning emitted.
    expect(
      warn.mock.calls.find((c) => String(c[0] ?? '').includes('init() called more than once')),
    ).toBeUndefined();
  });
});

describe('MonitorModule integration shape', () => {
  it('returns a DynamicModule from forRoot that Nest can compile', async () => {
    _resetStateForTest();
    const dyn = MonitorModule.forRoot({
      dsn: 'nmk_dev_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      disabled: true,
    });
    expect(dyn.module).toBe(MonitorModule);
    expect(dyn.exports).toContain(MonitorService);
    expect(dyn.providers?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('survives consumer-level @Module() composition (smoke)', async () => {
    _resetStateForTest();
    const { close: closeApp } = await bootstrap([
      MonitorModule.forRoot({
        dsn: 'nmk_dev_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        disabled: false,
        serviceName: 'svc',
      }),
      PingModule,
    ]);
    await closeApp();
  });
});

// Mark unused INestApplication import as referenced for stricter TS configs.
void (null as unknown as INestApplication);
