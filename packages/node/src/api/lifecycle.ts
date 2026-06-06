/**
 * Lifecycle entry points: `flush(timeoutMs?)` and `shutdown()`.
 *
 * Both delegate to the module-scoped processor. The default no-op processor
 * resolves immediately, so calling these before `init()` (or before transport
 * is wired in) is safe and returns success.
 */

import { getProcessor } from './state.js';

/**
 * Wait for any pending records to be sent. Resolves to `true` when the queue
 * drained inside `timeoutMs`, `false` otherwise. With the default no-op
 * processor (pre-init / pre-transport) this resolves to `true` immediately.
 */
export async function flush(timeoutMs?: number): Promise<boolean> {
  const processor = getProcessor();
  if (processor.flush === undefined) {
    return true;
  }
  return processor.flush(timeoutMs);
}

/**
 * Tear down the SDK: stop accepting new records and flush any in-flight ones.
 * No-op when the default no-op processor is in place.
 */
export async function shutdown(): Promise<void> {
  const processor = getProcessor();
  if (processor.shutdown === undefined) {
    return;
  }
  await processor.shutdown();
}
