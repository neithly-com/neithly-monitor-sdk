# DSN

> The credential application code pastes into `Neithly.init({ dsn })`. Identifies the project + environment, authenticates against the neithly-monitor ingest endpoints.
> **Status:** stable
> **Source:** `packages/core/src/dsn.ts`
> **Updated:** 2026-06-08

## Quick reference

| What | How |
|---|---|
| Format | `nmk_<env>_<64-char lowercase hex>` |
| `<env>` values | `live`, `staging`, `dev`, `test` |
| Used as | `Authorization: Bearer <full DSN plaintext>` (NOT just the hex segment) |
| Parser | `parseDsn(input)` from `@neithly-com/monitor-core` |
| Failure | Throws `DsnMalformedError` (code `DSN_MALFORMED`) synchronously in `init` |

## Grammar

```
DSN  ::= 'nmk_' ENV '_' KEY
ENV  ::= 'live' | 'staging' | 'dev' | 'test'
KEY  ::= [0-9a-f]{64}
```

Whitespace is trimmed but not allowed inside the body. Uppercase prefix or hex is rejected. A bare 64-hex value is **also** accepted as a legacy fallback (treated as `env = 'live'` with a one-shot `console.warn`); new tooling always emits the prefixed form.

## Parsed shape

```ts
type ParsedDsn = {
  input: string;           // full plaintext — use this as the bearer
  publicKey: string;       // 64-hex segment — display/env-tagging only
  environment: 'live' | 'staging' | 'dev' | 'test' | null;
  origin: string;          // ingest origin resolved from env (or override)
};
```

| Field | Use for |
|---|---|
| `input` | `Authorization: Bearer ${input}` — the wire credential |
| `publicKey` | Display in dashboards, tag the env in logs. **Never** send it as bearer alone. |
| `environment` | Default env tag when `init` doesn't set one |
| `origin` | Base URL for `resolveEndpoints` |

> **Footgun:** the parsed `publicKey` is **not** the wire bearer. The backend SHA-256s whatever bearer it receives and matches against the stored hash — which was hashed from the full plaintext `nmk_<env>_<hex>`. See [Finding 02](../qa/findings/02-dsn-bearer-shape.md).

## Origin resolution

| `<env>` | Resolved origin (default) |
|---|---|
| `live` | `https://ingest.neithly.com` |
| `staging` | `https://ingest.staging.neithly.com` |
| `dev` | `http://localhost:3001` |
| `test` | `http://localhost:3001` |

Override per-app via `init({ dsn, origin: 'https://my-self-host.example.com' })` (e.g. self-hosted deployments).

## Provisioning

DSNs are minted by the neithly-monitor backend, either via the admin SPA or directly via SQL on the dev stack:

```bash
docker exec neithly-monitor-postgres-1 psql -U neithly -d neithly_monitor_dev \
  -c "INSERT INTO project_dsns (id, project_id, key_hash, label, allowed_origins, created_at)
      SELECT 'dsn_' || md5(random()::text)::text,
             '<project_id>',
             encode(sha256('nmk_dev_<paste 64 random hex>'::bytea), 'hex'),
             'qa-integration',
             ARRAY[]::text[],          -- empty for server DSNs (Node has no Origin header)
             NOW();"
```

The plaintext is what application code uses. The backend only ever stores the SHA-256 — plaintext is unrecoverable once the INSERT lands.

### `allowedOrigins` rules

| Runtime | Pin to | Why |
|---|---|---|
| Browser | The SPA's origin (e.g. `https://app.example.com`) | Browsers always send `Origin`; the pin is a useful guardrail |
| Node / server | Empty list `[]` | Node never sends `Origin`; a non-empty pin returns `403 ORIGIN_REJECTED` |

See [Finding 03](../qa/findings/03-allowed-origins-vs-node.md) for the failure mode + workaround.

## Errors

| Code | When |
|---|---|
| `DSN_MALFORMED` | `parseDsn` rejects the input (empty, wrong env, short/long hex, uppercase) |
| `DSN_MISSING` | Backend `/v1/logs` received no `Authorization` header — 401 |
| `DSN_INVALID` | Backend SHA-256 mismatch (or DSN revoked) — 401 |
| `ORIGIN_REJECTED` | Backend `OriginCheckMiddleware` rejected — 403 (see Finding 03) |

## See also

- [reference/monitor-core.md](monitor-core.md) — `parseDsn` API
- [reference/architecture.md](architecture.md) — exporter wiring
- [guides/operating.md](../guides/operating.md) — DSN provisioning end-to-end
- [ADR-0001](../adr/0001-dsn-format.md) — rationale for the format
- [Finding 02](../qa/findings/02-dsn-bearer-shape.md) · [Finding 03](../qa/findings/03-allowed-origins-vs-node.md)
