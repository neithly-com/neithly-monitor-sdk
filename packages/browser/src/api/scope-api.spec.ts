import { beforeEach, describe, expect, it } from 'vitest';

import { captureMessage } from './capture.js';
import { init } from './init.js';
import {
  addBreadcrumb,
  setContext,
  setExtra,
  setTags,
  setUser,
  withScope,
} from './scope-api.js';
import {
  _resetStateForTest,
  _setSenderForTest,
  getScope,
  type SendPayload,
} from './state.js';

const VALID_DSN = `nmk_staging_${'c'.repeat(64)}`;

function attrValue(
  payload: SendPayload,
  key: string,
): string | undefined {
  return payload.record.attributes.find((kv) => kv.key === key)?.value.stringValue;
}

describe('scope-api', () => {
  beforeEach(() => {
    _resetStateForTest();
    init({ dsn: VALID_DSN });
  });

  it('addBreadcrumb pushes onto the live scope', () => {
    addBreadcrumb({ category: 'nav', message: '/home' });
    const snap = getScope().snapshot();
    expect(snap.breadcrumbs).toHaveLength(1);
    expect(snap.breadcrumbs[0]?.category).toBe('nav');
  });

  it('setUser, setTags, setContext, setExtra mutate live scope', () => {
    setUser({ id: 'u1' });
    setTags({ k: 'v' });
    setContext('runtime', { name: 'browser' });
    setExtra('debug', { detail: 1 });

    const snap = getScope().snapshot();
    expect(snap.user).toEqual({ id: 'u1' });
    expect(snap.tags).toEqual({ k: 'v' });
    expect(snap.contexts['runtime']).toEqual({ name: 'browser' });
    expect(snap.extras['debug']).toEqual({ detail: 1 });
  });

  it('withScope isolates mutations synchronously', () => {
    setTags({ outer: 'yes' });

    withScope((scope) => {
      scope.setTags({ inner: 'only' });
      scope.addBreadcrumb({ category: 'inner.crumb' });
    });

    const after = getScope().snapshot();
    expect(after.tags).toEqual({ outer: 'yes' });
    expect(after.breadcrumbs).toHaveLength(0);
  });

  it('withScope restores the previous scope if the callback throws', () => {
    setTags({ outer: 'yes' });

    expect(() =>
      withScope((scope) => {
        scope.setTags({ inner: 'leak?' });
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(getScope().snapshot().tags).toEqual({ outer: 'yes' });
  });

  it('captureMessage inside withScope sees the forked scope', () => {
    const payloads: SendPayload[] = [];
    _setSenderForTest((p) => {
      payloads.push(p);
    });

    setTags({ outer: 'yes' });
    withScope((scope) => {
      scope.setTags({ inner: 'visible' });
      captureMessage('inside');
    });
    captureMessage('outside');

    expect(payloads).toHaveLength(2);
    const inside = payloads[0];
    const outside = payloads[1];
    expect(inside).toBeDefined();
    expect(outside).toBeDefined();
    if (inside === undefined || outside === undefined) {
      return;
    }
    expect(attrValue(inside, 'tag.inner')).toBe('visible');
    expect(attrValue(inside, 'tag.outer')).toBe('yes');
    expect(attrValue(outside, 'tag.inner')).toBeUndefined();
    expect(attrValue(outside, 'tag.outer')).toBe('yes');
  });
});
