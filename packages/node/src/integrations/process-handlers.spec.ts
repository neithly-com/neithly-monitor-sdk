import { afterEach, describe, expect, it, vi } from 'vitest';

import { installUncaughtHandlers } from './process-handlers.js';

// The TS lib types model `process.emit` with strict per-event overloads. At
// runtime EventEmitter accepts any event name — funnel through a loosely
// typed alias for the tests.
const emit = (event: string, ...args: unknown[]): boolean =>
  (process as unknown as { emit: (event: string, ...args: unknown[]) => boolean }).emit(
    event,
    ...args,
  );

afterEach(() => {
  // Make sure no stray listeners survive between tests.
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
});

describe('installUncaughtHandlers', () => {
  it('invokes captureFn for uncaughtException and returns an uninstaller', () => {
    const captureFn = vi.fn<(err: unknown) => void>();
    const uninstall = installUncaughtHandlers(captureFn);

    const err = new Error('boom');
    // Suppress the default crash path inside Node's test runner by attaching
    // a sink listener AFTER ours; the chain runs in registration order.
    const sink = vi.fn();
    process.on('uncaughtException', sink);

    emit('uncaughtException', err, 'uncaughtException');

    expect(captureFn).toHaveBeenCalledTimes(1);
    expect(captureFn).toHaveBeenCalledWith(err);
    expect(sink).toHaveBeenCalled();

    process.removeListener('uncaughtException', sink);
    uninstall();
  });

  it('invokes captureFn for unhandledRejection and re-emits', () => {
    const captureFn = vi.fn<(err: unknown) => void>();
    const uninstall = installUncaughtHandlers(captureFn);

    const reason = new Error('rejected');
    const fakePromise = Promise.resolve();
    const sink = vi.fn();
    process.on('unhandledRejection', sink);

    emit('unhandledRejection', reason, fakePromise);

    expect(captureFn).toHaveBeenCalledTimes(1);
    expect(captureFn).toHaveBeenCalledWith(reason);
    expect(sink).toHaveBeenCalled();

    process.removeListener('unhandledRejection', sink);
    uninstall();
  });

  it('uninstaller removes both listeners', () => {
    const captureFn = vi.fn<(err: unknown) => void>();
    const uninstall = installUncaughtHandlers(captureFn);
    uninstall();

    emit('uncaughtException', new Error('after-uninstall'), 'uncaughtException');
    emit('unhandledRejection', new Error('after-uninstall'), Promise.resolve());

    expect(captureFn).not.toHaveBeenCalled();
  });

  it('swallows captureFn errors and still re-emits', () => {
    const captureFn = vi.fn<(err: unknown) => void>(() => {
      throw new Error('capture exploded');
    });
    const uninstall = installUncaughtHandlers(captureFn);
    const sink = vi.fn();
    process.on('uncaughtException', sink);

    emit('uncaughtException', new Error('real'), 'uncaughtException');

    expect(captureFn).toHaveBeenCalled();
    expect(sink).toHaveBeenCalled();

    process.removeListener('uncaughtException', sink);
    uninstall();
  });
});
