# Operating runbook

> DSN provisioning, env vars, release cuts, troubleshooting silent drops. For operators running an app that ships errors through the SDK.
> **Status:** stable
> **Updated:** 2026-06-09

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

| DSN type | `allowedOrigins` | Used by |
|---|---|---|
| Server | Empty list | Node services, server-side handlers |
| Browser | Pinned to SPA host | Browser SPAs |

The plaintext is shown **once** — copy it into your secret manager (Doppler, 1Password, AWS Secrets Manager, …).

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
| `GIT_SHA` | Short commit SHA | Used as `release` in `init()` and `buildNodeSdk()` |
| `NODE_ENV` | `production` / `staging` / `development` | Used as `environment` |

Inline the `serviceName` argument to `buildNodeSdk({ serviceName: '<slug>' })` in code — env-var drift between deploys is the most common cause of the silent-drop footgun ([Finding 01](../qa/findings/01-service-name-mismatch.md)).

### Browser

| Var | Value | Notes |
|---|---|---|
| `VITE_NEITHLY_DSN` | `nmk_<env>_<64 hex>` | DSN minted with `allowedOrigins` pinned to SPA host |
| `VITE_GIT_SHA` | Short commit SHA | Used as `release` in `init()` |

When building your own exporter chain (`createBrowserLogExporter`), pass `meta.serviceName` matching the project slug.

### CI (release pipeline)

| Var | Value | Notes |
|---|---|---|
| `NEITHLY_AUTH_TOKEN` | `nmk_live_<64 hex>` | Management token. NOT a DSN. |
| `MONITOR_AUTH_TOKEN` | Same | Accepted alias |
| `NEITHLY_API_URL` | Backend origin override | Default `https://api.neithly.com` |
| `NEITHLY_API_TOKEN` | Same as `NEITHLY_AUTH_TOKEN` | Read by `loadConfig()` (cosmiconfig flow) |
| `NEITHLY_PROJECT_SLUG` | Default project slug | Read by `loadConfig()` |

## Step 3 — Release cuts + sourcemap uploads

> **v0.1 status:** the `monitor` binary ships placeholder subcommands (`monitor releases` and `monitor sourcemaps` both print `not implemented yet`). The production-shaped `registerReleasesCreateCommand` and `registerSourceMapsUploadCommand` exist in `packages/cli/src/commands/` and can be wired into a custom binary today. When the default tree is filled in, the expected commands are:

```bash
export NEITHLY_AUTH_TOKEN=nmk_live_...
monitor releases create  --project apollo --version $(git describe --tags --always)
monitor sourcemaps upload "dist/**/*.{js,map}" --project apollo --release $(git describe --tags --always)
```

| Command | Idempotency |
|---|---|
| `releases create` | Idempotent on `(project, version)` — backend returns `409` with the existing id, the CLI prints it as success |
| `sourcemaps upload` | Content-addressed by SHA-256 — already-uploaded files are skipped automatically |

For now, drive the implementations programmatically:

```ts
import { Command } from 'commander';
import {
  loadConfig,
  createMonitorClient,
  registerReleasesCreateCommand,
  registerSourceMapsUploadCommand,
} from '@neithly-com/monitor-cli'; // deep-import via dist paths until index.ts re-exports them
```

See [reference/monitor-cli.md](../reference/monitor-cli.md) for the full signatures.

## Step 4 — Triage

| Symptom | Likely cause | Action |
|---|---|---|
| POST returns `200 {}` but no Issue appears in SPA | `service.name` doesn't match project slug → backend drops silently | Check `buildNodeSdk({ serviceName })` / browser exporter `meta.serviceName` matches the slug visible in the admin SPA. See [Finding 01](../qa/findings/01-service-name-mismatch.md). |
| `401 DSN_INVALID` after rotation | App restarted with stale DSN cached | Verify the deployed env var, restart the service |
| `401 DSN_INVALID` on a fresh service | Bearer is not the parsed `publicKey` (the 64-hex segment of the DSN) | Use `parseDsn(dsn).publicKey` as the bearer. The bundled exporters already do this. See [Finding 02](../qa/findings/02-dsn-bearer-shape.md). |
| `403 ORIGIN_REJECTED` on Node service | DSN minted with non-empty `allowedOrigins` | Mint a Server DSN (empty `allowed_origins`). See [Finding 03](../qa/findings/03-allowed-origins-vs-node.md). |
| `413 PAYLOAD_TOO_LARGE` | Event payload too big (typically chatty breadcrumbs) | Trim breadcrumbs or contexts; `serialiseBreadcrumbs` caps at 16 KiB by default — check for a runaway log line |
| Backend returns `partialSuccess` with `rejectedLogRecords > 0` | Batch hit ingest rate limit | Reduce capture frequency or increase backend limit |
| Sourcemap upload `Release not found` | `--release` does not exist on the project | Run the equivalent of `releases create` first |
| Sourcemap upload `Auth failed` | `NEITHLY_AUTH_TOKEN` missing or wrong scope | Verify the token has `releases:write` |

## Rotating a leaked DSN

1. Revoke in the admin SPA (or `UPDATE project_dsns SET revoked_at = NOW() WHERE label = '<label>'`). Existing in-flight POSTs start returning `401 DSN_INVALID` immediately.
2. Mint a fresh DSN (same `label`, new plaintext).
3. Update the secret manager + redeploy.
4. Verify the new DSN by triggering a smoke event.

Because the env tag is encoded in the DSN prefix (`nmk_dev_…` / `nmk_staging_…` / `nmk_live_…`), a leaked `nmk_dev_…` is naturally classified as dev-only — no need to rotate prod credentials.

## See also

- [reference/dsn.md](../reference/dsn.md) — DSN grammar + provisioning
- [reference/monitor-cli.md](../reference/monitor-cli.md) — release + sourcemap commands
- [guides/consumer-integration.md](consumer-integration.md) — initial SDK wiring
- [QA matrices](../qa/README.md) — what good looks like end-to-end
- [QA findings 01-03](../qa/findings/) — the three v0.1 footguns
