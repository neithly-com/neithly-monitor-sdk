# monitor-node

> Node.js SDK for neithly-monitor — Sentry-shaped public API on top of OpenTelemetry's `NodeSDK`, with Express middlewares, a Fastify plugin, and a NestJS module.
> **Status:** stable
> **Package:** `@neithly-com/monitor-node`
> **Source:** `packages/node/src/`
> **Updated:** 2026-06-09

## Quick reference

| What | How |
|---|---|
| Boot the public API | `init({ dsn, release?, environment?, sampling?, integrations? })` |
| Capture a thrown value | `captureException(err, context?)` → event id |
| Capture a freeform log | `captureMessage(message, level?, context?)` → event id |
| Per-request scope (ALS) | `withScope(fn)` — `AsyncLocalStorage`-bound child scope |
| Mutate the active scope | `setUser` / `setTags` / `setContext` / `setExtra` / `addBreadcrumb` |
| Drain / tear down | `flush(timeoutMs?)` / `shutdown()` |
| Build the OTel NodeSDK | `buildNodeSdk({ dsn, endpoint, serviceName, ... })` |
| Express bindings | `expressRequestHandler()` + `expressErrorHandler()` |
| Fastify binding | `fastifyPlugin` (use with `client: Neithly`) |
| NestJS binding | `NeithlyModule.forRoot({ client, options })` |
| Auto-instrumentation | `installConsoleBreadcrumbs` / `installHttpInstrumentation` / `installUncaughtHandlers` |

## Install

```bash
pnpm add @neithly-com/monitor-node
```

Requires Node `>=18`. The package re-exports `@neithly-com/monitor-core` types — no need to install it separately.

## Public API surface

Everything below is re-exported from `packages/node/src/index.ts`.

### `SDK_NAME`

**Source:** `packages/node/src/index.ts`

```ts
export const SDK_NAME = '@neithly-com/monitor-node';
```

### `Neithly` singleton

**Source:** `packages/node/src/api/index.ts`

A frozen object that bundles every public-API function for callers who prefer namespace-style access.

```ts
import { Neithly } from '@neithly-com/monitor-node';

Neithly.init({ dsn });
Neithly.captureException(err);
```

| Bundled method | Type |
|---|---|
| `init` / `captureException` / `captureMessage` | Capture entry points |
| `addBreadcrumb` / `setUser` / `setTags` / `setContext` / `setExtra` | Scope mutators |
| `withScope` | ALS-bound child scope |
| `flush` / `shutdown` | Lifecycle |

### `init(options)`

Parse the DSN, stash the config bag in module state. Idempotent — a second call warns via `console.warn` and returns the existing config.

**Source:** `packages/node/src/api/init.ts`

**Signature:**

```ts
export function init(options: InitOptions): SdkConfig;

export interface InitOptions {
  dsn: string;
  release?: string;
  environment?: string;
  integrations?: readonly Integration[];
  sampling?: InitSampling;
}

export interface InitSampling {
  tracesSampleRate?: number;
  errorSampleRate?: number;
}

export interface Integration {
  name: string;
}

export interface SdkConfig {
  dsn: ParsedDsn;
  release: string | undefined;
  environment: string | undefined;
  sdkName: string;
  sdkVersion: string;
}
```

| Field | Behaviour |
|---|---|
| `dsn` | Required. Validated via `parseDsn` — throws `DsnMalformedError` synchronously on bad input. |
| `release` | Optional. Becomes `service.version` on every record. |
| `environment` | Optional. Defaults to the DSN-encoded env (`live` / `staging` / `dev`) when omitted; remains `undefined` for legacy bare-hex DSNs. |
| `integrations` | Optional. Free-form `{ name }[]` carried in state; actual integration wiring is performed by the `install*` helpers below or by the framework bindings. |
| `sampling` | Optional. Carried in state; the transport feature decides how to apply it (`buildNodeSdk` uses `tracesSampleRate` via `TraceIdRatioBasedSampler`). |

`init()` itself does **not** wire transport. Use `buildNodeSdk()` (below) to assemble a real `NodeSDK`, or call `_setProcessorForTest` from your test harness to drive the seam directly.

### `captureException(err, context?)`

Snapshot the active scope, shape `err` via `shapeException`, build an OTLP log record, and hand it to the processor. Returns a fresh UUID v4 (event id).

**Source:** `packages/node/src/api/capture.ts`

**Signature:**

```ts
export function captureException(err: unknown, context?: CaptureContext): string;

export interface CaptureContext {
  user?: UserContext | null;
  tags?: Record<string, string>;
  contexts?: Record<string, Record<string, unknown>>;
  extras?: Record<string, unknown>;
}
```

`context` is shallow-merged on top of the active scope snapshot:

| Slot | Merge behaviour |
|---|---|
| `user` | Replace if defined; `null` clears |
| `tags` | Per-key merge (override-wins) |
| `contexts` | Per-namespace replace |
| `extras` | Per-key merge |
| `breadcrumbs` | Carried from the active scope unchanged |

Safe to call before `init()` — the default no-op processor silently drops the record.

### `captureMessage(message, level?, context?)`

Same shape as `captureException` but for freeform log messages.

**Source:** `packages/node/src/api/capture.ts`

**Signature:**

```ts
export function captureMessage(
  message: string,
  level?: SeverityLevel, // default 'info'
  context?: CaptureContext,
): string;

export type SeverityLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';
```

### Scope mutators

Top-level mutators that act on the active scope (the ALS-bound one inside `withScope`, or the module-global one outside it).

**Source:** `packages/node/src/api/scope-api.ts`

```ts
export function addBreadcrumb(breadcrumb: Breadcrumb): void;
export function setUser(user: UserContext | null): void;
export function setTags(tags: Record<string, string>): void;
export function setContext(namespace: string, ctx: Record<string, unknown> | null): void;
export function setExtra(key: string, value: unknown): void;
```

### `withScope(fn)`

Fork the active scope, bind the child via `AsyncLocalStorage.run`, invoke `fn(child)`, and return its result. Mutations performed inside (or in any async work `fn` awaits) hit the child only — the parent scope is untouched.

**Source:** `packages/node/src/api/scope-api.ts`

```ts
export function withScope<T>(callback: (scope: Scope) => T): T;
```

The generic preserves the return type, so `await withScope(async (scope) => …)` works naturally.

### `flush(timeoutMs?)` / `shutdown()`

**Source:** `packages/node/src/api/lifecycle.ts`

```ts
export function flush(timeoutMs?: number): Promise<boolean>;
export function shutdown(): Promise<void>;
```

| Function | Behaviour |
|---|---|
| `flush(timeoutMs?)` | Resolves `true` when the processor drained within `timeoutMs`, `false` otherwise. With the default no-op processor, resolves `true` immediately. |
| `shutdown()` | Calls `processor.shutdown?.()` if present; otherwise resolves immediately. |

### State helpers

**Source:** `packages/node/src/api/state.ts`

```ts
export function isInitialised(): boolean;
export function getConfig(): SdkConfig | null;
export function getActiveScope(): Scope;
```

### Test seams (prefixed `_`)

| Export | Purpose |
|---|---|
| `_resetStateForTest()` | Clear module state — config, scope, ALS, processor. |
| `_setProcessorForTest(processor)` | Replace the in-memory log record processor; pass `null` to restore the no-op. |

Both live in `packages/node/src/api/state.ts`. Production code should not import them.

## Transport — `buildNodeSdk`

Assemble (but do not `.start()`) an OpenTelemetry `NodeSDK` wired against the neithly-monitor ingest. The returned SDK has a batch log processor, a batch span processor, a periodic metric reader, and a `TraceIdRatioBasedSampler`.

**Source:** `packages/node/src/transport/sdk.ts`

**Signature:**

```ts
export function buildNodeSdk(options: BuildNodeSdkOptions): NodeSDK;

export interface BuildNodeSdkOptions {
  /** Neithly-monitor DSN — `nmk_<env>_<hex>` or raw 64-char hex. */
  dsn: string;
  /** Base ingest origin, e.g. `https://ingest.neithly.com`. */
  endpoint: string;
  /** Service identifier (`service.name`). */
  serviceName: string;
  /** Optional service version (`service.version`). */
  release?: string;
  /** Optional deployment env override (`deployment.environment.name`). Falls back to DSN env. */
  environment?: string;
  /** Trace head-sampling rate (TraceIdRatioBasedSampler). Defaults to 1.0. */
  sampling?: number;
}
```

Resource attributes set on the SDK:

| Semconv | Source |
|---|---|
| `service.name` | `options.serviceName` |
| `service.version` | `options.release` (only when defined) |
| `deployment.environment.name` | `options.environment ?? parseDsn(dsn).environment` (only when one resolves) |

### Exporter factories

Each factory returns an OTel exporter configured for `<endpoint>/v1/<signal>` with `Authorization: Bearer <publicKey>`.

**Source:** `packages/node/src/transport/{log,trace,metric}-exporter.ts`

```ts
export function createLogExporter(opts: CreateLogExporterOptions): OTLPLogExporter;
export function createTraceExporter(opts: CreateTraceExporterOptions): OTLPTraceExporter;
export function createMetricExporter(opts: CreateMetricExporterOptions): OTLPMetricExporter;

// All three share the same shape:
export interface CreateLogExporterOptions {
  /** DSN public key — used as the bearer token. */
  publicKey: string;
  /** Base ingest endpoint, no trailing `/v1/<signal>`. */
  endpoint: string;
}
```

Use these when you want to assemble your own OTel pipeline rather than going through `buildNodeSdk`.

**Example:**

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { buildNodeSdk, init } from '@neithly-com/monitor-node';

init({ dsn: process.env.NEITHLY_DSN! });

const otel = buildNodeSdk({
  dsn: process.env.NEITHLY_DSN!,
  endpoint: 'https://ingest.neithly.com',
  serviceName: 'apollo',
  release: process.env.GIT_SHA,
  sampling: 0.25,
});
otel.start();

process.on('SIGTERM', async () => {
  await otel.shutdown();
});
```

## Express integration

Two middlewares — one to open a request-scoped child scope, one to capture errors that bubble out of the route chain.

**Source:** `packages/node/src/integrations/express.ts`

**Signature:**

```ts
export function expressRequestHandler(): ExpressRequestMiddleware;
export function expressErrorHandler(): ExpressErrorMiddleware;

export type ExpressRequestMiddleware = (req: ReqLike, res: ResLike, next: NextFn) => void;
export type ExpressErrorMiddleware = (
  err: unknown,
  req: ReqLike,
  res: ResLike,
  next: NextFn,
) => void;
```

| Middleware | Behaviour |
|---|---|
| `expressRequestHandler()` | Forks the active scope, tags it with `method`, `url` (or `originalUrl`), and `requestId` (from `X-Request-Id`), binds via ALS for the rest of the request, and pushes a `response` breadcrumb on `res.on('finish')` carrying `{ status, durationMs }`. |
| `expressErrorHandler()` | Captures errors with `status` / `statusCode` `>= 500` or unset. Always forwards via `next(err)` so Express renders its default error response. |

The request handler is structurally typed against `ReqLike` / `ResLike` — it works under any Express-compatible router (e.g. `connect`).

**Example:**

```ts
import express from 'express';
import { init, expressRequestHandler, expressErrorHandler } from '@neithly-com/monitor-node';

init({ dsn: process.env.NEITHLY_DSN! });

const app = express();
app.use(expressRequestHandler());
// … routes …
app.use(expressErrorHandler());
```

## Fastify integration

A `fastify-plugin`-wrapped registration that opens a `withScope` per request and captures 5xx-or-unset errors via `setErrorHandler`.

**Source:** `packages/node/src/integrations/fastify.ts`

**Signature:**

```ts
export const fastifyPlugin: FastifyPluginCallback<FastifyPluginOptions>;
export function shouldCaptureFastifyError(err: unknown): boolean;

export interface FastifyPluginOptions {
  client: FastifyPluginClient;
}

export interface FastifyPluginClient {
  withScope<T>(callback: (scope: Scope) => T): T;
  captureException(error: unknown): void;
}
```

Tags applied to the request-scoped scope:

| Tag | Source |
|---|---|
| `http.method` | `request.method` |
| `http.url` | `request.url` |
| `http.route` | `request.routeOptions.url` (only when the route matched) |

`shouldCaptureFastifyError(err)` returns `true` for any non-object error and for objects whose `statusCode` is missing, non-numeric, or `>= 500`. Exported so other bindings can mirror the policy.

**Example:**

```ts
import Fastify from 'fastify';
import { fastifyPlugin, init, Neithly } from '@neithly-com/monitor-node';

init({ dsn: process.env.NEITHLY_DSN! });

const app = Fastify();
await app.register(fastifyPlugin, { client: Neithly });
```

The plugin is registered against Fastify `5.x`.

## NestJS integration

A `@Global()` `DynamicModule` that registers a global exception filter + interceptor.

**Source:** `packages/node/src/integrations/nestjs/`

**Signature:**

```ts
export class NeithlyModule {
  static forRoot(options: NeithlyModuleOptions): DynamicModule;
  static forRootAsync(asyncOptions: NeithlyModuleAsyncOptions): DynamicModule;
  static resetForTesting(): void;
}

export interface NeithlyModuleOptions {
  readonly client: NeithlyClient;
  readonly options: NeithlyInitOptions;
}

export interface NeithlyModuleAsyncOptions {
  readonly imports?: ReadonlyArray<Type<unknown> | DynamicModule | Promise<DynamicModule>>;
  readonly inject?: ReadonlyArray<InjectionToken | OptionalFactoryDependency>;
  readonly useFactory: (...args: unknown[]) => Promise<NeithlyModuleOptions> | NeithlyModuleOptions;
}

export interface NeithlyInitOptions {
  readonly dsn: string;
  readonly release?: string;
  readonly environment?: string;
  readonly [key: string]: unknown;
}

export interface NeithlyClient {
  init(options: NeithlyInitOptions): void;
  captureException(error: unknown): string;
  withScope<T>(fn: (scope: Scope) => T): T;
}

export const NEITHLY_CLIENT: unique symbol;
export class NeithlyBootstrapService implements OnApplicationBootstrap;
export class NeithlyExceptionFilter extends BaseExceptionFilter;
export class NeithlyInterceptor implements NestInterceptor;
```

**Wiring:**

| Provider | Role |
|---|---|
| `NEITHLY_CLIENT` | Injection token for the user-supplied `NeithlyClient` (the `Neithly` singleton satisfies it structurally) |
| `NeithlyBootstrapService` | `onApplicationBootstrap` hook that calls `client.init(options)` exactly once |
| `APP_FILTER` → `NeithlyExceptionFilter` | Captures non-`HttpException` errors and `HttpException` with status `>= 500` |
| `APP_INTERCEPTOR` → `NeithlyInterceptor` | Opens a `client.withScope(...)` per request, tags `http.method` / `http.url` / `http.request_id`, stamps `http.status_code` on `finalize` |

The interceptor also stashes the active scope on the request object under `NEITHLY_REQUEST_SCOPE_KEY` so the filter can replay tags at capture time (Nest's `AsyncResource.bind` snapshots pre-date the interceptor's `withScope`).

**Example (sync):**

```ts
import { Module } from '@nestjs/common';
import { Neithly, NeithlyModule } from '@neithly-com/monitor-node';

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

**Example (async with ConfigService):**

```ts
NeithlyModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => ({
    client: Neithly,
    options: { dsn: cfg.getOrThrow('NEITHLY_DSN') },
  }),
});
```

## Auto-instrumentation installers

Call site: anywhere after `init()`. Each returns an uninstaller.

**Source:** `packages/node/src/integrations/`

| Installer | What it does |
|---|---|
| `installConsoleBreadcrumbs(addBreadcrumb)` | Monkey-patches `console.log` / `.info` / `.warn` / `.error` to push a `console` breadcrumb (level: `info` / `info` / `warning` / `error`). Originals still fire. |
| `installHttpInstrumentation(addBreadcrumb)` | Wraps `@opentelemetry/instrumentation-http` to push an `http` breadcrumb with `{ method, url, status, durationMs }` per outgoing request. Returns a no-op uninstaller if the optional OTel deps are missing. |
| `installUncaughtHandlers(captureFn)` | Adds `process.on('uncaughtException')` + `process.on('unhandledRejection')` listeners that call `captureFn(err)`, then re-emit the event so Node's default behaviour still fires. |

**Signatures:**

```ts
export function installConsoleBreadcrumbs(
  addBreadcrumb: (b: Breadcrumb) => void,
): () => void;

export function installHttpInstrumentation(
  addBreadcrumb: (b: Breadcrumb) => void,
): () => void;

export function installUncaughtHandlers(captureFn: (err: unknown) => void): () => void;
```

**Example:**

```ts
import {
  Neithly,
  installConsoleBreadcrumbs,
  installHttpInstrumentation,
  installUncaughtHandlers,
} from '@neithly-com/monitor-node';

Neithly.init({ dsn: process.env.NEITHLY_DSN! });
installConsoleBreadcrumbs(Neithly.addBreadcrumb);
installHttpInstrumentation(Neithly.addBreadcrumb);
installUncaughtHandlers(Neithly.captureException);
```

## Errors

| Code | Surface | When |
|---|---|---|
| `DSN_MALFORMED` | `DsnMalformedError` thrown synchronously inside `init()` | DSN does not parse |
| Backend `401 DSN_INVALID` / `403 ORIGIN_REJECTED` / `413 PAYLOAD_TOO_LARGE` | OTel exporter logs (after retry budget) | Surfaced through the underlying `@opentelemetry/exporter-*-otlp-http` retry machinery; non-fatal to the host process |

## See also

- [reference/monitor-core.md](monitor-core.md) — shared shaping helpers
- [reference/monitor-browser.md](monitor-browser.md) — same Sentry shape, browser runtime
- [reference/architecture.md](architecture.md) — `captureException` end-to-end data flow
- [reference/dsn.md](dsn.md) — DSN format + provisioning
- [guides/consumer-integration.md](../guides/consumer-integration.md) — embed in a downstream Node app
- [ADR-0002](../adr/0002-sentry-shaped-api-over-otel.md) — Sentry-shaped API over OTel rationale
- [QA 02](../qa/02-node-wire-contract.md) — Node wire-contract matrix
- [QA finding 01](../qa/findings/01-service-name-mismatch.md) · [QA finding 03](../qa/findings/03-allowed-origins-vs-node.md)
