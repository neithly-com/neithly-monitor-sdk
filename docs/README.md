# Documentation index

> Docs for **neithly-monitor-sdk** — current `v0.1.0`.

## Reference (one per surface)

| Scope | Role | Doc |
|---|---|---|
| `monitor-core` | Pure-logic foundation: DSN parse, exception shape, scope, breadcrumb ring, endpoint resolution, OTLP envelope helpers | [reference/monitor-core.md](reference/monitor-core.md) |
| `monitor-node` | Node SDK + `buildNodeSdk` (OTel) + Express/Fastify/Nest bindings; `AsyncLocalStorage`-backed scope | [reference/monitor-node.md](reference/monitor-node.md) |
| `monitor-browser` | Browser SDK; hand-rolled fetch + sendBeacon exporters; sync `withScope`; DOM auto-instrumentation | [reference/monitor-browser.md](reference/monitor-browser.md) |
| `monitor-browser/react` | React adapter shipped on the browser SDK: `<MonitorProvider>`, `<MonitorErrorBoundary>`, `useMonitor()` (since v0.2.0) | [reference/react-adapter.md](reference/react-adapter.md) |
| `monitor-react` | Standalone React package: `<NeithlyErrorBoundary>`, `useNeithlyScope`, react-router v6/v7 navigation breadcrumbs | [reference/monitor-react.md](reference/monitor-react.md) |
| `monitor-cli` | `monitor` binary (placeholders in v0.1) + internal `releases create` / `sourcemaps upload` implementations | [reference/monitor-cli.md](reference/monitor-cli.md) |
| architecture | Package boundaries + `captureException` data flow end-to-end | [reference/architecture.md](reference/architecture.md) |
| dsn | DSN format, parsing rules, provisioning, bearer shape | [reference/dsn.md](reference/dsn.md) |

## Guides

- [consumer-integration.md](guides/consumer-integration.md) — wire the SDK into a Node, browser, React, or CI app
- [operating.md](guides/operating.md) — DSN provisioning, env vars, troubleshooting silent drops
- [contributing.md](guides/contributing.md) — develop locally, workspace rules, ADR + release process

## QA matrices

| Flow | Last verified | Doc |
|---|---|---|
| Core envelope shape (pure functions) | 2026-06-06 | [qa/01-core-shape.md](qa/01-core-shape.md) |
| Node wire contract (OTLP/HTTP → backend) | 2026-06-06 | [qa/02-node-wire-contract.md](qa/02-node-wire-contract.md) |
| Browser fetch flow (live tab → SPA) | 2026-06-06 | [qa/03-browser-fetch-flow.md](qa/03-browser-fetch-flow.md) |
| CLI releases + sourcemaps | 2026-06-06 | [qa/04-cli-releases-sourcemaps.md](qa/04-cli-releases-sourcemaps.md) |

QA findings (footguns discovered during the v0.1 integration pass):

- [findings/01-service-name-mismatch.md](qa/findings/01-service-name-mismatch.md) — backend silently drops records when `service.name !== project.slug`
- [findings/02-dsn-bearer-shape.md](qa/findings/02-dsn-bearer-shape.md) — DSN bearer is the parsed `publicKey`, not the full `nmk_<env>_<hex>` plaintext
- [findings/03-allowed-origins-vs-node.md](qa/findings/03-allowed-origins-vs-node.md) — `allowedOrigins` pin forbids Node-side use of the SDK

## Architecture decisions

[ADR index](adr/README.md) — 2 decisions in `v0.1.0`.

## Releases

[Release notes index](release-notes/README.md) — latest `v0.1.0`.
