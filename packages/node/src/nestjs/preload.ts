/**
 * Side-effect-only preload for the monitor SDK in NestJS apps.
 *
 * Imported as the very FIRST statement of `main.ts` so the SDK is live before
 * NestJS — or anything else — instantiates. Because ES module imports are
 * hoisted, the only way to guarantee `preloadMonitor()` runs before the rest
 * of the imports is to invoke it from a sibling module that is itself
 * imported first; that's what this file is for.
 *
 * Reads its config straight from `process.env`:
 *   - `MONITOR_DSN`   — required; if missing in `NODE_ENV=production` we throw
 *                       so the process exits non-zero before NestJS boots.
 *                       In any other env we log a warning and skip.
 *   - `MONITOR_ENV`   — optional environment tag override; defaults to `NODE_ENV`.
 *   - `npm_package_version` — auto-populated by `npm`/`pnpm`; used as release.
 *
 * Reading `process.env` directly here is the canonical pattern in our Nest
 * backends because this code runs BEFORE `ConfigModule` is wired (the SDK
 * has to be live before any provider is instantiated, including Config).
 *
 * Usage:
 * ```ts
 * // main.ts
 * import '@neithly-com/monitor-node/nestjs/preload';
 *
 * import { NestFactory } from '@nestjs/core';
 * import { AppModule } from './app.module';
 *
 * async function bootstrap() {
 *   const app = await NestFactory.create(AppModule);
 *   await app.listen(3000);
 * }
 * bootstrap();
 * ```
 *
 * Or call `preloadMonitor()` explicitly when you need to opt-out conditionally:
 * ```ts
 * import { preloadMonitor } from '@neithly-com/monitor-node/nestjs';
 * preloadMonitor({ serviceName: 'my-service' });
 * ```
 */

import { init } from '../api/init.js';
import { isInitialised } from '../api/state.js';
import { setTags } from '../api/scope-api.js';
import { captureException } from '../api/capture.js';
import { installUncaughtHandlers } from '../integrations/process-handlers.js';

/** Options for the explicit {@link preloadMonitor} entry point. */
export interface PreloadMonitorOptions {
  /** Service slug. Stamped on the global scope as the `serviceName` tag. */
  readonly serviceName?: string;
  /**
   * Optional logger; defaults to `console`. Allows tests / hosts that route
   * logs elsewhere to plug in without pulling in `@nestjs/common.Logger`.
   */
  readonly logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  /** Process env bag. Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Error thrown when `NODE_ENV=production` but `MONITOR_DSN` is unset.
 * Exposed so consumers can identify it without relying on the message text.
 */
export class MissingMonitorDsnError extends Error {
  constructor() {
    super(
      '[@neithly-com/monitor-node/nestjs] MONITOR_DSN is required in production ' +
        '(NODE_ENV=production) but was not set. Either provision a DSN or unset NODE_ENV.',
    );
    this.name = 'MissingMonitorDsnError';
  }
}

let preloaded = false;
let uninstallUncaught: (() => void) | null = null;

/**
 * Imperative preload: resolve config from env, init the SDK if enabled, and
 * install process-level uncaught handlers that forward errors to
 * `captureException`. Idempotent.
 */
export function preloadMonitor(options: PreloadMonitorOptions = {}): void {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;

  if (preloaded) {
    logger.warn('[@neithly-com/monitor-node/nestjs] preloadMonitor() called twice — skipping');
    return;
  }

  const rawDsn = env['MONITOR_DSN'];
  const dsn = typeof rawDsn === 'string' ? rawDsn.trim() : '';
  const nodeEnv = env['NODE_ENV'] ?? 'development';

  if (dsn === '') {
    if (nodeEnv === 'production') {
      throw new MissingMonitorDsnError();
    }
    logger.warn(
      '[@neithly-com/monitor-node/nestjs] MONITOR_DSN unset — monitor SDK disabled (errors will not be reported)',
    );
    preloaded = true;
    return;
  }

  const environment = env['MONITOR_ENV']?.trim() || nodeEnv;
  const release = env['npm_package_version']?.trim() || undefined;

  if (!isInitialised()) {
    init({
      dsn,
      environment,
      ...(release !== undefined ? { release } : {}),
    });
  }

  // Tag the global scope with serviceName + env so every record carries them.
  const tags: Record<string, string> = { env: environment };
  if (options.serviceName !== undefined) {
    tags['serviceName'] = options.serviceName;
  }
  setTags(tags);

  uninstallUncaught = installUncaughtHandlers((err) => {
    captureException(err);
  });

  preloaded = true;
  logger.log(
    `[@neithly-com/monitor-node/nestjs] monitor SDK initialised (service=${
      options.serviceName ?? 'unset'
    }, env=${environment}, release=${release ?? 'unset'})`,
  );
}

/**
 * Test-only: reset the one-shot guard + detach uncaught handlers. Never call
 * from production code.
 */
export function _resetPreloadForTesting(): void {
  preloaded = false;
  if (uninstallUncaught !== null) {
    uninstallUncaught();
    uninstallUncaught = null;
  }
}
