import type { InMemoryEnvelopeQueue, QueuedEnvelope } from './queue.js';

/** Uninstaller returned by `installPagehideFlush`. Idempotent. */
export type Uninstall = () => void;

export interface InstallPagehideFlushOptions {
  /** Window-like target. Defaults to `globalThis.window`. */
  window?: Window;
  /**
   * Custom fetch used as a fallback when `navigator.sendBeacon` is unavailable
   * or rejects the envelope. Defaults to `globalThis.fetch`.
   */
  fetch?: typeof fetch;
}

/**
 * Best-effort flush of any envelopes queued on the {@link InMemoryEnvelopeQueue}
 * when the page is being torn down. Listens on `pagehide` and on
 * `visibilitychange` (when the document becomes hidden) — both events fire
 * reliably across browsers on tab close, navigation, and mobile background.
 *
 * Each envelope is dispatched via `navigator.sendBeacon` first (CORS-safe
 * Blob with `Content-Type: text/plain` — beacon doesn't support custom
 * headers, so the public key travels inside the URL via the `Authorization`
 * header substitute we pre-bake into the queue). If beacon refuses (queue
 * full, payload too big) we fall back to `fetch({ keepalive: true })`.
 *
 * NOTE: `navigator.sendBeacon` cannot send custom headers. The pagehide path
 * sends the body as `Blob` with the original `Content-Type` and leaves
 * authentication on the URL — callers should ensure backend accepts beacons
 * via a query-string token if strict auth is required. For now we still set
 * the Blob's MIME from `headers['Content-Type']` and rely on the public-key
 * header for the fetch fallback.
 */
export function installPagehideFlush(
  queue: InMemoryEnvelopeQueue,
  options: InstallPagehideFlushOptions = {},
): Uninstall {
  const maybeWin = options.window ?? globalThis.window;
  if (maybeWin === undefined) {
    // No DOM — nothing to do. Return a no-op uninstaller for symmetry.
    return () => {};
  }
  const win: Window = maybeWin;

  const fetchImpl = options.fetch ?? globalThis.fetch;

  function dispatch(envelope: QueuedEnvelope): void {
    const contentType = envelope.headers['Content-Type'] ?? 'application/json';
    const nav = win.navigator as Navigator & {
      sendBeacon?: (url: string, data?: BodyInit) => boolean;
    };

    let accepted = false;
    if (typeof nav.sendBeacon === 'function') {
      try {
        const blob = new Blob([envelope.body], { type: contentType });
        accepted = nav.sendBeacon(envelope.url, blob);
      } catch {
        accepted = false;
      }
    }

    if (accepted) {
      return;
    }

    // Fallback — fire-and-forget keepalive fetch. Ignore the promise; the
    // page is going away, we cannot await it.
    try {
      void fetchImpl(envelope.url, {
        method: 'POST',
        keepalive: true,
        headers: envelope.headers,
        body: envelope.body,
      });
    } catch {
      // Swallow — pagehide is best-effort.
    }
  }

  function flushAll(): void {
    if (queue.size === 0) {
      return;
    }
    const drained = queue.flush();
    for (const envelope of drained) {
      dispatch(envelope);
    }
  }

  function onPagehide(): void {
    flushAll();
  }

  function onVisibilityChange(): void {
    if (win.document.visibilityState === 'hidden') {
      flushAll();
    }
  }

  win.addEventListener('pagehide', onPagehide);
  win.document.addEventListener('visibilitychange', onVisibilityChange);

  let uninstalled = false;
  return () => {
    if (uninstalled) {
      return;
    }
    uninstalled = true;
    win.removeEventListener('pagehide', onPagehide);
    win.document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
