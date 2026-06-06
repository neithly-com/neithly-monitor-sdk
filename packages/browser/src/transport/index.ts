// Transport feature — hand-rolled fetch + sendBeacon exporters and queue.
// Not @opentelemetry/exporter-* dependent; runs in any modern browser.

export { InMemoryEnvelopeQueue } from './queue.js';
export type { QueuedEnvelope } from './queue.js';

export { createBrowserLogExporter } from './log-exporter.js';
export type {
  BrowserExporterResult as BrowserLogExporterResult,
  BrowserLogExporter,
  CreateBrowserLogExporterOptions,
  LogExporterMeta,
} from './log-exporter.js';

export { createBrowserTraceExporter } from './trace-exporter.js';
export type {
  BrowserTraceExporter,
  CreateBrowserTraceExporterOptions,
  OtlpTracePayload,
} from './trace-exporter.js';

export { createBrowserMetricExporter } from './metric-exporter.js';
export type {
  BrowserMetricExporter,
  CreateBrowserMetricExporterOptions,
  OtlpMetricPayload,
} from './metric-exporter.js';

export { installPagehideFlush } from './pagehide.js';
export type {
  InstallPagehideFlushOptions,
  Uninstall,
} from './pagehide.js';
