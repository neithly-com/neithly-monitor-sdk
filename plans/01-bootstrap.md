# neithly-monitor-sdk — 01 Bootstrap (v0.1)

## Milestone

`v0.1 — Initial build` (milestone #1)

Five publishable packages + an internal core package in a pnpm workspace,
all wired to a single `Neithly.init({dsn})` boot call:

| Package | What | Publishes |
|---|---|---|
| `@neithly-com/monitor-core` | DSN parser, exception shaper, breadcrumb ring, OTLP envelope helpers. Shared between node + browser. | public on GitHub Packages |
| `@neithly-com/monitor-node` | Node entrypoint + OTel-Node wiring + Express / Fastify / NestJS bindings. | public |
| `@neithly-com/monitor-browser` | Browser entrypoint + fetch/XHR/console instrumentation. | public |
| `@neithly-com/monitor-react` | `<NeithlyErrorBoundary>` + react-router instrumentation. | public |
| `@neithly-com/monitor-cli` | `monitor releases create` + `monitor sourcemaps upload`. | public, `bin` |

## Context

The backend `neithly-monitor` v0.5 stabilised the OTLP/HTTP wire format
on three ingest endpoints with DSN bearer auth:

- `POST /v1/logs`   — `Authorization: Bearer <publicKey>` OR `?api_key=<publicKey>`.
- `POST /v1/metrics` — same auth.
- `POST /v1/traces`  — same auth.

The current onboarding path in the backend README requires ~30 lines of manual
`@opentelemetry/sdk-node` wiring per app. That's a huge adoption barrier for
the org's other services. The SDK's job is to collapse that to:

```ts
import { Neithly } from '@neithly-com/monitor-node';
Neithly.init({ dsn: process.env.NEITHLY_DSN, release: process.env.RELEASE });
```

And give app authors a Sentry-shaped public API (`captureException`,
`captureMessage`, `addBreadcrumb`, `setUser`, `setTags`, `withScope`) on top of
the OTel transport — operators know that shape, OTel feels strange to them.

CI tooling (`monitor releases create` + `monitor sourcemaps upload`) closes the
loop: a release lands, its source maps upload, the backend symbolicates
exceptions automatically.

### Non-goals (v0.1)

- Profiling (cpu/heap snapshots) — Sentry has it, OTel has it via separate SDK; skip for v0.1.
- Replay / RUM (session replay) — separate effort.
- Mobile SDKs (Android / iOS / RN). React Native is plausible later via monitor-browser shim.
- Edge runtimes (Cloudflare Workers, Deno Deploy). The fetch-based browser exporter is close — promote to its own package in v0.2.

## Stack

- **appType**: `lib-npm` (multi-package npm workspace).
- **languages**: TypeScript (strict + `exactOptionalPropertyTypes`).
- **frameworks**: none (bindings provided OUT for Express/Fastify/NestJS/React).
- **libs**: vitest (tests + workspace mode), tsup (build), changesets (versioning), commander (CLI), zod (config validation).

## Architectural decisions

- **DSN wire format**: `nmk_<env>_<32 hex>` — same prefix family as API tokens (`nmk_live_…`). Operators recognise the family. The backend already accepts the raw 32-hex value as the public key, so the prefix is parser-stripped client-side and the raw bytes flow to `Authorization: Bearer`.
- **Transport**: in monitor-node and monitor-browser, we wrap the OTel SDK's built-in `OTLPLogExporter` / `OTLPTraceExporter` / `OTLPMetricExporter` with our DSN auth header. No bespoke HTTP client.
- **Public API**: Sentry-compatible shape (`captureException(err, context?)`, `addBreadcrumb`, `setUser`, `setTags`, `withScope`, `flush`, `shutdown`). Operators get familiar ergonomics; under the hood we shape OTLP log records that match the backend's exception parser (`exception.type`, `exception.message`, `exception.stacktrace` attributes per OTel semconv).
- **monitor-core as a workspace-only package**: published to GitHub Packages alongside the others so consumer installs resolve cleanly. Source files are kept lean — < 1k LoC of pure logic shared between node + browser.
- **Auto-instrumentation opt-out**: every auto-instr is on by default, with `init({ integrations: { http: false, console: false } })` to disable individual ones.
- **Breadcrumb ring**: in-memory, 100-entry deque per process / tab. Drops oldest. Attached to next `captureException` payload as `breadcrumbs` attribute (JSON-serialised, capped at 16 KB).
- **Sampling**: pass through to OTel SDK's `traceIdRatioBased` sampler. Default 1.0 for v0.1 — operators tune from there.
- **Build**: `tsup` dual ESM + CJS + `.d.ts` per package. Targets `node18+` and `es2022` for browser.
- **Versioning**: `changesets` manages per-package semver + CHANGELOG generation.

## Breakdown

GitHub milestone: **#1 v0.1 — Initial build**.

### Epic: Monorepo bootstrap  (#1)
- **Feature: Workspace + TypeScript baseline**  (#2)
  - [ ] #3 — `chore(repo): scaffold pnpm workspace + per-package tsconfig`
  - [ ] #4 — `chore(repo): ESLint flat config + prettier shared across packages`
  - [ ] #5 — `chore(repo): root README + per-package README stubs`
- **Feature: Build + test pipeline**  (#6)
  - [ ] #7 — `chore(build): tsup dual ESM/CJS + .d.ts per package`
  - [ ] #8 — `chore(test): vitest workspace + shared setup`
  - [ ] #9 — `chore(release): changesets config + CHANGELOG generation`
- **Feature: CI / publishing**  (#10)
  - [ ] #11 — `ci(repo): GitHub Actions — lint + typecheck + test matrix on PR`
  - [ ] #12 — `ci(repo): GitHub Actions — publish to GitHub Packages on tag`

### Epic: monitor-core — shared transport + types  (#13)
- **Feature: DSN parsing**  (#14)
  - [ ] #15 — `feat(core): parseDsn — accepts nmk_<env>_<hex> + raw 32-hex; rejects malformed with code DSN_MALFORMED`
  - [ ] #16 — `test(core): parseDsn — fuzz over malformed inputs + boundary cases`
- **Feature: Exception shaper**  (#17)
  - [ ] #18 — `feat(core): shapeException — Error → { exception.type, exception.message, exception.stacktrace } OTel semconv`
  - [ ] #19 — `feat(core): support nested Error.cause chain (Node 16+ AggregateError + cause)`
  - [ ] #20 — `test(core): shapeException — TypeError / RangeError / custom Error / cause chain / AggregateError`
- **Feature: Breadcrumb ring + scope**  (#21)
  - [ ] #22 — `feat(core): BreadcrumbRing — bounded deque with capacity + drop-oldest`
  - [ ] #23 — `feat(core): Scope — user / tags / contexts + child scope via withScope`
  - [ ] #24 — `test(core): BreadcrumbRing eviction + serialization caps`
- **Feature: Wire envelopes**  (#25)
  - [ ] #26 — `feat(core): toOtlpLogRecord — Scope + Breadcrumbs + Exception → OTLP LogRecord JSON`
  - [ ] #27 — `feat(core): MonitorEndpointResolver — derive /v1/logs, /v1/metrics, /v1/traces from one origin`
  - [ ] #28 — `test(core): toOtlpLogRecord round-trip vs neithly-monitor's parser fixture`

### Epic: monitor-node — Node SDK + framework bindings  (#29)
- **Feature: monitor-node transport wiring**  (#30)
  - [ ] #31 — `feat(node): OTLPLogExporter wrapper — inject Authorization: Bearer <publicKey>`
  - [ ] #32 — `feat(node): OTLPTraceExporter wrapper — same auth`
  - [ ] #33 — `feat(node): OTLPMetricExporter wrapper — same auth`
  - [ ] #34 — `feat(node): NodeSDK bootstrapper — resource attrs, batch processors, sampler`
- **Feature: monitor-node public API (Sentry-shaped)**  (#35)
  - [ ] #36 — `feat(node): Neithly.init({dsn, release, environment, integrations, sampling})`
  - [ ] #37 — `feat(node): Neithly.captureException(err, context?) — synthesises OTLP log record`
  - [ ] #38 — `feat(node): Neithly.captureMessage(message, level?, context?)`
  - [ ] #39 — `feat(node): Neithly.addBreadcrumb({category, message, data, level})`
  - [ ] #40 — `feat(node): Neithly.setUser / setTags / setContext / setExtra`
  - [ ] #41 — `feat(node): Neithly.withScope(fn) — temporary scope via AsyncLocalStorage`
  - [ ] #42 — `feat(node): Neithly.flush(timeoutMs?) + Neithly.shutdown()`
- **Feature: monitor-node auto-instrumentation**  (#43)
  - [ ] #44 — `feat(node): hook process.on('uncaughtException') + 'unhandledRejection'`
  - [ ] #45 — `feat(node): integrate @opentelemetry/instrumentation-http (off via init opt-out)`
  - [ ] #46 — `feat(node): console breadcrumbs (log/info/warn/error → ring)`
- **Feature: monitor-node Express binding**  (#47)
  - [ ] #48 — `feat(node): expressRequestHandler() — opens an isolated scope per request`
  - [ ] #49 — `feat(node): expressErrorHandler() — captureException + next(err)`
  - [ ] #50 — `test(node): express e2e — uncaught error in handler reaches the mock collector`
- **Feature: monitor-node Fastify binding**  (#51)
  - [ ] #52 — `feat(node): fastifyPlugin — onRequest scope + setErrorHandler captureException`
  - [ ] #53 — `test(node): fastify e2e — uncaught error reaches the mock collector`
- **Feature: monitor-node NestJS binding**  (#54)
  - [ ] #55 — `feat(node): NeithlyModule.forRoot() — Nest module with DI registration`
  - [ ] #56 — `feat(node): NeithlyExceptionFilter — global filter that captureExceptions before rethrow`
  - [ ] #57 — `feat(node): NeithlyInterceptor — request-scope (correlationId, breadcrumbs)`
  - [ ] #58 — `test(node): nest e2e — thrown HttpException + non-HTTP error both captured`
- **Feature: monitor-node tests**  (#59)
  - [ ] #60 — `test(node): mock OTLP collector — assert log/trace/metric envelopes match expected shape`
  - [ ] #61 — `test(node): integration test against the local neithly-monitor backend`

### Epic: monitor-browser — Browser SDK  (#62)
- **Feature: Browser transport (fetch + sendBeacon)**  (#63)
  - [ ] #64 — `feat(browser): fetch-based OTLPLogExporter — DSN bearer + JSON body`
  - [ ] #65 — `feat(browser): fetch-based OTLPTraceExporter`
  - [ ] #66 — `feat(browser): fetch-based OTLPMetricExporter`
  - [ ] #67 — `feat(browser): sendBeacon fallback on pagehide for in-flight envelopes`
- **Feature: Browser public API**  (#68)
  - [ ] #69 — `feat(browser): Neithly.init({dsn, release, environment, tunnel?})`
  - [ ] #70 — `feat(browser): captureException + captureMessage + addBreadcrumb + setUser + setTags + withScope`
  - [ ] #71 — `feat(browser): Neithly.flush + Neithly.shutdown`
- **Feature: Browser auto-instrumentation**  (#72)
  - [ ] #73 — `feat(browser): window.onerror handler → captureException`
  - [ ] #74 — `feat(browser): unhandledrejection → captureException`
  - [ ] #75 — `feat(browser): fetch instrumentation — timing + status + breadcrumb`
  - [ ] #76 — `feat(browser): XMLHttpRequest instrumentation — same`
  - [ ] #77 — `feat(browser): console breadcrumbs (info/warn/error → ring)`
- **Feature: Browser tests**  (#78)
  - [ ] #79 — `test(browser): jsdom unit — captureException end-to-end shape`
  - [ ] #80 — `test(browser): jsdom unit — fetch instrumentation breadcrumb shape`
  - [ ] #81 — `test(browser): jsdom unit — pagehide sendBeacon path`

### Epic: monitor-react — React bindings  (#82)
- **Feature: ErrorBoundary**  (#83)
  - [ ] #84 — `feat(react): <NeithlyErrorBoundary> — captureException + fallback prop`
  - [ ] #85 — `feat(react): useNeithlyScope hook — set tags/user from component tree`
  - [ ] #86 — `test(react): @testing-library — boundary catches + sends event`
- **Feature: react-router instrumentation**  (#87)
  - [ ] #88 — `feat(react): useTrackRouter — react-router v6 navigation breadcrumbs`
  - [ ] #89 — `feat(react): wrapCreateBrowserRouter — auto-track route changes`
  - [ ] #90 — `test(react): router integration test`

### Epic: monitor-cli — CLI for releases + sourcemaps  (#91)
- **Feature: CLI scaffold**  (#92)
  - [ ] #93 — `feat(cli): commander setup — root + subcommands + version/help`
  - [ ] #94 — `feat(cli): config loader — env vars + .neithlyrc + flags`
  - [ ] #95 — `feat(cli): MonitorClient — auth via NEITHLY_API_TOKEN, base from MONITOR_API_URL`
- **Feature: Releases command**  (#96)
  - [ ] #97 — `feat(cli): monitor releases create --version <v> --project <slug>`
  - [ ] #98 — `feat(cli): auto-detect --version from git tag, fallback to git short sha`
  - [ ] #99 — `test(cli): releases create — mocked HTTP + git seam`
- **Feature: Source-maps command**  (#100)
  - [ ] #101 — `feat(cli): monitor sourcemaps upload <glob> --release <v>`
  - [ ] #102 — `feat(cli): multipart upload + parallel up to 4 with progress UI`
  - [ ] #103 — `feat(cli): SHA-256 dedup — skip if backend already has the file`
  - [ ] #104 — `test(cli): sourcemaps upload — happy path + 4xx surface + idempotent re-upload`

### Epic: Docs & examples  (#105)
- **Feature: Per-package READMEs**  (#106)
  - [ ] #107 — `docs(node): README + 30-line copy-paste setup`
  - [ ] #108 — `docs(browser): README + Vite / Webpack setup snippets`
  - [ ] #109 — `docs(react): README + ErrorBoundary + router examples`
  - [ ] #110 — `docs(cli): README + GitHub Actions snippet`
  - [ ] #111 — `docs(core): README explaining the workspace-only role`
- **Feature: Root docs**  (#112)
  - [ ] #113 — `docs(repo): root README — what's where, install matrix, quickstart`
  - [ ] #114 — `docs(repo): docs/architecture.md — package boundaries + data flow`
  - [ ] #115 — `docs(repo): docs/adr/0001-dsn-format.md`
  - [ ] #116 — `docs(repo): docs/adr/0002-sentry-shaped-api-over-otel.md`
- **Feature: Example apps**  (#117)
  - [ ] #118 — `docs(examples): examples/express-node — minimal POST /api/order with a throw`
  - [ ] #119 — `docs(examples): examples/react-spa — Vite + react-router + intentional bug`
