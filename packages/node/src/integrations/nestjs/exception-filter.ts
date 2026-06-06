/**
 * Global exception filter that captures unhandled errors into Neithly before
 * delegating to Nest's default exception handler so the HTTP response is
 * shaped exactly as it would be without the binding present.
 *
 * Behaviour:
 * - `HttpException` with status < 500 is treated as expected client error and
 *   skipped (no capture). This avoids drowning the inbox in 4xx noise.
 * - `HttpException` with status >= 500 is captured.
 * - Anything else (plain `Error`, unknown thrown value) is always captured.
 *
 * We extend `BaseExceptionFilter` and call `super.catch(...)` rather than
 * rethrowing. Rethrowing inside a filter that's registered as the global
 * `APP_FILTER` produces a double-capture because Nest re-runs the same
 * filter on the rethrown exception; delegating to the base sidesteps that.
 *
 * The filter retrieves the per-request scope set by `NeithlyInterceptor`
 * (stashed on the request under `NEITHLY_REQUEST_SCOPE_KEY`) and snapshots
 * it on a one-off child scope so the captured payload carries the
 * request-shaped tags. We don't trust AsyncLocalStorage alone because
 * Nest's interceptor consumer uses `AsyncResource.bind` snapshots taken
 * before our interceptor opens its scope.
 */

import { Catch, HttpException, Inject, Optional } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter, type HttpAdapterHost } from '@nestjs/core';
import type { Scope } from '@neithly-com/monitor-core';

import type { NeithlyClient } from './client.js';
import { NEITHLY_CLIENT, NEITHLY_REQUEST_SCOPE_KEY } from './tokens.js';

interface RequestWithScope {
  [NEITHLY_REQUEST_SCOPE_KEY]?: Scope;
}

@Catch()
export class NeithlyExceptionFilter extends BaseExceptionFilter {
  constructor(
    @Inject(NEITHLY_CLIENT) private readonly client: NeithlyClient,
    @Optional() httpAdapterHost?: HttpAdapterHost,
  ) {
    super(httpAdapterHost?.httpAdapter);
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (NeithlyExceptionFilter.shouldCapture(exception)) {
      // If the interceptor ran for this request, it stashed a scope on the
      // request object. Re-enter `withScope` and replay the tags so the
      // active scope at capture time carries them.
      const reqScope = NeithlyExceptionFilter.extractScope(host);
      if (reqScope !== null) {
        this.client.withScope((scope) => {
          const snap = reqScope.snapshot();
          scope.setTags(snap.tags);
          if (snap.user !== null) {
            scope.setUser(snap.user);
          }
          this.client.captureException(exception);
        });
      } else {
        this.client.captureException(exception);
      }
    }
    super.catch(exception, host);
  }

  /**
   * Exposed as a static helper so tests can exercise the decision logic
   * without spinning up a full Nest application.
   */
  static shouldCapture(exception: unknown): boolean {
    if (exception instanceof HttpException) {
      return exception.getStatus() >= 500;
    }
    return true;
  }

  private static extractScope(host: ArgumentsHost): Scope | null {
    if (host.getType() !== 'http') {
      return null;
    }
    const req = host.switchToHttp().getRequest<RequestWithScope>();
    return req[NEITHLY_REQUEST_SCOPE_KEY] ?? null;
  }
}
