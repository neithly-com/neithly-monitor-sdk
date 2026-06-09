# Consumer integration

> Wire the neithly-monitor SDK into a downstream app — Node service, browser SPA, React app, or CI release pipeline.
> **Status:** stable
> **Updated:** 2026-06-09

## Who this is for

App authors who own a deployable service or SPA and want errors to land in their team's neithly-monitor project. You should already have:

- A neithly-monitor project (slug visible in the admin SPA)
- A DSN minted for that project (see [operating.md](operating.md))
- Node `>=18` and access to GitHub Packages (`NODE_AUTH_TOKEN=$(gh auth token)`)

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

### Node service (public API only)

```bash
pnpm add @neithly-com/monitor-node
```

```ts
// src/monitor.ts — import this FIRST in your entry point.
import { Neithly } from '@neithly-com/monitor-node';

Neithly.init({
  dsn: process.env.NEITHLY_DSN!,           // nmk_<env>_<64 hex>
  release: process.env.GIT_SHA,
  environment: process.env.NODE_ENV,
});
```

```ts
// src/main.ts — entry point.
import './monitor';                          // boot first
import { app } from './app';
app.listen(3000);
```

`init()` parses the DSN and stashes config. It does **not** wire transport — see the next subsection.

### Node service with OTel transport

Assemble a real OTel pipeline via `buildNodeSdk`:

```ts
// src/monitor.ts
import { Neithly, buildNodeSdk } from '@neithly-com/monitor-node';

Neithly.init({ dsn: process.env.NEITHLY_DSN!, release: process.env.GIT_SHA });

const otel = buildNodeSdk({
  dsn: process.env.NEITHLY_DSN!,
  endpoint: 'https://ingest.neithly.com',
  serviceName: 'apollo',                   // MUST match the project slug
  release: process.env.GIT_SHA,
  environment: process.env.NODE_ENV,
});
otel.start();

process.on('SIGTERM', async () => {
  await Neithly.flush(2000);
  await otel.shutdown();
});
```

The `serviceName` you pass here becomes `service.name` on every record — it MUST equal the project's slug or the backend will drop records silently. See [QA finding 01](../qa/findings/01-service-name-mismatch.md).

### Express / Fastify / Nest

See [reference/monitor-node.md](../reference/monitor-node.md) for the per-framework wiring (Express middlewares, Fastify plugin, NestJS module).

### Browser SPA

```bash
pnpm add @neithly-com/monitor-browser
```

```ts
// src/main.ts — top of the entry chunk.
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

For pagehide flush of in-flight envelopes, build your own exporter chain with `createBrowserLogExporter` + `InMemoryEnvelopeQueue` + `installPagehideFlush(queue)` — see [reference/monitor-browser.md](../reference/monitor-browser.md).

### React app

```bash
pnpm add @neithly-com/monitor-react @neithly-com/monitor-browser
```

```tsx
import { createRoot } from 'react-dom/client';
import { Neithly } from '@neithly-com/monitor-browser';
import { NeithlyErrorBoundary } from '@neithly-com/monitor-react';

Neithly.init({ dsn: import.meta.env.VITE_NEITHLY_DSN });

createRoot(document.getElementById('root')!).render(
  <NeithlyErrorBoundary fallback={(err, reset) => (
    <div role="alert">
      <p>{err.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}>
    <App />
  </NeithlyErrorBoundary>,
);
```

A full Vite + react-router example lives under `examples/react-spa/`.

### CI release pipeline

> **v0.1 status:** the `monitor` binary currently ships placeholder subcommands that print `not implemented yet`. The fleshed-out `releases create` and `sourcemaps upload` implementations exist in source (`packages/cli/src/commands/`) but are not wired into the default binary's command tree. Use them programmatically via the `register*Command` factories until a follow-up Feature swaps them in. See [reference/monitor-cli.md](../reference/monitor-cli.md).

When the binary command tree is filled in, the GitHub Actions wiring will look like:

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

## Step 3 — Verify the first event

```ts
import { Neithly } from '@neithly-com/monitor-node';
Neithly.captureException(new Error('hello from apollo'));
```

Open the SPA → project `apollo` → Issues. The new row appears at the top with a "just now" timestamp within ~5 seconds (SSE drives the refetch — no manual reload).

If nothing appears, walk [Troubleshooting](#troubleshooting).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| POST returns `200 {}` but no Issue appears | `service.name !== project slug` → backend silently drops | Set `buildNodeSdk({ serviceName: '<exact project slug>' })` (or browser-side `meta.serviceName`). See [Finding 01](../qa/findings/01-service-name-mismatch.md). |
| POST returns `403 ORIGIN_REJECTED` from a Node service | DSN was minted with `allowedOrigins` pinned | Mint a new DSN with empty `allowed_origins`. See [Finding 03](../qa/findings/03-allowed-origins-vs-node.md). |
| `init` throws `DSN_MALFORMED` at boot | DSN does not match `nmk_<env>_<64 hex>` (or legacy bare 64-hex) | Re-paste from a fresh secret manager pull |
| Browser POST blocked by adblocker | Adblockers strip requests to known telemetry hosts | Pass `init({ tunnel: '<your-host>/ingest' })` to proxy through your own backend |
| Process exits without flushing | No `flush()` / `shutdown()` before `process.exit` | Call `await Neithly.flush(2000)` (and `otel.shutdown()` if you assembled the OTel SDK) in your shutdown hook |

## See also

- [reference/monitor-node.md](../reference/monitor-node.md) · [reference/monitor-browser.md](../reference/monitor-browser.md) · [reference/monitor-react.md](../reference/monitor-react.md) · [reference/monitor-cli.md](../reference/monitor-cli.md)
- [reference/dsn.md](../reference/dsn.md) — DSN format + provisioning
- [guides/operating.md](operating.md) — DSN provisioning, env vars
- [QA matrices](../qa/README.md) — what the end-to-end pass validates
