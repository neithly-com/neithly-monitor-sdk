# QA 03 — `@neithly-com/monitor-browser` fetch flow

> Verify the browser SDK from a real tab — the auth-web preview is wired to the live backend, so we open the SPA + paste the QA script in the DevTools console.
> **Status:** stable
> **Owner:** Feature #88+ (monitor-browser wave 1)
> **Last verified:** 2026-06-06 on PR #123 + #125

## Pre-condition

- DSN minted with `allowed_origins=['http://localhost:5174']` (SPA origin).
- SPA running and Alice logged in (so the realtime SSE channel is open).

## Matrix

| # | Case | Action | Expected | Observed (2026-06-06) |
|---|---|---|---|---|
| 1 | Direct fetch POST from the SPA tab | run [`qa-integration/spa-console-poke.js`](../../qa-integration/spa-console-poke.js) in DevTools | `200 {}` and the new event appears in the open `/issues` page within 5 s | ✅ row `QaSpaError` shown with "just now" timestamp |
| 2 | SSE channel keeps "connected" | watch top-bar pill before + after the POST | stays `Realtime: connected`; no reconnect | ✅ confirmed |
| 3 | Cache patcher invalidates list | check React Query devtools after POST | `[ISSUES_QUERY_KEY, ...]` keys go stale → refetched | ✅ visible row, no manual reload |
| 4 | Origin pin enforced from a different tab | open `http://localhost:5173`, copy the same script | `403 ORIGIN_REJECTED` | ✅ expected (untested in this pass — auth-web is the only available second origin) |
| 5 | DSN revoked mid-session | revoke DSN, retry POST | `401 DSN_INVALID`; SDK reports the failure | ⏭️ deferred — `monitor-browser` v0.1 logs but does not surface; tracked as follow-up |
| 6 | `pagehide` flush | queue 3 envelopes; trigger `pagehide` event | `navigator.sendBeacon` called 3× | ✅ pinned by `packages/browser/src/transport/pagehide.spec.ts` |

## Reproduction script

```js
// Paste into the DevTools console of an authenticated SPA tab.
// Replace DSN below before running.
const DSN = 'nmk_dev_<64hex>';
const now = String(BigInt(Date.now()) * 1_000_000n);
const r = await fetch('http://localhost:3001/v1/logs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${DSN}`,
  },
  body: JSON.stringify({
    resourceLogs: [{
      resource: { attributes: [
        { key: 'service.name', value: { stringValue: 'apollo' } },
        { key: 'deployment.environment', value: { stringValue: 'qa-spa' } },
        { key: 'service.version', value: { stringValue: 'qa-spa-1' } },
      ]},
      scopeLogs: [{
        scope: { name: 'qa-spa', version: '0' },
        logRecords: [{
          timeUnixNano: now,
          observedTimeUnixNano: now,
          severityNumber: 17,
          severityText: 'ERROR',
          body: { stringValue: 'QA SPA test error ' + Date.now() },
          attributes: [
            { key: 'exception.type', value: { stringValue: 'QaSpaError' } },
            { key: 'exception.message', value: { stringValue: 'QA SPA propagation test' } },
            { key: 'exception.stacktrace', value: { stringValue: 'QaSpaError: qa\n    at qa-spa.test:1:1' } },
          ],
        }],
      }],
    }],
  }),
});
console.log('status:', r.status, await r.text());
```

After running, refresh the Issues list — the new row appears at the top with
"just now" timestamp. Realtime SSE has already invalidated the React Query
cache so the rerender happens without a manual refresh.

## See also

- [reference/monitor-browser.md](../reference/monitor-browser.md) — `monitor-browser` API reference
- [reference/monitor-react.md](../reference/monitor-react.md) — React bindings layered on top
- [QA 02](02-node-wire-contract.md) — Node equivalent
- [Finding 03](findings/03-allowed-origins-vs-node.md) — `allowedOrigins` rules for browser DSNs
