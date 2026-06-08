# monitor-cli

> CLI for neithly-monitor. Ships the `monitor` binary with `releases create` and `sourcemaps upload` — designed for CI pipelines that cut a release on every deploy.
> **Status:** stable
> **Package:** `@neithly-com/monitor-cli`
> **Source:** `packages/cli/src/`
> **Updated:** 2026-06-08

`monitor-cli` is a Node.js binary that talks to the neithly-monitor management REST API. It registers a release for the project (tied to the current git tag or SHA) and uploads bundler sourcemaps so the backend can symbolicate stack traces. Uploads are content-addressed by SHA-256 — the CLI batch-checks which files the backend already has and only uploads the missing ones, so repeated runs on the same release are cheap.

Auth is via `NEITHLY_AUTH_TOKEN` (a `nmk_live_<64 hex>` management token, **not** a DSN). The optional `NEITHLY_API_URL` override points the CLI at a non-default backend.

## Quick reference

| Command | Purpose |
|---|---|
| `monitor --help` | List commands and global flags |
| `monitor releases create --project <slug>` | Register a release; idempotent on `(project, version)` |
| `monitor sourcemaps upload <glob> --project <slug> --release <v>` | Glob → SHA-256 → batch-check → upload missing |

## Install

```bash
pnpm add -D @neithly-com/monitor-cli
# or on-demand
pnpm dlx @neithly-com/monitor-cli --help
```

## Quickstart

```bash
export NEITHLY_AUTH_TOKEN=nmk_live_...
export NEITHLY_API_URL=https://api.neithly.com   # optional

# Cut a release for the current git tag/SHA
monitor releases create --project apollo

# Upload bundler sourcemaps
monitor sourcemaps upload "dist/**/*.{js,map}" \
  --project apollo \
  --release "$(git describe --tags --always)"
```

## Commands

### `monitor releases create`

POSTs `/projects/<slug>/releases`.

| Flag | Required | Default | Behaviour |
|---|---|---|---|
| `--project <slug>` | yes (or config) | — | Project slug on the backend |
| `--version <v>` | no | `git describe --tags --exact-match` fallback to short SHA | Free-form version string |

Prints the release id on stdout. A `409 already exists` is treated as success and prints the existing id.

### `monitor sourcemaps upload <glob>`

Globs files locally, SHA-256s them, batch-checks the backend, uploads the missing ones in parallel.

| Flag | Required | Default | Behaviour |
|---|---|---|---|
| `--project <slug>` | yes | — | Project slug |
| `--release <v>` | yes | — | Must already exist (`releases create` first) |
| `--concurrency <n>` | no | `4` | Parallel upload workers |

Errors surfaced:

| Symptom | Cause |
|---|---|
| `Auth failed` | `NEITHLY_AUTH_TOKEN` missing or invalid (401) |
| `Release not found` | `--release` does not exist on the project (404) — run `releases create` first |
| `0 files matched` | Glob matched nothing — exits 0 |

## Environment variables

| Var | Purpose |
|---|---|
| `NEITHLY_AUTH_TOKEN` | Required bearer (`nmk_live_<64 hex>` management token) |
| `MONITOR_AUTH_TOKEN` | Accepted alias |
| `NEITHLY_API_URL` | Override the API origin (default `https://api.neithly.com`) |

## GitHub Actions example

```yaml
name: release
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Create release
        env:
          NEITHLY_AUTH_TOKEN: ${{ secrets.NEITHLY_AUTH_TOKEN }}
        run: |
          pnpm exec monitor releases create \
            --project ${{ vars.NEITHLY_PROJECT }} \
            --version ${{ github.ref_name }}

      - name: Upload sourcemaps
        env:
          NEITHLY_AUTH_TOKEN: ${{ secrets.NEITHLY_AUTH_TOKEN }}
        run: |
          pnpm exec monitor sourcemaps upload "dist/**/*.{js,map}" \
            --project ${{ vars.NEITHLY_PROJECT }} \
            --release ${{ github.ref_name }}
```

## See also

- [reference/monitor-core.md](monitor-core.md) — shared core (DSN parser used by `monitor login`-style UX)
- [guides/operating.md](../guides/operating.md) — DSN provisioning, env vars
- [QA 04](../qa/04-cli-releases-sourcemaps.md) — CLI matrix
