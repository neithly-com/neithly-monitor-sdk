/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';

import { installUnhandledRejection } from './unhandledrejection.js';

function dispatchRejection(reason: unknown): void {
  // jsdom's PromiseRejectionEvent constructor is available; if not, fall back to a CustomEvent.
  const event =
    typeof PromiseRejectionEvent !== 'undefined'
      ? new PromiseRejectionEvent('unhandledrejection', {
          promise: Promise.reject(reason).catch(() => undefined),
          reason,
        })
      : new CustomEvent('unhandledrejection', { detail: { reason } });
  window.dispatchEvent(event);
}

describe('installUnhandledRejection', () => {
  it('captures the rejection reason', () => {
    const captured: unknown[] = [];
    const uninstall = installUnhandledRejection((e) => captured.push(e));

    const reason = new Error('async-boom');
    dispatchRejection(reason);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe(reason);
    uninstall();
  });

  it('captures non-Error rejection reasons verbatim', () => {
    const captured: unknown[] = [];
    const uninstall = installUnhandledRejection((e) => captured.push(e));

    dispatchRejection('string-reason');

    expect(captured).toEqual(['string-reason']);
    uninstall();
  });

  it('uninstaller removes the listener', () => {
    const captured: unknown[] = [];
    const uninstall = installUnhandledRejection((e) => captured.push(e));

    uninstall();
    dispatchRejection(new Error('after-uninstall'));
    expect(captured).toHaveLength(0);
  });

  it('does not throw when captureFn throws', () => {
    const uninstall = installUnhandledRejection(() => {
      throw new Error('sink-failure');
    });

    expect(() => dispatchRejection(new Error('boom'))).not.toThrow();
    uninstall();
  });
});
