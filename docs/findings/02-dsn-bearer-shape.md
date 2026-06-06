# Finding 02 — DSN bearer is the FULL plaintext, not the parsed `publicKey`

**Severity:** P2 — documentation gap that confuses SDK authors.
**Discovered:** 2026-06-06 during QA 02 integration pass.

## What

`parseDsn('nmk_dev_<64hex>')` returns `{ publicKey: '<64hex>', environment: 'dev' }`.
A naive SDK author sees this and sends `Authorization: Bearer <64hex>`.

The backend rejects with `401 DSN_INVALID` because it SHA-256s whatever bearer
it receives and compares against the stored hash — which was hashed from the
**full plaintext** `nmk_dev_<64hex>`, not just the hex segment.

From `neithly-monitor/src/ingestion/dsn-auth.middleware.ts:84`:

```ts
const match = /^Bearer\s+(\S+)/i.exec(header);
if (match && match[1]) return match[1];  // ← whole bearer, including the `nmk_dev_` prefix
```

Then:

```ts
const keyHash = sha256Hex(plaintext);
```

## Why the naming misleads

`publicKey` reads like the "actual bearer value" — but the backend's hash
ate the prefix. The parsed `publicKey` is for display / env-tagging only,
not for sending.

## Fix in v0.1.1

Rename `ParsedDsn.publicKey` → `ParsedDsn.keyHex` and add a
`ParsedDsn.bearer` field that's the full plaintext `input`. Bump core to
0.2.0. Update every SDK runtime to send `Authorization: Bearer ${parsed.bearer}`.

Until then, the runtime SDKs work around this by holding the full DSN
string in module state and using it as the bearer (see
`packages/node/src/api/state.ts:DsnState` and the browser equivalent).
The SDK-facing public API is unchanged.

## QA repro

```bash
# WRONG — 401
curl -X POST http://localhost:3001/v1/logs \
  -H "Authorization: Bearer <64hex>" -H "Content-Type: application/json" -d '{}'
# → 401 DSN_INVALID

# RIGHT — 200 (envelope may still be empty)
curl -X POST http://localhost:3001/v1/logs \
  -H "Authorization: Bearer nmk_dev_<64hex>" -H "Content-Type: application/json" -d '{}'
# → 200 {}
```
