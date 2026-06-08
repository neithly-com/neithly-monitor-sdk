# ADR index

> Architecture Decision Records — MADR format.

| # | Title | Status | Date |
|---|-------|--------|------|
| [0001](0001-dsn-format.md) | DSN format `nmk_<env>_<64 hex>` | Accepted | 2026-06-06 |
| [0002](0002-sentry-shaped-api-over-otel.md) | Sentry-shaped API over OTel | Accepted | 2026-06-06 |

## Statuses

- **Proposed** — under discussion
- **Accepted** — decision in effect
- **Superseded by ADR-MMMM** — replaced, see successor
- **Deprecated** — no longer applies, no successor

## Authoring a new ADR

Copy [0001-dsn-format.md](0001-dsn-format.md) as a starting template. Increment the 4-digit prefix. Cross-link the new ADR from:

- [`docs/reference/architecture.md`](../reference/architecture.md)
- The reference doc for the affected scope
- The PR description

See [`guides/contributing.md`](../guides/contributing.md#architectural-decisions) for the full process.
