# Architecture

> Package boundaries inside `neithly-monitor-sdk` + the data flow of a single `captureException` call from user code all the way to the neithly-monitor backend.
> **Status:** stable
> **Updated:** 2026-06-08

This is the entry point for new contributors. For the *why* behind specific decisions, follow the cross-links to the ADRs.

## Quick reference

| Layer | What it owns | Package |
|---|---|---|
| Pure logic | DSN parse, exception shape, scope, breadcrumbs, OTLP envelope | `monitor-core` |
| Node runtime | OTel `NodeSDK` + DSN auth + ALS scope + framework bindings | `monitor-node` |
| Browser runtime | fetch + sendBeacon transport + sync scope + auto-instrumentation | `monitor-browser` |
| React glue | ErrorBoundary, scope hook, react-router v6 | `monitor-react` |
| CI tooling | `monitor releases create` + `monitor sourcemaps upload` | `monitor-cli` |

## Goals

1. **One install, one boot call.** Consumer apps add a single dependency for their runtime and call `Neithly.init({ dsn })`. Everything else is wired internally.
2. **Sentry-shaped public API.** Operators recognise `captureException`, `addBreadcrumb`, `setUser`, `setTags`, `withScope`. See [ADR-0002](../adr/0002-sentry-shaped-api-over-otel.md).
3. **OTLP/HTTP under the hood.** The backend already speaks OTLP on `/v1/logs`, `/v1/metrics`, `/v1/traces` with DSN bearer auth. We wrap the OTel SDK's official exporters with a DSN-aware auth header rather than rolling our own HTTP client.
4. **Strict workspace boundaries.** `monitor-core` is the only package that may be imported by every other. Runtime packages (`monitor-node`, `monitor-browser`) do not import each other. Framework bindings live in the runtime package they need.

## Package boundaries

```
                 ┌──────────────────────┐
                 │  @neithly-com/       │
                 │  monitor-core        │   pure logic, no runtime deps
                 │  (workspace-only,    │   — parseDsn
                 │   published so       │   — shapeException
                 │   installs resolve)  │   — BreadcrumbRing
                 └──────────┬───────────┘   — Scope
                            │               — resolveEndpoints
        ┌───────────────────┼───────────────────────┐  — toOtlpLogRecord
        │                   │                       │
        ▼                   ▼                       ▼
┌───────────────┐   ┌───────────────┐       ┌────────────────┐
│  monitor-node │   │ monitor-      │       │  monitor-cli   │
│               │   │ browser       │       │                │
│  Sentry-shape │   │               │       │  releases      │
│  + OTel SDK   │   │  Sentry-shape │       │  sourcemaps    │
│  + Express /  │   │  + fetch      │       │  (auth via     │
│  Fastify /    │   │  exporter     │       │   nmk_live_ API│
│  Nest binding │   │  + sendBeacon │       │   token, not   │
│  + AsyncLocal-│   │  + sync       │       │   a DSN)       │
│   Storage     │   │   withScope   │       │                │
└───────────────┘   └───────┬───────┘       └────────────────┘
                            │
                            ▼
                    ┌────────────────┐
                    │  monitor-react │
                    │                │
                    │  ErrorBoundary │
                    │  useNeithly-   │
                    │   Scope        │
                    │  react-router  │
                    │  bindings      │
                    └────────────────┘
```

### Rules

- `monitor-core` has zero runtime dependencies. It must stay under ~1k LoC of pure logic.
- `monitor-node` and `monitor-browser` both depend on `monitor-core` and expose the **same** `Neithly` singleton shape so application code is portable between runtimes. The shape is identical; the implementation differs:
  - `monitor-node` uses `AsyncLocalStorage` for `withScope`, batched OTel processors, and OS-level hooks (`process.on('uncaughtException')`).
  - `monitor-browser` uses a synchronous `withScope` (no ALS available), a fetch-based exporter, and `sendBeacon` on `pagehide` for in-flight envelopes.
- `monitor-react` depends only on `monitor-browser`. It never reaches into `monitor-core` directly; everything flows through the browser singleton.
- `monitor-cli` is independent — it talks to the backend's management API (`nmk_live_…` tokens), not the OTLP ingest endpoints. It only shares `monitor-core` for the DSN parser when validating user-pasted DSNs in `monitor login` and similar UX paths.
- Inside `monitor-node`, the framework bindings (Express / Fastify / Nest) are subdirectories of the same package, not separate packages. They share the singleton and a small request-scope abstraction.

## The `captureException` data flow

This is the path a single uncaught error walks from the moment an app calls `Neithly.captureException(err)` to the moment it lands in neithly-monitor's exception store.

### Step 1 — Scope snapshot

```ts
Neithly.setUser({ id: 'u_42', email: 'alice@example.com' });
Neithly.setTags({ feature: 'checkout' });
Neithly.addBreadcrumb({ category: 'ui.click', message: 'Pay button' });

try {
  doRiskyThing();
} catch (err) {
  Neithly.captureException(err);
}
```

The singleton holds a current `Scope` (from `@neithly-com/monitor-core`):

- `user` — the last `setUser` payload.
- `tags` / `extra` / `contexts` — last setter wins, with `withScope(fn)` pushing a child scope so callees can mutate without leaking back to the parent.
- `breadcrumbs` — a `BreadcrumbRing(100)` deque. Auto-instrumentation (`fetch`, `console`, `XHR`, navigation) pushes here continuously; user `addBreadcrumb` calls append directly.

On `captureException`, the singleton **clones** the current scope (so concurrent calls do not race) and freezes a `{ user, tags, extra, contexts, breadcrumbs }` snapshot.

### Step 2 — Exception shaping

`shapeException(err)` from `monitor-core` walks the `Error` (and `err.cause` chain, and any `AggregateError.errors`) and produces the OTel-semconv shape:

```ts
{
  'exception.type':       'TypeError',
  'exception.message':    'Cannot read properties of undefined (reading "id")',
  'exception.stacktrace': '<normalised stack with the SDK frames stripped>',
  'exception.cause': /* nested same shape, or undefined */,
}
```

The stack walker normalises file URIs, strips the SDK's own frames so they do not pollute symbolication, and caps the rendered stack at a sane size. Custom error classes survive — their `.name` becomes `exception.type`.

### Step 3 — `toOtlpLogRecord`

`toOtlpLogRecord({ scope, exception, level, timestamp })` from `monitor-core` produces a single OTLP `LogRecord` matching what the backend's `neithly-monitor` parser expects:

- `severity_number` / `severity_text` derived from `level` (default `error` for `captureException`, `info` for `captureMessage`).
- `body` set to the human-readable message.
- `attributes` carrying:
  - All `exception.*` fields from step 2.
  - `user.id`, `user.email`, etc. flattened from the scope.
  - `tags.*` and `extra.*` flattened with their respective prefixes.
  - `breadcrumbs` — JSON-serialised, capped at 16 KB, oldest dropped when over budget.
  - `service.name`, `service.version` (= release), `deployment.environment` from `init` config.

The function is shared between Node and browser. There is exactly one place that knows the wire shape, and the tests round-trip against the backend's parser fixture.

### Step 4 — Exporter

The runtime package wraps the OTel SDK's official `OTLPLogExporter` with two additions:

1. An `Authorization: Bearer <input>` header, where `<input>` is the full plaintext DSN (NOT just the parsed `publicKey` — see [Finding 02](../qa/findings/02-dsn-bearer-shape.md)). The DSN was validated by `parseDsn` (see [ADR-0001](../adr/0001-dsn-format.md)).
2. The endpoint resolved by `resolveEndpoints(dsnOrigin)` — `/v1/logs`, `/v1/metrics`, `/v1/traces` all derived from the single DSN origin.

On Node, the exporter feeds a `BatchLogRecordProcessor` so multiple `captureException` calls coalesce into one HTTP POST. On browser, the same shape is used, but `sendBeacon` takes over on `pagehide` to flush any in-flight envelope before the tab dies.

### Step 5 — Backend

The neithly-monitor backend's `/v1/logs` endpoint validates the bearer token against the `nmk_<env>_<64 hex>` token family, deserialises the OTLP LogRecord, and routes records carrying `exception.*` attributes into the exception store. Once landed, the SPA's Issues view picks them up via SSE; sourcemaps uploaded by `monitor-cli` symbolicate the stack trace on read.

### Failure modes

| Failure | Surface | Mitigation |
|---|---|---|
| Malformed DSN | `parseDsn` throws `DSN_MALFORMED` synchronously inside `init` | Boot crashes — apps fail fast rather than silently dropping events |
| 4xx (not 429) on POST | Exporter drops the batch, logs `console.warn` once | Never blocks the host app |
| 429 / 5xx | OTel SDK built-in backoff retries | Drop after retry budget |
| `service.name` mismatch | Backend returns `200`, drops record silently | Document loudly; see [Finding 01](../qa/findings/01-service-name-mismatch.md) |
| Process exit with queued events | `flush(timeoutMs)` and `shutdown()` drain queued exporters | Tests assert all in-flight envelopes land before the promise resolves |

## Real-world wire contract (post-v0.1 QA findings)

The end-to-end QA pass on 2026-06-06 surfaced three contract details that aren't obvious from the OTel spec or the backend README:

1. **`service.name` resource attribute MUST match the project's slug** — the backend's ingest worker silently drops records when this differs, returning `200 {}`. Set `init({ serviceName: '<slug>' })`. See [Finding 01](../qa/findings/01-service-name-mismatch.md).
2. **The DSN bearer is the FULL plaintext** including the `nmk_<env>_` prefix, not just the parsed `publicKey`. Internal SDK state holds the original `input` and uses that as `Authorization: Bearer <input>`. See [Finding 02](../qa/findings/02-dsn-bearer-shape.md).
3. **DSNs with `allowedOrigins` reject node-side fetches** (Node never sends an `Origin` header). For server-side SDK use, mint the DSN with an empty `allowed_origins` list. See [Finding 03](../qa/findings/03-allowed-origins-vs-node.md).

End-to-end propagation latency (POST → SPA row visible) measured at ~5 s on the local stack, driven entirely by the SPA's SSE channel + TanStack Query cache invalidation — no manual reload required.

## See also

- [reference/monitor-core.md](monitor-core.md) — pure-logic foundation
- [reference/monitor-node.md](monitor-node.md) · [reference/monitor-browser.md](monitor-browser.md) — runtime SDKs
- [reference/dsn.md](dsn.md) — DSN format + provisioning
- [ADR-0001](../adr/0001-dsn-format.md) — DSN format
- [ADR-0002](../adr/0002-sentry-shaped-api-over-otel.md) — Sentry-shaped API over OTel
- [QA matrices](../qa/) — wire-contract validation
