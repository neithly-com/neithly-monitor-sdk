# @neithly-com/monitor-node

## 0.2.0

### Minor Changes

- Added the `@neithly-com/monitor-node/nestjs` subpath — opinionated, one-liner
  NestJS adoption that replaces the hand-rolled
  `src/common/monitor/{preload,module,service,context-interceptor,config}.ts`
  every backend used to ship.
  - **`MonitorModule.forRoot({ dsn, env?, serviceName?, release?, disabled? })`**
    — `@Global()` module that initialises the SDK (idempotent — re-checks
    `isInitialised()`), provides `MonitorService` (exported), and registers
    `MonitorContextInterceptor` globally via `APP_INTERCEPTOR`. `disabled: true`
    skips `init()` while still wiring DI for tests / disabled envs.
  - **`MonitorService`** — Injectable wrapper exposing `captureException`,
    `captureMessage`, `setUser`, `setTags`. Every call is try/catch-wrapped so a
    misbehaving collector never breaks a request path.
  - **`MonitorContextInterceptor`** — stamps `http.method` / `http.route` /
    `http.url` / `http.request_id` (+ `teamId` and user identity when
    `req.auth` is populated by an upstream auth guard) on the SDK scope, and
    clears the user on `finalize` to prevent cross-request scope leaks.
  - **`preloadMonitor` + side-effect entry `@neithly-com/monitor-node/nestjs/preload`**
    — reads `MONITOR_DSN` / `MONITOR_ENV` / `npm_package_version` from
    `process.env`, calls `init()`, and installs `installUncaughtHandlers`.
    Throws `MissingMonitorDsnError` when `NODE_ENV=production` and
    `MONITOR_DSN` is unset so the process fails fast before NestJS boots.

- `@nestjs/common` and `@nestjs/core` moved from `dependencies` to optional
  `peerDependencies` (`^10 || ^11`). The main entry stays usable without
  NestJS installed; consumers that import `/nestjs` declare their own NestJS
  versions.

- The classic `NeithlyModule` integration (`forRoot({ client, options })`) is
  unchanged and continues to ship from the main entry — the new subpath is an
  additive, opinionated alternative.

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
