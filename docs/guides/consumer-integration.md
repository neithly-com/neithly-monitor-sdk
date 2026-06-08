# Consumer integration

> Wire the neithly-monitor SDK into a downstream app — Node service, browser SPA, React app, or CI release pipeline.
> **Status:** stable
> **Updated:** 2026-06-08

## Who this is for

App authors who own a deployable service or SPA and want errors to land in their team's neithly-monitor project. You should already have:

- A neithly-monitor project (slug visible in the admin SPA)
- A DSN minted for that project (see [operating.md](operating.md))
- Node >= 18 and access to GitHub Packages (`NODE_AUTH_TOKEN=$(gh auth token)`)

## What you'll do

1. Configure your package manager to resolve `@neithly-com/*` from GitHub Packages
2. Install the runtime package for your platform
3. Boot the SDK at the entry point
4. Verify the first event lands in the SPA

## Step 1 — `.npmrc`

```bash
echo "@neithly-com:registry=https://npm.pkg.github.com" >> .npmrc
export NODE_AUTH_TOKEN=$(gh auth token)        # in CI, use a fine-grained PAT
```

## Step 2 — Install + boot

### Node service

```bash
pnpm add @neithly-com/monitor-node
```

```ts
// src/monitor.ts — import this FIRST in your entry point.
import { Neithly } from '@neithly-com/monitor-node';

Neithly.init({
  dsn: process.env.NEITHLY_DSN!,           // nmk_<env>_<64 hex>
  serviceName: 'apollo',                   // MUST match the project slug
  release: process.env.GIT_SHA,
  environment: process.env.NODE_ENV,
});
```

```ts
// src/main.ts — entry point.
import './monitor';                          // boot first so uncaught handlers register
import { app } from './app';
app.listen(3000);
```

### Express / Fastify / Nest

See [reference/monitor-node.md](../reference/monitor-node.md#framework-bindings) for the per-framework wiring. Same `init({ dsn, serviceName })`, then mount the request handler / plugin / module.

### Browser SPA

```bash
pnpm add @neithly-com/monitor-browser
```

```ts
// src/main.ts — top of the entry chunk.
import {
  init,
  installOnerror,
  installUnhandledRejection,
  installPagehideFlush,
} from '@neithly-com/monitor-browser';

init({
  dsn: import.meta.env.VITE_NEITHLY_DSN,
  serviceName: 'apollo',                   // MUST match the project slug
  release: import.meta.env.VITE_GIT_SHA,
});
installOnerror();
installUnhandledRejection();
installPagehideFlush();
```

### React app

```bash
pnpm add @neithly-com/monitor-react @neithly-com/monitor-browser
```

```tsx
import { init } from '@neithly-com/monitor-browser';
import { NeithlyErrorBoundary } from '@neithly-com/monitor-react';
import { createRoot } from 'react-dom/client';

init({ dsn: import.meta.env.VITE_NEITHLY_DSN, serviceName: 'apollo' });

createRoot(document.getElementById('root')!).render(
  <NeithlyErrorBoundary fallback={<p>Something went wrong.</p>}>
    <App />
  </NeithlyErrorBoundary>,
);
```

A full Vite + react-router example lives under `examples/react-spa/`.

### CI release pipeline

Cut a release on every deploy + upload sourcemaps so stack traces symbolicate.

```bash
pnpm add -D @neithly-com/monitor-cli
```

```yaml
# .github/workflows/release.yml
- name: Create release
  env:
    NEITHLY_AUTH_TOKEN: ${{ secrets.NEITHLY_AUTH_TOKEN }}  # nmk_live_<token>
  run: pnpm exec monitor releases create --project apollo --version ${{ github.ref_name }}

- name: Upload sourcemaps
  env:
    NEITHLY_AUTH_TOKEN: ${{ secrets.NEITHLY_AUTH_TOKEN }}
  run: pnpm exec monitor sourcemaps upload "dist/**/*.{js,map}" --project apollo --release ${{ github.ref_name }}
```

See [reference/monitor-cli.md](../reference/monitor-cli.md) for the full CLI surface.

## Step 3 — Verify the first event

```ts
// Anywhere in your app — temporary for the smoke test.
import { captureException } from '@neithly-com/monitor-node';
captureException(new Error('hello from apollo'));
```

Open the SPA → project `apollo` → Issues. The new row appears at the top with a "just now" timestamp within ~5 seconds (SSE drives the refetch — no manual reload).

If nothing appears, walk [Troubleshooting](#troubleshooting).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| POST returns `200 {}` but no Issue appears | `service.name !== project slug` → backend silently drops | Set `init({ serviceName: '<exact project slug>' })`. See [Finding 01](../qa/findings/01-service-name-mismatch.md). |
| POST returns `401 DSN_INVALID` from a Node service | Sending the parsed `publicKey` (64-hex) instead of the full DSN as bearer | Upgrade the SDK — internal state holds the full `input`. See [Finding 02](../qa/findings/02-dsn-bearer-shape.md). |
| POST returns `403 ORIGIN_REJECTED` from a Node service | DSN was minted with `allowedOrigins` pinned (e.g. via the SPA's "Create DSN" flow that pre-fills the SPA host) | Mint a new DSN with empty `allowed_origins`. See [Finding 03](../qa/findings/03-allowed-origins-vs-node.md). |
| `init` throws `DSN_MALFORMED` at boot | DSN does not match `nmk_<env>_<64 hex>` | Re-paste from a fresh secret manager pull |
| Browser POST blocked by adblocker | Adblockers strip requests to known telemetry hosts | Use the `tunnel: '<your-host>/ingest'` option to proxy through your own backend |
| Process exits without flushing | No `flush()` / `shutdown()` before `process.exit` | Call `await Neithly.flush(2000)` in your shutdown hook |

## See also

- [reference/monitor-node.md](../reference/monitor-node.md) · [reference/monitor-browser.md](../reference/monitor-browser.md) · [reference/monitor-react.md](../reference/monitor-react.md) · [reference/monitor-cli.md](../reference/monitor-cli.md)
- [reference/dsn.md](../reference/dsn.md) — DSN format + provisioning
- [guides/operating.md](operating.md) — DSN provisioning, env vars
- [QA matrices](../qa/) — what the end-to-end pass validates
