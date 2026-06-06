# @neithly-com/monitor-core

Shared core for the neithly-monitor SDK family — DSN parsing, exception shaping, breadcrumb ring, scope snapshots, endpoint resolution, and OTLP envelope helpers.

## What

`monitor-core` is the runtime-agnostic foundation that every platform SDK
(`@neithly-com/monitor-node`, `@neithly-com/monitor-browser`,
`@neithly-com/monitor-react`) builds on. It owns the pure data path:
turning a DSN into a public key + environment, normalising arbitrary
thrown values into `exception.*` OTLP attributes, holding a bounded
breadcrumb ring, forking a `Scope`, resolving the ingest endpoints, and
emitting OTLP `LogRecord` envelopes ready for the wire.

You typically do **not** install this package directly. It ships
transitively via the platform SDKs and is only needed when you author a
new binding or integration.

## Install

```bash
pnpm add @neithly-com/monitor-core
```

## Quickstart

```ts
import {
  parseDsn,
  shapeException,
  Scope,
  toOtlpLogRecord,
} from '@neithly-com/monitor-core';

const dsn = parseDsn('nmk_live_' + 'a'.repeat(64));
const scope = new Scope();
scope.setTag('feature', 'checkout');

const record = toOtlpLogRecord({
  scope: scope.snapshot(),
  exception: shapeException(new Error('boom')),
  sdkName: '@neithly-com/monitor-core',
  sdkVersion: '0.1.0',
  environment: dsn.environment ?? 'dev',
});
```

## API

| Export | Purpose |
| --- | --- |
| `parseDsn(input)` / `DsnMalformedError` | Validate `nmk_<env>_<64-hex>` or raw 64-hex DSNs. |
| `shapeException(err)` | Normalise any thrown value to `ExceptionAttributes`. |
| `BreadcrumbRing` / `serialiseBreadcrumbs` | Bounded FIFO ring with OTLP serialisation. |
| `Scope` | User, tags, contexts, extras, breadcrumbs — with `snapshot()` and `clone()`. |
| `resolveEndpoints(origin)` | Derive logs / traces / metrics URLs from an ingest origin. |
| `toOtlpLogRecord` / `toOtlpLogsRequest` | Build OTLP-shaped envelopes from a scope + payload. |

Full TypeScript types ship in `dist/index.d.ts`. See
`packages/core/src/index.ts` for the canonical export list.

## DSN format

```
nmk_<env>_<64-char lowercase hex>
```

`<env>` is one of `live`, `staging`, `dev`. A bare 64-char hex string is
also accepted; its environment is `null` and the host SDK falls back to
the explicit `environment` option passed to `init`.

## Use it as an internal dep

If you are writing a new platform binding (e.g. a Bun or Deno SDK),
re-export the Sentry-shaped surface from this package and wire your
runtime transport to `toOtlpLogRecord`. Keep all serialisation logic
here so every binding stays wire-compatible.
