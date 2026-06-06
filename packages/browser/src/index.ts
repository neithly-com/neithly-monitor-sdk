/**
 * Public surface of `@neithly-com/monitor-browser`.
 *
 * Re-exports the Sentry-shaped public API (Neithly singleton + named
 * functions and types), the transport feature (fetch + sendBeacon exporters
 * and the pagehide flush installer), and the auto-instrumentation installers
 * (window.onerror, unhandledrejection, fetch, XHR, console).
 */

export const SDK_NAME = '@neithly-com/monitor-browser';

// ---------------------------------------------------------------------------
// Public API (init / capture / scope / lifecycle) + Neithly singleton.
// ---------------------------------------------------------------------------
export {
  Neithly,
  addBreadcrumb,
  captureException,
  captureMessage,
  flush,
  getResolvedConfig,
  init,
  setContext,
  setExtra,
  setTags,
  setUser,
  shutdown,
  withScope,
  _setSenderForTest,
} from './api/index.js';
export type {
  BrowserIntegration,
  CaptureMessageOptions,
  InitOptions,
  SendPayload,
  Sender,
} from './api/index.js';

// ---------------------------------------------------------------------------
// Transport (queue + log / trace / metric exporters + pagehide flush).
// ---------------------------------------------------------------------------
export {
  InMemoryEnvelopeQueue,
  createBrowserLogExporter,
  createBrowserMetricExporter,
  createBrowserTraceExporter,
  installPagehideFlush,
} from './transport/index.js';
export type {
  BrowserLogExporter,
  BrowserLogExporterResult,
  BrowserMetricExporter,
  BrowserTraceExporter,
  CreateBrowserLogExporterOptions,
  CreateBrowserMetricExporterOptions,
  CreateBrowserTraceExporterOptions,
  InstallPagehideFlushOptions,
  LogExporterMeta,
  OtlpMetricPayload,
  OtlpTracePayload,
  QueuedEnvelope,
  Uninstall,
} from './transport/index.js';

// ---------------------------------------------------------------------------
// Auto-instrumentation installers.
// ---------------------------------------------------------------------------
export {
  installConsoleBreadcrumbs,
  installFetchInstrumentation,
  installOnerror,
  installUnhandledRejection,
  installXhrInstrumentation,
} from './integrations/index.js';
export type {
  ConsoleAddBreadcrumbFn,
  ConsoleUninstaller,
  FetchAddBreadcrumbFn,
  FetchUninstaller,
  OnErrorUninstaller,
  OnerrorCaptureFn,
  UnhandledRejectionCaptureFn,
  UnhandledRejectionUninstaller,
  XhrAddBreadcrumbFn,
  XhrUninstaller,
} from './integrations/index.js';
