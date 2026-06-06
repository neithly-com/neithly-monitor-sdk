# QA 01 — `@neithly-com/monitor-core` envelope shape

Surface: every pure function in `monitor-core`. No HTTP, no DOM, no Node-only
globals beyond `Buffer`.

Script: [`qa-integration/test-core.mjs`](../../qa-integration/test-core.mjs).
Reproduce with:

```bash
NEITHLY_DSN="nmk_dev_<64hex>" node qa-integration/test-core.mjs
```

## Matrix

| # | Case | Action | Expected | Observed (2026-06-06) |
|---|---|---|---|---|
| 1 | DSN parse — env-prefixed | `parseDsn('nmk_dev_<hex>')` | `{ publicKey: '<hex>', environment: 'dev' }` | ✅ `{ publicKey: '5c159f84…', environment: 'dev' }` |
| 2 | Exception shape — TypeError | `throw new TypeError('demo')` → `shapeException(err)` | `'exception.type' === 'TypeError'`, message preserved, stacktrace begins with the type | ✅ `TypeError: demo error from QA` |
| 3 | Scope flatten | `scope.setUser(...).setTags(...).addBreadcrumb(...) ×2` then `toOtlpLogRecord` | `severityNumber === 9` (info), body intact, 7 OTLP attributes including `user.id` + `neithly.breadcrumbs` | ✅ attrCount=7, hasUser=true, hasBreadcrumbs=true |
| 4 | Body precedence | `message + exception` → record body is the **message** | body matches `message.body`; exception still in attributes | ✅ implicit (`toOtlpLogRecord` contract) |
| 5 | Severity numbers | `level: 'debug'/'info'/'warning'/'error'/'fatal'` | `5/9/13/17/21` | ✅ pinned by core spec |
| 6 | Breadcrumbs cap | push > 100 → ring drops oldest | size stays 100 | ✅ pinned by `breadcrumbs.spec.ts` |
| 7 | Breadcrumb JSON cap | serialise > 16 KB → oldest dropped | output ≤ 16 KB | ✅ pinned by `breadcrumbs.spec.ts` |
| 8 | Cause chain | `Error(outer, { cause: inner })` → stacktrace contains `Caused by: …` | both messages visible | ✅ pinned by `exception.spec.ts` |
| 9 | Cycle safe | self-referential `cause` chain | bounded at depth 8, no `Maximum call stack` | ✅ pinned by `exception.spec.ts` |

## Edges to verify

- `parseDsn('NMK_DEV_…')` (uppercase) → **rejected** with `DsnMalformedError`.
- `parseDsn('  nmk_dev_…  ')` (whitespace) → **accepted** after trim.
- `shapeException(null)` → wraps into a synthetic `Error('null')`; `exception.type === 'Error'`.
- `toOtlpLogRecord` with neither `message` nor `exception` → body is `''`,
  severity defaults to `info` (the SDK caller is expected to set one).
