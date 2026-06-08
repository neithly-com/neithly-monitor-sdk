# Finding 03 — `allowedOrigins` forbids node-side use of the SDK

> Operational footgun: a DSN minted via the SPA's "Create DSN" flow has `allowedOrigins` pre-filled with the SPA host, which then rejects every Node-side fetch with `403`. Mint server DSNs with empty `allowed_origins`.
> **Status:** known issue (UX split + SDK warn planned for v0.1.1)
> **Severity:** P2
> **Discovered:** 2026-06-06 during QA 02 integration pass
> **Updated:** 2026-06-08

## What

A DSN can be created with a non-empty `allowed_origins` list. The backend's
`OriginCheckMiddleware` then rejects any request that arrives without an
`Origin` HTTP header — which includes every server-side Node fetch (Node
doesn't send `Origin` for outbound requests).

From `neithly-monitor/src/ingestion/origin-check.middleware.ts`: an empty
allowedOrigins skips the check; non-empty enforces "Origin header REQUIRED".

The error is at least clear:
```
403 ORIGIN_REJECTED — This DSN pins an allowedOrigins list but the request
has no Origin header.
```

## Why it bit us

The admin SPA's "Create DSN" flow pre-fills `allowedOrigins` with the SPA
host. Operators creating a DSN for a server-side Node app from the SPA end
up with a DSN that's pinned to the SPA's origin — and the Node app gets 403
on every event.

## Fix in v0.1.1

- **Backend**: split `allowedOrigins` UI into two flows: "Browser DSN" (pin
  required) and "Server DSN" (pin forbidden). Default to "Server DSN" since
  it's the bigger blast radius if mispinned.
- **SDK (Node)**: warn on init when the DSN has non-empty `allowedOrigins`
  (we'd need an admin endpoint that returns DSN metadata — not currently
  exposed). For v0.1, document loudly in `packages/node/README.md`.
- **SDK (Browser)**: forge the `Origin` header is impossible from `fetch`
  (the browser always sets it). The `sendBeacon` fallback may not — verify
  in v0.1.1 QA.

## QA repro

Minted DSN with `allowedOrigins=['http://localhost:5174']`:

```
$ curl -X POST http://localhost:3001/v1/logs \
       -H "Authorization: Bearer nmk_dev_<hex>" -d '{}'
{"statusCode":403,"code":"ORIGIN_REJECTED","message":"This DSN pins an
allowedOrigins list but the request has no Origin header.", ...}
```

Same DSN with `allowedOrigins = ARRAY[]::text[]`:

```
$ curl -X POST http://localhost:3001/v1/logs \
       -H "Authorization: Bearer nmk_dev_<hex>" -d '{}'
{}
```

## See also

- [reference/dsn.md](../../reference/dsn.md#allowedorigins-rules) — Browser vs Server DSN rules
- [reference/monitor-node.md](../../reference/monitor-node.md) · [reference/monitor-browser.md](../../reference/monitor-browser.md)
- [QA 02](../02-node-wire-contract.md) — case #3 demonstrates the 403
- [guides/operating.md](../../guides/operating.md#step-1--mint-a-dsn) — minting rules
