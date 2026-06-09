# @neithly-com/monitor-node

Node.js SDK for neithly-monitor. Sentry-shaped public API on top of
OpenTelemetry, with first-class Express, Fastify, and NestJS bindings.

## What

`monitor-node` is the server-side SDK. You call `init({ dsn })` once at
process boot and then use familiar verbs — `captureException`,
`captureMessage`, `withScope`, `setUser`, `setTags`, `addBreadcrumb` —
to ship errors and structured events to your neithly-monitor backend.
Under the hood, every capture turns into an OTLP `LogRecord` that
travels through a batched exporter built on `@opentelemetry/sdk-node`.

Scope isolation is backed by `AsyncLocalStorage`, so a per-request
scope (tags, user, breadcrumbs) stays bound to the request even across
`await` points. The package ships ready-made middlewares for the
mainstream Node web frameworks so you rarely need to wire that yourself.

## Install

```bash
pnpm add @neithly-com/monitor-node
```

## Quickstart

```ts
import { init, captureException } from '@neithly-com/monitor-node';

init({
  dsn: process.env.NEITHLY_DSN!,
  serviceName: 'apollo',          // ← MUST match the project's slug on the backend
  release: process.env.GIT_SHA,
  environment: process.env.NODE_ENV,
});

try {
  await doWork();
} catch (err) {
  captureException(err);
}
```

> **`serviceName` MUST match the project slug.** The backend's ingest worker
> silently drops records whose `service.name` resource attribute doesn't
> equal the project's slug — the SDK still gets `200 {}` from the HTTP layer.
> The slug is visible in the SPA's admin / project list. See
> [QA finding 01](https://github.com/neithly-com/neithly-monitor-sdk/blob/dev/docs/qa/findings/01-service-name-mismatch.md).

> **Server-side DSNs must NOT pin `allowedOrigins`** (Node never sends an
> `Origin` header). Mint the DSN with an empty allowed-origins list from the
> backend admin. See
> [QA finding 03](https://github.com/neithly-com/neithly-monitor-sdk/blob/dev/docs/qa/findings/03-allowed-origins-vs-node.md).

Or via the singleton facade:

```ts
import { Neithly } from '@neithly-com/monitor-node';

Neithly.init({ dsn: process.env.NEITHLY_DSN! });
Neithly.captureMessage('boot complete', 'info');
```

## API

| Export | Purpose |
| --- | --- |
| `init(options)` | Parse DSN, stash config; idempotent. |
| `captureException(err, ctx?)` | Ship a thrown value; returns event id. |
| `captureMessage(msg, level?, ctx?)` | Ship a freeform log; returns event id. |
| `withScope(fn)` | Run `fn` against a forked, async-isolated scope. |
| `setUser` / `setTags` / `setContext` / `setExtra` | Mutate the active scope. |
| `addBreadcrumb(crumb)` | Push onto the bounded ring. |
| `flush(ms?)` / `shutdown(ms?)` | Drain or tear down the exporter. |
| `Neithly` | Singleton bundling every call. |

Full types: `packages/node/src/index.ts`.

## Integrations

### Express

```ts
import express from 'express';
import {
  init,
  expressRequestHandler,
  expressErrorHandler,
} from '@neithly-com/monitor-node';

init({ dsn: process.env.NEITHLY_DSN! });

const app = express();
app.use(expressRequestHandler());
// ... your routes ...
app.use(expressErrorHandler());
```

### Fastify

```ts
import Fastify from 'fastify';
import { init, fastifyPlugin, Neithly } from '@neithly-com/monitor-node';

init({ dsn: process.env.NEITHLY_DSN! });

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
      options: { dsn: process.env.NEITHLY_DSN! },
    }),
  ],
})
export class AppModule {}
```

### Auto-instrumentation

```ts
import {
  installConsoleBreadcrumbs,
  installHttpInstrumentation,
  installUncaughtHandlers,
} from '@neithly-com/monitor-node';

installConsoleBreadcrumbs();
installHttpInstrumentation();
installUncaughtHandlers();
```
