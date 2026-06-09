# monitor-browser

> Browser SDK for neithly-monitor — Sentry-shaped public API with a hand-rolled fetch + sendBeacon exporter chain, synchronous `withScope`, and auto-instrumentation for `window.onerror`, `unhandledrejection`, `fetch`, `XMLHttpRequest`, and `console`.
> **Status:** stable
> **Package:** `@neithly-com/monitor-browser`
> **Source:** `packages/browser/src/`
> **Updated:** 2026-06-09

## Quick reference

| What | How |
|---|---|
| Boot the SDK | `init({ dsn, release?, environment?, tunnel?, integrations? })` |
| Capture a thrown value | `captureException(err)` → event id |
| Capture a freeform log | `captureMessage(message, { level? }?)` → event id |
| Per-callback scope | `withScope(fn)` — synchronous fork/restore |
| Mutate the active scope | `setUser` / `setTags` / `setContext` / `setExtra` / `addBreadcrumb` |
| Drain / tear down | `flush(timeout?)` / `shutdown(timeout?)` |
| Read resolved config | `getResolvedConfig()` |
| Per-signal exporters | `createBrowserLogExporter` / `createBrowserTraceExporter` / `createBrowserMetricExporter` |
| In-memory envelope queue | `new InMemoryEnvelopeQueue()` |
| Beacon flush on tab close | `installPagehideFlush(queue)` |
| Auto-instrumentation | `installOnerror` / `installUnhandledRejection` / `installFetchInstrumentation` / `installXhrInstrumentation` / `installConsoleBreadcrumbs` |

## Install

```bash
pnpm add @neithly-com/monitor-browser
```

The package re-exports `@neithly-com/monitor-core` types — no need to install it separately.

## Public API surface

Re-exported from `packages/browser/src/index.ts`.

### `SDK_NAME`

**Source:** `packages/browser/src/index.ts`

```ts
export const SDK_NAME = '@neithly-com/monitor-browser';
```

### `Neithly` singleton

**Source:** `packages/browser/src/api/index.ts`

```ts
import { Neithly } from '@neithly-com/monitor-browser';

Neithly.init({ dsn });
Neithly.captureException(err);
```

| Bundled method | Type |
|---|---|
| `init` / `captureException` / `captureMessage` | Capture entry points |
| `addBreadcrumb` / `setUser` / `setTags` / `setContext` / `setExtra` | Scope mutators |
| `withScope` | Synchronous fork/restore |
| `flush` / `shutdown` | Lifecycle |

### `init(options)`

Parse the DSN, resolve ingest endpoints, mark the module initialised. Idempotent — a second call warns via `console.warn` and returns silently.

**Source:** `packages/browser/src/api/init.ts`

**Signature:**

```ts
export function init(options: InitOptions): void;

export interface InitOptions {
  dsn: string;
  release?: string;
  environment?: string;
  /** Override the ingest origin (e.g. when you proxy through your own backend). */
  tunnel?: string;
  integrations?: ReadonlyArray<BrowserIntegration>;
}

export interface BrowserIntegration {
  name: string;
  setup?(): void;
}
```

| Field | Behaviour |
|---|---|
| `dsn` | Required. Parsed via `parseDsn` — throws `DsnMalformedError` synchronously on bad input. |
| `release` | Optional. Set as `service.version` resource attribute by the exporters. |
| `environment` | Optional. Defaults to the DSN-encoded env (`live` / `staging` / `dev`) when omitted; remains `undefined` for legacy bare-hex DSNs. |
| `tunnel` | Optional. Overrides the default ingest origin `https://ingest.neithly.com`. Passed through `resolveEndpoints`. |
| `integrations` | Optional. Stashed for downstream code to inspect; `init()` does NOT call `.setup()` on them. Wire each installer (`installOnerror`, etc.) manually after `init()`. |

### `getResolvedConfig()`

Return the fully-resolved config, or `null` until `init()` has run.

**Source:** `packages/browser/src/api/init.ts`

**Signature:**

```ts
export function getResolvedConfig(): ResolvedConfig | null;

export interface ResolvedConfig {
  publicKey: string;
  environment: string | undefined;
  release: string | undefined;
  endpoints: MonitorEndpoints; // { logs, metrics, traces } from monitor-core
}
```

### `captureException(err)`

Snapshot the active scope, shape `err`, build an OTLP log record, and hand it to the sender. Returns a synchronous event id (hex-stripped UUID v4, or 32-hex fallback when `crypto.randomUUID` is unavailable).

**Source:** `packages/browser/src/api/capture.ts`

**Signature:**

```ts
export function captureException(err: unknown): string;
```

No second `context` argument here (Node has one, browser does not). Use `withScope(scope => { scope.setTags(…); captureException(err); })` for one-off context.

### `captureMessage(message, options?)`

**Source:** `packages/browser/src/api/capture.ts`

**Signature:**

```ts
export function captureMessage(message: string, options?: CaptureMessageOptions): string;

export interface CaptureMessageOptions {
  level?: SeverityLevel; // 'debug' | 'info' | 'warning' | 'error' | 'fatal'
}
```

Defaults to `level: 'info'`.

### Scope mutators

**Source:** `packages/browser/src/api/scope-api.ts`

```ts
export function addBreadcrumb(breadcrumb: Breadcrumb): void;
export function setUser(user: UserContext | null): void;
export function setTags(tags: Record<string, string>): void;
export function setContext(namespace: string, ctx: Record<string, unknown> | null): void;
export function setExtra(key: string, value: unknown): void;
```

### `withScope(fn)`

Synchronously clone the active scope, swap it in, run `fn`, and restore the previous scope on return (and on throw). The forked scope is *not* available to async work scheduled from inside `fn` — by the time that work runs, the previous scope has been restored.

**Source:** `packages/browser/src/api/scope-api.ts`

```ts
export function withScope<T>(fn: (scope: Scope) => T): T;
```

### `flush(timeout?)` / `shutdown(timeout?)`

**Source:** `packages/browser/src/api/lifecycle.ts`

```ts
export function flush(timeout?: number): Promise<boolean>;   // default 2000 ms
export function shutdown(timeout?: number): Promise<boolean>; // default 2000 ms
```

`flush` races the sender's optional `flush(timeout)` method against a `setTimeout` of `timeout` ms. Default no-op sender resolves `true` immediately. `shutdown` calls `flush` and resets module state — useful in tests and SPA tear-downs.

### Test seam — `_setSenderForTest`

**Source:** `packages/browser/src/api/lifecycle.ts`

```ts
export type Sender = (payload: SendPayload) => void | Promise<void>;
export interface SendPayload { record: OtlpLogRecord }

export function _setSenderForTest(sender: Sender): void;
```

Replace the outbound sender for tests. Underscored — not part of the public stable surface.

## Transport

Hand-rolled (no `@opentelemetry/exporter-*-otlp-http` dependency) so the browser bundle stays slim.

### `createBrowserLogExporter(options)`

Build a `fetch`-based exporter that POSTs `toOtlpLogsRequest(records, meta)` JSON to `<endpoint>/v1/logs`.

**Source:** `packages/browser/src/transport/log-exporter.ts`

**Signature:**

```ts
export function createBrowserLogExporter(
  options: CreateBrowserLogExporterOptions,
): BrowserLogExporter;

export interface CreateBrowserLogExporterOptions {
  /** DSN public key — sent as `Authorization: Bearer <publicKey>`. */
  publicKey: string;
  /** Base ingest origin (e.g. `https://ingest.neithly.com`). Trailing slashes stripped, `/v1/logs` appended. */
  endpoint: string;
  /** Per-payload resource metadata applied to every send. */
  meta: LogExporterMeta;
  /** Custom fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

export type LogExporterMeta = Pick<
  ShapeOtlpLogRecordInput,
  'release' | 'environment' | 'serviceName' | 'sdkName' | 'sdkVersion'
>;

export interface BrowserLogExporter {
  send(records: OtlpLogRecord[]): Promise<BrowserLogExporterResult>;
  readonly url: string;
}

export interface BrowserLogExporterResult {
  ok: boolean;
  status: number;
}
```

The exporter calls `fetch(url, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer <publicKey>' }, body: JSON.stringify(payload) })`. It does **not** retry — that is the queue's responsibility.

### `createBrowserTraceExporter(options)` / `createBrowserMetricExporter(options)`

Same shape as the log exporter but for `/v1/traces` and `/v1/metrics`. The core SDK does not yet ship `toOtlpTracesRequest` / `toOtlpMetricsRequest`, so these exporters accept already-shaped OTLP payloads and stringify them as-is.

**Source:** `packages/browser/src/transport/{trace,metric}-exporter.ts`

**Signatures:**

```ts
export function createBrowserTraceExporter(
  options: CreateBrowserTraceExporterOptions,
): BrowserTraceExporter;

export interface CreateBrowserTraceExporterOptions {
  publicKey: string;
  endpoint: string;
  fetch?: typeof fetch;
}

export type OtlpTracePayload = Record<string, unknown>;
export interface BrowserTraceExporter {
  send(payload: OtlpTracePayload): Promise<{ ok: boolean; status: number }>;
  readonly url: string;
}

// metric-exporter mirrors trace-exporter with OtlpMetricPayload.
```

### `InMemoryEnvelopeQueue`

Tiny FIFO queue for unsent OTLP envelopes. Used by the pagehide flush path: failed / deferred exporter calls push their envelope here; `installPagehideFlush` drains it on tab close.

**Source:** `packages/browser/src/transport/queue.ts`

**Signature:**

```ts
export class InMemoryEnvelopeQueue {
  readonly size: number;
  push(envelope: QueuedEnvelope): void;
  flush(): QueuedEnvelope[]; // returns and clears in one shot
}

export interface QueuedEnvelope {
  /** Absolute URL of the ingest endpoint. */
  url: string;
  /** Pre-stringified JSON body. */
  body: string;
  /** HTTP headers — must include `Content-Type` and `Authorization`. */
  headers: Record<string, string>;
}
```

### `installPagehideFlush(queue, options?)`

Listen on `pagehide` and on `visibilitychange` (when `document.visibilityState === 'hidden'`). On either event, drain the queue and dispatch every envelope via `navigator.sendBeacon` first (Blob with the envelope's `Content-Type`), falling back to `fetch({ keepalive: true })` when the beacon API is unavailable or refuses (queue full, payload too big). Returns an idempotent uninstaller.

**Source:** `packages/browser/src/transport/pagehide.ts`

**Signature:**

```ts
export function installPagehideFlush(
  queue: InMemoryEnvelopeQueue,
  options?: InstallPagehideFlushOptions,
): Uninstall;

export interface InstallPagehideFlushOptions {
  window?: Window;          // defaults to globalThis.window
  fetch?: typeof fetch;     // defaults to globalThis.fetch
}

export type Uninstall = () => void;
```

> **Beacon caveat:** `navigator.sendBeacon` cannot send custom headers. The pagehide path sends the body as a `Blob` with the original `Content-Type`; the `Authorization` header is preserved only on the `fetch` fallback. If your backend requires strict bearer auth even on beacons, configure it to accept the public key via query string.

**Example:**

```ts
import {
  createBrowserLogExporter,
  InMemoryEnvelopeQueue,
  installPagehideFlush,
} from '@neithly-com/monitor-browser';

const queue = new InMemoryEnvelopeQueue();
const exporter = createBrowserLogExporter({
  publicKey: 'aaa…aaa',
  endpoint: 'https://ingest.neithly.com',
  meta: {
    sdkName: '@neithly-com/monitor-browser',
    sdkVersion: '0.1.0',
    serviceName: 'apollo',
    release: '1.2.3',
    environment: 'production',
  },
});

installPagehideFlush(queue);
```

## Auto-instrumentation installers

Each installer takes a small callback (`captureFn` or `addBreadcrumb`) and returns an uninstaller. Wire them in to the `Neithly` singleton after `init()`.

**Source:** `packages/browser/src/integrations/`

### `installOnerror(captureFn)`

Install a `window.onerror` handler that forwards the surfaced error (real `Error` when the browser provides it, synthesised `Error(message)` otherwise) to `captureFn`. Chains any previously-installed handler. Returns an uninstaller that restores the prior handler — but only if our handler is still in slot.

**Signature:**

```ts
export function installOnerror(captureFn: OnerrorCaptureFn): OnErrorUninstaller;

export type OnerrorCaptureFn = (error: unknown) => void;
export type OnErrorUninstaller = () => void;
```

### `installUnhandledRejection(captureFn)`

Add a `window.addEventListener('unhandledrejection', …)` handler that forwards `event.reason` to `captureFn`. Never calls `event.preventDefault()` — host logging is preserved.

**Signature:**

```ts
export function installUnhandledRejection(
  captureFn: UnhandledRejectionCaptureFn,
): UnhandledRejectionUninstaller;

export type UnhandledRejectionCaptureFn = (error: unknown) => void;
export type UnhandledRejectionUninstaller = () => void;
```

### `installFetchInstrumentation(addBreadcrumb)`

Patch `window.fetch` to push an `http` breadcrumb per call with `{ method, url, status_code, duration_ms }`. Breadcrumb level: `info` (2xx/3xx), `warning` (4xx/5xx), or `error` (network failure → `status_code: 0`). Original response/promise is returned unchanged.

**Signature:**

```ts
export function installFetchInstrumentation(addBreadcrumb: FetchAddBreadcrumbFn): FetchUninstaller;

export type FetchAddBreadcrumbFn = (b: Breadcrumb) => void;
export type FetchUninstaller = () => void;
```

### `installXhrInstrumentation(addBreadcrumb)`

Patch `XMLHttpRequest.prototype.open` and `.send` to push an `http` breadcrumb when each request reaches `readyState === DONE`. Mirrors the fetch breadcrumb shape (`{ method, url, status_code, duration_ms }`).

**Signature:**

```ts
export function installXhrInstrumentation(addBreadcrumb: XhrAddBreadcrumbFn): XhrUninstaller;

export type XhrAddBreadcrumbFn = (b: Breadcrumb) => void;
export type XhrUninstaller = () => void;
```

### `installConsoleBreadcrumbs(addBreadcrumb)`

Patch `console.log` / `.info` / `.warn` / `.error` to record a `console` breadcrumb per call with a stringified preview of the arguments. Levels: `debug` / `info` / `warning` / `error`. Originals still fire — dev-tools output unchanged.

**Signature:**

```ts
export function installConsoleBreadcrumbs(addBreadcrumb: ConsoleAddBreadcrumbFn): ConsoleUninstaller;

export type ConsoleAddBreadcrumbFn = (b: Breadcrumb) => void;
export type ConsoleUninstaller = () => void;
```

**Full installer table:**

| Installer | Category | Notes |
|---|---|---|
| `installOnerror` | n/a — captures | Coerces missing `Error` arg into a synthesised one |
| `installUnhandledRejection` | n/a — captures | Forwards `event.reason` directly |
| `installFetchInstrumentation` | `http` breadcrumb | Network failures yield `status_code: 0`, level `error` |
| `installXhrInstrumentation` | `http` breadcrumb | Fires on `readystatechange === DONE` |
| `installConsoleBreadcrumbs` | `console` breadcrumb | Level mapping: log→debug, info→info, warn→warning, error→error |

## Wiring example

```ts
import {
  Neithly,
  installOnerror,
  installUnhandledRejection,
  installFetchInstrumentation,
  installXhrInstrumentation,
  installConsoleBreadcrumbs,
} from '@neithly-com/monitor-browser';

Neithly.init({
  dsn: import.meta.env.VITE_NEITHLY_DSN,
  release: import.meta.env.VITE_GIT_SHA,
  environment: import.meta.env.MODE,
});

installOnerror(Neithly.captureException);
installUnhandledRejection(Neithly.captureException);
installFetchInstrumentation(Neithly.addBreadcrumb);
installXhrInstrumentation(Neithly.addBreadcrumb);
installConsoleBreadcrumbs(Neithly.addBreadcrumb);
```

## Differences vs `monitor-node`

| Aspect | Browser | Node |
|---|---|---|
| `withScope` isolation | Synchronous fork/restore (no ALS in browsers) | `AsyncLocalStorage`-backed |
| Transport | Hand-rolled `fetch` + `sendBeacon` on `pagehide` | OTel `BatchLogRecordProcessor` via `buildNodeSdk` |
| Auto-instrumentation | `onerror`, `unhandledrejection`, `fetch`, `XHR`, `console` | `process.on('uncaughtException')`, `instrumentation-http`, `console` |
| `init()` extras | `tunnel` to proxy through your own host | `sampling` carried for `buildNodeSdk` |
| Event id source | `crypto.randomUUID()` (32 hex, dashes stripped) or `Math.random` fallback | `node:crypto.randomUUID()` |
| DSN `allowedOrigins` | Pin to SPA host (browser always sends `Origin`) | Must be empty (Node never sends `Origin`) |

## See also

- [reference/monitor-core.md](monitor-core.md) — shared shaping helpers
- [reference/monitor-node.md](monitor-node.md) — same Sentry shape, Node runtime
- [reference/monitor-react.md](monitor-react.md) — React bindings layered on this package
- [reference/architecture.md](architecture.md) — `captureException` end-to-end data flow
- [reference/dsn.md](dsn.md) — DSN format + provisioning
- [guides/consumer-integration.md](../guides/consumer-integration.md) — embed in a browser app
- [QA 03](../qa/03-browser-fetch-flow.md) — browser fetch flow matrix
- [QA finding 01](../qa/findings/01-service-name-mismatch.md) · [QA finding 03](../qa/findings/03-allowed-origins-vs-node.md)
