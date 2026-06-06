# neithly-monitor-sdk

Official JS/TS SDK family for [neithly-monitor](https://github.com/neithly-com/neithly-monitor) — Sentry-shaped public API wrapping OTLP/HTTP exporters.

## Packages

| Package | What |
|---|---|
| [`@neithly-com/monitor-core`](./packages/core) | Shared core — DSN parsing, exception shaping, breadcrumb ring, OTLP envelope helpers. |
| [`@neithly-com/monitor-node`](./packages/node) | Node SDK + Express / Fastify / NestJS bindings. |
| [`@neithly-com/monitor-browser`](./packages/browser) | Browser SDK — fetch exporter + window.onerror / fetch / XHR / console instrumentation. |
| [`@neithly-com/monitor-react`](./packages/react) | React bindings — `<NeithlyErrorBoundary>` + react-router v6 instrumentation. |
| [`@neithly-com/monitor-cli`](./packages/cli) | CLI — `monitor releases create` + `monitor sourcemaps upload` for CI. |

## Development

Requires Node ≥ 18 and pnpm ≥ 9.

```bash
pnpm install
pnpm -r build
pnpm test
pnpm lint
```

See [`docs/architecture.md`](./docs/architecture.md) for the package boundary rationale and the full data flow.

## Status

Under development — v0.1 in flight. See `plans/01-bootstrap.md` for the full breakdown and live progress on [milestone v0.1](https://github.com/neithly-com/neithly-monitor-sdk/milestone/1).
