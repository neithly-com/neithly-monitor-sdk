# monitor-node

> Node.js SDK for neithly-monitor. Sentry-shaped public API on top of OpenTelemetry, with first-class Express, Fastify, and NestJS bindings.
> **Status:** stable
> **Package:** `@neithly-com/monitor-node`
> **Source:** `packages/node/src/`
> **Updated:** 2026-06-08

## Quick reference

| What | How |
|---|---|
| Boot the SDK | `init({ dsn, serviceName, release, environment })` (once at process start) |
| Capture a thrown value | `captureException(err, ctx?)` |
| Capture a freeform log | `captureMessage(msg, level?, ctx?)` |
| Per-request scope | `withScope(fn)` — `AsyncLocalStorage`-backed, survives `await` |
| Mutate scope | `setUser` / `setTags` / `setContext` / `setExtra` / `addBreadcrumb` |
| Drain in flight | `flush(ms?)` / `shutdown(ms?)` |
| Singleton facade | `Neithly.init(...) / Neithly.captureException(...)` |

## Install

```bash
pnpm add @neithly-com/monitor-node
```

## Init options

```ts
import { init } from '@neithly-com/monitor-node';

init({
  dsn: process.env.NEITHLY_DSN!,         // nmk_<env>_<64 hex> — required
  serviceName: 'apollo',                 // MUST match project slug — see Finding 01
  release: process.env.GIT_SHA,          // free-form version string
  environment: process.env.NODE_ENV,     // production | staging | dev
  origin: 'https://ingest.neithly.com',  // optional override (self-host)
  integrations: {                        // toggle auto-instrumentation
    http: true,
    console: true,
    uncaught: true,
  },
});
```

**Required co-config (avoid silent drops):**

- `serviceName` MUST equal the project's slug on the backend. Otherwise the backend returns `200 {}` and drops the record. See [Finding 01](../qa/findings/01-service-name-mismatch.md).
- The DSN MUST be minted with empty `allowedOrigins` (Node never sends an `Origin` header). See [Finding 03](../qa/findings/03-allowed-origins-vs-node.md).

## Public API

| Export | Purpose |
|---|---|
| `init(options)` | Parse DSN, stash config, register exporters. Idempotent. |
| `captureException(err, ctx?)` | Ship a thrown value. Returns event id. |
| `captureMessage(msg, level?, ctx?)` | Ship a freeform log. Returns event id. |
| `withScope(fn)` | Run `fn` against a forked, async-isolated scope (ALS). |
| `setUser(user)` | Last-setter-wins on current scope. |
| `setTags(map)` / `setTag(k, v)` | Tags map. |
| `setContext(name, ctx)` / `setExtra(key, val)` | Structured contexts + extras. |
| `addBreadcrumb(crumb)` | Append to scope's `BreadcrumbRing(100)`. |
| `flush(ms?)` | Drain pending exporters. Default 2 s. |
| `shutdown(ms?)` | Drain + tear down. |
| `Neithly` | Singleton bundling every call. |

Full types: `packages/node/src/index.ts`.

## Framework bindings

### Express

```ts
import express from 'express';
import { init, expressRequestHandler, expressErrorHandler } from '@neithly-com/monitor-node';

init({ dsn: process.env.NEITHLY_DSN!, serviceName: 'apollo' });

const app = express();
app.use(expressRequestHandler());
// ... your routes ...
app.use(expressErrorHandler());
```

`expressRequestHandler()` opens a `withScope` keyed on the request and attaches HTTP metadata as tags. `expressErrorHandler()` captures any error reaching the Express error chain.

### Fastify

```ts
import Fastify from 'fastify';
import { init, fastifyPlugin, Neithly } from '@neithly-com/monitor-node';

init({ dsn: process.env.NEITHLY_DSN!, serviceName: 'apollo' });

const app = Fastify();
await app.register(fastifyPlugin, { client: Neithly });
```

### NestJS

```ts
import { Module } from '@nestjs/common';
import { NeithlyModule, Neithly } from '@neithly-com/monitor-node';

@Module({
  imports: [
    NeithlyModule.forRoot({
      client: Neithly,
      options: { dsn: process.env.NEITHLY_DSN!, serviceName: 'apollo' },
    }),
  ],
})
export class AppModule {}
```

`NeithlyModule` also wires `NeithlyExceptionFilter` and `NeithlyInterceptor` if you `.forFeature()` them.

## Auto-instrumentation

```ts
import {
  installConsoleBreadcrumbs,
  installHttpInstrumentation,
  installUncaughtHandlers,
} from '@neithly-com/monitor-node';

installConsoleBreadcrumbs();    // console.* → breadcrumbs
installHttpInstrumentation();   // @opentelemetry/instrumentation-http
installUncaughtHandlers();      // process.on('uncaughtException' | 'unhandledRejection')
```

All three are enabled by default via `init({ integrations: { http: true, console: true, uncaught: true } })`. Call the `install*` helpers manually when you want fine control over wiring order.

## Errors surfaced by `init`

| Code | When |
|---|---|
| `DSN_MALFORMED` | DSN does not parse — synchronous, fails fast at boot |

Backend HTTP errors (`401 DSN_INVALID`, `403 ORIGIN_REJECTED`, `413 PAYLOAD_TOO_LARGE`, etc.) are surfaced through the OTel exporter's retry/drop machinery and logged via `console.warn` once per batch failure.

## Escape hatch

For power users wanting raw OTel access (custom spans, custom processors, exotic sampling):

```ts
import { Neithly } from '@neithly-com/monitor-node';
const otelSdk = Neithly.getOtelSdk();   // returns the underlying NodeSDK
```

See [ADR-0002](../adr/0002-sentry-shaped-api-over-otel.md) for the rationale.

## See also

- [reference/monitor-core.md](monitor-core.md) — shared core
- [reference/monitor-browser.md](monitor-browser.md) — same shape, browser runtime
- [reference/architecture.md](architecture.md) — `captureException` data flow end-to-end
- [reference/dsn.md](dsn.md) — DSN format + provisioning
- [guides/consumer-integration.md](../guides/consumer-integration.md) — embed in a downstream app
- [QA 02](../qa/02-node-wire-contract.md) — Node wire contract matrix
- [Finding 01](../qa/findings/01-service-name-mismatch.md) · [Finding 03](../qa/findings/03-allowed-origins-vs-node.md)
