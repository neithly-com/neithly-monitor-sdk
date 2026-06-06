/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installOnerror } from './onerror.js';

describe('installOnerror', () => {
  beforeEach(() => {
    window.onerror = null;
  });

  afterEach(() => {
    window.onerror = null;
  });

  it('forwards a real Error to captureFn', () => {
    const captured: unknown[] = [];
    const uninstall = installOnerror((e) => captured.push(e));

    const err = new Error('boom');
    window.onerror?.call(window, 'boom', 'app.js', 42, 7, err);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe(err);
    uninstall();
  });

  it('synthesises an Error when none was provided', () => {
    const captured: unknown[] = [];
    const uninstall = installOnerror((e) => captured.push(e));

    window.onerror?.call(window, 'scriptError', 'a.js', 1, 2, undefined);

    expect(captured).toHaveLength(1);
    const first = captured[0];
    expect(first).toBeInstanceOf(Error);
    expect((first as Error).message).toBe('scriptError');
    uninstall();
  });

  it('chains a previously-installed handler and preserves its return value', () => {
    const priorCalls: string[] = [];
    window.onerror = (msg): boolean => {
      priorCalls.push(String(msg));
      return true;
    };

    const captured: unknown[] = [];
    const uninstall = installOnerror((e) => captured.push(e));

    const result = window.onerror?.call(window, 'oops', 'a.js', 1, 2, new Error('oops'));

    expect(captured).toHaveLength(1);
    expect(priorCalls).toEqual(['oops']);
    expect(result).toBe(true);
    uninstall();
  });

  it('uninstaller restores the prior handler', () => {
    const prior = vi.fn();
    window.onerror = prior;

    const uninstall = installOnerror(() => undefined);
    expect(window.onerror).not.toBe(prior);

    uninstall();
    expect(window.onerror).toBe(prior);
  });

  it('does not throw when captureFn throws', () => {
    const uninstall = installOnerror(() => {
      throw new Error('sink-failure');
    });

    expect(() =>
      window.onerror?.call(window, 'x', 'a.js', 1, 2, new Error('x')),
    ).not.toThrow();
    uninstall();
  });
});
