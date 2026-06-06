# @neithly-com/monitor-browser

Browser SDK for neithly-monitor. Sentry-shaped public API with fetch +
`sendBeacon` transport, auto-instrumentation for unhandled errors,
unhandled rejections, fetch, XHR, and console.

## What

`monitor-browser` is the client-side SDK. Call `init({ dsn })` once at
app boot and capture errors with the same verbs as the Node SDK —
`captureException`, `captureMessage`, `withScope`, `setUser`,
`setTags`, `addBreadcrumb`. Scope isolation is synchronous (no
`AsyncLocalStorage` in browsers): `withScope` forks a child scope for
the duration of the callback and restores the parent on return.

The transport queues OTLP envelopes in memory and flushes them via
`fetch` while the tab is alive, then falls back to `sendBeacon` on
`pagehide` so events survive a tab close. Bundle size is the priority:
everything ships as ESM with tree-shakeable named exports.

## Install

```bash
pnpm add @neithly-com/monitor-browser
```

## Quickstart

```ts
import {
  init,
  captureException,
  installOnerror,
  installUnhandledRejection,
} from '@neithly-com/monitor-browser';

init({
  dsn: import.meta.env.VITE_NEITHLY_DSN,
  release: import.meta.env.VITE_GIT_SHA,
});

installOnerror();
installUnhandledRejection();

window.addEventListener('my-error', (e) => {
  captureException(e);
});
```

## API

| Export | Purpose |
| --- | --- |
| `init(options)` | Parse DSN, resolve endpoints, stash config; idempotent. |
| `captureException(err, ctx?)` | Ship a thrown value. |
| `captureMessage(msg, opts?)` | Ship a freeform log. |
| `withScope(fn)` | Run `fn` against a forked, sync-isolated scope. |
| `setUser` / `setTags` / `setContext` / `setExtra` | Mutate the active scope. |
| `addBreadcrumb(crumb)` | Push onto the bounded ring. |
| `flush()` / `shutdown()` | Drain or tear down the transport queue. |
| `install*` | Auto-instrumentation: onerror, unhandledrejection, fetch, XHR, console. |
| `installPagehideFlush()` | Beacon-flush the queue on `pagehide`. |
| `Neithly` | Singleton bundling every call. |

Full types: `packages/browser/src/index.ts`.

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

init({ dsn: import.meta.env.VITE_NEITHLY_DSN });
installOnerror();
installUnhandledRejection();
installPagehideFlush();
```

### Webpack

```ts
// src/index.ts — entry chunk.
import {
  init,
  installFetchInstrumentation,
  installXhrInstrumentation,
} from '@neithly-com/monitor-browser';

init({ dsn: process.env.NEITHLY_DSN!, release: process.env.GIT_SHA });
installFetchInstrumentation();
installXhrInstrumentation();
```

### Tunnel through your backend

```ts
init({
  dsn: import.meta.env.VITE_NEITHLY_DSN,
  tunnel: 'https://app.example.com/ingest',
});
```

The tunnel option replaces the default ingest origin so the DSN never
appears in the network panel and adblockers don't strip the request.
