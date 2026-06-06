/**
 * Install a `window.onerror` handler that forwards the surfaced error to
 * `captureFn`, then chains any previously-installed handler so we never
 * silently swallow another integration's logic.
 *
 * Returns an uninstaller that restores whatever `window.onerror` was at the
 * time of install — including any handler later set by foreign code — by
 * resetting to the saved prior reference.
 */

export type CaptureFn = (error: unknown) => void;

export type OnErrorUninstaller = () => void;

/**
 * Coerce a `window.onerror` argument tuple into a single `unknown` we can hand
 * to `captureFn`. Browsers pass the real `Error` as the 5th arg when available;
 * fall back to the message otherwise.
 */
function coerceError(
  event: Event | string,
  source: string | undefined,
  lineno: number | undefined,
  colno: number | undefined,
  error: Error | undefined,
): unknown {
  if (error !== undefined && error !== null) {
    return error;
  }
  // No Error provided — synthesise one from the message so the captureFn always
  // sees something it can shape.
  const message = typeof event === 'string' ? event : 'Unknown error';
  const synthetic = new Error(message);
  // Attach the positional metadata as non-enumerable hints; consumers may read
  // them, but they don't appear in JSON.stringify.
  Object.defineProperty(synthetic, 'source', { value: source, enumerable: false });
  Object.defineProperty(synthetic, 'lineno', { value: lineno, enumerable: false });
  Object.defineProperty(synthetic, 'colno', { value: colno, enumerable: false });
  return synthetic;
}

export function installOnerror(captureFn: CaptureFn): OnErrorUninstaller {
  const prior: OnErrorEventHandler = window.onerror ?? null;

  const handler: OnErrorEventHandler = (event, source, lineno, colno, error) => {
    try {
      captureFn(coerceError(event, source, lineno, colno, error));
    } catch {
      // Swallow capture errors — instrumentation must never throw into the host.
    }
    if (typeof prior === 'function') {
      // Chain to the previously-installed handler. Its return value decides
      // whether the browser logs the error to the console.
      return prior.call(window, event, source, lineno, colno, error);
    }
    return false;
  };

  window.onerror = handler;

  return (): void => {
    // Only restore if our handler is still installed; otherwise a foreign
    // integration owns the slot and we should not clobber it.
    if (window.onerror === handler) {
      window.onerror = prior;
    }
  };
}
