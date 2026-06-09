# Contributing

> Develop the SDK locally — pnpm workspace conventions, workspace boundaries, ADR + release process.
> **Status:** stable
> **Updated:** 2026-06-09

## Who this is for

Contributors landing changes in `neithly-monitor-sdk`. Read [reference/architecture.md](../reference/architecture.md) first if you're new — it covers package boundaries and the `captureException` data flow.

## What you'll do

1. Bootstrap the workspace
2. Make changes following the workspace rules
3. Add a changeset for any user-visible change
4. Open a PR through `dev → staging → main`

## Step 1 — Bootstrap

Requires Node >= 18 and pnpm >= 9.

```bash
git clone https://github.com/neithly-com/neithly-monitor-sdk.git
cd neithly-monitor-sdk
pnpm install
pnpm -r build           # tsup → dual ESM + CJS + .d.ts per package
pnpm test               # vitest, workspace mode
pnpm typecheck          # tsc --noEmit across packages
pnpm lint               # ESLint flat config (TS-aware)
pnpm format             # Prettier
```

Run a single package:

```bash
pnpm --filter @neithly-com/monitor-core test
pnpm --filter @neithly-com/monitor-node typecheck
```

## Step 2 — Workspace rules

| Rule | Why |
|---|---|
| Strict TS, no `any` without an inline `// reason: …` comment | Bugs hide behind `any`; the comment forces a defensible reason |
| Explicit return types on all exported functions | `.d.ts` shapes are the public API — don't leave them implicit |
| Tests next to source as `<name>.spec.ts` / `<name>.spec.tsx` | Locality > directory walls; vitest picks them up automatically |
| `monitor-core` is the only package allowed to be imported by every other | See [reference/architecture.md](../reference/architecture.md#package-boundaries) |
| `monitor-react` may import `monitor-browser`; nothing else cross-imports | Runtime packages stay independent |
| Use `pnpm add <name> --filter <workspace>` for deps — no direct `package.json` edits | Lockfile + workspace protocols stay in sync |
| All serialisation logic lives in `monitor-core` | One place owns the wire shape; tests round-trip against the backend's parser fixture |

## Step 3 — Add a changeset

Every user-visible change needs a changeset. Internal refactors with no API surface can skip.

```bash
pnpm changeset                    # interactive: pick affected packages + bump type
# This writes .changeset/<adjective>-<animal>-<adverb>.md
git add .changeset/
git commit
```

Bump types:

| Type | When |
|---|---|
| `patch` | Bug fix, doc-only, internal-only changes that don't affect the public API |
| `minor` | New API, new integration, new framework binding |
| `major` | Breaking change (signature changed, behavior changed, export removed) — coordinate with maintainers first |

## Step 4 — PR flow

Branch off `dev`, push, open a PR against `dev`. CI runs lint + typecheck + tests on every package. Once green and reviewed, squash-merge into `dev`.

Promotion `dev → staging → main` is human-approved (org rulesets). Don't open promotion PRs without coordinating — staging is the soak environment for the changeset queue, and `main` cuts the release tag.

### Architectural decisions

Anything that changes a contract, a package boundary, a wire shape, or introduces a new dependency goes in a new ADR under `docs/adr/NNNN-<title>.md`. Follow the MADR template — [ADR-0001](../adr/0001-dsn-format.md) is a worked example. Cross-link the ADR from:

- `docs/reference/architecture.md`
- The reference doc for the affected scope
- The PR description

### Release flow

Per-package semver + CHANGELOGs are managed by [changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset             # describe your change → creates a .changeset/*.md
pnpm changeset:version     # bump versions + write per-package CHANGELOG.md
pnpm changeset:publish     # build then publish to GitHub Packages
```

On `main`, the publish step runs in CI on a tag push. The matching release notes live in `docs/release-notes/vX.Y.Z.md` (write before tagging — they're immutable once released).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `pnpm install` fails with `ERR_PNPM_FETCH_401` | `NODE_AUTH_TOKEN` not set | `export NODE_AUTH_TOKEN=$(gh auth token)` |
| `pnpm -r build` complains about missing types from `monitor-core` | Order: built `monitor-core` before its dependents? | `pnpm -r build` does topological order; rebuild from scratch (`rm -rf packages/*/dist`) |
| Test in `monitor-node` can't find `@opentelemetry/sdk-node` | Peer dep not installed in the test runner | `pnpm install --shamefully-hoist` is NOT the answer; verify the dep is in the package's own `package.json` |
| Vitest snapshot drift on `toOtlpLogRecord` | Wire shape changed | Update the snapshot AND open an ADR — this is a backend-contract change |

## See also

- [reference/architecture.md](../reference/architecture.md) — package boundaries + data flow
- [reference/monitor-core.md](../reference/monitor-core.md) — pure-logic foundation
- [ADR index](../adr/README.md)
- [Release notes index](../release-notes/README.md)
