# @neithly-com/monitor-cli

CLI for neithly-monitor. Ships the `monitor` binary with
`monitor releases create` and `monitor sourcemaps upload` — designed
for CI pipelines that cut a release on every deploy.

## What

`monitor-cli` is a small Node.js binary that talks to the
neithly-monitor REST API to: (1) register a release tied to the
project's current git tag or SHA, and (2) upload the sourcemaps
produced by your bundler so the backend can symbolicate stack traces.
Uploads are content-addressed by SHA-256 — the CLI batch-checks which
files the backend already has and only uploads the missing ones, so
repeated runs on the same release are cheap.

Auth lives in `NEITHLY_AUTH_TOKEN`. The optional `NEITHLY_API_URL`
override points the CLI at a non-default backend (self-hosted,
staging, etc.).

## Install

```bash
pnpm add -D @neithly-com/monitor-cli
```

Or run on-demand:

```bash
pnpm dlx @neithly-com/monitor-cli --help
```

## Quickstart

```bash
export NEITHLY_AUTH_TOKEN=...

# Cut a release for the current git tag/SHA.
monitor releases create --project my-web-app

# Upload the bundler's sourcemaps to that release.
monitor sourcemaps upload "dist/**/*.{js,map}" \
  --project my-web-app \
  --release "$(git describe --tags --always)"
```

## API

| Command | Flags | Behaviour |
| --- | --- | --- |
| `monitor releases create` | `--project <slug>` (optional, falls back to config), `--version <v>` (optional, auto-detected from git) | POSTs `/projects/<slug>/releases`. Prints the release id on stdout (also on `409` — already exists). |
| `monitor sourcemaps upload <glob>` | `--release <version>` (required), `--project <slug>` (required), `--concurrency <n>` (default 4) | Globs files, SHA-256s them, batch-checks the backend, uploads the missing ones in parallel. |

Environment variables:

- `NEITHLY_AUTH_TOKEN` — required bearer token.
- `MONITOR_AUTH_TOKEN` — accepted alias.
- `NEITHLY_API_URL` — override the API origin (default `https://api.neithly.com`).

Source: `packages/cli/src/cli.ts` and `packages/cli/src/commands/`.

## GitHub Actions

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
