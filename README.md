# neithly-monitor-sdk

> Official JS/TS SDK family for [neithly-monitor](https://github.com/neithly-com/neithly-monitor) — Sentry-shaped API over OTLP/HTTP. Node + Browser + React + CLI.

[![Latest](https://img.shields.io/github/v/release/neithly-com/neithly-monitor-sdk)](./docs/release-notes/)
[![CI](https://github.com/neithly-com/neithly-monitor-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/neithly-com/neithly-monitor-sdk/actions)

## What is this?

A pnpm workspace of npm packages published to GitHub Packages under `@neithly-com`. Application code installs the runtime entry-point for its platform (`monitor-node`, `monitor-browser`, `monitor-react`) and ships errors with the familiar Sentry shape — `captureException`, `addBreadcrumb`, `setUser`, `setTags`, `withScope`, `flush`, `shutdown`. Under the hood every capture becomes an OTLP `LogRecord` sent to the neithly-monitor backend on `/v1/logs`.

The SDK collapses the ~30 lines of manual `@opentelemetry/sdk-node` wiring documented in the backend README down to a single `Neithly.init({ dsn })` call.

## Quickstart

```bash
# Prereqs: Node >= 18, pnpm >= 9
export NODE_AUTH_TOKEN=$(gh auth token)

# Consumer install (in your app)
echo "@neithly-com:registry=https://npm.pkg.github.com" >> .npmrc
pnpm add @neithly-com/monitor-node          # or monitor-browser / monitor-react

# Boot in a few lines
cat <<'TS' > src/monitor.ts
import { Neithly, buildNodeSdk } from '@neithly-com/monitor-node';

Neithly.init({
  dsn: process.env.NEITHLY_DSN,             // nmk_<env>_<64 hex>
  release: process.env.GIT_SHA,
  environment: process.env.NODE_ENV,
});

// Wire the OTel transport (sends OTLP/HTTP to /v1/logs).
buildNodeSdk({
  dsn: process.env.NEITHLY_DSN,
  endpoint: 'https://ingest.neithly.com',
  serviceName: 'apollo',                    // MUST match project slug
  release: process.env.GIT_SHA,
}).start();
TS
```

For contributors:

```bash
git clone https://github.com/neithly-com/neithly-monitor-sdk.git && cd neithly-monitor-sdk
pnpm install
pnpm -r build
pnpm test
```

## What's inside

| Surface | Path | Doc |
|---|---|---|
| Shared core (DSN, scope, OTLP envelope) | `packages/core/` | [reference/monitor-core.md](docs/reference/monitor-core.md) |
| Node SDK (+ Express / Fastify / Nest) | `packages/node/` | [reference/monitor-node.md](docs/reference/monitor-node.md) |
| Browser SDK (fetch + sendBeacon) | `packages/browser/` | [reference/monitor-browser.md](docs/reference/monitor-browser.md) |
| React bindings (ErrorBoundary, hooks) | `packages/react/` | [reference/monitor-react.md](docs/reference/monitor-react.md) |
| CLI (releases + sourcemaps) | `packages/cli/` | [reference/monitor-cli.md](docs/reference/monitor-cli.md) |
| Architecture + data flow | — | [reference/architecture.md](docs/reference/architecture.md) |
| DSN format + provisioning | — | [reference/dsn.md](docs/reference/dsn.md) |

## Docs

- [Docs index](docs/README.md)
- [Consumer integration guide](docs/guides/consumer-integration.md) — wire the SDK into your app
- [Operating runbook](docs/guides/operating.md) — DSN provisioning, env vars, troubleshooting
- [Contributing](docs/guides/contributing.md) — develop locally, ADR process, release flow
- [ADRs](docs/adr/) · [Release notes](docs/release-notes/) · [QA matrices](docs/qa/)

## License

Private — `neithly-com` org.
