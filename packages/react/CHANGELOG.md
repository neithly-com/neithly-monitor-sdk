# @neithly-com/monitor-react

## 0.1.0

### Minor Changes

- Initial v0.1 release.
  - **monitor-core** — DSN parsing (`nmk_<env>_<64hex>`), exception shaping with Error.cause + AggregateError walk, breadcrumb ring, Scope, OTLP envelope (`toOtlpLogRecord` / `toOtlpLogsRequest`), endpoint resolver.
  - **monitor-node** — Sentry-shaped public API wrapping `@opentelemetry/sdk-node`. Auto-instrumentation: process uncaughtException + unhandledRejection, `@opentelemetry/instrumentation-http`, console breadcrumbs. Framework bindings: Express, Fastify, NestJS.
  - **monitor-browser** — Same Sentry shape, sync `withScope`, fetch + sendBeacon transport with pagehide flush. Auto-instrumentation: `window.onerror`, `unhandledrejection`, fetch + XHR + console breadcrumbs.
  - **monitor-react** — `<NeithlyErrorBoundary>`, `useNeithlyScope`, `useTrackRouter` + `wrapCreateBrowserRouter` for react-router v6.
  - **monitor-cli** — `monitor releases create` + `monitor sourcemaps upload` with SHA-256 dedup + p-limit parallel.

### Patch Changes

- Updated dependencies
  - @neithly-com/monitor-core@0.1.0
  - @neithly-com/monitor-browser@0.1.0
