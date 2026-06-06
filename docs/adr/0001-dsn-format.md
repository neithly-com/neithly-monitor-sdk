# ADR-0001 — DSN format `nmk_<env>_<64 hex>`

- Status: Accepted
- Date: 2026-06-06
- Deciders: neithly-monitor-sdk maintainers
- Consulted: neithly-monitor backend team

## Context and Problem Statement

Application code needs a single credential to authenticate OTLP/HTTP ingest from the SDK to the neithly-monitor backend. The backend already exposes three ingest endpoints — `POST /v1/logs`, `POST /v1/metrics`, `POST /v1/traces` — and accepts `Authorization: Bearer <publicKey>` (or `?api_key=<publicKey>`) where `<publicKey>` is a 64-hex value.

The backend also already issues a management-API token family for the CLI and dashboard automation: `nmk_live_<64 hex>`, `nmk_test_<64 hex>`. Operators are familiar with seeing `nmk_…` tokens in their secret managers, env files, and audit logs.

We need to decide what string app authors paste into `Neithly.init({ dsn })`. Two pressures:

1. **Operator legibility.** A DSN that looks unrelated to the existing `nmk_live_…` token family fragments operators' mental model — they cannot tell at a glance which env a leaked token came from, and rotation playbooks have to branch on token shape.
2. **Backend compatibility.** The backend has already shipped and stabilised on the raw 64-hex public key. We cannot change the wire format on the auth header without a coordinated migration.

## Decision Drivers

- Familiar shape for operators already running neithly-monitor.
- Self-describing — the env (live / staging / dev / test) must be visible without decoding.
- Parser must be unambiguous: no risk of confusing a DSN with a management-API token.
- Zero backend change. The 64-hex value flows verbatim to `Authorization: Bearer`.
- Cheap to validate client-side, fail fast at `init` time.

## Considered Options

1. **Raw 64-hex string.** Paste the public key directly.
2. **URL-shaped DSN à la Sentry.** `https://<publicKey>@ingest.neithly.com/<projectId>`.
3. **Prefixed string `nmk_<env>_<64 hex>`.** Matches the existing token family with an env discriminant.

## Decision Outcome

Chosen option: **3 — `nmk_<env>_<64 hex>`**, with `<env>` from a fixed set (`live`, `staging`, `dev`, `test`) and `<64 hex>` the same value the backend already validates.

`parseDsn` strips the prefix and produces `{ env, publicKey, origin }`. The raw 64-hex bytes flow to `Authorization: Bearer`. The `origin` is resolved from the env (`live` → `https://ingest.neithly.com`, etc.) with an `init({ dsn, origin })` override for self-hosted deployments.

For backward compatibility and developer convenience, `parseDsn` **also** accepts a raw 64-hex string and treats it as `env = 'live'` with a `console.warn` recommending the prefixed form. The CLI's `monitor dsn` command always emits the prefixed form.

### Positive Consequences

- Operators recognise the family. A DSN in a `.env` file is visually grouped with the `nmk_live_…` API token sitting two lines above it.
- Env-tagging makes incident response cheaper: a leaked `nmk_dev_…` is auto-classified as dev-only.
- No backend change. The 64-hex value is what the backend already accepts.
- Fail-fast: `parseDsn` rejects malformed input synchronously inside `Neithly.init`, with `DSN_MALFORMED`. The app crashes at boot rather than silently dropping events for hours.
- Cheap rotation: rotating the public key swaps the 64-hex tail without touching the prefix; secret-scanner regexes can target `nmk_(live|staging|dev|test)_[0-9a-f]{64}` for both DSNs and API tokens.

### Negative Consequences

- Two slightly different families now share the `nmk_` prefix: DSNs use env tags (`nmk_dev_…`), while management-API tokens use `nmk_live_…` / `nmk_test_…`. Operators must learn that `live` is the only string that appears in both. We mitigate by documenting the table in the README and by emitting the env explicitly in CLI output.
- The accepted raw 64-hex fallback means a leaked raw key cannot be reverse-mapped to its env without backend lookup. This is acceptable because the fallback is a migration affordance — tooling we own (CLI, dashboard) always emits prefixed.

### Validation

- `parseDsn` has fuzz tests over malformed inputs and boundary cases (empty, wrong env, short hex, mixed case, leading whitespace).
- `parseDsn(rawHex).env === 'live'` is asserted with the warn-once contract.
- A round-trip test exists from `parseDsn` → exporter `Authorization` header → backend fixture.

## Links

- [Architecture overview](../architecture.md#step-4--exporter) — where the parsed public key meets the OTel exporter.
- [ADR-0002 — Sentry-shaped API over OTel](./0002-sentry-shaped-api-over-otel.md) — the public API that consumes the DSN.
- `plans/01-bootstrap.md` — issues #15 / #16 implement and test `parseDsn`.
