# monitor-browser

> Browser SDK for neithly-monitor. Same Sentry shape as `monitor-node`, with fetch + `sendBeacon` transport, sync `withScope`, and auto-instrumentation for window errors, promise rejections, fetch, XHR, and console.
> **Status:** stable
> **Package:** `@neithly-com/monitor-browser`
> **Source:** `packages/browser/src/`
> **Updated:** 2026-06-08

## Quick reference

| What | How |
|---|---|
| Boot the SDK | `init({ dsn, serviceName, release })` (once at app boot) |
| Capture a thrown value | `captureException(err, ctx?)` |
| Capture a freeform log | `captureMessage(msg, opts?)` |
| Per-callback scope | `withScope(fn)` — synchronous fork/restore |
| Mutate scope | `setUser` / `setTags` / `setContext` / `setExtra` / `addBreadcrumb` |
| Drain queue | `flush()` / `shutdown()` |
| Beacon-flush on tab close | `installPagehideFlush()` |
| Auto-instrumentation | `installOnerror`, `installUnhandledRejection`, `installFetchInstrumentation`, `installXhrInstrumentation`, `installConsoleBreadcrumbs` |
| Singleton facade | `Neithly` |

## Install

```bash
pnpm add @neithly-com/monitor-browser
```

## Init options

```ts
import { init } from '@neithly-com/monitor-browser';

init({
  dsn: import.meta.env.VITE_NEITHLY_DSN,    // nmk_<env>_<64 hex>
  serviceName: 'apollo',                    // MUST match project slug — see Finding 01
  release: import.meta.env.VITE_GIT_SHA,
  environment: import.meta.env.MODE,        // production | staging | dev
  tunnel: 'https://app.example.com/ingest', // optional — proxy through your own host
  integrations: { fetch: true, xhr: true, console: true },
});
```

**Required co-config:**

- `serviceName` MUST equal the project's slug on the backend. Otherwise the backend returns `200 {}` and silently drops the record. See [Finding 01](../qa/findings/01-service-name-mismatch.md).
- For browser use, mint the DSN with `allowedOrigins` pinned to the SPA's host (the browser always sends `Origin`). See [Finding 03](../qa/findings/03-allowed-origins-vs-node.md).

## Public API

| Export | Purpose |
|---|---|
| `init(options)` | Parse DSN, resolve endpoints, install queue. Idempotent. |
| `captureException(err, ctx?)` | Ship a thrown value. |
| `captureMessage(msg, opts?)` | Ship a freeform log. |
| `withScope(fn)` | Fork the active scope synchronously for the callback's duration. |
| `setUser` / `setTags` / `setContext` / `setExtra` / `addBreadcrumb` | Scope mutators. |
| `flush()` / `shutdown()` | Drain or tear down the transport queue. |
| `installOnerror()` | Capture via `window.onerror`. |
| `installUnhandledRejection()` | Capture via `unhandledrejection`. |
| `installFetchInstrumentation()` | Patch `fetch` for timing + breadcrumbs. |
| `installXhrInstrumentation()` | Patch `XMLHttpRequest` for timing + breadcrumbs. |
| `installConsoleBreadcrumbs()` | Mirror `console.*` calls as breadcrumbs. |
| `installPagehideFlush()` | `sendBeacon` flush on `pagehide`. |
| `Neithly` | Singleton bundling every call. |

Full types: `packages/browser/src/index.ts`.

## Transport

The queue holds OTLP envelopes in memory. While the tab is alive they flush via `fetch`. On `pagehide` (tab close, navigation away), `navigator.sendBeacon` ships any in-flight envelopes before the tab dies — install with `installPagehideFlush()`.

```
captureException()
  → scope snapshot → toOtlpLogRecord → queue
  → fetch (while alive)  OR  sendBeacon (on pagehide)
```

## Integration examples

### Vite

```ts
// src/main.ts — top of file, before any other side-effecting import.
import {
  init,
  installOnerror,
  installUnhandledRejection,
  installPagehideFlush,
} from '@neithly-com/monitor-browser';

init({ dsn: import.meta.env.VITE_NEITHLY_DSN, serviceName: 'apollo' });
installOnerror();
installUnhandledRejection();
installPagehideFlush();
```

### Webpack

```ts
import {
  init,
  installFetchInstrumentation,
  installXhrInstrumentation,
} from '@neithly-com/monitor-browser';

init({ dsn: process.env.NEITHLY_DSN!, serviceName: 'apollo', release: process.env.GIT_SHA });
installFetchInstrumentation();
installXhrInstrumentation();
```

### Tunnel through your backend

```ts
init({
  dsn: import.meta.env.VITE_NEITHLY_DSN,
  serviceName: 'apollo',
  tunnel: 'https://app.example.com/ingest',
});
```

The tunnel option replaces the default ingest origin so the DSN never appears in the network panel and adblockers don't strip the request.

## Differences vs `monitor-node`

| Aspect | Browser | Node |
|---|---|---|
| `withScope` isolation | Synchronous fork/restore — no ALS in browsers | `AsyncLocalStorage`-backed |
| Transport | `fetch` + `sendBeacon` on `pagehide` | OTel `BatchLogRecordProcessor` |
| Auto-instrumentation | `onerror`, `unhandledrejection`, fetch, XHR, console | `process.on('uncaughtException')`, `@otel/instrumentation-http`, console |
| DSN `allowedOrigins` | Pin to SPA host (browser always sends `Origin`) | Must be empty (Node never sends `Origin`) |

## See also

- [reference/monitor-core.md](monitor-core.md) — shared core
- [reference/monitor-node.md](monitor-node.md) — same shape, Node runtime
- [reference/monitor-react.md](monitor-react.md) — React bindings layered on top of this package
- [reference/architecture.md](architecture.md) — `captureException` data flow end-to-end
- [reference/dsn.md](dsn.md) — DSN format + provisioning
- [guides/consumer-integration.md](../guides/consumer-integration.md) — embed in a downstream app
- [QA 03](../qa/03-browser-fetch-flow.md) — browser fetch flow matrix
- [Finding 01](../qa/findings/01-service-name-mismatch.md) · [Finding 03](../qa/findings/03-allowed-origins-vs-node.md)
