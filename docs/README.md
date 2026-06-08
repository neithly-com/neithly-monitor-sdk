# Documentation index

> Docs for **neithly-monitor-sdk** — current `v0.1.0`.

## Reference (one per surface)

| Scope | Role | Doc |
|---|---|---|
| `monitor-core` | Pure-logic foundation: DSN parsing, exception shaping, scope, breadcrumb ring, OTLP envelope | [reference/monitor-core.md](reference/monitor-core.md) |
| `monitor-node` | Node SDK + Express/Fastify/Nest bindings; `AsyncLocalStorage`-backed scope | [reference/monitor-node.md](reference/monitor-node.md) |
| `monitor-browser` | Browser SDK; fetch + `sendBeacon` transport; sync `withScope` | [reference/monitor-browser.md](reference/monitor-browser.md) |
| `monitor-react` | `<NeithlyErrorBoundary>`, `useNeithlyScope`, react-router v6 bindings | [reference/monitor-react.md](reference/monitor-react.md) |
| `monitor-cli` | `monitor releases create` + `monitor sourcemaps upload` | [reference/monitor-cli.md](reference/monitor-cli.md) |
| architecture | Package boundaries + the `captureException` data flow end-to-end | [reference/architecture.md](reference/architecture.md) |
| dsn | DSN format, parsing rules, provisioning | [reference/dsn.md](reference/dsn.md) |

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
- [findings/02-dsn-bearer-shape.md](qa/findings/02-dsn-bearer-shape.md) — DSN bearer is the full `nmk_<env>_<hex>` plaintext, not the parsed `publicKey`
- [findings/03-allowed-origins-vs-node.md](qa/findings/03-allowed-origins-vs-node.md) — `allowedOrigins` pin forbids Node-side use of the SDK

## Architecture decisions

[ADR index](adr/README.md) — 2 decisions in `v0.1.0`.

## Releases

[Release notes index](release-notes/README.md) — latest `v0.1.0`.
