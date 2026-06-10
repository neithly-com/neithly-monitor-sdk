/**
 * `MonitorContextInterceptor` — registered globally via `APP_INTERCEPTOR` by
 * {@link MonitorModule.forRoot}.
 *
 * Stamps request-shaped tags + the resolved caller identity onto the monitor
 * SDK's active scope so any exception captured downstream carries the right
 * context. This is the canonical "context interceptor" pattern every
 * neithly-* backend used to hand-roll — now baked into the SDK.
 *
 * Runs AFTER the authentication guard (NestJS evaluates interceptors after
 * guards in the request pipeline), so `req.auth` — the standard payload
 * shape set by `@neithly-com/neithly-auth-sdk/nestjs` `NeithlyAuthGuard` —
 * is present and we can call `monitor.setUser({ id: req.auth.sub, email })`.
 * For `@Public()` routes `req.auth` is `undefined` and the user step is
 * skipped; tags are still applied so unauthenticated traffic still gets
 * `http.method` / `http.route` stamped on any exception captured downstream.
 *
 * Scope-leak gotcha: the SDK mutates a module-global scope when nothing else
 * is in play (the canonical Sentry trap). Two back-to-back requests could
 * otherwise share user / tag context. We avoid that by clearing the user
 * (`setUser(null)`) on the response lifecycle via `rxjs.finalize` — which
 * runs on BOTH success and error paths. Per-request tags are deliberately
 * allowed to accumulate within the request (later interceptors or services
 * can add more); the next request opens with the cleared user, and the
 * tags get overwritten by the next request's `setTags` call thanks to the
 * SDK's merge-by-key behaviour.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { type Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { MonitorService } from './monitor.service.js';

/**
 * Minimal shape we read off the incoming request. Tighter than `any` so the
 * member-access lints stay happy without a hard dep on `@types/express`.
 */
interface RequestLike {
  readonly method?: string;
  readonly url?: string;
  readonly originalUrl?: string;
  readonly route?: { path?: string };
  readonly params?: Record<string, string | undefined>;
  readonly headers?: Record<string, string | string[] | undefined>;
  readonly auth?: {
    readonly sub?: string;
    readonly email?: string;
    readonly teamId?: string;
    readonly [key: string]: unknown;
  };
}

@Injectable()
export class MonitorContextInterceptor implements NestInterceptor {
  // Explicit `@Inject(MonitorService)` rather than relying on
  // `design:paramtypes` so consumers that transpile with esbuild / swc / tsc
  // without `emitDecoratorMetadata` (or vitest, which uses esbuild) still
  // get a working interceptor. Tracked as the canonical SDK-side workaround
  // for the well-known "constructor injection without metadata" footgun.
  constructor(@Inject(MonitorService) private readonly monitor: MonitorService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only HTTP transports carry the request/auth pair we care about. For
    // RPC / WebSocket contexts we no-op rather than mis-tagging.
    if (ctx.getType() !== 'http') {
      return next.handle();
    }

    const req = ctx.switchToHttp().getRequest<RequestLike>();

    const tags: Record<string, string> = {};
    if (typeof req.method === 'string') {
      tags['http.method'] = req.method;
    }
    // `req.route?.path` is the parameterised template (e.g. `/v1/users/:id`);
    // fall back to the raw URL when Express hasn't matched a route yet (404).
    const routePath = req.route?.path;
    const fallbackUrl = req.originalUrl ?? req.url;
    if (typeof routePath === 'string') {
      tags['http.route'] = routePath;
    } else if (typeof fallbackUrl === 'string') {
      tags['http.route'] = fallbackUrl;
    }
    if (typeof fallbackUrl === 'string') {
      tags['http.url'] = fallbackUrl;
    }
    const requestId = pickRequestId(req.headers);
    if (requestId !== undefined) {
      tags['http.request_id'] = requestId;
    }

    if (req.auth?.sub !== undefined) {
      this.monitor.setUser({
        id: req.auth.sub,
        ...(typeof req.auth.email === 'string' ? { email: req.auth.email } : {}),
      });
      if (typeof req.auth.teamId === 'string' && req.auth.teamId.length > 0) {
        tags['teamId'] = req.auth.teamId;
      }
    }

    if (Object.keys(tags).length > 0) {
      this.monitor.setTags(tags);
    }

    return next.handle().pipe(
      finalize(() => {
        // Clear the user from the module-global scope so the next request on
        // this worker doesn't inherit this one's identity.
        this.monitor.setUser(null);
      }),
    );
  }
}

function pickRequestId(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  if (headers === undefined) {
    return undefined;
  }
  const raw = headers['x-request-id'];
  if (raw === undefined) {
    return undefined;
  }
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}
