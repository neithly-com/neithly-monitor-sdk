# QA 04 — `@neithly-com/monitor-cli` releases + sourcemaps

Verify `monitor releases create` and `monitor sourcemaps upload` against the
live backend.

## Pre-condition

- An API token minted via the backend's `/admin/api-tokens` endpoint with
  `releases:write` scope. Seed already creates one called `qa-test-token`;
  recover its plaintext from the seed log, or mint a fresh one:
  ```bash
  # via JWT auth
  curl -X POST http://localhost:3001/admin/api-tokens \
    -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" \
    -d '{"name":"qa-cli","scopes":["releases:write","events:read"]}'
  ```
  The response includes the `token` field (shown ONCE).

## Matrix

| # | Case | Action | Expected | Status |
|---|---|---|---|---|
| 1 | `monitor --help` | `pnpm --filter @neithly-com/monitor-cli exec monitor --help` | exit 0, shows `releases` + `sourcemaps` subcommands | ✅ pinned by `cli.spec.ts` |
| 2 | `releases create` happy | `monitor releases create --project apollo --version qa-1` | prints the release id; status 2xx on the backend | ⏭️ ready to run — requires API token |
| 3 | `releases create` idempotent | re-run the same command | prints the same id (backend treats as upsert on `(project, version)`); 409 surfaced as success | ✅ pinned by `releases-create.spec.ts` |
| 4 | `releases create` git auto-detect | omit `--version` in a clean git working tree | uses `git describe --tags --exact-match`, falls back to short SHA | ✅ pinned by `git.spec.ts` + `releases-create.spec.ts` |
| 5 | `sourcemaps upload` happy | `monitor sourcemaps upload "dist/**/*.map" --project apollo --release qa-1` | counts files, SHA-256s, batch-checks, uploads missing ones | ⏭️ ready to run — requires a built dist |
| 6 | `sourcemaps upload` dedup | re-run with same files | all skipped (already present); progress shows N/N skipped | ✅ pinned by `sourcemaps-upload.spec.ts` |
| 7 | `sourcemaps upload` 401 | wrong/expired token | surfaces `Auth failed` message | ✅ pinned by `sourcemaps-upload.spec.ts` |
| 8 | `sourcemaps upload` 404 release | unknown `--release` | surfaces `Release not found` (suggests `releases create` first) | ✅ pinned by `sourcemaps-upload.spec.ts` |

## Repro

```bash
# Setup
export NEITHLY_AUTH_TOKEN="nmk_live_<token>"
export NEITHLY_API_URL="http://localhost:3001"

# Cut a release for the current git tag
pnpm --filter @neithly-com/monitor-cli exec monitor releases create \
  --project apollo \
  --version "$(git describe --tags --always)"

# Upload bundler sourcemaps to the release
pnpm --filter @neithly-com/monitor-cli exec monitor sourcemaps upload \
  "dist/**/*.{js,map}" \
  --project apollo \
  --release "$(git describe --tags --always)"
```

## Edges to verify

- Invalid glob (`"dist/nope/**"`) → CLI prints "0 files matched" and exits 0.
- Concurrency cap (`--concurrency 2`) — verify via observed throughput.
- `NEITHLY_AUTH_TOKEN` unset → CLI prints config error with the env var name.
