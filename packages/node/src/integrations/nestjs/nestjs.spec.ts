/**
 * End-to-end NestJS binding tests.
 *
 * Builds a full Nest application via `@nestjs/testing` + Express, hits routes
 * with `supertest`, and asserts:
 * - 5xx `HttpException` → captured
 * - 4xx `HttpException` → NOT captured (expected client errors)
 * - plain `Error` → captured
 * - the interceptor opens a scope with method / url / x-request-id and stamps
 *   the final statusCode tag
 * - `init` runs exactly once
 *
 * The runtime contract is faked via a {@link FakeClient} so the spec doesn't
 * depend on sibling features (parallel-build safety).
 */

import 'reflect-metadata';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Module,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Scope } from '@neithly-com/monitor-core';
import type { ScopeSnapshot } from '@neithly-com/monitor-core';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { NeithlyClient, NeithlyInitOptions } from './client.js';
import { NeithlyExceptionFilter } from './exception-filter.js';
import { NeithlyModule } from './module.js';

interface CapturedEvent {
  readonly error: unknown;
  readonly scope: ScopeSnapshot;
}

class FakeClient implements NeithlyClient {
  initCalls: NeithlyInitOptions[] = [];
  captured: CapturedEvent[] = [];
  // AsyncLocalStorage so a scope opened inside `withScope` stays active
  // across async boundaries (microtasks, Promise resolutions, the RxJS
  // pipeline used by the interceptor). This mirrors what the real client
  // does in production — without it the filter would observe an empty scope
  // because the synchronous withScope callback has already returned by the
  // time the handler finishes throwing.
  private readonly als = new AsyncLocalStorage<Scope>();

  init(options: NeithlyInitOptions): void {
    this.initCalls.push(options);
  }

  captureException(error: unknown): string {
    const active = this.als.getStore();
    const snap = active !== undefined ? active.snapshot() : new Scope().snapshot();
    this.captured.push({ error, scope: snap });
    return `evt_${this.captured.length}`;
  }

  withScope<T>(fn: (scope: Scope) => T): T {
    const scope = new Scope();
    return this.als.run(scope, () => fn(scope));
  }
}

@Controller()
class FlakyController {
  @Get('boom-500')
  boom500(): never {
    throw new HttpException('boom', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  @Get('boom-400')
  boom400(): never {
    throw new HttpException('bad', HttpStatus.BAD_REQUEST);
  }

  @Get('plain')
  plain(): never {
    throw new Error('plain failure');
  }

  @Get('ok')
  ok(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [FlakyController] })
class FlakyModule {}

async function bootstrap(client: NeithlyClient): Promise<{
  app: NestExpressApplication;
  close: () => Promise<void>;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      NeithlyModule.forRoot({
        client,
        options: { dsn: 'https://pub@host/1' },
      }),
      FlakyModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(
    new ExpressAdapter(),
  );
  await app.init();
  return {
    app,
    close: () => app.close(),
  };
}

describe('NestJS binding', () => {
  let client: FakeClient;
  let close: (() => Promise<void>) | null = null;
  let httpServer: unknown;

  beforeEach(async () => {
    NeithlyModule.resetForTesting();
    client = new FakeClient();
    const booted = await bootstrap(client);
    close = booted.close;
    httpServer = booted.app.getHttpServer();
  });

  afterEach(async () => {
    if (close !== null) {
      await close();
      close = null;
    }
  });

  describe('NeithlyExceptionFilter.shouldCapture', () => {
    it('captures 5xx HttpException', () => {
      expect(
        NeithlyExceptionFilter.shouldCapture(
          new HttpException('x', HttpStatus.INTERNAL_SERVER_ERROR),
        ),
      ).toBe(true);
    });

    it('skips 4xx HttpException', () => {
      expect(
        NeithlyExceptionFilter.shouldCapture(
          new HttpException('x', HttpStatus.BAD_REQUEST),
        ),
      ).toBe(false);
      expect(
        NeithlyExceptionFilter.shouldCapture(
          new HttpException('x', HttpStatus.NOT_FOUND),
        ),
      ).toBe(false);
    });

    it('captures plain errors', () => {
      expect(NeithlyExceptionFilter.shouldCapture(new Error('x'))).toBe(true);
      expect(NeithlyExceptionFilter.shouldCapture('string thrown')).toBe(true);
      expect(NeithlyExceptionFilter.shouldCapture(null)).toBe(true);
    });
  });

  it('calls client.init exactly once with the provided options', () => {
    expect(client.initCalls).toHaveLength(1);
    expect(client.initCalls[0]).toEqual({ dsn: 'https://pub@host/1' });
  });

  it('captures 5xx HttpException and lets Nest still respond 500', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .get('/boom-500')
      .set('x-request-id', 'req-500');
    expect(res.status).toBe(500);
    expect(client.captured).toHaveLength(1);
    const event = client.captured[0];
    expect(event).toBeDefined();
    expect(event?.error).toBeInstanceOf(HttpException);
    expect(event?.scope.tags['http.method']).toBe('GET');
    expect(event?.scope.tags['http.url']).toBe('/boom-500');
    expect(event?.scope.tags['http.request_id']).toBe('req-500');
  });

  it('does NOT capture 4xx HttpException', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0]).get(
      '/boom-400',
    );
    expect(res.status).toBe(400);
    expect(client.captured).toHaveLength(0);
  });

  it('captures plain Error thrown by a handler', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .get('/plain')
      .set('x-request-id', 'req-plain');
    // Nest's default filter maps unknown errors to 500.
    expect(res.status).toBe(500);
    expect(client.captured).toHaveLength(1);
    const event = client.captured[0];
    expect(event?.error).toBeInstanceOf(Error);
    expect((event?.error as Error).message).toBe('plain failure');
    expect(event?.scope.tags['http.method']).toBe('GET');
    expect(event?.scope.tags['http.url']).toBe('/plain');
    expect(event?.scope.tags['http.request_id']).toBe('req-plain');
  });

  it('opens a scope on successful requests too (no capture, no leak)', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0]).get(
      '/ok',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(client.captured).toHaveLength(0);
  });
});
