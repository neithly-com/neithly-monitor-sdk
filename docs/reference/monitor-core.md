# monitor-core

> Pure-logic foundation for every neithly-monitor SDK binding — DSN parsing, exception shaping, breadcrumb ring, per-event scope, endpoint resolution, OTLP envelope helpers.
> **Status:** stable
> **Package:** `@neithly-com/monitor-core`
> **Source:** `packages/core/src/`
> **Updated:** 2026-06-09

You typically do **not** install this package directly — it is a transitive dependency of `@neithly-com/monitor-node` and `@neithly-com/monitor-browser`. Install it only when authoring a new platform binding (Bun, Deno, edge runtime, …) where you need the pure shaping helpers but the existing runtime packages do not fit.

## Quick reference

| What | How |
|---|---|
| Constant | `SDK_NAME` (`'@neithly-com/monitor-core'`) |
| Parse a DSN | `parseDsn('nmk_<env>_<64 hex>')` → `{ publicKey, environment }` |
| Shape a thrown value | `shapeException(err)` → `{ 'exception.type', 'exception.message', 'exception.stacktrace' }` |
| Bounded breadcrumb buffer | `new BreadcrumbRing(capacity?)` + `serialiseBreadcrumbs(ring, byteCap?)` |
| Per-event mutable state | `new Scope()` + `setUser` / `setTags` / `setContext` / `setExtra` / `addBreadcrumb` |
| Resolve OTLP URLs | `resolveEndpoints(origin)` → `{ logs, traces, metrics }` |
| Shape one OTLP log record | `toOtlpLogRecord(input)` |
| Wrap records in OTLP envelope | `toOtlpLogsRequest(records, meta)` |

## Exported APIs

### `SDK_NAME`

String constant identifying the package. Stamped onto `neithly.sdk.name` attributes when a binding does not override it.

**Source:** `packages/core/src/index.ts`

```ts
export const SDK_NAME = '@neithly-com/monitor-core';
```

### `parseDsn(input)`

Validates a DSN and extracts the public key and environment tag.

**Source:** `packages/core/src/dsn.ts`

**Signature:**

```ts
export function parseDsn(input: string): ParsedDsn;

export type DsnEnvironment = 'live' | 'staging' | 'dev';

export interface ParsedDsn {
  publicKey: string;
  environment: DsnEnvironment | null;
}
```

**Accepted shapes** (after a surrounding-whitespace trim):

| Input | Result |
|---|---|
| `nmk_<env>_<64-char lowercase hex>` | `{ publicKey: '<hex>', environment: '<env>' }` |
| `<64-char lowercase hex>` (legacy bare key) | `{ publicKey: '<hex>', environment: null }` |

Anything else (uppercase prefix or hex, wrong env tag, wrong hex length, embedded whitespace, non-string) is rejected with `DsnMalformedError`.

**Example:**

```ts
import { parseDsn } from '@neithly-com/monitor-core';

const dsn = parseDsn(`nmk_dev_${'a'.repeat(64)}`);
// dsn.publicKey   === 'aaaa…aaaa'
// dsn.environment === 'dev'
```

**Errors thrown:**

| Error class | Code | When |
|---|---|---|
| `DsnMalformedError` | `DSN_MALFORMED` | Input is empty, non-string, has an unknown env tag, wrong hex length, uppercase characters, or any non-hex content |

### `DsnMalformedError`

Error class thrown by `parseDsn` on bad input.

**Source:** `packages/core/src/dsn.ts`

**Signature:**

```ts
export class DsnMalformedError extends Error {
  readonly code: 'DSN_MALFORMED';
  readonly input: string;
  constructor(input: string);
}
```

The original input is preserved on `.input` for debugging — useful when the caller wants to log a redacted form of the offending value.

### `shapeException(err)`

Normalises any thrown value into a flat set of OTel-semconv `exception.*` attributes.

**Source:** `packages/core/src/exception.ts`

**Signature:**

```ts
export function shapeException(err: unknown): ExceptionAttributes;

export interface ExceptionAttributes {
  'exception.type': string;
  'exception.message': string;
  'exception.stacktrace': string;
}
```

**Behaviour:**

| Source | Output |
|---|---|
| `Error` instance | `exception.type = err.constructor.name`, `exception.message = err.message`, `exception.stacktrace = err.stack` (CRLF normalised to LF) |
| `null` / `undefined` / `string` / `number` / `boolean` / `bigint` / `symbol` / `function` / object | Synthesised `Error` wrapping a string render of the value; `exception.type = 'Error'` |
| `err.cause` (recursive) | Appended to `exception.stacktrace` as `Caused by: <type>: <message>\n<stack>`, bounded at depth 8, cycle-safe |
| `AggregateError.errors[]` | Each element appended as `Aggregate error <i>: <type>: <message>\n<stack>`, recursive into nested causes |

The bounded depth (`MAX_CAUSE_DEPTH = 8`) and `WeakSet` cycle guard mean self-referential cause chains terminate cleanly.

**Example:**

```ts
import { shapeException } from '@neithly-com/monitor-core';

const inner = new Error('db disconnected');
const outer = new Error('checkout failed', { cause: inner });
shapeException(outer);
// → {
//     'exception.type':       'Error',
//     'exception.message':    'checkout failed',
//     'exception.stacktrace': 'Error: checkout failed\n    at …\nCaused by: Error: db disconnected\n    at …',
//   }
```

### `BreadcrumbRing`

Bounded FIFO ring buffer of breadcrumbs. Pushing past `capacity` drops the oldest entry.

**Source:** `packages/core/src/breadcrumbs.ts`

**Signature:**

```ts
export class BreadcrumbRing {
  constructor(capacity?: number); // default 100; throws RangeError on non-positive integer
  readonly size: number;
  push(breadcrumb: Breadcrumb): void;
  snapshot(): SerialisedBreadcrumb[];
  clear(): void;
}

export type BreadcrumbLevel = 'debug' | 'info' | 'warning' | 'error';

export interface Breadcrumb {
  category: string;
  message?: string;
  data?: Record<string, unknown>;
  level?: BreadcrumbLevel;
  timestamp?: number; // ms epoch — auto-stamped to Date.now() if omitted
}

export interface SerialisedBreadcrumb extends Breadcrumb {
  timestamp: number;
}
```

**Example:**

```ts
import { BreadcrumbRing } from '@neithly-com/monitor-core';

const ring = new BreadcrumbRing(50);
ring.push({ category: 'ui.click', message: 'Pay button' });
ring.push({ category: 'fetch', data: { url: '/checkout', status: 500 }, level: 'warning' });
const all = ring.snapshot(); // 2 entries, oldest first
```

### `serialiseBreadcrumbs(ring, byteCap?)`

Snapshot the ring and JSON-stringify it, dropping oldest entries until the encoded form fits under `byteCap`. If a single breadcrumb's `data` alone exceeds `byteCap`, that breadcrumb's `data` is replaced with `{ __truncated__: '[truncated]' }`.

**Source:** `packages/core/src/breadcrumbs.ts`

**Signature:**

```ts
export function serialiseBreadcrumbs(
  ring: BreadcrumbRing,
  byteCap?: number, // default 16_384 (16 KiB); throws RangeError on non-positive
): SerialisedBreadcrumb[];
```

Note: this returns the trimmed `SerialisedBreadcrumb[]` array, not a JSON string — the byte-cap is measured against the JSON encoding to decide what to drop.

### `Scope`

Mutable per-event state. Holds user, tags, contexts, extras, and a `BreadcrumbRing(100)`. Mirror of Sentry's `Scope` API.

**Source:** `packages/core/src/scope.ts`

**Signature:**

```ts
export class Scope {
  setUser(user: UserContext | null): this;
  setTags(tags: Record<string, string>): this;
  setContext(namespace: string, ctx: Record<string, unknown> | null): this;
  setExtra(key: string, value: unknown): this;
  addBreadcrumb(breadcrumb: Breadcrumb): this;
  clone(): Scope;
  snapshot(): ScopeSnapshot;
}

export interface UserContext {
  id?: string;
  email?: string;
  ip_address?: string;
}

export interface ScopeSnapshot {
  user: UserContext | null;
  tags: Record<string, string>;
  contexts: Record<string, Record<string, unknown>>;
  extras: Record<string, unknown>;
  breadcrumbs: SerialisedBreadcrumb[];
}
```

**Methods:**

| Method | Behaviour |
|---|---|
| `setUser(user)` | Replaces user (defensive copy). Pass `null` to clear. |
| `setTags(tags)` | Merges into existing tags (last-setter-wins per key). |
| `setContext(name, ctx)` | Replaces the named context bag. Pass `null` to delete the namespace. |
| `setExtra(key, value)` | Sets a single extra (arbitrary value, JSON-serialised on shape). |
| `addBreadcrumb(crumb)` | Appends to the internal `BreadcrumbRing(100)`. |
| `clone()` | Deep-copy fork. Used by host bindings for `withScope(fn)`. |
| `snapshot()` | Returns a fresh `ScopeSnapshot` — safe to hand off to `toOtlpLogRecord`. |

All mutators return `this` for chaining.

**Example:**

```ts
import { Scope } from '@neithly-com/monitor-core';

const scope = new Scope()
  .setUser({ id: 'u_42', email: 'alice@example.com' })
  .setTags({ feature: 'checkout' })
  .addBreadcrumb({ category: 'ui.click', message: 'Pay' });

const snap = scope.snapshot();
const fork = scope.clone(); // independent copy for a nested handler
```

### `resolveEndpoints(origin)`

Derives the three OTLP ingest URLs from a base origin.

**Source:** `packages/core/src/endpoints.ts`

**Signature:**

```ts
export function resolveEndpoints(origin: string): MonitorEndpoints;

export interface MonitorEndpoints {
  logs: string;
  metrics: string;
  traces: string;
}
```

**Behaviour:**

- Input is validated via `new URL(origin)`. Invalid URLs throw `TypeError` (propagated from the URL constructor).
- Origin with a query string (`?...`) or fragment (`#...`) is rejected with `TypeError`.
- Trailing slashes on the path are stripped before composition.
- Scheme, host, port, and any path prefix on the origin are preserved (e.g. `http://localhost:4318/monitor` is honoured).

**Example:**

```ts
import { resolveEndpoints } from '@neithly-com/monitor-core';

resolveEndpoints('https://ingest.neithly.com');
// → {
//     logs:    'https://ingest.neithly.com/v1/logs',
//     metrics: 'https://ingest.neithly.com/v1/metrics',
//     traces:  'https://ingest.neithly.com/v1/traces',
//   }

resolveEndpoints('http://localhost:4318/monitor/');
// → { logs: 'http://localhost:4318/monitor/v1/logs', … }
```

### `toOtlpLogRecord(input)`

Shape a scope snapshot (+ optional exception or message + SDK metadata) into a single OTLP/JSON `LogRecord`.

**Source:** `packages/core/src/otlp-envelope.ts`

**Signature:**

```ts
export function toOtlpLogRecord(input: ShapeOtlpLogRecordInput): OtlpLogRecord;

export interface ShapeOtlpLogRecordInput {
  scope: ScopeSnapshot;
  exception?: ExceptionAttributes;
  message?: MessageInput;
  release?: string;
  environment?: string;
  serviceName?: string;
  sdkName: string;
  sdkVersion: string;
}

export type SeverityLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface MessageInput {
  body: string;
  level?: SeverityLevel;
}

export interface OtlpLogRecord {
  timeUnixNano: string;
  observedTimeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: { stringValue: string };
  attributes: OtlpKeyValue[];
}

export interface OtlpKeyValue {
  key: string;
  value: { stringValue: string };
}
```

**Severity mapping:**

| Level | `severityNumber` | `severityText` |
|---|---|---|
| `debug` | 5 | `DEBUG` |
| `info` | 9 | `INFO` |
| `warning` | 13 | `WARNING` |
| `error` | 17 | `ERROR` |
| `fatal` | 21 | `FATAL` |

If neither `exception` nor `message.level` is supplied, level defaults to `info`. With an `exception` and no `message`, level defaults to `error`.

**Body resolution:**

- `message.body` if provided
- otherwise `exception['exception.message']` if an exception is provided
- otherwise the empty string

**Attribute layout** (deterministic, alphabetised within group):

| Attribute key pattern | Source |
|---|---|
| `exception.type` / `exception.message` / `exception.stacktrace` | `input.exception` (omitted if no exception) |
| `user.id` / `user.email` / `user.ip_address` | `input.scope.user` (only defined fields) |
| `tag.<name>` | `input.scope.tags` (sorted by key) |
| `<namespace>.<key>` | `input.scope.contexts` (sorted; values JSON-stringified) |
| `extra.<key>` | `input.scope.extras` (sorted; values JSON-stringified) |
| `neithly.breadcrumbs` | JSON of `input.scope.breadcrumbs`, capped at 16 KiB (drop oldest) |
| `neithly.sdk.name` / `neithly.sdk.version` | `input.sdkName` / `input.sdkVersion` |

All attribute values are emitted as `stringValue` (no typed values yet) per the wire shape the backend's ingest parser expects.

**Example:**

```ts
import { Scope, shapeException, toOtlpLogRecord } from '@neithly-com/monitor-core';

const scope = new Scope().setUser({ id: 'u_42' });
const exception = shapeException(new TypeError('boom'));

const record = toOtlpLogRecord({
  scope: scope.snapshot(),
  exception,
  sdkName: '@neithly-com/monitor-node',
  sdkVersion: '0.1.0',
  release: '1.2.3',
  environment: 'production',
});
```

### `toOtlpLogsRequest(records, meta)`

Wrap one or more `OtlpLogRecord` values in the OTLP resource/scope envelope expected by `POST /v1/logs`.

**Source:** `packages/core/src/otlp-envelope.ts`

**Signature:**

```ts
export function toOtlpLogsRequest(
  records: OtlpLogRecord[],
  meta: Pick<
    ShapeOtlpLogRecordInput,
    'release' | 'environment' | 'serviceName' | 'sdkName' | 'sdkVersion'
  >,
): OtlpLogsRequest;

export interface OtlpLogsRequest {
  resourceLogs: [
    {
      resource: { attributes: OtlpKeyValue[] };
      scopeLogs: [
        {
          scope: { name: string; version: string };
          logRecords: OtlpLogRecord[];
        },
      ];
    },
  ];
}
```

**Resource attributes:**

| Attribute | Source |
|---|---|
| `service.name` | `meta.serviceName` (defaults to `'neithly-monitor-sdk'` when omitted) |
| `service.version` | `meta.release` (omitted if undefined) |
| `deployment.environment` | `meta.environment` (omitted if undefined) |
| `telemetry.sdk.name` / `telemetry.sdk.version` | `meta.sdkName` / `meta.sdkVersion` |

The instrumentation-scope is set to `{ name: meta.sdkName, version: meta.sdkVersion }`.

## Authoring a new binding

To wrap this package in a new platform (Bun, Deno, edge worker, mobile):

1. Parse the DSN with `parseDsn`; reject malformed inputs at boot.
2. Resolve the ingest URLs with `resolveEndpoints(origin)`.
3. Hold per-event state in a `Scope` instance.
4. On capture: snapshot the scope, shape the exception with `shapeException`, build the record with `toOtlpLogRecord`, wrap with `toOtlpLogsRequest`, POST as `application/json` with `Authorization: Bearer <publicKey>`.

The same `toOtlpLogRecord` output is what the backend's ingest parser consumes — keeping all shape logic here means every binding stays wire-compatible.

## See also

- [reference/architecture.md](architecture.md) — package boundaries + `captureException` end-to-end data flow
- [reference/dsn.md](dsn.md) — DSN grammar + provisioning
- [reference/monitor-node.md](monitor-node.md) · [reference/monitor-browser.md](monitor-browser.md) — runtime consumers
- [ADR-0001](../adr/0001-dsn-format.md) — DSN format
- [ADR-0002](../adr/0002-sentry-shaped-api-over-otel.md) — Sentry-shaped API over OTel
- [QA 01](../qa/01-core-shape.md) — core envelope shape matrix
