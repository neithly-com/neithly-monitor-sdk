import { beforeEach, describe, expect, it } from 'vitest';

import { flush, shutdown } from './lifecycle.js';
import { init } from './init.js';
import {
  _resetStateForTest,
  _setSenderForTest,
  isInitialised,
} from './state.js';

const VALID_DSN = `nmk_dev_${'d'.repeat(64)}`;

describe('lifecycle', () => {
  beforeEach(() => {
    _resetStateForTest();
  });

  it('flush resolves true when the sender has no flush method', async () => {
    init({ dsn: VALID_DSN });
    _setSenderForTest(() => undefined);

    await expect(flush(50)).resolves.toBe(true);
  });

  it('flush forwards to a sender.flush hook when present', async () => {
    init({ dsn: VALID_DSN });

    // Sender with an attached flush method — mimics what the transport
    // Feature registers at runtime.
    const sender: ((p: unknown) => void) & {
      flush?: (timeout: number) => Promise<boolean>;
    } = () => undefined;
    sender.flush = async (): Promise<boolean> => true;
    _setSenderForTest(sender);

    await expect(flush(100)).resolves.toBe(true);
  });

  it('flush resolves false when the sender.flush exceeds the timeout', async () => {
    init({ dsn: VALID_DSN });

    const sender: ((p: unknown) => void) & {
      flush?: (timeout: number) => Promise<boolean>;
    } = () => undefined;
    sender.flush = (): Promise<boolean> =>
      new Promise((resolve) => {
        setTimeout(() => resolve(true), 100);
      });
    _setSenderForTest(sender);

    await expect(flush(10)).resolves.toBe(false);
  });

  it('shutdown drains then resets module state', async () => {
    init({ dsn: VALID_DSN });
    expect(isInitialised()).toBe(true);

    await shutdown(50);

    expect(isInitialised()).toBe(false);
  });
});
