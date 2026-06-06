/**
 * Per-event scope: user identity, tags, contexts, extras, and a breadcrumb ring.
 *
 * Pure logic: no HTTP, no DOM, no Node-only globals. The scope owns its own
 * `BreadcrumbRing` so `clone()` can carry a copy along without re-plumbing the
 * ring through callers.
 *
 * All mutators return `this` to support a fluent builder style. `snapshot()`
 * returns fresh objects so callers can hand them off to a serialiser without
 * fear of subsequent scope mutations leaking through.
 */

import type { Breadcrumb, SerialisedBreadcrumb } from './breadcrumbs.js';
import { BreadcrumbRing } from './breadcrumbs.js';

export interface UserContext {
  id?: string;
  email?: string;
  ip_address?: string;
}

export interface ScopeSnapshot {
  user: UserContext | null;
  tags: Record<string, string>;
  contexts: Record<string, Record<string, unknown>>;
  extras: Record<string, unknown>;
  breadcrumbs: SerialisedBreadcrumb[];
}

function cloneUser(user: UserContext): UserContext {
  const out: UserContext = {};
  if (user.id !== undefined) {
    out.id = user.id;
  }
  if (user.email !== undefined) {
    out.email = user.email;
  }
  if (user.ip_address !== undefined) {
    out.ip_address = user.ip_address;
  }
  return out;
}

function cloneTags(tags: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(tags)) {
    const value = tags[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function cloneContexts(
  contexts: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const key of Object.keys(contexts)) {
    const value = contexts[key];
    if (value !== undefined) {
      out[key] = { ...value };
    }
  }
  return out;
}

function cloneExtras(extras: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(extras)) {
    out[key] = extras[key];
  }
  return out;
}

function cloneRing(ring: BreadcrumbRing): BreadcrumbRing {
  const next = new BreadcrumbRing();
  for (const entry of ring.snapshot()) {
    next.push(entry);
  }
  return next;
}

export class Scope {
  #user: UserContext | null = null;
  #tags: Record<string, string> = {};
  #contexts: Record<string, Record<string, unknown>> = {};
  #extras: Record<string, unknown> = {};
  #breadcrumbs: BreadcrumbRing = new BreadcrumbRing();

  setUser(user: UserContext | null): this {
    if (user === null) {
      this.#user = null;
      return this;
    }
    this.#user = cloneUser(user);
    return this;
  }

  setTags(tags: Record<string, string>): this {
    for (const key of Object.keys(tags)) {
      const value = tags[key];
      if (value !== undefined) {
        this.#tags[key] = value;
      }
    }
    return this;
  }

  setContext(namespace: string, ctx: Record<string, unknown> | null): this {
    if (ctx === null) {
      delete this.#contexts[namespace];
      return this;
    }
    this.#contexts[namespace] = { ...ctx };
    return this;
  }

  setExtra(key: string, value: unknown): this {
    this.#extras[key] = value;
    return this;
  }

  addBreadcrumb(breadcrumb: Breadcrumb): this {
    this.#breadcrumbs.push(breadcrumb);
    return this;
  }

  clone(): Scope {
    const next = new Scope();
    if (this.#user !== null) {
      next.setUser(cloneUser(this.#user));
    }
    // Inject deep-copied internals via a private hook so the public setters
    // don't have to be replayed key-by-key.
    next.replaceInternals(
      cloneTags(this.#tags),
      cloneContexts(this.#contexts),
      cloneExtras(this.#extras),
      cloneRing(this.#breadcrumbs),
    );
    return next;
  }

  snapshot(): ScopeSnapshot {
    return {
      user: this.#user === null ? null : cloneUser(this.#user),
      tags: cloneTags(this.#tags),
      contexts: cloneContexts(this.#contexts),
      extras: cloneExtras(this.#extras),
      breadcrumbs: this.#breadcrumbs.snapshot(),
    };
  }

  /**
   * Internal hook used by `clone()` to inject deep-copied state into a freshly
   * constructed instance. Not part of the public API.
   */
  private replaceInternals(
    tags: Record<string, string>,
    contexts: Record<string, Record<string, unknown>>,
    extras: Record<string, unknown>,
    breadcrumbs: BreadcrumbRing,
  ): void {
    this.#tags = tags;
    this.#contexts = contexts;
    this.#extras = extras;
    this.#breadcrumbs = breadcrumbs;
  }
}
