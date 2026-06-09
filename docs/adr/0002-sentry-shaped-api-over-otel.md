# ADR-0002 — Sentry-shaped API over OTel

- Status: Accepted
- Date: 2026-06-06
- Deciders: neithly-monitor-sdk maintainers
- Consulted: app authors in the org currently onboarding to neithly-monitor

## Context and Problem Statement

The neithly-monitor backend speaks OTLP/HTTP. The official way to feed it from a Node service is to wire up `@opentelemetry/sdk-node` with a logs exporter, a traces exporter, a metrics exporter, batch processors, resource attributes, and a sampler — roughly 30 lines of code per app, copy-pasted from the backend README.

Two problems with that as the *public* SDK surface:

1. **Adoption friction.** Every team onboarding a service has to internalise the OTel mental model (providers, processors, resources, semconv) before they can capture their first exception. Operators in the org have repeatedly said the OTel API "feels strange" — concepts like `Span`, `attributes`, `severityNumber`, and resource detectors do not map cleanly to the everyday question "did my prod app throw?".
2. **Ergonomic gap with the rest of the ecosystem.** Most app authors have used Sentry before. The shape `captureException(err)`, `addBreadcrumb({ category, message })`, `setUser({ id })`, `setTags({ ... })`, `withScope(fn)` is muscle memory. Re-implementing the same patterns in OTel primitives is busywork and bug-prone.

Meanwhile we still want the **transport** to be standard OTLP — the backend already speaks it, and OTel's exporters / batch processors / retry logic are battle-tested. Throwing them away to ship a bespoke HTTP client would be a regression.

## Decision Drivers

- Time-to-first-event for an app author who has never read the OTel spec.
- Familiar shape — Sentry's API is the de-facto industry idiom for app-side error reporting.
- Reuse OTel's exporters, batch processors, and retry logic. No bespoke HTTP.
- Keep an escape hatch for power users who *do* want raw OTel (custom spans, custom processors, advanced sampling).
- Same shape on Node and browser so application code is portable.

## Considered Options

1. **Raw OTel SDK re-export.** Ship `@neithly-com/monitor-node` as a thin convenience wrapper that pre-configures the OTel SDK with our DSN auth, and tell users to learn the OTel API.
2. **Sentry-shaped wrapper that hides OTel entirely.** Public API is `captureException` / `addBreadcrumb` / `setUser` etc. Under the hood, we synthesise OTLP log records, traces, and metrics from those calls. The OTel SDK is an implementation detail.
3. **Hybrid:** Sentry-shaped public API **plus** a documented `Neithly.getOtelSdk()` escape hatch returning the underlying configured OTel SDK for power users.

## Decision Outcome

Chosen option: **3 — Sentry-shaped public API, with `Neithly.getOtelSdk()` as the escape hatch.**

- The 90% case (`captureException` + breadcrumbs + scope) is a one-liner per concept.
- Power users (custom spans, custom processors, exotic sampling) can call `Neithly.getOtelSdk()` and operate on the underlying `NodeSDK` (or browser equivalent) directly.
- The shape is identical on Node and browser. The only behavioural difference is that Node's `withScope` uses `AsyncLocalStorage` (so concurrent requests do not race) while browser's `withScope` is synchronous (no ALS in browsers; concurrent state is a non-issue for a single-tab JS event loop).
- All OTel concepts that leak into config — `sampler`, `integrations`, `resource` attrs — get Sentry-style names where possible (`sampleRate` over `traceIdRatioBased`, `release` over `service.version`) and a documented mapping table for power users.

### Positive Consequences

- App authors ship their first event in under five minutes. The Node quickstart in the root README is six lines including the `try/catch`.
- The mental model is portable from Sentry experience. `withScope`, `addBreadcrumb`, `setUser`, `setTags` all behave as expected.
- The same code runs in Node and browser. Sharing tests against `toOtlpLogRecord` (in `monitor-core`) keeps the wire shape coherent across runtimes.
- We still ride OTel's HTTP exporter, batch processor, retry, and shutdown machinery — no bespoke transport to maintain.
- The escape hatch keeps the door open for power users without polluting the default surface.

### Negative Consequences

- **Maintenance burden.** We own a public API and have to evolve it carefully — breaking it is an SDK major bump that ripples through every consumer service. We mitigate by mirroring Sentry's shape as closely as semantics allow, so changes track an established prior art.
- **Concept-impedance bugs.** A small set of OTel concepts do not have a direct Sentry analogue (e.g. resource attributes vs. tags vs. contexts). We document the mapping table in [`docs/reference/architecture.md`](../reference/architecture.md) and in the per-package READMEs, and we test edge cases (e.g. `setTags` keys that collide with OTel resource attrs are namespaced as `tags.<key>` on the wire).
- **OTel API drift.** When the OTel SDK changes shape, we may need to adapt our internal wiring without breaking our public surface. The `monitor-core` `toOtlpLogRecord` test fixture pins the wire shape and catches drift early.
- **Dual debugging surface.** When something goes wrong, contributors may need to debug both the Sentry-shaped path and the OTel internals. The architecture doc walks through the full data flow so this stays tractable.

### Validation

- A `toOtlpLogRecord` round-trip test exists against the neithly-monitor backend's parser fixture.
- A `Neithly.getOtelSdk()` smoke test in `monitor-node` confirms the escape hatch exposes a usable SDK.
- Public-API spec tests assert each Sentry-shaped method (`captureException`, `captureMessage`, `addBreadcrumb`, `setUser`, `setTags`, `setContext`, `setExtra`, `withScope`, `flush`, `shutdown`) is callable, has explicit return types, and produces the expected on-wire OTLP shape.

## Links

- [Architecture overview](../reference/architecture.md) — full data flow for `captureException`.
- [ADR-0001 — DSN format](./0001-dsn-format.md) — the credential that the Sentry-shaped `init` accepts.
- `plans/01-bootstrap.md` — issues #36–#42 (Node) and #69–#71 (Browser) implement the Sentry-shaped public API on top of the OTel transport.
