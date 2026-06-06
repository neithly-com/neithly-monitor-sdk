/**
 * `flush` and `shutdown` lifecycle helpers.
 *
 * The actual transport (with its in-memory queue + sendBeacon fallback) lives
 * in a sibling Feature under transport/. These helpers expose the public
 * shape the host app calls (e.g. before navigation) and forward to whatever
 * sender is currently wired. The default no-op sender resolves immediately.
 */

import { _resetStateForTest, _setSenderForTest, getSender } from './state.js';

/**
 * Ask the underlying sender to drain its buffer. The sender contract allows
 * sync or async senders — we always normalise to a Promise<boolean> that
 * resolves `true` when the drain succeeded within `timeout` ms (or
 * immediately if there's nothing to drain), and `false` if the timeout fired
 * first.
 */
export function flush(timeout: number = 2_000): Promise<boolean> {
  const sender = getSender();
  // Senders signal "flush me" by being called with a marker payload-less call.
  // Today the default sender is a no-op, so we just race a resolved promise
  // against the timeout. The transport Feature will register a sender that
  // exposes a `flush` method; we look for it dynamically so we don't have to
  // import that module here.
  const maybeFlush = (sender as unknown as { flush?: (t: number) => Promise<boolean> })
    .flush;
  if (typeof maybeFlush === 'function') {
    return Promise.race<boolean>([
      maybeFlush(timeout),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), timeout);
      }),
    ]);
  }
  return Promise.resolve(true);
}

/**
 * Flush then tear the SDK back down. Subsequent `init()` calls will succeed
 * again. Test seam: this also resets module state, which is what specs want
 * in `afterEach`.
 */
export async function shutdown(timeout: number = 2_000): Promise<boolean> {
  const drained = await flush(timeout);
  _resetStateForTest();
  return drained;
}

// Re-export the sender seam under the api/ surface so the barrel and specs
// can reach it without poking at state.ts directly.
export { _setSenderForTest };
