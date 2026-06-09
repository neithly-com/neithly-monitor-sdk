# Architecture

> Package boundaries inside `neithly-monitor-sdk` + the data flow of a single `captureException` call from user code to the neithly-monitor backend.
> **Status:** stable
> **Source:** `packages/*/src/`
> **Updated:** 2026-06-09

Entry point for new contributors. For the *why* behind specific decisions, follow the cross-links to the ADRs.

## Quick reference

| Layer | What it owns | Package |
|---|---|---|
| Pure logic | DSN parse, exception shape, scope, breadcrumbs, OTLP envelope, endpoint resolution | `@neithly-com/monitor-core` |
| Node runtime | Public Sentry-shaped API + ALS scope + `buildNodeSdk` (OTel NodeSDK) + Express/Fastify/Nest bindings | `@neithly-com/monitor-node` |
| Browser runtime | Public Sentry-shaped API + sync scope + hand-rolled fetch/sendBeacon exporters + DOM auto-instrumentation | `@neithly-com/monitor-browser` |
| React glue | `<NeithlyErrorBoundary>`, `useNeithlyScope`, react-router v6/v7 navigation breadcrumbs | `@neithly-com/monitor-react` |
| CI tooling | `monitor` binary (releases create + sourcemaps upload — placeholders in v0.1) | `@neithly-com/monitor-cli` |

## Workspace layout

```
neithly-monitor-sdk/
├── packages/
│   ├── core/        ← pure logic, no runtime deps (vitest-only)
│   ├── node/        ← depends on core + OTel SDK + fastify + @nestjs/*
│   ├── browser/     ← depends on core; jsdom-only dev dep
│   ├── react/       ← depends on browser + core; optional react-router-dom peer
│   ├── cli/         ← depends on core + commander + cosmiconfig + ora + globby + p-limit
│   └── _internal-test-utils/  ← workspace-private helpers for specs
└── examples/        ← runnable consumer demos
```

`pnpm-workspace.yaml` keeps everything in lockstep. Versions are managed via Changesets (`pnpm changeset` → `pnpm changeset:version` → `pnpm changeset:publish`).

## Package boundaries

```
                 ┌──────────────────────┐
                 │  @neithly-com/       │
                 │  monitor-core        │   pure logic, no runtime deps
                 │                      │   — parseDsn
                 │                      │   — shapeException
                 │                      │   — BreadcrumbRing
                 └──────────┬───────────┘   — Scope
                            │               — resolveEndpoints
        ┌───────────────────┼───────────────────────┐  — toOtlpLogRecord
        │                   │                       │  — toOtlpLogsRequest
        ▼                   ▼                       ▼
┌───────────────┐   ┌───────────────┐       ┌────────────────┐
│  monitor-node │   │ monitor-      │       │  monitor-cli   │
│               │   │ browser       │       │                │
│  init/capture │   │               │       │  monitor       │
│  + ALS scope  │   │  init/capture │       │  binary +      │
│  + buildNode- │   │  + sync scope │       │  releases /    │
│   Sdk (OTel)  │   │  + fetch &    │       │  sourcemaps    │
│  + Express /  │   │   sendBeacon  │       │  (placeholders │
│   Fastify /   │   │   exporters   │       │   in v0.1)     │
│   Nest        │   │  + DOM auto-  │       │                │
│   bindings    │   │   instrument  │       │                │
└───────────────┘   └───────┬───────┘       └────────────────┘
                            │
                            ▼
                    ┌────────────────┐
                    │  monitor-react │
                    │                │
                    │  ErrorBoundary │
                    │  useNeithly-   │
                    │   Scope        │
                    │  router        │
                    │   bindings     │
                    └────────────────┘
```

### Rules

| Rule | Detail |
|---|---|
| `monitor-core` has zero runtime deps | Pure functions only. `TextEncoder` is the only optional environment touch. |
| Runtime packages do not import each other | `monitor-node` and `monitor-browser` both depend on `monitor-core` and expose the same `Neithly` singleton shape so application code is portable between runtimes. |
| `monitor-react` depends only on `monitor-browser` | Reaches `monitor-core` only via re-export. The singleton lives in `monitor-browser`. |
| `monitor-cli` depends only on `monitor-core` | It talks to the backend management API (not OTLP ingest), and only uses `monitor-core`'s DSN parser when a future `monitor login` UX needs it. |
| Framework bindings (Express/Fastify/Nest) live inside `monitor-node` | Not separate packages. They share the singleton and a small request-scope abstraction. |

### Runtime differences (same public shape)

| Behaviour | `monitor-node` | `monitor-browser` |
|---|---|---|
| `withScope(fn)` | `AsyncLocalStorage.run(child, () => fn(child))` — survives `await` boundaries | Synchronous fork → restore in `finally` — async work scheduled inside `fn` runs against the restored parent scope |
| Default ingest origin | Caller supplies via `buildNodeSdk({ endpoint })` | `https://ingest.neithly.com` (override via `init({ tunnel })`) |
| Transport | OTel `BatchLogRecordProcessor` + `BatchSpanProcessor` + `PeriodicExportingMetricReader` | Hand-rolled `fetch({ keepalive: true })` + `navigator.sendBeacon` on pagehide |
| Auto-instrumentation | `installConsoleBreadcrumbs`, `installHttpInstrumentation` (OTel HTTP instr.), `installUncaughtHandlers` | `installOnerror`, `installUnhandledRejection`, `installFetchInstrumentation`, `installXhrInstrumentation`, `installConsoleBreadcrumbs` |
| Event id | `node:crypto.randomUUID()` (with dashes) | `crypto.randomUUID()` (dashes stripped) or 32-hex `Math.random` fallback |

## The `captureException` data flow

The path a single uncaught error walks from the moment an app calls `captureException(err)` to the moment it lands in the neithly-monitor backend.

### Step 1 — Scope state

```ts
import { Neithly } from '@neithly-com/monitor-node';

Neithly.setUser({ id: 'u_42', email: 'alice@example.com' });
Neithly.setTags({ feature: 'checkout' });
Neithly.addBreadcrumb({ category: 'ui.click', message: 'Pay button' });

try {
  doRiskyThing();
} catch (err) {
  Neithly.captureException(err);
}
```

The active scope is held in module state (`packages/node/src/api/state.ts` / `packages/browser/src/api/state.ts`):

| Slot | Type | Semantics |
|---|---|---|
| `user` | `UserContext \| null` | Last `setUser` payload (defensive copy) |
| `tags` | `Record<string, string>` | Per-key last-setter-wins; no per-tag removal primitive |
| `contexts` | `Record<string, Record<string, unknown>>` | Per-namespace replace; `setContext(name, null)` deletes |
| `extras` | `Record<string, unknown>` | Per-key replace; values JSON-stringified at shape time |
| `breadcrumbs` | `BreadcrumbRing(100)` | Bounded FIFO; oldest dropped past capacity |

Node uses `AsyncLocalStorage` to swap the active scope inside `withScope(fn)` — the global scope is the fallback when no ALS context is in play.

### Step 2 — Snapshot + per-call context merge

`captureException(err, context?)` (Node) clones the active scope snapshot via `getActiveScope().snapshot()`. The browser equivalent grabs the global scope directly. If a `context` argument is supplied (Node only), it is shallow-merged on top of the snapshot:

| Slot | Merge rule |
|---|---|
| `user` | Replace if defined; `null` clears |
| `tags` | Per-key merge |
| `contexts` | Per-namespace replace |
| `extras` | Per-key merge |
| `breadcrumbs` | Carried from active scope unchanged |

### Step 3 — `shapeException`

`shapeException(err)` (from `monitor-core`) normalises arbitrary thrown values into OTel-semconv attributes:

```ts
{
  'exception.type':       'TypeError',          // err.constructor.name
  'exception.message':    'Cannot read …',      // err.message
  'exception.stacktrace': 'TypeError: …\n…\n'
                       + 'Caused by: …\n…\n'    // err.cause chain (depth 8, cycle-safe)
                       + 'Aggregate error 0: …' // AggregateError.errors[]
}
```

CRLF is normalised to LF. Non-Error inputs (string, number, null, function, plain object) are coerced into a synthesised `Error(stringified)`.

### Step 4 — `toOtlpLogRecord`

`toOtlpLogRecord({ scope, exception, sdkName, sdkVersion, release?, environment? })` produces a single OTLP/JSON `LogRecord`:

| Field | Source |
|---|---|
| `timeUnixNano` / `observedTimeUnixNano` | `BigInt(Date.now()) * 1_000_000n` |
| `severityNumber` / `severityText` | Derived from level (default `error` for exceptions, `info` for messages without level) — see severity map in `monitor-core` |
| `body.stringValue` | `message.body` or `exception['exception.message']` or `''` |
| `attributes` | `exception.*` + `user.*` (defined fields) + `tag.<name>` + `<ns>.<key>` (contexts, JSON-stringified) + `extra.<key>` (JSON-stringified) + `neithly.breadcrumbs` (JSON, capped at 16 KiB) + `neithly.sdk.name` + `neithly.sdk.version` |

Same function on Node and browser — one place that knows the wire shape.

### Step 5 — Exporter / sender

The runtime hands the record to the transport layer:

**Node** — through the OTel SDK pipeline assembled by `buildNodeSdk`:

1. `BatchLogRecordProcessor` buffers + coalesces records.
2. `OTLPLogExporter` (from `@opentelemetry/exporter-logs-otlp-http`) POSTs to `<endpoint>/v1/logs` with `Authorization: Bearer <publicKey>` and `Content-Type: application/x-protobuf`.
3. Per-signal cousins exist for `/v1/traces` and `/v1/metrics`.

Resource attributes attached by `buildNodeSdk`:

| Attribute | Source |
|---|---|
| `service.name` | `options.serviceName` |
| `service.version` | `options.release` (when defined) |
| `deployment.environment.name` | `options.environment` (or DSN env) |

**Browser** — through the hand-rolled `createBrowserLogExporter`:

1. Caller calls `exporter.send(records)`.
2. Body wrapped via `toOtlpLogsRequest(records, meta)` and serialised as JSON.
3. `fetch(url, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer <publicKey>' }, body })`.
4. On `pagehide` / `visibilitychange=hidden`, any envelope queued via `InMemoryEnvelopeQueue` is drained — `navigator.sendBeacon` first (Blob with the original `Content-Type`), `fetch({ keepalive: true })` as fallback. Note: sendBeacon cannot send custom headers, so the bearer is carried only on the fetch fallback.

### Step 6 — Backend

The neithly-monitor backend's OTLP ingest validates the bearer against the `nmk_<env>_<64 hex>` token family (SHA-256 lookup), deserialises the LogRecord, and routes records carrying `exception.*` attributes into the exception store. The SPA's Issues view picks them up via SSE; sourcemaps uploaded by the CLI symbolicate stack traces on read.

### Failure modes

| Failure | Surface | Mitigation |
|---|---|---|
| Malformed DSN | `parseDsn` throws `DsnMalformedError` (`code = 'DSN_MALFORMED'`) synchronously inside `init` | Boot crashes — apps fail fast rather than silently dropping events |
| 4xx (not 429) on POST | OTel exporter drops the batch and logs once; browser exporter resolves `{ ok: false, status }` and the caller decides | Never blocks the host app |
| 429 / 5xx | OTel SDK's built-in backoff retries (Node); browser caller is expected to push the envelope back onto the queue | Drop after retry budget (Node) / never retried by the queue (browser) |
| `service.name` mismatch | Backend returns `200`, drops record silently | See [QA finding 01](../qa/findings/01-service-name-mismatch.md) |
| DSN with `allowedOrigins` used from Node | Backend returns `403 ORIGIN_REJECTED` | See [QA finding 03](../qa/findings/03-allowed-origins-vs-node.md) |
| Process exit with queued events | `await flush(timeoutMs)` then `await shutdown()` | Tests assert in-flight envelopes land before the promise resolves |

## Real-world wire contract (post-v0.1 QA findings)

The end-to-end QA pass on 2026-06-06 surfaced three contract details that aren't obvious from the OTel spec or the backend README:

1. **`service.name` resource attribute MUST match the project's slug.** The backend's ingest worker silently drops records when this differs and returns `200 {}`. Set `buildNodeSdk({ serviceName: '<slug>' })` (Node) or pass `meta.serviceName` to your browser exporter. See [QA finding 01](../qa/findings/01-service-name-mismatch.md).
2. **The DSN bearer is the parsed `publicKey`** (the 64-hex segment), not the full `nmk_<env>_<hex>` plaintext. Every exporter in `packages/node/src/transport/*-exporter.ts` and `packages/browser/src/transport/*-exporter.ts` extracts and sends `publicKey`. See [QA finding 02](../qa/findings/02-dsn-bearer-shape.md).
3. **DSNs with `allowedOrigins` reject node-side fetches** because Node never sends an `Origin` header. For server-side SDK use, mint the DSN with an empty `allowed_origins` list. See [QA finding 03](../qa/findings/03-allowed-origins-vs-node.md).

End-to-end propagation latency (POST → SPA row visible) measured at ~5 s on the local stack, driven by the SPA's SSE channel + TanStack Query cache invalidation — no manual reload required.

## See also

- [reference/monitor-core.md](monitor-core.md) — pure-logic foundation
- [reference/monitor-node.md](monitor-node.md) · [reference/monitor-browser.md](monitor-browser.md) — runtime SDKs
- [reference/dsn.md](dsn.md) — DSN format + provisioning
- [ADR-0001](../adr/0001-dsn-format.md) — DSN format
- [ADR-0002](../adr/0002-sentry-shaped-api-over-otel.md) — Sentry-shaped API over OTel
- [QA matrices](../qa/README.md) — wire-contract validation
