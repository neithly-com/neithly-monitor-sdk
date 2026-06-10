/**
 * `MonitorModule.forRoot()` — one-liner NestJS adoption for
 * `@neithly-com/monitor-node`.
 *
 * This is the modern, opinionated wiring that ships from the SDK so consumer
 * apps don't have to hand-roll `src/common/monitor/{module,service,context-interceptor,config}.ts`
 * in every backend. It mirrors the `@neithly-com/neithly-auth-sdk/nestjs`
 * adoption model: peer-only NestJS dependency, side-effect-free imports
 * (except `preload.ts`), and a `@Global()` module that provides:
 *   - {@link MonitorService} (Injectable wrapper around the SDK capture surface)
 *   - {@link MonitorContextInterceptor} (request-shaped scope tagging) registered
 *     globally via `APP_INTERCEPTOR`.
 *
 * Bootstrap (calling `init()`) is performed synchronously inside the module's
 * static `forRoot()` factory. We do NOT defer to `OnApplicationBootstrap` here
 * because the SDK has to be live BEFORE Nest instantiates any controller — the
 * canonical pattern in our backends is to import {@link preloadMonitor} from
 * `@neithly-com/monitor-node/nestjs` at the very top of `main.ts` so the SDK
 * is up before `AppModule` is even constructed. `forRoot()` then doubles as
 * a safety net for apps that didn't call the preload (it re-checks
 * `isInitialised()` and skips a second `init`).
 *
 * Usage:
 * ```ts
 * import { MonitorModule } from '@neithly-com/monitor-node/nestjs';
 *
 * @Module({
 *   imports: [
 *     MonitorModule.forRoot({
 *       dsn: process.env.MONITOR_DSN!,
 *       env: process.env.MONITOR_ENV ?? process.env.NODE_ENV,
 *       serviceName: 'my-service',
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * The `disabled` flag is the explicit opt-out for tests / disabled
 * environments — `forRoot({ dsn: '', disabled: true })` skips `init()`
 * entirely and still provides the service, so callers can inject it without
 * sending any data.
 */

import { Global, Module } from '@nestjs/common';
import type { DynamicModule, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { init } from '../api/init.js';
import { isInitialised } from '../api/state.js';
import { setTags } from '../api/scope-api.js';

import { MonitorContextInterceptor } from './monitor-context.interceptor.js';
import { MonitorService } from './monitor.service.js';

export interface MonitorModuleOptions {
  /** DSN string (`nmk_<env>_<64hex>`). Required unless `disabled` is true. */
  readonly dsn: string;
  /** Environment tag (defaults to `process.env.NODE_ENV`). */
  readonly env?: string;
  /** Service slug — MUST match the backend project slug. */
  readonly serviceName?: string;
  /** Release identifier (typically a git SHA). */
  readonly release?: string;
  /**
   * Skip `init()` entirely. Useful in tests or when the consumer wants the
   * Injectable wrappers in DI without sending any data.
   */
  readonly disabled?: boolean;
}

@Global()
@Module({})
export class MonitorModule {
  /**
   * Initialise the SDK (idempotent) and provide {@link MonitorService} +
   * the global {@link MonitorContextInterceptor}.
   *
   * Synchronous on purpose: by the time `AppModule` is being assembled, the
   * SDK MUST be live, and we don't want to wait for `OnApplicationBootstrap`.
   * For consumers that need their own `process.env` parsing, the preferred
   * pattern is still {@link preloadMonitor} at the very top of `main.ts` —
   * `forRoot()` here only re-runs `init` if {@link isInitialised} is false.
   */
  static forRoot(options: MonitorModuleOptions): DynamicModule {
    if (options.disabled !== true) {
      if (options.dsn === '') {
        throw new Error(
          '[MonitorModule.forRoot] `dsn` is required unless `disabled: true` is set.',
        );
      }
      if (!isInitialised()) {
        init({
          dsn: options.dsn,
          ...(options.env !== undefined ? { environment: options.env } : {}),
          ...(options.release !== undefined ? { release: options.release } : {}),
        });
      }
      // Stamp serviceName + env on the global scope so every captured record
      // carries it. `init()` doesn't accept a serviceName option (that lives
      // on `buildNodeSdk` for the OTel resource); attaching it as a tag is
      // the canonical workaround and what every consumer app does today.
      const tags: Record<string, string> = {};
      if (options.serviceName !== undefined) {
        tags['serviceName'] = options.serviceName;
      }
      if (options.env !== undefined) {
        tags['env'] = options.env;
      }
      if (Object.keys(tags).length > 0) {
        setTags(tags);
      }
    }

    const interceptorProvider: Provider = {
      provide: APP_INTERCEPTOR,
      useClass: MonitorContextInterceptor,
    };

    return {
      module: MonitorModule,
      providers: [MonitorService, MonitorContextInterceptor, interceptorProvider],
      exports: [MonitorService],
    };
  }
}
