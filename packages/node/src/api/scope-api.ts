/**
 * Top-level scope manipulators (Sentry-shaped).
 *
 * These mutate the active scope — the ALS-bound one inside a `withScope`
 * callback, or the module-global one outside it. `withScope` forks the active
 * scope into a child, binds it via `AsyncLocalStorage.run`, and returns the
 * callback's result so async work is naturally awaited.
 */

import type { Breadcrumb, Scope, UserContext } from '@neithly-com/monitor-core';

import { getActiveScope, getAsyncStorage } from './state.js';

export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  getActiveScope().addBreadcrumb(breadcrumb);
}

export function setUser(user: UserContext | null): void {
  getActiveScope().setUser(user);
}

export function setTags(tags: Record<string, string>): void {
  getActiveScope().setTags(tags);
}

export function setContext(
  namespace: string,
  ctx: Record<string, unknown> | null,
): void {
  getActiveScope().setContext(namespace, ctx);
}

export function setExtra(key: string, value: unknown): void {
  getActiveScope().setExtra(key, value);
}

/**
 * Run `callback` with a forked copy of the current active scope bound to ALS.
 * Mutations performed inside the callback (or any async work it awaits) hit
 * the child scope only — the parent scope is left untouched.
 *
 * Generic over the callback return type so awaited results pass through
 * unchanged.
 */
export function withScope<T>(callback: (scope: Scope) => T): T {
  const child = getActiveScope().clone();
  return getAsyncStorage().run(child, () => callback(child));
}
