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
  serviceName: 'apollo', // ← MUST match the project's slug on the backend
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

| Export                                            | Purpose                                          |
| ------------------------------------------------- | ------------------------------------------------ |
| `init(options)`                                   | Parse DSN, stash config; idempotent.             |
| `captureException(err, ctx?)`                     | Ship a thrown value; returns event id.           |
| `captureMessage(msg, level?, ctx?)`               | Ship a freeform log; returns event id.           |
| `withScope(fn)`                                   | Run `fn` against a forked, async-isolated scope. |
| `setUser` / `setTags` / `setContext` / `setExtra` | Mutate the active scope.                         |
| `addBreadcrumb(crumb)`                            | Push onto the bounded ring.                      |
| `flush(ms?)` / `shutdown(ms?)`                    | Drain or tear down the exporter.                 |
| `Neithly`                                         | Singleton bundling every call.                   |

Full types: `packages/node/src/index.ts`.

## Integrations

### Express

```ts
import express from 'express';
import { init, expressRequestHandler, expressErrorHandler } from '@neithly-com/monitor-node';

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

#### One-liner adoption (`/nestjs` subpath, recommended since v0.2.0)

```ts
// main.ts — must be the very first import so the SDK is live before NestJS
import '@neithly-com/monitor-node/nestjs/preload';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { MonitorModule } from '@neithly-com/monitor-node/nestjs';

@Module({
  imports: [
    MonitorModule.forRoot({
      dsn: process.env.MONITOR_DSN!,
      env: process.env.MONITOR_ENV ?? process.env.NODE_ENV,
      serviceName: 'my-service', // ← MUST match the project slug
    }),
  ],
})
export class AppModule {}
```

```ts
// any provider / controller
import { Injectable } from '@nestjs/common';
import { MonitorService } from '@neithly-com/monitor-node/nestjs';

@Injectable()
export class MyService {
  constructor(private readonly monitor: MonitorService) {}

  doWork() {
    try {
      // ...
    } catch (err) {
      this.monitor.captureException(err, { route: 'doWork' });
    }
  }
}
```

What you get:

- **`MonitorService`** — Injectable wrapper around the SDK; calls are
  try/catch-wrapped so a misbehaving collector never breaks a request.
- **`MonitorContextInterceptor`** — registered globally; stamps
  `http.method` / `http.route` / `http.url` / `http.request_id` (+ `teamId`,
  user identity when `req.auth` is populated) on every captured event.
- **`preloadMonitor`** — programmatic alternative to the side-effect import,
  for when you want to pass a custom `serviceName` or env bag.

`@nestjs/common` and `@nestjs/core` are **peer dependencies** (optional). The
main `@neithly-com/monitor-node` entry stays usable without NestJS installed.

#### Classic `NeithlyModule` (still supported)

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
