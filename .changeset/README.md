# Changesets

Hi! This directory is owned by [changesets](https://github.com/changesets/changesets).

## Adding a changeset

```bash
pnpm changeset
```

Pick which packages bump, the bump level, and write a short summary. The
changeset file is committed alongside your PR. On the next release, the
generated PR consumes all pending changesets, bumps versions, and writes
CHANGELOG entries.

## Releasing

CI (`.github/workflows/publish.yml`) runs on push to `main` and:
1. Opens a PR that consumes pending changesets (or updates one).
2. When merged, publishes the bumped packages to GitHub Packages.
