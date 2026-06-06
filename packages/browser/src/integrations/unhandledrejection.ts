/**
 * Install a global `unhandledrejection` listener that forwards the rejection
 * reason to `captureFn`.
 *
 * Returns an uninstaller that removes the listener exactly once. The listener
 * never calls `event.preventDefault()` so the host application's own logging
 * (and the browser's default behaviour) is preserved.
 */

export type CaptureFn = (error: unknown) => void;

export type UnhandledRejectionUninstaller = () => void;

export function installUnhandledRejection(
  captureFn: CaptureFn,
): UnhandledRejectionUninstaller {
  const handler = (event: PromiseRejectionEvent): void => {
    try {
      captureFn(event.reason);
    } catch {
      // Instrumentation must never throw into the host.
    }
  };

  window.addEventListener('unhandledrejection', handler);

  return (): void => {
    window.removeEventListener('unhandledrejection', handler);
  };
}
