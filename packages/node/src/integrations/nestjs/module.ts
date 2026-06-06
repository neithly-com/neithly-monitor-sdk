/**
 * `NeithlyModule` — drop-in NestJS integration for `@neithly-com/monitor-node`.
 *
 * Usage (sync):
 * ```ts
 * NeithlyModule.forRoot({
 *   client,
 *   options: { dsn: process.env.NEITHLY_DSN },
 * });
 * ```
 *
 * Usage (async):
 * ```ts
 * NeithlyModule.forRootAsync({
 *   imports: [ConfigModule],
 *   inject: [ConfigService],
 *   useFactory: (cfg: ConfigService) => ({
 *     client,
 *     options: { dsn: cfg.get('NEITHLY_DSN', '') },
 *   }),
 * });
 * ```
 *
 * The module is `@Global()` so a single `forRoot` in `AppModule` makes the
 * filter and interceptor cover the whole app. It registers them via
 * `APP_FILTER` / `APP_INTERCEPTOR` so they live inside the DI tree and pick
 * up any `Logger` or future per-request providers.
 *
 * Bootstrap (calling `client.init(options)` exactly once) is handled by an
 * internal `NeithlyBootstrapService` rather than the module class itself —
 * NestJS instantiates the module class without honouring custom constructor
 * injection, so the work has to live in a regular `@Injectable()` provider.
 */

import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type {
  DynamicModule,
  InjectionToken,
  OnApplicationBootstrap,
  OptionalFactoryDependency,
  Provider,
  Type,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import type { NeithlyClient, NeithlyInitOptions } from './client.js';
import { NeithlyExceptionFilter } from './exception-filter.js';
import { NeithlyInterceptor } from './interceptor.js';
import { NEITHLY_CLIENT } from './tokens.js';

export interface NeithlyModuleOptions {
  /** Runtime adapter (init / captureException / withScope). */
  readonly client: NeithlyClient;
  /** Init options forwarded to `client.init` on application bootstrap. */
  readonly options: NeithlyInitOptions;
}

export interface NeithlyModuleAsyncOptions {
  readonly imports?: ReadonlyArray<
    Type<unknown> | DynamicModule | Promise<DynamicModule>
  >;
  readonly inject?: ReadonlyArray<InjectionToken | OptionalFactoryDependency>;
  readonly useFactory: (
    ...args: unknown[]
  ) => Promise<NeithlyModuleOptions> | NeithlyModuleOptions;
}

/**
 * Internal token holding the user-supplied {@link NeithlyModuleOptions}. We
 * resolve it inside the bootstrap hook to call `client.init(options)` exactly
 * once, after Nest has finished wiring the container.
 */
const NEITHLY_MODULE_OPTIONS: unique symbol = Symbol.for(
  '@neithly-com/monitor-node:nestjs:module-options',
);

@Injectable()
export class NeithlyBootstrapService implements OnApplicationBootstrap {
  private static readonly logger = new Logger('NeithlyModule');
  private static initialised = false;

  constructor(
    @Inject(NEITHLY_MODULE_OPTIONS)
    private readonly resolvedOptions: NeithlyModuleOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (NeithlyBootstrapService.initialised) {
      NeithlyBootstrapService.logger.warn(
        'NeithlyModule.forRoot was registered more than once; ignoring extra init.',
      );
      return;
    }
    NeithlyBootstrapService.initialised = true;
    this.resolvedOptions.client.init(this.resolvedOptions.options);
  }

  /**
   * Reset the one-shot init guard. Exposed for test environments that spin
   * up multiple Nest applications inside the same process; never call this
   * from production code.
   */
  static resetForTesting(): void {
    NeithlyBootstrapService.initialised = false;
  }
}

@Global()
@Module({})
export class NeithlyModule {
  static forRoot(options: NeithlyModuleOptions): DynamicModule {
    return NeithlyModule.build([
      { provide: NEITHLY_MODULE_OPTIONS, useValue: options },
      { provide: NEITHLY_CLIENT, useValue: options.client },
    ]);
  }

  static forRootAsync(asyncOptions: NeithlyModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: NEITHLY_MODULE_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: asyncOptions.inject !== undefined ? [...asyncOptions.inject] : [],
    };
    const clientProvider: Provider = {
      provide: NEITHLY_CLIENT,
      useFactory: (resolved: NeithlyModuleOptions) => resolved.client,
      inject: [NEITHLY_MODULE_OPTIONS],
    };
    return NeithlyModule.build(
      [optionsProvider, clientProvider],
      asyncOptions.imports !== undefined ? [...asyncOptions.imports] : undefined,
    );
  }

  /**
   * Reset the one-shot init guard. Re-exported here for ergonomics so tests
   * don't have to import the internal bootstrap service.
   */
  static resetForTesting(): void {
    NeithlyBootstrapService.resetForTesting();
  }

  private static build(
    providers: Provider[],
    imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>>,
  ): DynamicModule {
    const filterProvider: Provider = {
      provide: APP_FILTER,
      useClass: NeithlyExceptionFilter,
    };
    const interceptorProvider: Provider = {
      provide: APP_INTERCEPTOR,
      useClass: NeithlyInterceptor,
    };
    const dyn: DynamicModule = {
      module: NeithlyModule,
      providers: [
        ...providers,
        NeithlyBootstrapService,
        filterProvider,
        interceptorProvider,
      ],
      exports: [NEITHLY_CLIENT],
    };
    if (imports !== undefined) {
      dyn.imports = imports;
    }
    return dyn;
  }
}
