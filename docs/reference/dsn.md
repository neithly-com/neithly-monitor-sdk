# DSN

> The credential application code pastes into `init({ dsn })`. Identifies the project + environment and authenticates against the neithly-monitor OTLP ingest endpoints.
> **Status:** stable
> **Source:** `packages/core/src/dsn.ts`
> **Updated:** 2026-06-09

## Quick reference

| What | How |
|---|---|
| Format | `nmk_<env>_<64-char lowercase hex>` (legacy bare 64-hex is also accepted) |
| `<env>` values | `live`, `staging`, `dev` |
| Parser | `parseDsn(input)` from `@neithly-com/monitor-core` |
| Wire bearer | The parsed **`publicKey`** (the 64-hex segment), sent as `Authorization: Bearer <publicKey>` |
| Failure | Throws `DsnMalformedError` (`code = 'DSN_MALFORMED'`) synchronously |

## Grammar

```
DSN  ::= 'nmk_' ENV '_' KEY  |  KEY
ENV  ::= 'live' | 'staging' | 'dev'
KEY  ::= [0-9a-f]{64}
```

| Rule | Detail |
|---|---|
| Whitespace | Trimmed surrounding whitespace; embedded whitespace rejected |
| Casing | Uppercase prefix or hex is rejected (lowercase hex only) |
| Bare 64-hex | Accepted as a legacy fallback — parses to `{ publicKey, environment: null }` |
| Unknown env | Anything other than `live` / `staging` / `dev` is rejected |
| Length | Hex segment must be exactly 64 characters |

## Parsed shape

```ts
export type DsnEnvironment = 'live' | 'staging' | 'dev';

export interface ParsedDsn {
  publicKey: string;
  environment: DsnEnvironment | null;
}
```

| Field | Use for |
|---|---|
| `publicKey` | `Authorization: Bearer ${publicKey}` on every OTLP POST |
| `environment` | Default `deployment.environment` resource attribute when `init` does not pass one explicitly; `null` for legacy bare-hex DSNs |

## Bearer token shape

The runtime SDKs (`monitor-node` / `monitor-browser`) extract `publicKey` from the parsed DSN and use **only that segment** as the bearer:

```
Authorization: Bearer <64-char hex>
```

This is verified in `packages/node/src/transport/log-exporter.ts`, `trace-exporter.ts`, `metric-exporter.ts`, and the matching browser exporters under `packages/browser/src/transport/`.

## Default ingest origins

`parseDsn` itself does not resolve an origin — that is the runtime SDK's job:

| Runtime | Default ingest origin | Override |
|---|---|---|
| `monitor-node` (via `buildNodeSdk`) | Caller supplies `endpoint` explicitly | `buildNodeSdk({ endpoint })` |
| `monitor-browser` | `https://ingest.neithly.com` | `init({ tunnel: '<your-origin>' })` |

In both cases, the resolved origin is fed through `resolveEndpoints(origin)` from `@neithly-com/monitor-core` to produce `<origin>/v1/logs`, `<origin>/v1/traces`, `<origin>/v1/metrics`.

## Provisioning

DSNs are minted by the neithly-monitor backend (admin SPA or SQL on the dev stack). The backend stores a SHA-256 of the plaintext; the plaintext is unrecoverable once written.

```bash
docker exec neithly-monitor-postgres-1 psql -U neithly -d neithly_monitor_dev \
  -c "INSERT INTO project_dsns (id, project_id, key_hash, label, allowed_origins, created_at)
      SELECT 'dsn_' || md5(random()::text)::text,
             '<project_id>',
             encode(sha256('nmk_dev_<paste 64 random hex>'::bytea), 'hex'),
             'qa-integration',
             ARRAY[]::text[],
             NOW();"
```

The plaintext is what application code passes to `init({ dsn })`.

### `allowedOrigins` rules

| Runtime | Pin to | Why |
|---|---|---|
| Browser | The SPA's origin (e.g. `https://app.example.com`) | Browsers always send `Origin`; the pin is a useful guardrail |
| Node / server | Empty list `[]` | Node never sends `Origin`; a non-empty pin returns `403 ORIGIN_REJECTED` |

See [QA finding 03](../qa/findings/03-allowed-origins-vs-node.md) for the failure mode + workaround.

## Errors

| Code | Class / status | When |
|---|---|---|
| `DSN_MALFORMED` | `DsnMalformedError` (synchronous throw) | `parseDsn` rejects the input (non-string, empty after trim, unknown env tag, wrong hex length, uppercase, non-hex characters) |
| `DSN_MISSING` | Backend 401 | OTLP POST arrived without an `Authorization` header |
| `DSN_INVALID` | Backend 401 | Backend SHA-256 of the bearer did not match any stored hash (DSN revoked or wrong) |
| `ORIGIN_REJECTED` | Backend 403 | Backend `OriginCheckMiddleware` rejected the request — typically a Node POST against a DSN that has `allowedOrigins` set |

## Example

```ts
import { parseDsn, DsnMalformedError } from '@neithly-com/monitor-core';

try {
  const dsn = parseDsn(process.env.NEITHLY_DSN ?? '');
  console.log(dsn.publicKey, dsn.environment); // → 'aaaa…aaaa', 'dev'
} catch (err) {
  if (err instanceof DsnMalformedError) {
    console.error('Bad DSN at boot — refusing to start:', err.input);
    process.exit(1);
  }
  throw err;
}
```

## See also

- [reference/monitor-core.md](monitor-core.md) — `parseDsn` API + the rest of the shaping helpers
- [reference/architecture.md](architecture.md) — where the bearer attaches in the exporter chain
- [guides/operating.md](../guides/operating.md) — DSN provisioning end-to-end
- [ADR-0001](../adr/0001-dsn-format.md) — rationale for the `nmk_<env>_<hex>` format
- [QA finding 02](../qa/findings/02-dsn-bearer-shape.md) · [QA finding 03](../qa/findings/03-allowed-origins-vs-node.md)
