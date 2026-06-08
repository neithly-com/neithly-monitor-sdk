# monitor-core

> Pure-logic foundation for every neithly-monitor SDK binding. DSN parsing, exception shaping, scope, breadcrumb ring, OTLP envelope helpers.
> **Status:** stable
> **Package:** `@neithly-com/monitor-core`
> **Source:** `packages/core/src/`
> **Updated:** 2026-06-08

You typically do **not** install this package directly — it ships transitively via the runtime SDKs (`monitor-node`, `monitor-browser`). Install it only when authoring a new platform binding (Bun, Deno, edge runtime, ...) or an internal integration.

## Quick reference

| What | How |
|---|---|
| Parse a DSN | `parseDsn('nmk_<env>_<64 hex>')` → `{ publicKey, environment, origin, input }` |
| Shape a thrown value | `shapeException(err)` → OTel `exception.*` attributes |
| Hold per-request state | `new Scope()` + `scope.setUser` / `setTag` / `addBreadcrumb` / `snapshot()` |
| Build an OTLP record | `toOtlpLogRecord({ scope, exception, level, ... })` |
| Build a batch request | `toOtlpLogsRequest({ records, resource })` |
| Resolve ingest URLs | `resolveEndpoints(origin)` → `{ logs, traces, metrics }` |
| Ring-buffer breadcrumbs | `new BreadcrumbRing(100)` + `serialiseBreadcrumbs(ring)` |

## Exports

### `parseDsn(input)`

Validates and parses a DSN. Throws `DsnMalformedError` on bad input. Accepts:

| Form | Result |
|---|---|
| `nmk_<env>_<64-hex>` (env-prefixed) | `{ publicKey: '<hex>', environment: '<env>', origin: '<resolved>', input }` |
| `<64-hex>` (raw, legacy) | `{ publicKey: '<hex>', environment: null, origin: defaultOrigin, input }` — emits `console.warn` once |

`<env>` is one of `live`, `staging`, `dev`, `test`. See [reference/dsn.md](dsn.md) for the full grammar and [ADR-0001](../adr/0001-dsn-format.md) for the rationale.

**Important:** `publicKey` is for display/env-tagging only. The wire bearer is `input` (the full plaintext). See [Finding 02](../qa/findings/02-dsn-bearer-shape.md).

```ts
import { parseDsn } from '@neithly-com/monitor-core';

const dsn = parseDsn('nmk_dev_' + 'a'.repeat(64));
// dsn.environment === 'dev'
// dsn.input === 'nmk_dev_aaaa...'  ← send THIS as Authorization: Bearer
```

### `shapeException(err)`

Normalises any thrown value (Error, `null`, string, AggregateError, cause chains) into OTel semconv `exception.*` attributes.

| Attribute | Source |
|---|---|
| `exception.type` | `err.name` (defaults to `'Error'`) |
| `exception.message` | `err.message` |
| `exception.stacktrace` | `err.stack`, SDK frames stripped, capped at sane size |
| `exception.cause` | Nested same shape from `err.cause`, depth-bounded at 8 |

- Walks `AggregateError.errors` and `Error.cause` chains.
- Cycle-safe: self-referential `cause` chains stop at depth 8.
- `shapeException(null)` produces a synthetic `Error('null')`.

### `Scope`

Mutable per-context state. Mirror of Sentry's `Scope`.

```ts
const scope = new Scope();
scope.setUser({ id: 'u_42', email: 'alice@example.com' });
scope.setTag('feature', 'checkout');
scope.addBreadcrumb({ category: 'ui.click', message: 'Pay button' });

const snap = scope.snapshot();           // immutable copy for `toOtlpLogRecord`
const child = scope.clone();             // for `withScope(fn)` in host SDKs
```

| Method | Purpose |
|---|---|
| `setUser(user)` / `setTag(key, val)` / `setTags(map)` | Last-setter-wins state |
| `setContext(name, ctx)` / `setExtra(key, val)` | Structured contexts + extras |
| `addBreadcrumb(crumb)` | Append to internal `BreadcrumbRing(100)` |
| `snapshot()` | Frozen copy — caller-safe |
| `clone()` | Mutable fork for `withScope` |

### `BreadcrumbRing`

Bounded FIFO ring. Oldest drops when over capacity.

```ts
const ring = new BreadcrumbRing(100);
ring.push({ category: 'fetch', message: 'GET /api/x', level: 'info', timestamp: Date.now() });
const json = serialiseBreadcrumbs(ring, { maxBytes: 16 * 1024 });  // 16 KiB cap, oldest dropped
```

### `toOtlpLogRecord(payload)`

Produces a single OTLP `LogRecord` matching what the backend's `neithly-monitor` parser expects.

```ts
toOtlpLogRecord({
  scope: scope.snapshot(),
  exception: shapeException(err),
  level: 'error',                  // → severity_number 17, severity_text 'ERROR'
  timestamp: Date.now(),
  sdkName: '@neithly-com/monitor-node',
  sdkVersion: '0.1.0',
  environment: 'production',
})
```

Severity mapping:

| Level | severity_number | severity_text |
|---|---|---|
| `debug` | 5 | `DEBUG` |
| `info` | 9 | `INFO` |
| `warning` | 13 | `WARN` |
| `error` | 17 | `ERROR` |
| `fatal` | 21 | `FATAL` |

Attribute layout (flattened with prefixes):

- `exception.*` from `shapeException`
- `user.id`, `user.email`, ... flattened from scope
- `tags.<key>` and `extra.<key>` with their respective prefixes
- `neithly.breadcrumbs` — JSON-serialised, ≤ 16 KiB
- `service.name`, `service.version` (= `release`), `deployment.environment`

### `toOtlpLogsRequest({ records, resource })`

Wraps an array of `LogRecord`s in the OTLP `ExportLogsServiceRequest` envelope ready for `POST /v1/logs`.

### `resolveEndpoints(origin)`

```ts
resolveEndpoints('https://ingest.neithly.com')
// → { logs:    'https://ingest.neithly.com/v1/logs',
//     traces:  'https://ingest.neithly.com/v1/traces',
//     metrics: 'https://ingest.neithly.com/v1/metrics' }
```

### Errors

| Code | Thrown by | When |
|---|---|---|
| `DSN_MALFORMED` (`DsnMalformedError`) | `parseDsn` | Empty input, wrong env tag, short/long hex, uppercase, embedded whitespace beyond a trim, non-hex chars |

## Authoring a new binding

If you are writing a new platform binding (Bun, Deno, mobile, edge), re-export the Sentry-shaped surface from this package and wire your runtime transport to `toOtlpLogRecord`. Keep **all** serialisation logic in `monitor-core` so every binding stays wire-compatible — the same `toOtlpLogRecord` fixture round-trips through the backend's parser.

```ts
// my-runtime-binding/src/init.ts
import { parseDsn, Scope, BreadcrumbRing, toOtlpLogRecord, resolveEndpoints } from '@neithly-com/monitor-core';

export function init(opts: { dsn: string }) {
  const dsn = parseDsn(opts.dsn);
  const endpoints = resolveEndpoints(dsn.origin);
  // ... wire your runtime transport, sending toOtlpLogRecord(...) outputs to endpoints.logs
}
```

## See also

- [reference/architecture.md](architecture.md) — package boundaries + the `captureException` data flow end-to-end
- [reference/dsn.md](dsn.md) — DSN grammar + provisioning
- [reference/monitor-node.md](monitor-node.md) · [reference/monitor-browser.md](monitor-browser.md) — runtime consumers
- [ADR-0001](../adr/0001-dsn-format.md) — DSN format `nmk_<env>_<64 hex>`
- [ADR-0002](../adr/0002-sentry-shaped-api-over-otel.md) — Sentry-shaped API over OTel
- [QA 01](../qa/01-core-shape.md) — core envelope shape matrix
