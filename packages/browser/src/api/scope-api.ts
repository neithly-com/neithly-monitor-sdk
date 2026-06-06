/**
 * Scope mutators and `withScope`.
 *
 * Unlike the Node SDK, there's no AsyncLocalStorage here — `withScope` clones
 * the current global scope, swaps it in synchronously, runs the callback, and
 * restores the previous scope on return (and on throw). This is safe because
 * the browser is single-threaded; async work scheduled from inside the
 * callback runs after `withScope` has restored, so it should not rely on the
 * forked scope.
 */

import type {
  Breadcrumb,
  Scope,
  UserContext,
} from '@neithly-com/monitor-core';

import { getScope, setScope } from './state.js';

export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  getScope().addBreadcrumb(breadcrumb);
}

export function setUser(user: UserContext | null): void {
  getScope().setUser(user);
}

export function setTags(tags: Record<string, string>): void {
  getScope().setTags(tags);
}

export function setContext(
  namespace: string,
  ctx: Record<string, unknown> | null,
): void {
  getScope().setContext(namespace, ctx);
}

export function setExtra(key: string, value: unknown): void {
  getScope().setExtra(key, value);
}

/**
 * Synchronously clone the current scope, swap it in, run `fn`, then restore
 * the previous scope. Mutations inside `fn` (breadcrumbs, tags, user…) do not
 * leak out. Returns whatever `fn` returns; if `fn` throws, the previous scope
 * is still restored before the throw propagates.
 */
export function withScope<T>(fn: (scope: Scope) => T): T {
  const previous = getScope();
  const forked = previous.clone();
  setScope(forked);
  try {
    return fn(forked);
  } finally {
    setScope(previous);
  }
}
