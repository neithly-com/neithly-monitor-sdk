# QA 02 — `@neithly-com/monitor-node` wire contract

End-to-end: SDK builds an OTLP envelope → POST `http://localhost:3001/v1/logs` →
worker drains → Issue lands in DB → SPA picks it up via SSE.

Script: [`qa-integration/test-node-direct.mjs`](../../qa-integration/test-node-direct.mjs).

## Pre-condition

A DSN minted on the project with **`allowed_origins = []`** (empty array — no
origin pin so Node fetches don't need to forge an `Origin` header):

```sql
UPDATE project_dsns SET allowed_origins = ARRAY[]::text[] WHERE label = 'qa-integration';
```

If the SDK is meant for browser, repin to the SPA origin instead.

## Matrix

| # | Case | Action | Expected | Observed (2026-06-06) |
|---|---|---|---|---|
| 1 | DSN auth — full plaintext | `Authorization: Bearer nmk_dev_<hex>` | `200 {}` | ✅ accepted |
| 2 | DSN auth — only the public key | `Authorization: Bearer <hex>` (64 chars) | `401 DSN_INVALID` (mismatch with stored SHA-256) | ✅ rejected — see finding #2 |
| 3 | Origin pin enforced | DSN with `allowed_origins=['http://localhost:5174']`, fetch from Node (no Origin header) | `403 ORIGIN_REJECTED` | ✅ rejected — see finding #3 |
| 4 | Worker drop on `service.name` mismatch | `service.name='qa-integration'` against project slug `apollo` | `200` returned, **0 records persisted** (silent drop with `SERVICE_NAME_MISMATCH`) | ✅ confirmed — see finding #1 |
| 5 | Worker accepts on `service.name` match | `service.name='apollo'` against project `apollo` | `200`, 1 record persisted, 1 Issue upserted | ✅ `count=1`, fingerprint `cb9ec627205aeb47` |
| 6 | Issue creation | First `RangeError` from `apollo` project | new Issue row (`isNew=true` path) | ✅ Issue id `cmq2qtq1i000bn82c9re11yqf` |
| 7 | Issue increment | Repost identical envelope | same Issue, `count += 1`, `lastSeen` bumped | ✅ pinned by ingestion-worker.spec.ts |
| 8 | SPA propagation | After (5), open SPA `/projects/<id>/issues` | new row appears at top with "just now" timestamp | ✅ `QaSpaError` row visible, SSE drove the refetch — no manual reload |
| 9 | Realtime SSE channel | SPA badge while POSTing | `Realtime: connected` throughout | ✅ confirmed live |
| 10 | Wrong DSN env | DSN minted with `environment=staging`, POST against the prod backend | accepted (the env tag isn't validated server-side — it's metadata) | ✅ no enforcement; documented as opt-in convention |

## Edges to verify

- POST with `Content-Length` > `EVENT_PAYLOAD_MAX_BYTES` (default 1 MiB) → `413 PAYLOAD_TOO_LARGE`.
- POST with > `INGEST_RATE_LIMIT_DEFAULT_PER_MIN` records in one batch — earliest accepted, rest counted as `rejected` in the `partialSuccess` response.
- POST with no `Authorization` header → `401 DSN_MISSING`.
- Revoke the DSN (`UPDATE project_dsns SET revoked_at = NOW()`) → subsequent POSTs return `401 DSN_INVALID`.

## Repro: send + verify in one shell

```bash
# 1. Send
NEITHLY_DSN="nmk_dev_<hex>" node qa-integration/test-node-direct.mjs

# 2. Verify in DB
docker exec neithly-monitor-postgres-1 psql -U neithly -d neithly_monitor_dev \
  -c "SELECT COUNT(*), MAX(received_at) FROM log_records
      WHERE project_id='<project_id>' AND received_at > NOW() - INTERVAL '1 minute';"

# 3. Verify in SPA
curl -s "http://localhost:3001/projects/<project_id>/issues" \
     -H "Authorization: Bearer $JWT" | jq '.items[0]'
```
