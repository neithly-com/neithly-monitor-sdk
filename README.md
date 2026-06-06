# neithly-monitor-sdk

Official JS/TS SDK family for [neithly-monitor](https://github.com/neithly-com/neithly-monitor) — a Sentry-shaped public API wrapping the OTLP/HTTP exporters that neithly-monitor's backend already accepts.

The SDK collapses the ~30 lines of manual `@opentelemetry/sdk-node` wiring documented in the backend README down to a single `Neithly.init({ dsn })` call, and exposes the familiar Sentry shape (`captureException`, `captureMessage`, `addBreadcrumb`, `setUser`, `setTags`, `withScope`, `flush`, `shutdown`) on top of the OTel transport.

## Install matrix

Pick the entry-point package for your runtime. `monitor-core` is pulled in transitively — you do not depend on it directly.

| Runtime / framework | Package | Notes |
|---|---|---|
| Node.js (plain) | [`@neithly-com/monitor-node`](./packages/node) | Sentry-shaped singleton + `AsyncLocalStorage`-backed `withScope`. |
| Node — Express | [`@neithly-com/monitor-node`](./packages/node) | Exports `expressRequestHandler()` + `expressErrorHandler()`. |
| Node — Fastify | [`@neithly-com/monitor-node`](./packages/node) | Exports a `fastifyPlugin`. |
| Node — NestJS | [`@neithly-com/monitor-node`](./packages/node) | Exports `NeithlyModule.forRoot()` + `NeithlyExceptionFilter` + `NeithlyInterceptor`. |
| Browser (any bundler) | [`@neithly-com/monitor-browser`](./packages/browser) | Sentry-shaped singleton with sync `withScope` (no `AsyncLocalStorage`). |
| React (web) | [`@neithly-com/monitor-react`](./packages/react) | `<NeithlyErrorBoundary>`, `useNeithlyScope`, react-router v6 bindings. Depends on `monitor-browser`. |
| CI / release tooling | [`@neithly-com/monitor-cli`](./packages/cli) | `monitor releases create` + `monitor sourcemaps upload`. Authenticates with a `nmk_live_…` API token, not a DSN. |
| Shared core (workspace) | [`@neithly-com/monitor-core`](./packages/core) | DSN parsing, exception shaping, breadcrumb ring, OTLP envelope helpers. Published so consumer installs resolve cleanly; you should not import from it directly. |

All packages are published to GitHub Packages under the `@neithly-com` scope. To install in a consumer repo, see the org convention [npm packages via GitHub Packages](https://github.com/neithly-com): add `@neithly-com:registry=https://npm.pkg.github.com` to `.npmrc` and authenticate with `NODE_AUTH_TOKEN=$(gh auth token)`.

### Node — 30-second quickstart

```ts
import { Neithly } from '@neithly-com/monitor-node';

Neithly.init({
  dsn: process.env.NEITHLY_DSN,           // nmk_<env>_<64 hex>
  release: process.env.RELEASE,           // e.g. git short sha
  environment: process.env.NODE_ENV,      // production | staging | dev
});

try {
  doRiskyThing();
} catch (err) {
  Neithly.captureException(err, { tags: { feature: 'checkout' } });
}
```

### Browser — 30-second quickstart

```ts
import { Neithly } from '@neithly-com/monitor-browser';

Neithly.init({
  dsn: import.meta.env.VITE_NEITHLY_DSN,
  release: import.meta.env.VITE_RELEASE,
  environment: import.meta.env.MODE,
});
```

`window.onerror`, `unhandledrejection`, fetch / XHR timing, and console calls are all wired automatically. Disable any of them via `init({ integrations: { fetch: false, ... } })`.

## Contributor quickstart

Requires Node >= 18 and pnpm >= 9.

```bash
pnpm install           # bootstrap the workspace
pnpm -r build          # build every package (tsup → dual ESM + CJS + .d.ts)
pnpm test              # vitest, workspace mode
pnpm --filter @neithly-com/monitor-core test    # one package
pnpm typecheck         # tsc --noEmit across packages
pnpm lint              # ESLint flat config (TS-aware)
pnpm format            # Prettier
```

Conventions you should know before opening a PR:

- **Strict TS, no `any`** without an inline `// reason: …` comment. Explicit return types on all exported functions.
- **Tests next to source** as `<name>.spec.ts` / `<name>.spec.tsx`. Run with `pnpm --filter <package> test`.
- **Workspace boundaries**: `monitor-core` is the only package allowed to be imported by every other; `monitor-react` may import `monitor-browser`; nothing else cross-imports. See [`docs/architecture.md`](./docs/architecture.md).
- **No direct `package.json` edits for deps** — use `pnpm add <name> --filter <workspace>`.
- **Architectural decisions** go in [`docs/adr/`](./docs/adr) following the MADR format. Cross-link new ADRs from `docs/architecture.md`.

## Release flow

Per-package semver and CHANGELOGs are managed by [changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset             # describe your change → creates a .changeset/*.md
pnpm changeset:version     # bump versions + write CHANGELOG.md per package
pnpm changeset:publish     # build then publish to GitHub Packages
```

On `main`, the publish step runs in CI on a tag push. The promotion flow `dev → staging → main` follows the org rulesets (review required); see `plans/01-bootstrap.md` for the milestone breakdown and live progress at [milestone v0.1](https://github.com/neithly-com/neithly-monitor-sdk/milestone/1).

## Architecture & decisions

- [`docs/architecture.md`](./docs/architecture.md) — package boundaries + the `captureException` data flow end-to-end.
- [`docs/adr/0001-dsn-format.md`](./docs/adr/0001-dsn-format.md) — why DSNs use the `nmk_<env>_<64 hex>` shape.
- [`docs/adr/0002-sentry-shaped-api-over-otel.md`](./docs/adr/0002-sentry-shaped-api-over-otel.md) — why the public API is Sentry-shaped instead of raw OTel.

## Status

Under development — v0.1 in flight. See [`plans/01-bootstrap.md`](./plans/01-bootstrap.md) for the full breakdown and live progress on [milestone v0.1](https://github.com/neithly-com/neithly-monitor-sdk/milestone/1).
