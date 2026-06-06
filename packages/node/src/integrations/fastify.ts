/**
 * Fastify binding for `@neithly-com/monitor-node`.
 *
 * Registers two pieces of behaviour against a Fastify instance:
 *
 * 1. An `onRequest` hook that opens a fresh `withScope` callback around the
 *    request lifecycle. Inside that scope we set a small set of HTTP tags
 *    (method, route, url) so any exception captured later in the lifecycle
 *    carries the request context. The scope mutations stay scoped to the
 *    `withScope` callback — the surrounding application scope is untouched.
 *
 * 2. A `setErrorHandler` that forwards 5xx (or status-less) errors to the
 *    client's `captureException` seam and rethrows so Fastify's default error
 *    response pipeline still runs. 4xx errors are deliberately left alone:
 *    they're routine client errors, not symptoms of a server defect.
 *
 * The integration is intentionally written against a tiny seam interface
 * (`FastifyPluginClient`) rather than a concrete client class. This keeps the
 * binding decoupled from the node SDK's client wiring (which lives elsewhere)
 * and makes it trivial to assert behaviour with a fake in unit tests.
 */

import type {
  FastifyError,
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import fp from 'fastify-plugin';

import type { Scope } from '@neithly-com/monitor-core';

/**
 * Minimal client-shaped seam the Fastify plugin depends on.
 *
 * The real node SDK client implements a superset of this surface; tests stand
 * in a fake that records calls. Keeping the seam local to the integration
 * avoids a circular dependency on a client module that isn't part of this
 * feature.
 */
export interface FastifyPluginClient {
  /**
   * Run `callback` with a fresh, request-scoped `Scope`. Mutations made to the
   * scope inside the callback MUST NOT leak to the surrounding application
   * scope once the callback returns.
   */
  withScope<T>(callback: (scope: Scope) => T): T;
  /**
   * Capture an arbitrary thrown value. The plugin treats this as fire-and-
   * forget: the return value is ignored and any thrown error is swallowed so
   * the original request error path is preserved.
   */
  captureException(error: unknown): void;
}

/**
 * Options accepted by `fastifyPlugin`.
 */
export interface FastifyPluginOptions {
  client: FastifyPluginClient;
}

/**
 * Decide whether a given error should be captured.
 *
 * Exported for tests and for callers that want to mirror the same rule in
 * their own error handlers (e.g. an Express binding sharing the policy).
 */
export function shouldCaptureFastifyError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') {
    return true;
  }
  const candidate = err as { statusCode?: unknown };
  const statusCode = candidate.statusCode;
  if (typeof statusCode !== 'number') {
    return true;
  }
  return statusCode >= 500;
}

const PLUGIN_NAME = '@neithly-com/monitor-node/fastify';

function tagRequest(scope: Scope, request: FastifyRequest): void {
  const tags: Record<string, string> = {
    'http.method': request.method,
    'http.url': request.url,
  };
  // `routeOptions.url` is the templated path (e.g. `/users/:id`) when the
  // route has been matched. It can be undefined for 404s — skip in that case
  // so we don't pollute tags with empty strings.
  const routeUrl = request.routeOptions?.url;
  if (typeof routeUrl === 'string' && routeUrl.length > 0) {
    tags['http.route'] = routeUrl;
  }
  scope.setTags(tags);
}

const plugin: FastifyPluginCallback<FastifyPluginOptions> = (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
  done: (err?: Error) => void,
): void => {
  const { client } = opts;

  fastify.addHook(
    'onRequest',
    (request: FastifyRequest, _reply: FastifyReply, hookDone: (err?: Error) => void): void => {
      client.withScope((scope: Scope): void => {
        tagRequest(scope, request);
        hookDone();
      });
    },
  );

  fastify.setErrorHandler(
    (err: FastifyError, _request: FastifyRequest, _reply: FastifyReply): never => {
      if (shouldCaptureFastifyError(err)) {
        try {
          client.captureException(err);
        } catch {
          // Capture must never mask the original error.
        }
      }
      throw err;
    },
  );

  done();
};

export const fastifyPlugin = fp(plugin, {
  fastify: '5.x',
  name: PLUGIN_NAME,
});
