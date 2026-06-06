# SDK QA matrices

Every matrix here is a black-box integration test: the SDK boots in one
process, posts to a running `neithly-monitor` backend on `:3001`, and we
verify the event reaches the database AND surfaces in the operator SPA
(`neithly-monitor-web` on `:5174`).

These are run before tagging a release. CI does not run them — they need
the full stack (Postgres + Redis + auth + monitor + SPA) to be live, which
the GitHub Actions matrix doesn't carry.

## Pre-conditions

| Service | Port | How to start |
|---|---|---|
| Postgres + Redis | 5435 / 6385 | `cd neithly-monitor && pnpm db:up` |
| `neithly-auth` backend | 3000 | `cd neithly-auth && pnpm start:dev` |
| `neithly-auth-web` | 5173 | `cd neithly-auth-web && pnpm dev` |
| `neithly-monitor` backend | 3001 | `cd neithly-monitor && pnpm start:dev` |
| `neithly-monitor-web` | 5174 | `cd neithly-monitor-web && pnpm dev` |
| Seeded login | — | `alice@neithly.dev` / `devalicepass1234` |
| Seeded projects | — | Apollo Web (slug `apollo`), Beacon API (`beacon`), Comet Mobile (`comet`) |

## Mint a fresh DSN

Direct DB insert (saves a click through the admin SPA):

```bash
docker exec neithly-monitor-postgres-1 psql -U neithly -d neithly_monitor_dev \
  -c "INSERT INTO project_dsns (id, project_id, key_hash, label, allowed_origins, created_at)
      SELECT 'dsn_qa_' || md5(random()::text)::text,
             '<project_id>',
             encode(sha256('nmk_dev_<paste 64 random hex>'::bytea), 'hex'),
             'qa-integration',
             ARRAY[]::text[],
             NOW();"
```

Note the **plaintext** before hashing — that's what your SDK uses as the
DSN. The backend only ever sees its SHA-256.

## Matrices

- [01-core-shape.md](./01-core-shape.md) — monitor-core: DSN parsing, exception
  shaping, breadcrumb ring, scope, OTLP envelope. No HTTP.
- [02-node-wire-contract.md](./02-node-wire-contract.md) — POST raw OTLP/HTTP
  envelopes to `/v1/logs`. Verifies the wire contract (DSN auth, origin pin,
  worker drain, Issue creation, fingerprinting, SPA propagation).
- [03-browser-fetch-flow.md](./03-browser-fetch-flow.md) — load
  `@neithly-com/monitor-browser` in a real browser tab, init, capture, verify
  the SPA picks it up (driven via the running auth-web preview).
- [04-cli-releases-sourcemaps.md](./04-cli-releases-sourcemaps.md) — run the
  `monitor releases create` + `monitor sourcemaps upload` commands against
  the backend.

## Findings index

Real bugs / footguns discovered during QA, with the file:line that pins the
behaviour in the backend.

1. **Backend silently drops records when `service.name !== project.slug`**.
   See [`docs/findings/01-service-name-mismatch.md`](../findings/01-service-name-mismatch.md).
2. **DSN bearer is the FULL `nmk_<env>_<hex>` plaintext, NOT the parsed
   publicKey** (the 64-hex segment). See
   [`docs/findings/02-dsn-bearer-shape.md`](../findings/02-dsn-bearer-shape.md).
3. **`allowedOrigins` on a DSN forbids requests with no `Origin` header** —
   so server-side Node use of the SDK fails 403 when the DSN was created via
   the SPA (which pins the SPA origin). See
   [`docs/findings/03-allowed-origins-vs-node.md`](../findings/03-allowed-origins-vs-node.md).

These three should land as ADR-0003 / API tweaks / SDK warnings in v0.1.1.
