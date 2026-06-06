/**
 * Express integration for monitor-node.
 *
 * Provides two middlewares:
 *   - `expressRequestHandler()` — opens an isolated scope per request (forked
 *     from the active scope, bound via AsyncLocalStorage so nested async
 *     work runs against it), tags `method` / `url` / `requestId`, and pushes
 *     a `response` breadcrumb on `res.on('finish')` with `{ status, durationMs }`.
 *   - `expressErrorHandler()` — captures unhandled errors whose `status` is
 *     `>= 500` or unset, then forwards to Express's default error chain
 *     via `next(err)`.
 *
 * Both middlewares are framework-agnostic in shape: they only touch fields
 * Express guarantees on the standard request / response objects (`method`,
 * `url`, `headers`, `statusCode`, plus the `on('finish')` event). They do
 * NOT take a hard dependency on the `express` type, so consumer projects can
 * use them under any Express-compatible router (e.g. `connect`).
 *
 * The integration drives the SDK seam exposed by `../api/state.ts` directly
 * (`getActiveScope`, `getAsyncStorage`, `getProcessor`, `getConfig`) so this
 * Feature does not need higher-level `withScope` / `captureException` wrappers
 * to ship.
 */

import {
  SDK_NAME,
  shapeException,
  toOtlpLogRecord,
  type ScopeSnapshot,
} from '@neithly-com/monitor-core';

import {
  getActiveScope,
  getAsyncStorage,
  getConfig,
  getProcessor,
} from '../api/state.js';

/** Minimal Node request shape this middleware reads from. */
interface ReqLike {
  method?: string | undefined;
  url?: string | undefined;
  originalUrl?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

/** Minimal Node response shape this middleware reads from. */
interface ResLike {
  statusCode: number;
  on(event: 'finish', listener: () => void): unknown;
}

/** Error shape that Express error middlewares observe. */
interface ErrorLike {
  status?: unknown;
  statusCode?: unknown;
}

type NextFn = (err?: unknown) => void;

export type ExpressRequestMiddleware = (
  req: ReqLike,
  res: ResLike,
  next: NextFn,
) => void;

export type ExpressErrorMiddleware = (
  err: unknown,
  req: ReqLike,
  res: ResLike,
  next: NextFn,
) => void;

const FALLBACK_SDK_VERSION = '0.0.0';

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function resolveUrl(req: ReqLike): string | undefined {
  if (req.originalUrl !== undefined && req.originalUrl !== '') {
    return req.originalUrl;
  }
  return req.url;
}

function readStatusCandidate(err: unknown): number | undefined {
  if (err === null || typeof err !== 'object') {
    return undefined;
  }
  const e = err as ErrorLike;
  if (typeof e.status === 'number' && Number.isFinite(e.status)) {
    return e.status;
  }
  if (typeof e.statusCode === 'number' && Number.isFinite(e.statusCode)) {
    return e.statusCode;
  }
  return undefined;
}

/**
 * Send the shaped log record to the active processor, sourcing release /
 * environment / SDK identity from the init() config bag. Falls back to the
 * package's SDK name + version when `init()` has not yet run, so the integration
 * remains usable in tests that drive the processor seam directly.
 */
function emitException(err: unknown, scopeSnapshot: ScopeSnapshot): void {
  const config = getConfig();
  const exception = shapeException(err);
  const sdkName = config?.sdkName ?? SDK_NAME;
  const sdkVersion = config?.sdkVersion ?? FALLBACK_SDK_VERSION;
  const release = config?.release;
  const environment = config?.environment;

  const record = toOtlpLogRecord({
    scope: scopeSnapshot,
    exception,
    sdkName,
    sdkVersion,
    ...(release !== undefined ? { release } : {}),
    ...(environment !== undefined ? { environment } : {}),
  });
  getProcessor().process(record);
}

/**
 * Opens an isolated scope per request (cloned from the active scope and bound
 * via AsyncLocalStorage), tags it with `method` / `url` / `requestId`, and
 * pushes a `response` breadcrumb when the response finishes.
 *
 * Because the scope is bound via ALS, any `captureException` made by
 * downstream middlewares or route handlers runs against this request's scope
 * — including the paired `expressErrorHandler`, which Express invokes inside
 * the same ALS context as the route that threw.
 */
export function expressRequestHandler(): ExpressRequestMiddleware {
  return function neithlyExpressRequestHandler(req, res, next): void {
    const storage = getAsyncStorage();
    const scope = getActiveScope().clone();

    const tags: Record<string, string> = {};
    const method = req.method;
    if (method !== undefined && method !== '') {
      tags['method'] = method;
    }
    const url = resolveUrl(req);
    if (url !== undefined && url !== '') {
      tags['url'] = url;
    }
    const requestId = firstHeader(req.headers['x-request-id']);
    if (requestId !== undefined && requestId !== '') {
      tags['requestId'] = requestId;
    }
    if (Object.keys(tags).length > 0) {
      scope.setTags(tags);
    }

    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      scope.addBreadcrumb({
        category: 'response',
        data: {
          status: res.statusCode,
          durationMs,
        },
      });
    });

    storage.run(scope, () => {
      next();
    });
  };
}

/**
 * Express error-middleware: captures the error when no `status` is set or the
 * status is `>= 500` (i.e. it represents a server-side failure rather than a
 * deliberate 4xx). Always forwards via `next(err)` so Express renders its
 * default error response.
 *
 * Express invokes error middlewares synchronously within the same async
 * context as the route handler that threw, so `getActiveScope()` here is the
 * request-bound scope established by `expressRequestHandler`.
 */
export function expressErrorHandler(): ExpressErrorMiddleware {
  return function neithlyExpressErrorHandler(err, _req, _res, next): void {
    const status = readStatusCandidate(err);
    if (status === undefined || status >= 500) {
      const snapshot = getActiveScope().snapshot();
      emitException(err, snapshot);
    }
    next(err);
  };
}
