# Finding 01 — Backend silently drops records when `service.name !== project.slug`

**Severity:** P1 — silent data loss with no operator-visible signal.
**Discovered:** 2026-06-06 during QA 02 integration pass.

## What

The backend's ingestion worker checks that the OTel resource attribute
`service.name` matches the project's slug before persisting any record.
A mismatch increments an internal `SERVICE_NAME_MISMATCH` counter and the
record is silently dropped.

From `neithly-monitor/src/ingestion/ingestion-worker.ts:109`:

```ts
const serviceName = readString(resourceAttributes, 'service.name');
if (!serviceName || serviceName !== project.slug) {
  this.droppedCounts[DROP_REASONS.SERVICE_NAME_MISMATCH] += 1;
  return;
}
```

The HTTP layer still returns `200 {}` — the SDK has no signal that the
record was dropped. The only trace is in the backend's pino logs, and only
at periodic-flush time (the counter is emitted, not the individual drop).

## Why it bit us

The QA test set `service.name = 'qa-integration'` (the SDK's identifier).
Against project `apollo`, every POST returned 200 yet zero records landed.
Took ~5 iterations + reading the worker source to find the silent path.

## Recommended fix (backend)

Surface the mismatch in the OTLP `partialSuccess` response:

```ts
return {
  partialSuccess: {
    rejectedLogRecords: rejected,
    errorMessage: rejected > 0
      ? `Some records dropped: service.name must match project slug`
      : '',
  },
};
```

Or relax the check entirely — `service.name` is OTel semconv for "the
logical service emitting telemetry", not "the project identifier". A DSN
already identifies the project unambiguously. The current pairing makes
multi-service apps painful (each app must call `Neithly.init({ serviceName:
'<project-slug>' })` rather than its own service name).

## Workaround (SDK)

Until the backend changes, the SDK must:

1. Default `serviceName` to the project slug derived from the DSN's bound
   project. This requires a lookup we don't have client-side; an alternative
   is to pass `projectSlug` through `init({ ... })` and use it as the
   resource attribute.
2. Or document loudly that `init({ serviceName })` MUST equal the project
   slug.

For v0.1 we ship option (2) — `docs/api/init.md` + the per-package READMEs
both call this out. v0.1.1 will add automatic resolution via a `/me/project`
endpoint once the backend ships it.
