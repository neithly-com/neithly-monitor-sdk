# Changelog

All notable changes per release at the workspace level. Detailed notes in [`docs/release-notes/`](docs/release-notes/). Per-package changesets live under `packages/*/CHANGELOG.md`.

## v0.1.0 — 2026-06-06

Foundation release of the SDK family. Five packages shipped together.

- feat(core): monitor-core v0.1 — DSN, exception, breadcrumbs, scope, endpoints, OTLP envelope
- feat: monitor-node + monitor-browser + monitor-cli v0.1 (Sentry-shaped public API + framework bindings + releases / sourcemaps CLI)
- feat(react)+docs+examples: monitor-react v0.1 + READMEs + ADRs + examples
- docs: end-to-end QA matrices + 3 wire-contract findings
- chore(repo): bootstrap tooling — eslint + tsup + vitest + changesets + CI
- chore(repo): scaffold pnpm workspace + per-package tsconfig
- chore(lint): ignore qa-integration/ in ESLint
- chore(release): version packages → v0.1.0

See [docs/release-notes/v0.1.0.md](docs/release-notes/v0.1.0.md) for the full release notes, ADRs, known limitations, and acknowledgments.
