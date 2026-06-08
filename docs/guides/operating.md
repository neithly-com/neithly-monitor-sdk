# Operating runbook

> DSN provisioning, env vars, release cuts, troubleshooting silent drops. For operators running an app that ships errors through the SDK.
> **Status:** stable
> **Updated:** 2026-06-08

## Who this is for

The on-call / operator for an app already wired with the SDK. You triage events landing in neithly-monitor, mint DSNs, rotate them when leaked, and own the env vars deployed to staging and production.

## What you'll do

1. Mint DSNs per environment + service
2. Configure runtime env vars (server-side vs browser-side)
3. Cut a release on every deploy + upload sourcemaps
4. Triage common failure modes

## Step 1 — Mint a DSN

DSNs are minted by the neithly-monitor backend. Two paths:

### Admin SPA (preferred for prod)

Open the project → Settings → DSNs → "Create DSN". Choose:

- **Server DSN** (Node/server-side use) — `allowedOrigins` must be empty
- **Browser DSN** — `allowedOrigins` pinned to the SPA host

The plaintext is shown **once** — copy it into your secret manager (Doppler, 1Password, AWS Secrets Manager, ...).

### Direct SQL (dev / QA fast path)

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

Note the **plaintext** before hashing — that's the DSN your SDK uses. The backend only ever stores the SHA-256.

## Step 2 — Configure runtime env vars

### Server-side (Node)

| Var | Value | Notes |
|---|---|---|
| `NEITHLY_DSN` | `nmk_<env>_<64 hex>` | DSN minted with empty `allowedOrigins` |
| `GIT_SHA` | Short commit SHA | Used as `release` |
| `NODE_ENV` | `production` / `staging` / `development` | Used as `environment` |

### Browser

| Var | Value | Notes |
|---|---|---|
| `VITE_NEITHLY_DSN` | `nmk_<env>_<64 hex>` | DSN minted with `allowedOrigins` pinned to SPA host |
| `VITE_GIT_SHA` | Short commit SHA | Used as `release` |

Inline `serviceName` in code so it travels with the source (avoid mismatch from env-var drift).

### CI (release pipeline)

| Var | Value | Notes |
|---|---|---|
| `NEITHLY_AUTH_TOKEN` | `nmk_live_<64 hex>` | Management token with `releases:write` scope. NOT a DSN. |
| `NEITHLY_API_URL` | Backend origin override | Default `https://api.neithly.com` |

## Step 3 — Release cuts + sourcemap uploads

On every deploy:

```bash
export NEITHLY_AUTH_TOKEN=nmk_live_...
monitor releases create  --project apollo --version $(git describe --tags --always)
monitor sourcemaps upload "dist/**/*.{js,map}" --project apollo --release $(git describe --tags --always)
```

`releases create` is idempotent on `(project, version)` — repeated runs print the existing id (no-op). `sourcemaps upload` is content-addressed by SHA-256 — already-uploaded files are skipped automatically.

A full GitHub Actions workflow lives in [reference/monitor-cli.md](../reference/monitor-cli.md#github-actions-example).

## Step 4 — Triage

| Symptom | Likely cause | Action |
|---|---|---|
| POST returns `200 {}` but no Issue appears in SPA | `service.name` doesn't match project slug → backend drops silently | Check `init({ serviceName })` matches the slug visible in the admin SPA. See [Finding 01](../qa/findings/01-service-name-mismatch.md). |
| `401 DSN_INVALID` after rotation | App restarted with stale DSN cached | Verify the deployed env var, restart the service |
| `401 DSN_INVALID` from a fresh service | Sending parsed `publicKey` instead of full plaintext as bearer | Upgrade SDK to ≥ 0.1.0. See [Finding 02](../qa/findings/02-dsn-bearer-shape.md). |
| `403 ORIGIN_REJECTED` on Node service | DSN minted with non-empty `allowedOrigins` | Mint a Server DSN (empty `allowed_origins`). See [Finding 03](../qa/findings/03-allowed-origins-vs-node.md). |
| `413 PAYLOAD_TOO_LARGE` | Event payload > 1 MiB | Trim breadcrumbs or contexts; check for a runaway log line |
| Backend returns `partialSuccess` with `rejectedLogRecords > 0` | Batch hit `INGEST_RATE_LIMIT_DEFAULT_PER_MIN` | Reduce capture frequency or increase backend limit |
| Sourcemap upload `Release not found` | `--release` doesn't exist on the project | Run `monitor releases create` first |
| Sourcemap upload `Auth failed` | `NEITHLY_AUTH_TOKEN` missing or wrong scope | Verify the token has `releases:write` |

## Rotating a leaked DSN

1. Revoke in the admin SPA (or `UPDATE project_dsns SET revoked_at = NOW() WHERE label = '<label>'`). Existing in-flight POSTs start returning `401 DSN_INVALID` immediately.
2. Mint a fresh DSN (same `label`, new plaintext).
3. Update the secret manager + redeploy.
4. Verify the new DSN by triggering a smoke event.

Because the env tag is in the DSN prefix, a leaked `nmk_dev_…` is auto-classified as dev-only — no need to rotate prod credentials.

## See also

- [reference/dsn.md](../reference/dsn.md) — DSN grammar + provisioning
- [reference/monitor-cli.md](../reference/monitor-cli.md) — release + sourcemap commands
- [guides/consumer-integration.md](consumer-integration.md) — initial SDK wiring
- [QA matrices](../qa/) — what good looks like end-to-end
- [QA findings](../qa/findings/) — the three v0.1 footguns
