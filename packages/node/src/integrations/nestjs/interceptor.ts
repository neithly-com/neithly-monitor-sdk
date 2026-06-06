/**
 * Per-request interceptor that wraps the handler in a `withScope` so
 * request-shaped tags (HTTP method, URL, x-request-id, eventual response
 * status code) are attached to any exception captured inside that scope.
 *
 * `withScope(fn)` is expected to make the scope active for the synchronous
 * portion of `fn`. To bridge the gap between the interceptor (which opens
 * the scope) and the exception filter (which captures), we also stash the
 * scope on the request object under {@link NEITHLY_REQUEST_SCOPE_KEY}.
 * Nest's interceptor consumer uses `AsyncResource.bind` snapshots that
 * pre-date our `withScope` call, so we can't rely on naive async-context
 * propagation alone — the request-attached scope is the reliable bridge.
 *
 * The `finalize` operator stamps `statusCode` once the response has been
 * produced (or the stream has errored) — that's the earliest moment Nest
 * knows the final status.
 */

import { Inject, Injectable } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

import type { Scope } from '@neithly-com/monitor-core';

import type { NeithlyClient } from './client.js';
import { NEITHLY_CLIENT, NEITHLY_REQUEST_SCOPE_KEY } from './tokens.js';

interface RequestLike {
  readonly method?: string;
  readonly url?: string;
  readonly originalUrl?: string;
  readonly headers?: Record<string, string | string[] | undefined>;
  // Mutable index for stashing the scope; the symbol property is set by us.
  [key: symbol]: Scope | undefined;
}

interface ResponseLike {
  readonly statusCode?: number;
}

@Injectable()
export class NeithlyInterceptor implements NestInterceptor {
  constructor(@Inject(NEITHLY_CLIENT) private readonly client: NeithlyClient) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only HTTP transports carry the request/response pair we care about.
    // For RPC / WebSocket contexts we still open a scope (so user code can
    // tag freely) but skip request-shaped tags.
    const isHttp = context.getType() === 'http';
    const httpCtx = isHttp ? context.switchToHttp() : null;
    const request: RequestLike | null =
      httpCtx?.getRequest<RequestLike>() ?? null;
    const response: ResponseLike | null =
      httpCtx?.getResponse<ResponseLike>() ?? null;

    return new Observable<unknown>((subscriber) => {
      let inner: { unsubscribe(): void } | undefined;
      this.client.withScope((scope) => {
        if (request !== null) {
          const tags: Record<string, string> = {};
          if (typeof request.method === 'string') {
            tags['http.method'] = request.method;
          }
          const url = request.originalUrl ?? request.url;
          if (typeof url === 'string') {
            tags['http.url'] = url;
          }
          const requestId = pickRequestId(request.headers);
          if (requestId !== undefined) {
            tags['http.request_id'] = requestId;
          }
          if (Object.keys(tags).length > 0) {
            scope.setTags(tags);
          }
          // Stash on the request so the exception filter can recover the
          // scope at capture time (see top-of-file comment for why we don't
          // rely on AsyncLocalStorage alone here).
          (request as RequestLike)[NEITHLY_REQUEST_SCOPE_KEY] = scope;
        }

        inner = next
          .handle()
          .pipe(
            finalize(() => {
              if (response !== null && typeof response.statusCode === 'number') {
                scope.setTags({
                  'http.status_code': String(response.statusCode),
                });
              }
            }),
          )
          .subscribe({
            next: (value) => subscriber.next(value),
            error: (err) => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
      });
      return () => {
        inner?.unsubscribe();
      };
    });
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
