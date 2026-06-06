/**
 * Outgoing HTTP breadcrumb integration backed by
 * `@opentelemetry/instrumentation-http`.
 *
 * For every outgoing request, a breadcrumb of category `'http'` is pushed
 * via the supplied callback containing `method`, `url`, `status`, and the
 * request's wall-clock `durationMs`.
 *
 * The OpenTelemetry packages are loaded dynamically with `require` inside a
 * try/catch so that missing modules degrade gracefully to a no-op
 * uninstaller rather than crashing at import time.
 */

import type { ClientRequest, IncomingMessage } from 'node:http';

import type { Breadcrumb } from '@neithly-com/monitor-core';

export type AddBreadcrumbFn = (breadcrumb: Breadcrumb) => void;

export type Uninstaller = () => void;

interface HttpBreadcrumbData extends Record<string, unknown> {
  method: string;
  url: string;
  status: number | undefined;
  durationMs: number;
}

interface OtelHttpModule {
  HttpInstrumentation: new (config: Record<string, unknown>) => unknown;
}

interface OtelInstrumentationModule {
  registerInstrumentations: (options: { instrumentations: unknown[] }) => () => void;
}

function tryLoad<T>(specifier: string): T | undefined {
  try {
    // Dynamic require so the surrounding code can no-op gracefully when the
    // optional peer dependency is absent.
    const req =
       
      typeof require === 'function'
        ?  
          require
        : // Fallback for ESM contexts — created via Function ctor to avoid
          // bundlers rewriting the static `require` reference.
          (new Function('return require') as () => NodeRequire)();
    return req(specifier) as T;
  } catch {
    return undefined;
  }
}

function extractMethod(request: ClientRequest): string {
  // ClientRequest exposes `method` as a string property at runtime.
  const m = (request as unknown as { method?: unknown }).method;
  return typeof m === 'string' ? m : 'GET';
}

function extractUrl(request: ClientRequest): string {
  const r = request as unknown as {
    protocol?: unknown;
    host?: unknown;
    path?: unknown;
    getHeader?: (name: string) => unknown;
  };
  const protocol = typeof r.protocol === 'string' ? r.protocol : 'http:';
  const hostHeader = typeof r.getHeader === 'function' ? r.getHeader('host') : undefined;
  const host =
    typeof hostHeader === 'string'
      ? hostHeader
      : typeof r.host === 'string'
        ? r.host
        : 'unknown-host';
  const path = typeof r.path === 'string' ? r.path : '/';
  return `${protocol}//${host}${path}`;
}

function extractStatus(response: IncomingMessage): number | undefined {
  const code = (response as unknown as { statusCode?: unknown }).statusCode;
  return typeof code === 'number' ? code : undefined;
}

/**
 * Install outgoing-HTTP breadcrumb capture. Returns an uninstaller that
 * detaches the OpenTelemetry instrumentation. If the OpenTelemetry packages
 * cannot be loaded the function returns a no-op uninstaller silently.
 */
export function installHttpInstrumentation(addBreadcrumb: AddBreadcrumbFn): Uninstaller {
  const httpMod = tryLoad<OtelHttpModule>('@opentelemetry/instrumentation-http');
  const instMod = tryLoad<OtelInstrumentationModule>('@opentelemetry/instrumentation');

  if (httpMod === undefined || instMod === undefined) {
    return (): void => {
      /* no-op */
    };
  }

  // Track start times per ClientRequest so the responseHook can compute the
  // duration. WeakMap so requests can be GC'd if something goes wrong.
  const startTimes = new WeakMap<ClientRequest, number>();

  const config: Record<string, unknown> = {
    requestHook: (_span: unknown, request: ClientRequest | IncomingMessage): void => {
      if (isClientRequest(request)) {
        startTimes.set(request, performance.now());
      }
    },
    responseHook: (_span: unknown, response: IncomingMessage | unknown): void => {
      // For outgoing requests, the response object is an IncomingMessage and
      // it carries a back-reference to the originating ClientRequest under
      // `.req`. We use that to pull the matching start time.
      const res = response as { req?: unknown; statusCode?: unknown };
      const req = res.req;
      if (!isClientRequest(req)) {
        return;
      }
      const start = startTimes.get(req);
      const durationMs = start === undefined ? 0 : Math.max(0, performance.now() - start);
      startTimes.delete(req);

      const data: HttpBreadcrumbData = {
        method: extractMethod(req),
        url: extractUrl(req),
        status: extractStatus(response as IncomingMessage),
        durationMs,
      };

      try {
        addBreadcrumb({
          category: 'http',
          data,
        });
      } catch {
        // Never let breadcrumb capture break the host's HTTP flow.
      }
    },
  };

  let instrumentation: unknown;
  try {
    instrumentation = new httpMod.HttpInstrumentation(config);
  } catch {
    return (): void => {
      /* no-op */
    };
  }

  let disable: (() => void) | undefined;
  try {
    disable = instMod.registerInstrumentations({ instrumentations: [instrumentation] });
  } catch {
    return (): void => {
      /* no-op */
    };
  }

  return (): void => {
    try {
      disable?.();
    } catch {
      // Ignore teardown failures — the process is usually exiting.
    }
  };
}

function isClientRequest(value: unknown): value is ClientRequest {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  // ClientRequest has a `method` string and an `end` function. This is good
  // enough to disambiguate from IncomingMessage (which has neither `method`
  // as a settable string property in the same shape, nor relies on it the
  // same way).
  const candidate = value as { method?: unknown; end?: unknown };
  return typeof candidate.method === 'string' && typeof candidate.end === 'function';
}
