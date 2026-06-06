/**
 * Public surface of `@neithly-com/monitor-node`.
 *
 * Re-exports the Sentry-shaped public API (Neithly singleton + named
 * functions and types) along with the framework bindings shipped in this
 * package: Express middlewares, the Fastify plugin, and the NestJS module.
 */

export const SDK_NAME = '@neithly-com/monitor-node';

// ---------------------------------------------------------------------------
// Public API (init / capture / scope / lifecycle / state) + Neithly singleton.
// ---------------------------------------------------------------------------
export {
  Neithly,
  addBreadcrumb,
  captureException,
  captureMessage,
  flush,
  getActiveScope,
  getConfig,
  init,
  isInitialised,
  setContext,
  setExtra,
  setTags,
  setUser,
  shutdown,
  withScope,
  _resetStateForTest,
  _setProcessorForTest,
} from './api/index.js';
export type {
  CaptureContext,
  InitOptions,
  InitSampling,
  Integration,
  LogRecordProcessor,
  SdkConfig,
} from './api/index.js';

// ---------------------------------------------------------------------------
// Transport factories (log / trace / metric exporters + SDK builder).
// ---------------------------------------------------------------------------
export {
  buildNodeSdk,
  createLogExporter,
  createMetricExporter,
  createTraceExporter,
} from './transport/index.js';
export type {
  BuildNodeSdkOptions,
  CreateLogExporterOptions,
  CreateMetricExporterOptions,
  CreateTraceExporterOptions,
} from './transport/index.js';

// ---------------------------------------------------------------------------
// Express integration.
// ---------------------------------------------------------------------------
export {
  expressErrorHandler,
  expressRequestHandler,
} from './integrations/express.js';
export type {
  ExpressErrorMiddleware,
  ExpressRequestMiddleware,
} from './integrations/express.js';

// ---------------------------------------------------------------------------
// Fastify integration.
// ---------------------------------------------------------------------------
export { fastifyPlugin, shouldCaptureFastifyError } from './integrations/fastify.js';
export type {
  FastifyPluginClient,
  FastifyPluginOptions,
} from './integrations/fastify.js';

// ---------------------------------------------------------------------------
// NestJS integration.
// ---------------------------------------------------------------------------
export {
  NEITHLY_CLIENT,
  NeithlyBootstrapService,
  NeithlyExceptionFilter,
  NeithlyInterceptor,
  NeithlyModule,
} from './integrations/nestjs/index.js';
export type {
  NeithlyClient,
  NeithlyInitOptions,
  NeithlyModuleAsyncOptions,
  NeithlyModuleOptions,
} from './integrations/nestjs/index.js';

// ---------------------------------------------------------------------------
// Auxiliary auto-instrumentation installers (console / http / process).
// ---------------------------------------------------------------------------
export { installConsoleBreadcrumbs } from './integrations/console.js';
export { installHttpInstrumentation } from './integrations/http.js';
export { installUncaughtHandlers } from './integrations/process-handlers.js';
