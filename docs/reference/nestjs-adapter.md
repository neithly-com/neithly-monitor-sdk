# nestjs-adapter

> Opinionated NestJS adoption for `@neithly-com/monitor-node` — drop-in
> `MonitorModule.forRoot()`, `MonitorService`, `MonitorContextInterceptor`,
> and a side-effect-only `preload` entry.
> **Status:** stable
> **Source:** `packages/node/src/nestjs/`
> **Updated:** 2026-06-10

## Quick reference

| What               | How                                                                       |
| ------------------ | ------------------------------------------------------------------------- |
| Import path        | `@neithly-com/monitor-node/nestjs`                                        |
| Preload entry      | `import '@neithly-com/monitor-node/nestjs/preload'`                       |
| Module             | `MonitorModule.forRoot({ dsn, env?, serviceName?, release?, disabled? })` |
| Injectable wrapper | `MonitorService` (exported by `MonitorModule`)                            |
| Global interceptor | `MonitorContextInterceptor` (auto-registered via `APP_INTERCEPTOR`)       |
| Preload error      | `MissingMonitorDsnError` (production-only)                                |

The subpath ships its own dual ESM/CJS bundle (`dist/nestjs/index.{mjs,cjs}` +
`.d.ts`) and `@nestjs/common` / `@nestjs/core` are **peer dependencies** (both
marked optional). Importing `@neithly-com/monitor-node` (root) does NOT pull
NestJS — only `/nestjs` does.

## When to use

Use `MonitorModule.forRoot()` whenever a NestJS backend needs the SDK. It
replaces the hand-rolled `src/common/monitor/{preload,module,service,context-interceptor,config}.ts`
pattern every neithly-\* backend used to ship.

For non-NestJS Node apps (Express, Fastify, plain scripts), keep importing
the root `@neithly-com/monitor-node` entry as before.

## Setup (one-liner)

### Step 1 — preload before NestJS boots

```ts
// main.ts — MUST be the very first import in the file
import '@neithly-com/monitor-node/nestjs/preload';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

The side-effect import reads `MONITOR_DSN`, `MONITOR_ENV`, and
`npm_package_version` from `process.env`. If `NODE_ENV=production` and
`MONITOR_DSN` is unset, it throws `MissingMonitorDsnError` so the process
exits non-zero before NestJS instantiates anything.

For programmatic control (custom `serviceName`, custom env bag, test
harness), import `preloadMonitor` and call it explicitly:

```ts
import { preloadMonitor } from '@neithly-com/monitor-node/nestjs';

preloadMonitor({ serviceName: 'my-service' });
```

### Step 2 — register `MonitorModule` in `AppModule`

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { MonitorModule } from '@neithly-com/monitor-node/nestjs';

@Module({
  imports: [
    MonitorModule.forRoot({
      dsn: process.env.MONITOR_DSN!,
      env: process.env.MONITOR_ENV ?? process.env.NODE_ENV,
      serviceName: 'my-service', // MUST match the project slug on the backend
    }),
  ],
})
export class AppModule {}
```

`MonitorModule` is `@Global()` — register once in `AppModule` and
`MonitorService` is injectable everywhere.

### Step 3 — inject `MonitorService`

```ts
import { Injectable } from '@nestjs/common';
import { MonitorService } from '@neithly-com/monitor-node/nestjs';

@Injectable()
export class MyService {
  constructor(private readonly monitor: MonitorService) {}

  doWork(): void {
    try {
      // ...
    } catch (err) {
      this.monitor.captureException(err, { route: 'doWork' });
    }
  }
}
```

## API

### `MonitorModule.forRoot(options)`

| Option        | Type      | Required                | Description                                             |
| ------------- | --------- | ----------------------- | ------------------------------------------------------- |
| `dsn`         | `string`  | yes (unless `disabled`) | Parsed by `parseDsn`; `nmk_<env>_<64hex>` or raw 64-hex |
| `env`         | `string`  | no                      | Environment tag; defaults to whatever the DSN encodes   |
| `serviceName` | `string`  | no                      | Slug attached as the `serviceName` tag                  |
| `release`     | `string`  | no                      | Release identifier (typically a git SHA)                |
| `disabled`    | `boolean` | no                      | Skip `init()` entirely; still provides `MonitorService` |

Returns a `DynamicModule`. Side effects (synchronous, at module assembly):

1. Calls `init({ dsn, env?, release? })` once unless `isInitialised()` is
   already true OR `disabled: true`.
2. Stamps `serviceName` and `env` tags on the global scope.
3. Wires `MonitorService` + `MonitorContextInterceptor` (via `APP_INTERCEPTOR`).

Errors:

| Code                 | When                                 |
| -------------------- | ------------------------------------ |
| `'`dsn`is required'` | `dsn === ''` and `disabled !== true` |

### `MonitorService`

```ts
class MonitorService {
  captureException(err: unknown, ctx?: Record<string, unknown>): void;
  captureMessage(message: string, level?: MonitorLevel): void;
  setUser(user: MonitorUser | null): void;
  setTags(tags: Record<string, string>): void;
}

type MonitorLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';
interface MonitorUser {
  id: string;
  email?: string;
  ip_address?: string;
}
```

Every call is wrapped in `try / catch`; SDK-side errors log to
`Logger('MonitorService')` and are swallowed so a misbehaving collector
cannot break the host code path.

### `MonitorContextInterceptor`

Registered globally by `MonitorModule.forRoot`. On every HTTP request it
calls `monitor.setTags(...)` with:

| Tag               | Value                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| `http.method`     | `req.method`                                                                |
| `http.route`      | `req.route?.path` (Express param template) or fallback to `req.originalUrl` |
| `http.url`        | `req.originalUrl ?? req.url`                                                |
| `http.request_id` | first value of `x-request-id` header                                        |
| `teamId`          | `req.auth.teamId` (when present)                                            |

When `req.auth.sub` is populated (typically by `@neithly-com/neithly-auth-sdk/nestjs`
`NeithlyAuthGuard`), it also calls `monitor.setUser({ id, email })`. On
response — both success AND error paths via `rxjs.finalize` — it calls
`monitor.setUser(null)` to prevent the next request on the same worker from
inheriting the identity (the canonical Sentry scope-leak trap).

### `preloadMonitor(options?)`

```ts
interface PreloadMonitorOptions {
  serviceName?: string;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  env?: NodeJS.ProcessEnv;
}
```

Reads from `env` (default `process.env`):

| Variable              | Effect                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `MONITOR_DSN`         | Required to actually init. Empty + `NODE_ENV=production` throws `MissingMonitorDsnError`. |
| `MONITOR_ENV`         | Environment tag override; defaults to `NODE_ENV`.                                         |
| `npm_package_version` | Used as `release`.                                                                        |

Side effects:

1. Calls `init({ dsn, environment, release })` (skipped if `isInitialised()`).
2. Stamps `serviceName` (if provided) and `env` tags on the global scope.
3. Installs process-level uncaught handlers via `installUncaughtHandlers`.

Idempotent — second call logs a warning and returns.

### `MissingMonitorDsnError`

Thrown by `preloadMonitor` when `NODE_ENV=production` and `MONITOR_DSN` is
unset. Has `.name === 'MissingMonitorDsnError'` for ergonomic matching.

## Gotchas

- **`@nestjs/common` / `@nestjs/core` are PEER deps.** Non-Nest consumers
  importing the root entry don't pay for them. Apps that import `/nestjs`
  must have NestJS installed (peer ranges: `^10.0.0 || ^11.0.0`).
- **Constructor injection uses explicit `@Inject(MonitorService)`.** This
  keeps the interceptor working under esbuild / swc / vitest transpilers
  that do NOT emit `design:paramtypes` decorator metadata.
- **`MONITOR_DSN` is read at preload-time, BEFORE `ConfigModule`.** This is
  intentional: the SDK must be live before any provider instantiates, which
  is earlier than `ConfigService` becomes available.
- **`forRoot` is idempotent.** Calling it twice (e.g. across test suites)
  re-checks `isInitialised()` and skips the second `init()` — but the
  underlying SDK still logs a single "double init" warning if you somehow
  bypass that check (e.g. by mixing the classic `NeithlyModule` and
  `MonitorModule` in the same process).

## See also

- [`monitor-node.md`](./monitor-node.md) — full SDK surface (root entry).
- Classic `NeithlyModule` integration — still exported from the root entry;
  recommended only for advanced use cases that need explicit `client`
  injection.
- `@neithly-com/neithly-auth-sdk/nestjs` — the auth-side counterpart whose
  `NeithlyAuthGuard` populates `req.auth` that this interceptor reads.
