# @neithly-com/monitor-browser

## 0.2.0

### Minor Changes

- Add `/react` subpath with a minimal React adapter so SPA hosts can wire
  the browser SDK from React without taking a second package dependency.
  - `<MonitorProvider dsn={…}>` — calls `init()` on mount, publishes a
    `MonitorClient` on context, optional `userResolver` keeps the scope
    user in sync with your auth context.
  - `<MonitorErrorBoundary fallback={…}>` — class-component boundary
    that ships render-phase errors through the active client (provider
    context → `client` prop → SDK singleton fallback).
  - `useMonitor()` — pull the active `MonitorClient` out of context.
    Throws if no provider is mounted, so bootstrap bugs are loud.
  - `useSetUserEffect(user)` — opt-in hook for hosts that prefer to wire
    `setUser` themselves from an auth context.
- `react` and `react-dom` declared as **optional** peer dependencies
  (`^18 || ^19`). Hosts that don't import from `/react` pay no React
  cost.
- `exports` map gains a `./react` entry with separate `.d.ts` / `.mjs` /
  `.cjs` outputs. `tsup` builds both entries with `external: ['react',
  'react-dom']`.

See [`docs/reference/react-adapter.md`](../../docs/reference/react-adapter.md)
for the full API reference and behaviour notes.

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
