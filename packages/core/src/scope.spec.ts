import { describe, expect, it } from 'vitest';

import { Scope } from './scope.js';

describe('Scope', () => {
  it('stores user via setUser and exposes it through snapshot', () => {
    const scope = new Scope();
    scope.setUser({ id: 'u-1', email: 'a@b.c', ip_address: '10.0.0.1' });

    expect(scope.snapshot().user).toEqual({
      id: 'u-1',
      email: 'a@b.c',
      ip_address: '10.0.0.1',
    });
  });

  it('setUser(null) clears the user', () => {
    const scope = new Scope();
    scope.setUser({ id: 'u-1' });
    scope.setUser(null);

    expect(scope.snapshot().user).toBeNull();
  });

  it('setTags shallow-merges across calls', () => {
    const scope = new Scope();
    scope.setTags({ env: 'prod', region: 'eu' });
    scope.setTags({ region: 'us', release: 'v1.2' });

    expect(scope.snapshot().tags).toEqual({
      env: 'prod',
      region: 'us',
      release: 'v1.2',
    });
  });

  it('setContext stores a namespace and setContext(ns, null) removes it', () => {
    const scope = new Scope();
    scope.setContext('runtime', { name: 'node', version: '20' });
    scope.setContext('device', { os: 'linux' });

    expect(scope.snapshot().contexts).toEqual({
      runtime: { name: 'node', version: '20' },
      device: { os: 'linux' },
    });

    scope.setContext('runtime', null);
    expect(scope.snapshot().contexts).toEqual({
      device: { os: 'linux' },
    });
  });

  it('setExtra writes arbitrary values onto extras', () => {
    const scope = new Scope();
    scope.setExtra('correlationId', 'abc-123');
    scope.setExtra('attempt', 3);
    scope.setExtra('payload', { foo: 'bar' });

    expect(scope.snapshot().extras).toEqual({
      correlationId: 'abc-123',
      attempt: 3,
      payload: { foo: 'bar' },
    });
  });

  it('addBreadcrumb appears in snapshot.breadcrumbs with a timestamp', () => {
    const scope = new Scope();
    scope.addBreadcrumb({
      category: 'http',
      message: 'GET /users',
      level: 'info',
      timestamp: 1_700_000_000_000,
    });

    const breadcrumbs = scope.snapshot().breadcrumbs;
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toEqual({
      category: 'http',
      message: 'GET /users',
      level: 'info',
      timestamp: 1_700_000_000_000,
    });
  });

  it('addBreadcrumb stamps a timestamp when one is not supplied', () => {
    const scope = new Scope();
    const before = Date.now();
    scope.addBreadcrumb({ category: 'click', message: 'btn' });
    const after = Date.now();

    const [crumb] = scope.snapshot().breadcrumbs;
    expect(crumb).toBeDefined();
    expect(crumb?.timestamp).toBeGreaterThanOrEqual(before);
    expect(crumb?.timestamp).toBeLessThanOrEqual(after);
  });

  it('clone() produces a deep copy: mutating clone tags does not touch the original', () => {
    const original = new Scope();
    original.setTags({ env: 'prod' });
    original.setContext('runtime', { name: 'node' });
    original.setExtra('attempt', 1);
    original.setUser({ id: 'u-1' });
    original.addBreadcrumb({
      category: 'nav',
      message: '/home',
      timestamp: 1,
    });

    const clone = original.clone();
    clone.setTags({ env: 'staging', extra: 'yes' });
    clone.setContext('runtime', { name: 'browser' });
    clone.setExtra('attempt', 2);
    clone.setUser({ id: 'u-2' });
    clone.addBreadcrumb({ category: 'nav', message: '/about', timestamp: 2 });

    const originalSnap = original.snapshot();
    expect(originalSnap.tags).toEqual({ env: 'prod' });
    expect(originalSnap.contexts).toEqual({ runtime: { name: 'node' } });
    expect(originalSnap.extras).toEqual({ attempt: 1 });
    expect(originalSnap.user).toEqual({ id: 'u-1' });
    expect(originalSnap.breadcrumbs).toHaveLength(1);
    expect(originalSnap.breadcrumbs[0]?.message).toBe('/home');

    const cloneSnap = clone.snapshot();
    expect(cloneSnap.tags).toEqual({ env: 'staging', extra: 'yes' });
    expect(cloneSnap.contexts).toEqual({ runtime: { name: 'browser' } });
    expect(cloneSnap.extras).toEqual({ attempt: 2 });
    expect(cloneSnap.user).toEqual({ id: 'u-2' });
    expect(cloneSnap.breadcrumbs).toHaveLength(2);
  });

  it('clone() deep-copies nested context objects so mutating them does not leak', () => {
    const original = new Scope();
    original.setContext('runtime', { name: 'node', version: '20' });

    const clone = original.clone();
    const cloneSnap = clone.snapshot();
    const runtime = cloneSnap.contexts['runtime'];
    expect(runtime).toBeDefined();
    if (runtime !== undefined) {
      runtime['version'] = '22';
    }

    // Original still sees the un-mutated value.
    expect(original.snapshot().contexts).toEqual({
      runtime: { name: 'node', version: '20' },
    });
  });

  it('snapshot() returns fresh objects: mutating the result does not affect Scope', () => {
    const scope = new Scope();
    scope.setTags({ env: 'prod' });
    scope.setContext('runtime', { name: 'node' });
    scope.setExtra('attempt', 1);
    scope.setUser({ id: 'u-1' });
    scope.addBreadcrumb({ category: 'nav', timestamp: 1 });

    const snap = scope.snapshot();
    snap.tags['env'] = 'mutated';
    snap.tags['injected'] = 'yes';
    const runtime = snap.contexts['runtime'];
    if (runtime !== undefined) {
      runtime['name'] = 'browser';
    }
    snap.extras['attempt'] = 999;
    if (snap.user !== null) {
      snap.user.id = 'mutated';
    }
    snap.breadcrumbs.push({ category: 'noise', timestamp: 2 });

    const fresh = scope.snapshot();
    expect(fresh.tags).toEqual({ env: 'prod' });
    expect(fresh.contexts).toEqual({ runtime: { name: 'node' } });
    expect(fresh.extras).toEqual({ attempt: 1 });
    expect(fresh.user).toEqual({ id: 'u-1' });
    expect(fresh.breadcrumbs).toHaveLength(1);
    expect(fresh.breadcrumbs[0]?.category).toBe('nav');
  });

  it('snapshot() defensively copies breadcrumb entries so mutating one does not bleed back', () => {
    const scope = new Scope();
    scope.addBreadcrumb({
      category: 'http',
      message: 'GET /a',
      data: { url: '/a' },
      timestamp: 10,
    });

    const snap = scope.snapshot();
    const first = snap.breadcrumbs[0];
    expect(first).toBeDefined();
    if (first !== undefined) {
      first.message = 'mutated';
      if (first.data !== undefined) {
        first.data['url'] = '/mutated';
      }
    }

    const fresh = scope.snapshot();
    expect(fresh.breadcrumbs[0]?.message).toBe('GET /a');
  });

  it('exposes a chained fluent API: every mutator returns the same scope instance', () => {
    const scope = new Scope();

    const result = scope
      .setUser({ id: 'u-1' })
      .setTags({ env: 'prod' })
      .setContext('runtime', { name: 'node' })
      .setExtra('attempt', 1)
      .addBreadcrumb({ category: 'nav', timestamp: 1 });

    expect(result).toBe(scope);

    const snap = scope.snapshot();
    expect(snap.user).toEqual({ id: 'u-1' });
    expect(snap.tags).toEqual({ env: 'prod' });
    expect(snap.contexts).toEqual({ runtime: { name: 'node' } });
    expect(snap.extras).toEqual({ attempt: 1 });
    expect(snap.breadcrumbs).toHaveLength(1);
  });

  it('starts with empty state: user=null, tags/contexts/extras={}, breadcrumbs=[]', () => {
    const scope = new Scope();
    expect(scope.snapshot()).toEqual({
      user: null,
      tags: {},
      contexts: {},
      extras: {},
      breadcrumbs: [],
    });
  });

  it('setUser defensively copies the input so caller mutations do not leak in', () => {
    const scope = new Scope();
    const input = { id: 'u-1', email: 'a@b.c' };
    scope.setUser(input);
    input.id = 'mutated';
    input.email = 'changed@x.y';

    expect(scope.snapshot().user).toEqual({ id: 'u-1', email: 'a@b.c' });
  });

  it('setContext defensively copies the input so caller mutations do not leak in', () => {
    const scope = new Scope();
    const ctx: Record<string, unknown> = { name: 'node', version: '20' };
    scope.setContext('runtime', ctx);
    ctx['version'] = '22';

    expect(scope.snapshot().contexts).toEqual({
      runtime: { name: 'node', version: '20' },
    });
  });
});
