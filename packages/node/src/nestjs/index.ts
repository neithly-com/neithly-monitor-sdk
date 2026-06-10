/**
 * `@neithly-com/monitor-node/nestjs` — opinionated NestJS adoption for the
 * monitor SDK.
 *
 * One-liner integration:
 *
 * ```ts
 * // main.ts — preload BEFORE NestFactory boots so the SDK is live first
 * import '@neithly-com/monitor-node/nestjs/preload';
 *
 * // app.module.ts
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
 * Mirrors the `@neithly-com/neithly-auth-sdk/nestjs` model:
 *   - `@nestjs/common` + `@nestjs/core` are **peer dependencies** (optional),
 *     so the main entry stays usable without NestJS;
 *   - this subpath only loads when imported, keeping non-Nest consumers lean;
 *   - all DI tokens / classes are re-exported from a single barrel.
 */

export { MonitorModule } from './monitor.module.js';
export type { MonitorModuleOptions } from './monitor.module.js';

export { MonitorService } from './monitor.service.js';
export type { MonitorLevel, MonitorUser } from './monitor.service.js';

export { MonitorContextInterceptor } from './monitor-context.interceptor.js';

export { preloadMonitor, MissingMonitorDsnError, _resetPreloadForTesting } from './preload.js';
export type { PreloadMonitorOptions } from './preload.js';
