/**
 * Process-level error capture for Node.js.
 *
 * Installs handlers for `uncaughtException` and `unhandledRejection` that
 * synchronously invoke a caller-supplied capture function, then re-emit the
 * error so the default Node behaviour (process crash / warning) still fires.
 *
 * The uninstaller returned by {@link installUncaughtHandlers} only removes the
 * exact listeners that this module installed — pre-existing listeners on the
 * process are left untouched.
 */

export type CaptureFn = (err: unknown) => void;

export type Uninstaller = () => void;

/**
 * Install process-level error handlers.
 *
 * The supplied `captureFn` is invoked synchronously with the raised error /
 * rejection reason. After capture, the handler re-emits the original event on
 * `process` *without* this module's own listener attached, so the default
 * Node behaviour (crash on uncaught, warning on unhandled rejection) still
 * applies.
 */
export function installUncaughtHandlers(captureFn: CaptureFn): Uninstaller {
  let reentrantUncaught = false;
  let reentrantRejection = false;

  const onUncaughtException = (err: Error, origin: NodeJS.UncaughtExceptionOrigin): void => {
    if (reentrantUncaught) {
      return;
    }
    try {
      captureFn(err);
    } catch {
      // Capture must never break the re-emit path.
    }
    // Re-emit after temporarily detaching our own listener so we don't loop.
    reentrantUncaught = true;
    process.removeListener('uncaughtException', onUncaughtException);
    try {
      // The TS lib types model `process.emit` with strict per-event overloads
      // that don't include `'uncaughtException'`. At runtime EventEmitter
      // accepts any event name — cast via a structural alias to satisfy TS.
      (process as unknown as { emit: (event: string, ...args: unknown[]) => boolean }).emit(
        'uncaughtException',
        err,
        origin,
      );
    } finally {
      // Re-attach if the process is still alive (it usually isn't for
      // uncaughtException, but unhandledRejection without --unhandled-rejections=strict
      // does keep going).
      process.on('uncaughtException', onUncaughtException);
      reentrantUncaught = false;
    }
  };

  const onUnhandledRejection = (reason: unknown, promise: Promise<unknown>): void => {
    if (reentrantRejection) {
      return;
    }
    try {
      captureFn(reason);
    } catch {
      // Capture must never break the re-emit path.
    }
    reentrantRejection = true;
    process.removeListener('unhandledRejection', onUnhandledRejection);
    try {
      (process as unknown as { emit: (event: string, ...args: unknown[]) => boolean }).emit(
        'unhandledRejection',
        reason,
        promise,
      );
    } finally {
      process.on('unhandledRejection', onUnhandledRejection);
      reentrantRejection = false;
    }
  };

  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);

  return (): void => {
    process.removeListener('uncaughtException', onUncaughtException);
    process.removeListener('unhandledRejection', onUnhandledRejection);
  };
}
