import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import { Scope, type ScopeSnapshot } from '@neithly-com/monitor-core';

import {
  fastifyPlugin,
  shouldCaptureFastifyError,
  type FastifyPluginClient,
} from './fastify.js';

interface CapturedScope {
  snapshot: ScopeSnapshot;
}

interface FakeClient extends FastifyPluginClient {
  readonly scopes: CapturedScope[];
  readonly captures: unknown[];
}

function makeFakeClient(): FakeClient {
  const scopes: CapturedScope[] = [];
  const captures: unknown[] = [];
  return {
    scopes,
    captures,
    withScope<T>(callback: (scope: Scope) => T): T {
      const scope = new Scope();
      try {
        return callback(scope);
      } finally {
        scopes.push({ snapshot: scope.snapshot() });
      }
    },
    captureException(error: unknown): void {
      captures.push(error);
    },
  };
}

async function buildApp(client: FastifyPluginClient): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(fastifyPlugin, { client });
  return app;
}

describe('shouldCaptureFastifyError', () => {
  it('captures errors without a statusCode', () => {
    expect(shouldCaptureFastifyError(new Error('boom'))).toBe(true);
  });

  it('captures errors with a 5xx statusCode', () => {
    const err = Object.assign(new Error('upstream'), { statusCode: 503 });
    expect(shouldCaptureFastifyError(err)).toBe(true);
  });

  it('captures 500 itself', () => {
    const err = Object.assign(new Error('boom'), { statusCode: 500 });
    expect(shouldCaptureFastifyError(err)).toBe(true);
  });

  it('skips 4xx client errors', () => {
    const err = Object.assign(new Error('bad'), { statusCode: 400 });
    expect(shouldCaptureFastifyError(err)).toBe(false);
  });

  it('skips 404 not-found errors', () => {
    const err = Object.assign(new Error('missing'), { statusCode: 404 });
    expect(shouldCaptureFastifyError(err)).toBe(false);
  });

  it('captures non-object throws', () => {
    expect(shouldCaptureFastifyError('not-an-error')).toBe(true);
    expect(shouldCaptureFastifyError(null)).toBe(true);
  });
});

describe('fastifyPlugin', () => {
  it('opens a withScope around the request lifecycle and tags it', async () => {
    const client = makeFakeClient();
    const app = await buildApp(client);
    app.get('/hello/:id', async () => ({ ok: true }));

    const res = await app.inject({ method: 'GET', url: '/hello/42' });

    expect(res.statusCode).toBe(200);
    expect(client.scopes).toHaveLength(1);
    const snapshot = client.scopes[0]?.snapshot;
    expect(snapshot?.tags).toMatchObject({
      'http.method': 'GET',
      'http.url': '/hello/42',
      'http.route': '/hello/:id',
    });

    await app.close();
  });

  it('captures thrown 500 errors via the client seam', async () => {
    const client = makeFakeClient();
    const app = await buildApp(client);
    const boom = new Error('kaboom');
    app.get('/explode', async (): Promise<never> => {
      throw boom;
    });

    const res = await app.inject({ method: 'GET', url: '/explode' });

    expect(res.statusCode).toBe(500);
    expect(client.captures).toHaveLength(1);
    expect(client.captures[0]).toBe(boom);

    await app.close();
  });

  it('does not capture 4xx errors', async () => {
    const client = makeFakeClient();
    const app = await buildApp(client);
    app.get('/bad', async (_req, reply): Promise<never> => {
      const err = Object.assign(new Error('nope'), { statusCode: 400 });
      reply.code(400);
      throw err;
    });

    const res = await app.inject({ method: 'GET', url: '/bad' });

    expect(res.statusCode).toBe(400);
    expect(client.captures).toHaveLength(0);

    await app.close();
  });

  it('rethrows the original error so the fastify response pipeline still runs', async () => {
    const client = makeFakeClient();
    const app = await buildApp(client);
    app.get('/explode', async (): Promise<never> => {
      throw new Error('original');
    });

    const res = await app.inject({ method: 'GET', url: '/explode' });

    expect(res.statusCode).toBe(500);
    const body = res.json() as { message?: string };
    expect(body.message).toBe('original');

    await app.close();
  });

  it('swallows seam errors so the original request error path is preserved', async () => {
    const client: FastifyPluginClient = {
      withScope<T>(callback: (scope: Scope) => T): T {
        return callback(new Scope());
      },
      captureException(): void {
        throw new Error('seam blew up');
      },
    };
    const app = await buildApp(client);
    app.get('/explode', async (): Promise<never> => {
      throw new Error('original');
    });

    const res = await app.inject({ method: 'GET', url: '/explode' });

    expect(res.statusCode).toBe(500);

    await app.close();
  });

  it('exposes fastify-plugin metadata so encapsulation is broken on register', async () => {
    // If `fp` wasn't applied the hook + setErrorHandler would be encapsulated
    // inside the plugin scope and never see the outer app's routes. We assert
    // by registering at the root and verifying a route declared on the root
    // app still triggers the hook.
    const client = makeFakeClient();
    const app = Fastify();
    await app.register(fastifyPlugin, { client });
    app.get('/ping', async () => ({ pong: true }));

    const res = await app.inject({ method: 'GET', url: '/ping' });

    expect(res.statusCode).toBe(200);
    expect(client.scopes).toHaveLength(1);

    await app.close();
  });
});
