"""
Structured plan data for neithly-monitor-sdk v0.1.

Each task has a `body` field with rich Markdown (Goal, Context, Acceptance
criteria, Technical approach, Test plan, Docs impact, Parent). Bodies use
`{parent}` as a placeholder for the parent Epic/Feature reference — the
runner substitutes the real issue number once the parent is created.

Priority / Effort / Impact for every issue follow these heuristics:
- Epics:    P0 / L  / high (this is the v0.1 commitment)
- Features: P0 / M  / medium-high
- Tasks:    P1 / S-M / low-medium  (XS for trivial chores; L only when wiring touches multiple packages)
"""


def body_epic(goal, context, success_criteria, features):
    return f"""## Goal
{goal}

## Context
{context}

## Success criteria
{chr(10).join(f'- {s}' for s in success_criteria)}

## Features
{chr(10).join(f'- [ ] {f}' for f in features)}
"""


def body_feature(goal, context, acceptance, tasks):
    return f"""## Goal
{goal}

## Context
{context}

## Acceptance criteria
{chr(10).join(f'- [ ] {a}' for a in acceptance)}

## Tasks
{chr(10).join(f'- [ ] {t}' for t in tasks)}

## Parent
{{parent}}
"""


def body_task(goal, context, acceptance, approach, test_plan, docs="none", deps=None):
    deps_str = f"  ·  Depends on: {deps}" if deps else ""
    return f"""## Goal
{goal}

## Context
{context}

## Acceptance criteria
{chr(10).join(f'- [ ] {a}' for a in acceptance)}

## Technical approach
{approach}

## Test plan
{test_plan}

## Docs impact
{docs}

## Parent
{{parent}}{deps_str}
"""


PLAN = [
    # =====================================================================
    # EPIC 1 — Monorepo bootstrap
    # =====================================================================
    {
        "title": "Epic: Monorepo bootstrap",
        "priority": "P0", "effort": "L", "impact": "high",
        "body": body_epic(
            goal="Stand up the pnpm workspace, dual-build pipeline, vitest, and CI publishing so every other Epic has a working host repo.",
            context="The SDK ships as 5 npm packages (core / node / browser / react / cli). Without a workspace they'd be 5 repos with 5 CI pipelines and duplicate tooling. pnpm workspaces + a single CI matrix solves this cleanly. Versioning via changesets keeps the per-package CHANGELOG honest.",
            success_criteria=[
                "`pnpm install && pnpm -r build` succeeds from a clean clone",
                "`pnpm -r test` runs all packages' vitest suites in one command",
                "Pushing a tag to `main` publishes the changed packages to GitHub Packages",
                "PR CI runs lint + typecheck + test on Node 18 / 20 / 22",
            ],
            features=[
                "Feature: Workspace + TypeScript baseline",
                "Feature: Build + test pipeline",
                "Feature: CI / publishing",
            ],
        ),
        "features": [
            {
                "title": "Feature: Workspace + TypeScript baseline",
                "priority": "P0", "effort": "M", "impact": "high",
                "body": body_feature(
                    goal="Get pnpm workspaces, shared tsconfig, ESLint flat config, and prettier wired so every package inherits one consistent toolchain.",
                    context="Without a shared baseline each package would re-roll its tsconfig + lint config + prettier — that drift bit the neithly-ui workspace badly. Lock the baseline first.",
                    acceptance=[
                        "Adding a new package needs only a package.json + tsconfig.json (3 lines extending the shared one)",
                        "`pnpm lint` runs across the workspace in one pass",
                        "All packages report a clean `tsc --noEmit`",
                    ],
                    tasks=[
                        "`chore(repo): scaffold pnpm workspace + per-package tsconfig`",
                        "`chore(repo): ESLint flat config + prettier shared across packages`",
                        "`chore(repo): root README + per-package README stubs`",
                    ],
                ),
                "tasks": [
                    {
                        "title": "chore(repo): scaffold pnpm workspace + per-package tsconfig",
                        "priority": "P0", "effort": "M", "impact": "high",
                        "body": body_task(
                            goal="Create the pnpm workspace skeleton with 5 empty packages and a shared tsconfig.base.json.",
                            context="The workspace is the foundation everything else builds on. We hard-pin pnpm via packageManager so contributors get the right version. Strict TS + exactOptionalPropertyTypes from day 0 — retrofitting strictness later is painful.",
                            acceptance=[
                                "`pnpm-workspace.yaml` lists `packages/*`",
                                "Root `package.json` pins `packageManager: pnpm@9.x`",
                                "`tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`",
                                "Each package has `packages/<name>/package.json` + `tsconfig.json` extending base",
                                "`pnpm install` succeeds from a clean clone",
                            ],
                            approach="""- `pnpm-workspace.yaml` → `packages: - 'packages/*'`
- Root `package.json` — `private: true`, scripts forward to `pnpm -r`
- `tsconfig.base.json` at repo root — strict + module: esnext + target: es2022
- `packages/<name>/{package.json,tsconfig.json,src/index.ts}` skeletons for: core, node, browser, react, cli""",
                            test_plan="Run `pnpm install` then `pnpm -r exec tsc --noEmit` — must complete without errors on a clean clone.",
                            docs="Root `README.md` mentions pnpm version requirement.",
                        ),
                    },
                    {
                        "title": "chore(repo): ESLint flat config + prettier shared across packages",
                        "priority": "P0", "effort": "S", "impact": "medium",
                        "body": body_task(
                            goal="Lock down ESLint flat config + prettier so every package gets the same rules and formatting.",
                            context="Drift across per-package configs is the #1 source of style noise in PRs. One root config, every package picks it up.",
                            acceptance=[
                                "`eslint.config.mjs` at the root covers every `packages/*/src/**/*.ts`",
                                "`prettier` config matches the neithly-monitor convention (single quotes, trailing commas, 100-char width)",
                                "`pnpm lint` exits 0 on a clean workspace",
                                "`pnpm format` rewrites files in place",
                            ],
                            approach="""- ESLint v9 flat config with `typescript-eslint`, `eslint-plugin-import`, `eslint-plugin-unused-imports`
- `.prettierrc.json` mirrored from `neithly-monitor`
- Lint rules: no-unused-vars (error), no-explicit-any (warn — SDK has some unavoidable `any`s at the OTel boundary), consistent-type-imports
- Scripts: `lint`, `lint:fix`, `format`, `format:check`""",
                            test_plan="`pnpm lint` on the bootstrap commit — should pass even with empty src.",
                            docs="Root README adds the lint/format script docs.",
                            deps="previous task in feature",
                        ),
                    },
                    {
                        "title": "chore(repo): root README + per-package README stubs",
                        "priority": "P1", "effort": "XS", "impact": "low",
                        "body": body_task(
                            goal="Ship a root README that explains the workspace + per-package README stubs that the full docs Epic will fill in later.",
                            context="A repo without a root README looks abandoned. The stubs anchor each package's docs and let the build pipeline ship something coherent from v0.1 day one.",
                            acceptance=[
                                "Root README explains: what the SDK is, the 5 packages, install matrix, quickstart link",
                                "Each `packages/<name>/README.md` exists with a 1-paragraph 'what is this package' intro + a `Status: under development` note",
                            ],
                            approach="""- Root README mirrors `neithly-monitor`'s README style (purpose, stack, quickstart, project layout)
- Per-package stubs reference the parent docs Epic that will fill them in""",
                            test_plan="Manual: open each README and check that a new contributor would know which package to install for their use case.",
                            docs="The 6 READMEs themselves.",
                            deps="previous task in feature",
                        ),
                    },
                ],
            },
            {
                "title": "Feature: Build + test pipeline",
                "priority": "P0", "effort": "M", "impact": "high",
                "body": body_feature(
                    goal="Set up tsup (dual ESM+CJS+.d.ts), vitest workspace mode, and changesets so the repo can build, test, and version every package consistently.",
                    context="Dual-format publishing is non-negotiable — Node consumers still use CJS, browser bundlers (Vite, esbuild) prefer ESM. tsup handles both from one config. Changesets are the industry-standard pattern for monorepo versioning.",
                    acceptance=[
                        "`pnpm -r build` produces `dist/index.cjs`, `dist/index.mjs`, `dist/index.d.ts` per package",
                        "`pnpm test` runs vitest in workspace mode (all packages)",
                        "`pnpm changeset` starts the interactive version-bump flow",
                    ],
                    tasks=[
                        "`chore(build): tsup dual ESM/CJS + .d.ts per package`",
                        "`chore(test): vitest workspace + shared setup`",
                        "`chore(release): changesets config + CHANGELOG generation`",
                    ],
                ),
                "tasks": [
                    {
                        "title": "chore(build): tsup dual ESM/CJS + .d.ts per package",
                        "priority": "P0", "effort": "M", "impact": "high",
                        "body": body_task(
                            goal="Configure tsup at the root with a per-package override so every package emits CJS + ESM + .d.ts.",
                            context="Every package gets the same build invariant: one entry point, dual format, type declarations. Edge cases (browser package can't bundle node:fs, cli needs a shebang) are handled per-package.",
                            acceptance=[
                                "Each `packages/<name>/tsup.config.ts` extends a shared root config",
                                "`pnpm -r build` produces dist files matching the package.json `exports` field",
                                "`exports` declares `import`, `require`, and `types` triplets",
                                "Tree-shaking works: importing `Neithly.captureException` from monitor-node pulls in only the necessary subset",
                            ],
                            approach="""- Root `tsup.config.base.ts` exports a function returning a `defineConfig` with shared defaults (format: ['esm', 'cjs'], dts: true, sourcemap: true, clean: true, target: 'es2022')
- Per-package tsup config overrides target ('node18' for node, 'es2020' for browser) + adds package-specific banners (cli gets `#!/usr/bin/env node`)
- `package.json` `exports` field with import/require/types
- `files: ['dist']` so only built output ships to npm""",
                            test_plan="`pnpm -r build` then check each dist/ folder against the contract.",
                            docs="Per-package README mentions the install + import shapes.",
                        ),
                    },
                    {
                        "title": "chore(test): vitest workspace + shared setup",
                        "priority": "P0", "effort": "S", "impact": "high",
                        "body": body_task(
                            goal="Wire vitest in workspace mode so a single `pnpm test` runs every package's tests.",
                            context="Vitest 1.0+ workspace mode is the canonical way to test pnpm monorepos. One shared setup file (mock OTLP collector, common assertions) is reused across packages.",
                            acceptance=[
                                "`vitest.workspace.ts` at the root lists every package",
                                "`pnpm test` runs every suite in parallel",
                                "Browser package uses jsdom environment; others use node",
                                "Shared test utils live in `packages/_internal-test-utils/` (workspace-only, not published)",
                            ],
                            approach="""- `vitest.workspace.ts` — array of package globs
- Per-package `vitest.config.ts` overrides environment when needed
- `_internal-test-utils` package exposes: `MockOtlpCollector` (records POSTs to /v1/logs etc.), `expectOtlpLogRecord` matcher
- `package.json` script: `test`, `test:watch`, `test:coverage`""",
                            test_plan="Add a smoke test per package that imports the package's entry and asserts a non-undefined export.",
                            docs="Root README adds the test script section.",
                            deps="tsup build setup",
                        ),
                    },
                    {
                        "title": "chore(release): changesets config + CHANGELOG generation",
                        "priority": "P0", "effort": "S", "impact": "medium",
                        "body": body_task(
                            goal="Wire `@changesets/cli` so PR authors mark version bumps and tags publish to GitHub Packages.",
                            context="Changesets is the de-facto standard for pnpm monorepo versioning. The PR author runs `pnpm changeset`, picks affected packages + bump level, and that becomes the next CHANGELOG entry.",
                            acceptance=[
                                "`.changeset/config.json` is configured for the workspace",
                                "`pnpm changeset` opens the interactive version-bump flow",
                                "`pnpm changeset:version` consumes pending changesets + bumps package versions + writes CHANGELOG.md per package",
                                "Internal-only packages (`_internal-test-utils`) are ignored",
                            ],
                            approach="""- `.changeset/config.json` — baseBranch: 'main', updateInternalDependencies: 'patch'
- Custom `changelog` plugin that prepends a `## Unreleased` section
- Root `.changeset/README.md` explains the workflow""",
                            test_plan="Manual: run `pnpm changeset` → pick a fake bump → `pnpm changeset:version` → verify CHANGELOG entries written.",
                            docs="`CONTRIBUTING.md` explains how to add a changeset to a PR.",
                            deps="vitest setup",
                        ),
                    },
                ],
            },
            {
                "title": "Feature: CI / publishing",
                "priority": "P0", "effort": "M", "impact": "high",
                "body": body_feature(
                    goal="GitHub Actions matrix runs lint + typecheck + test on every PR; tag pushes to main publish the workspace to GitHub Packages.",
                    context="No CI = no safety net. The matrix covers Node 18 (LTS), 20 (LTS), and 22 (current) so platform bugs surface early. Publishing on tag (not on every main push) keeps the npm registry tidy.",
                    acceptance=[
                        "PRs trigger `.github/workflows/ci.yml` — lint + typecheck + test pass on all Node versions",
                        "Tag push `v*.*.*` triggers `.github/workflows/publish.yml` — uses changesets release action",
                        "Publishing uses the existing GitHub Packages registry (mirrors neithly-ui pattern)",
                    ],
                    tasks=[
                        "`ci(repo): GitHub Actions — lint + typecheck + test matrix on PR`",
                        "`ci(repo): GitHub Actions — publish to GitHub Packages on tag`",
                    ],
                ),
                "tasks": [
                    {
                        "title": "ci(repo): GitHub Actions — lint + typecheck + test matrix on PR",
                        "priority": "P0", "effort": "S", "impact": "high",
                        "body": body_task(
                            goal="Run lint + typecheck + test on Node 18/20/22 on every PR.",
                            context="Matches the neithly-monitor CI shape so contributors get a familiar PR experience.",
                            acceptance=[
                                "Workflow triggers on pull_request + push to dev/staging/main",
                                "Matrix: Node {18, 20, 22} × OS {ubuntu-latest}",
                                "Steps: pnpm install (cached) → lint → typecheck → test → build",
                                "Build artefact: dist tarballs uploaded so review can sniff them",
                            ],
                            approach="""- `.github/workflows/ci.yml` — uses pnpm/action-setup, actions/setup-node with cache: 'pnpm'
- Matrix strategy with `fail-fast: false`
- `pnpm install --frozen-lockfile` (fails CI if lockfile is out of date)
- Concurrency group cancels in-progress on new commits""",
                            test_plan="Open a draft PR with a deliberate lint/typecheck/test break and confirm CI surfaces each.",
                            docs="`CONTRIBUTING.md` references the CI matrix.",
                        ),
                    },
                    {
                        "title": "ci(repo): GitHub Actions — publish to GitHub Packages on tag",
                        "priority": "P0", "effort": "M", "impact": "high",
                        "body": body_task(
                            goal="Tag push `v*` triggers changesets publish — every package whose version bumped lands on GitHub Packages.",
                            context="GitHub Packages is the same registry the rest of the org uses. The changesets/action handles the publish + CHANGELOG commit + tag dance.",
                            acceptance=[
                                "Workflow triggers on push tags `v*`",
                                "Uses `changesets/action` for orchestration",
                                "GITHUB_TOKEN scoped to `packages: write`",
                                "Smoke test: a fake bump of monitor-core publishes successfully",
                                "Failure visibility: any publish error surfaces as a PR comment on the release PR",
                            ],
                            approach="""- `.github/workflows/publish.yml` — `permissions: contents: write, packages: write, id-token: write` (for provenance)
- Uses `changesets/action@v1` with `publish: pnpm changeset:publish`
- `npmrc` configured for `@neithly-com:registry=https://npm.pkg.github.com`
- All packages declare `publishConfig.registry`""",
                            test_plan="Cut a tag against a feature branch first to validate the workflow without polluting the real registry.",
                            docs="`docs/RELEASE.md` explains the cut → tag → publish dance.",
                            deps="changesets setup",
                        ),
                    },
                ],
            },
        ],
    },
    # =====================================================================
    # EPIC 2 — monitor-core
    # =====================================================================
    {
        "title": "Epic: monitor-core — shared transport + types",
        "priority": "P0", "effort": "L", "impact": "high",
        "body": body_epic(
            goal="Ship a workspace-only `@neithly-com/monitor-core` package with the DSN parser, exception shaper, breadcrumb ring, and OTLP envelope helpers shared between node + browser.",
            context="monitor-node and monitor-browser would otherwise duplicate ~1k LoC of DSN parsing, exception serialisation, scope/breadcrumb state, and OTLP record shaping. Promoting them to a shared internal package is the cleanest split.",
            success_criteria=[
                "Both monitor-node and monitor-browser depend on monitor-core via workspace protocol",
                "monitor-core has zero runtime deps (only types from @opentelemetry/api)",
                "100% of public API has TSDoc + a vitest spec",
                "An OTLP log record produced by `toOtlpLogRecord({ exception })` is accepted unchanged by the neithly-monitor backend's parser",
            ],
            features=[
                "Feature: DSN parsing",
                "Feature: Exception shaper",
                "Feature: Breadcrumb ring + scope",
                "Feature: Wire envelopes",
            ],
        ),
        "features": [
            {
                "title": "Feature: DSN parsing",
                "priority": "P0", "effort": "S", "impact": "high",
                "body": body_feature(
                    goal="`parseDsn(input)` accepts both the `nmk_<env>_<hex>` format and a raw 32-hex key and returns `{ publicKey, endpoint, environment }`.",
                    context="The DSN format mirrors the API token family (`nmk_live_…`) so operators recognise it. The parser strips the prefix and exposes the raw key + the derived endpoint for the OTel exporters.",
                    acceptance=[
                        "`parseDsn('nmk_live_<64hex>')` returns `{ publicKey: '<64hex>', environment: 'live' }`",
                        "Raw 32-hex bytes are accepted as a fallback for backward compat",
                        "Malformed input throws `DsnMalformedError` with a descriptive message",
                        "The endpoint is derived from a separate `endpoint` option (defaulting to https://monitor.neithly.com)",
                    ],
                    tasks=[
                        "`feat(core): parseDsn — accepts nmk_<env>_<hex> + raw 32-hex; rejects malformed`",
                        "`test(core): parseDsn — fuzz over malformed inputs + boundary cases`",
                    ],
                ),
                "tasks": [
                    {
                        "title": "feat(core): parseDsn — accepts nmk_<env>_<hex> + raw 32-hex; rejects malformed with code DSN_MALFORMED",
                        "priority": "P0", "effort": "S", "impact": "high",
                        "body": body_task(
                            goal="Implement the DSN parser + the DsnMalformedError class.",
                            context="The two accepted shapes are documented in the SDK README + ADR-0001. Any other shape must fail loudly so operators don't ship a typo into production.",
                            acceptance=[
                                "Exports `parseDsn(input: string): ParsedDsn`",
                                "ParsedDsn type: `{ publicKey: string; environment: 'live'|'staging'|'dev'|null }`",
                                "Accepts `nmk_<env>_<64 hex>` (env in {live, staging, dev}) → returns env",
                                "Accepts 32-hex (64 char) raw → returns env = null",
                                "Throws `DsnMalformedError` with `{ code: 'DSN_MALFORMED', message, input }` otherwise",
                                "Trim whitespace + reject leading/trailing junk",
                            ],
                            approach="""- File: `packages/core/src/dsn.ts`
- Regex: `^nmk_(live|staging|dev)_([0-9a-f]{64})$` then fallback `^([0-9a-f]{64})$`
- DsnMalformedError extends Error with a `code` field for downstream tooling
- TSDoc on parseDsn explains both accepted shapes with examples""",
                            test_plan="Vitest spec covering: valid live+staging+dev DSN, raw hex, leading/trailing whitespace, mixed case (reject), too-short, too-long, non-hex chars, empty string, undefined.",
                            docs="`packages/core/README.md` mentions DSN format and links the parser type.",
                        ),
                    },
                    {
                        "title": "test(core): parseDsn — fuzz over malformed inputs + boundary cases",
                        "priority": "P1", "effort": "XS", "impact": "low",
                        "body": body_task(
                            goal="Property-test the parser against a generator of valid + invalid DSN candidates.",
                            context="A typo in a DSN parser can silently accept the wrong production key. Fuzz tests catch regressions a typed regex change might miss.",
                            acceptance=[
                                "100 generated valid DSNs all parse",
                                "100 generated malformed DSNs all throw DsnMalformedError",
                                "Boundary cases: 63 vs 64 vs 65 hex chars",
                                "Unicode + control chars in the env segment are rejected",
                            ],
                            approach="""- Use `fast-check` for the fuzz generator
- Valid generator: pick env from set, generate 64 random hex via fc.hexa
- Malformed generators: prefix swap, hex length swap, case swap, garbage""",
                            test_plan="`pnpm --filter @neithly-com/monitor-core test` — fast-check shrinks on failures.",
                            docs="none",
                            deps="parseDsn implementation",
                        ),
                    },
                ],
            },
            {
                "title": "Feature: Exception shaper",
                "priority": "P0", "effort": "M", "impact": "high",
                "body": body_feature(
                    goal="`shapeException(err)` turns a JS `Error` (or thrown non-Error) into the OTel semconv `{ exception.type, exception.message, exception.stacktrace }` attribute bag the backend's parser expects.",
                    context="The backend's fingerprinter (src/ingestion/fingerprinting.ts) keys Issues on (exception.type, top stack frame). If the SDK emits the wrong attribute keys or escapes the stacktrace funny, every event lands as its own Issue. The shaper is the contract.",
                    acceptance=[
                        "Plain `Error` → `{ exception.type: 'Error', exception.message, exception.stacktrace }`",
                        "Subclasses (TypeError, RangeError, custom class) preserve the constructor name",
                        "`Error.cause` chain walks recursively, surfacing as a `caused by:` block in the stacktrace",
                        "Non-Error throws (string, object) round-trip with a synthetic Error wrapper",
                        "Output is OTel semconv 1.20+ compliant",
                    ],
                    tasks=[
                        "`feat(core): shapeException — Error → OTel semconv exception.* attributes`",
                        "`feat(core): support nested Error.cause chain (Node 16+ AggregateError + cause)`",
                        "`test(core): shapeException — TypeError / RangeError / custom Error / cause chain / AggregateError`",
                    ],
                ),
                "tasks": [
                    {
                        "title": "feat(core): shapeException — Error → { exception.type, exception.message, exception.stacktrace } OTel semconv",
                        "priority": "P0", "effort": "M", "impact": "high",
                        "body": body_task(
                            goal="Implement the core Error → semconv attribute mapping.",
                            context="OTel semconv defines a stable attribute namespace for exceptions. Following it means the backend (and any future exporters) handle our records without bespoke parsing.",
                            acceptance=[
                                "Exports `shapeException(err: unknown): ExceptionAttributes`",
                                "Output type: `{ 'exception.type': string; 'exception.message': string; 'exception.stacktrace': string }`",
                                "Constructor name preserved for Error subclasses",
                                "Non-Error inputs wrap into a synthetic Error with the string repr",
                                "`exception.stacktrace` matches the format the backend's symbolicator already parses (`at <fn> (<file>:<line>:<col>)`)",
                            ],
                            approach="""- File: `packages/core/src/exception.ts`
- Resolve `err.constructor.name` (falls back to `'Error'` when missing)
- For non-Error: wrap in `new Error(String(err))` then shape
- Stacktrace: use `err.stack ?? new Error().stack` and normalise CRLF → LF""",
                            test_plan="Vitest: plain Error, TypeError, custom `class FooError extends Error`, string throw, object throw, null throw, Error with no stack.",
                            docs="`packages/core/README.md` documents the attribute shape.",
                        ),
                    },
                    {
                        "title": "feat(core): support nested Error.cause chain (Node 16+ AggregateError + cause)",
                        "priority": "P1", "effort": "S", "impact": "medium",
                        "body": body_task(
                            goal="Walk `Error.cause` and `AggregateError.errors` chains and surface them in the stacktrace.",
                            context="Modern Node code uses `throw new Error('outer', { cause: inner })`. Without chain walking, the inner cause is lost — which is usually the real bug.",
                            acceptance=[
                                "`shapeException(err)` walks `err.cause` recursively, appending `Caused by: <type>: <message>\\n<stack>` to `exception.stacktrace`",
                                "AggregateError surfaces every `errors[]` as a `Aggregate error <i>:` block",
                                "Cycle protection: a self-referential cause chain does not loop infinitely (cap at depth 8)",
                            ],
                            approach="""- Use a WeakSet to detect cycles
- Cap chain depth at 8 to avoid pathological recursion
- Format: `\\nCaused by: TypeError: <message>\\n<stack>` (matches Java's printStackTrace + JS's `util.inspect`)""",
                            test_plan="Vitest: nested cause 3 levels deep, AggregateError with 2 sub-errors, cyclic cause (a→b→a), no cause (back-compat with prior task).",
                            docs="`packages/core/README.md` adds a 'Cause chains' note.",
                            deps="shapeException base implementation",
                        ),
                    },
                    {
                        "title": "test(core): shapeException — TypeError / RangeError / custom Error / cause chain / AggregateError",
                        "priority": "P1", "effort": "S", "impact": "medium",
                        "body": body_task(
                            goal="Comprehensive vitest suite that pins the shaper's output for every supported input shape.",
                            context="The shaper is part of the SDK's contract with the backend. Any regression in output shape can break Issue fingerprinting for every consumer. Pin it hard.",
                            acceptance=[
                                "Test cases: Error, TypeError, RangeError, EvalError, ReferenceError, SyntaxError",
                                "Custom subclasses with extra props (e.g. HttpError with status)",
                                "Cause chain (3 deep), AggregateError (2 sub), cyclic cause",
                                "Non-Error throws: string, number, plain object, null, undefined",
                                "Snapshot tests for the stacktrace format",
                            ],
                            approach="""- One vitest file per concern: exception.spec.ts, exception-cause.spec.ts, exception-non-error.spec.ts
- Snapshot helper that strips file paths so tests are stable across machines""",
                            test_plan="The tests themselves.",
                            docs="none",
                            deps="shapeException + cause chain implementations",
                        ),
                    },
                ],
            },
            {
                "title": "Feature: Breadcrumb ring + scope",
                "priority": "P0", "effort": "M", "impact": "high",
                "body": body_feature(
                    goal="Implement the BreadcrumbRing (bounded deque) and the Scope (user/tags/contexts) primitives that the public Neithly API builds on top of.",
                    context="Sentry's mental model is well-known: a Scope holds user + tags + breadcrumbs; captureException snapshots the current scope into the payload. We adopt the same model so the public API is familiar.",
                    acceptance=[
                        "BreadcrumbRing has bounded capacity (default 100), drops oldest on push",
                        "Scope has `setUser`, `setTags`, `setContexts`, `addBreadcrumb`",
                        "`withScope(fn)` creates a child scope that inherits + can override",
                        "Serialisation of breadcrumbs caps at 16 KB (drops oldest until under cap)",
                    ],
                    tasks=[
                        "`feat(core): BreadcrumbRing — bounded deque with capacity + drop-oldest`",
                        "`feat(core): Scope — user / tags / contexts + child scope via withScope`",
                        "`test(core): BreadcrumbRing eviction + serialization caps`",
                    ],
                ),
                "tasks": [
                    {
                        "title": "feat(core): BreadcrumbRing — bounded deque with capacity + drop-oldest",
                        "priority": "P0", "effort": "S", "impact": "high",
                        "body": body_task(
                            goal="Implement the breadcrumb ring buffer used by both Node and Browser SDKs.",
                            context="Breadcrumbs are the user's lifeline when debugging — they show what happened before the exception. A bounded ring prevents unbounded memory growth in long-running processes.",
                            acceptance=[
                                "Constructor accepts `capacity` (default 100)",
                                "`push(breadcrumb)` adds; over capacity drops the oldest",
                                "`snapshot()` returns a copy of current entries (oldest first)",
                                "`clear()` empties the ring",
                                "Breadcrumb type: `{ category, message?, data?, level?, timestamp }` matching Sentry's shape for familiarity",
                            ],
                            approach="""- File: `packages/core/src/breadcrumbs.ts`
- Use a plain array + head index (faster than `shift()` on long arrays)
- TSDoc on Breadcrumb explains each field""",
                            test_plan="Vitest: push under capacity, push exceeding capacity, snapshot returns a copy not a reference, clear works.",
                            docs="`packages/core/README.md` documents the Breadcrumb shape.",
                        ),
                    },
                    {
                        "title": "feat(core): Scope — user / tags / contexts + child scope via withScope",
                        "priority": "P0", "effort": "M", "impact": "high",
                        "body": body_task(
                            goal="Implement the Scope object — holds user/tags/contexts/breadcrumbs and supports child scopes that override.",
                            context="Sentry's withScope pattern: enter a scope, set request-specific tags, capture an exception. The scope auto-pops on exit. Same shape lets us copy a familiar pattern.",
                            acceptance=[
                                "Scope has `setUser({ id?, email?, ip_address? })`, `setTags({k:v})`, `setContexts({namespace: obj})`, `addBreadcrumb`",
                                "`scope.clone()` returns a deep copy",
                                "`withScope(fn)` clones the active scope, runs fn, restores",
                                "Async-safe: uses AsyncLocalStorage in Node (per-request), a single global in the browser",
                                "`scope.snapshot()` returns the serialisable bag for attaching to events",
                            ],
                            approach="""- File: `packages/core/src/scope.ts`
- Scope is a plain class — no Hub abstraction (we don't need multi-SDK concurrency)
- `withScope` lives separately in monitor-node (AsyncLocalStorage) vs monitor-browser (mutating global)
- Core exports the Scope class; the runtime-specific `withScope` lives in monitor-node/browser""",
                            test_plan="Vitest: setUser/setTags/setContexts/addBreadcrumb all serialise in snapshot; clone is deep (mutating clone doesn't touch original).",
                            docs="`packages/core/README.md` documents the Scope shape + withScope contract.",
                            deps="BreadcrumbRing",
                        ),
                    },
                    {
                        "title": "test(core): BreadcrumbRing eviction + serialization caps",
                        "priority": "P1", "effort": "XS", "impact": "low",
                        "body": body_task(
                            goal="Property-test the ring's eviction policy + cap the serialised JSON at 16 KB.",
                            context="Long-running services can leak the ring up to capacity. Serialisation cap prevents a single huge breadcrumb from bloating every payload.",
                            acceptance=[
                                "Ring at capacity drops oldest on push (property test over random capacities)",
                                "`serialiseBreadcrumbs(ring, 16384)` drops oldest entries until under 16 KB",
                                "Edge: a single breadcrumb > 16 KB is truncated with `[truncated]` marker",
                            ],
                            approach="""- fast-check generator for breadcrumb sizes + capacity
- Truncation strategy: drop oldest first; if still over, slice the newest's `data` field""",
                            test_plan="Vitest with fast-check.",
                            docs="none",
                            deps="BreadcrumbRing + Scope",
                        ),
                    },
                ],
            },
            {
                "title": "Feature: Wire envelopes",
                "priority": "P0", "effort": "M", "impact": "high",
                "body": body_feature(
                    goal="Implement `toOtlpLogRecord({scope, exception, message, level})` so the runtime SDKs only stitch transport, never wire shape.",
                    context="The backend's parser (src/ingestion/scrubbing.ts + fingerprinting.ts) expects a specific OTLP/HTTP/JSON shape. Centralising the shape in core means a backend wire change touches one file across the SDK family.",
                    acceptance=[
                        "`toOtlpLogRecord` produces a valid OTel `LogRecord` JSON",
                        "Severity maps from level (`debug`→5, `info`→9, `warn`→13, `error`→17, `fatal`→21)",
                        "Scope (user/tags/contexts) flattens into `attributes`",
                        "Breadcrumbs serialise to `attributes['neithly.breadcrumbs']` (JSON string, capped 16 KB)",
                        "`MonitorEndpointResolver` derives /v1/logs, /v1/metrics, /v1/traces from one origin",
                    ],
                    tasks=[
                        "`feat(core): toOtlpLogRecord — Scope + Breadcrumbs + Exception → OTLP LogRecord JSON`",
                        "`feat(core): MonitorEndpointResolver — derive /v1/logs, /v1/metrics, /v1/traces from one origin`",
                        "`test(core): toOtlpLogRecord round-trip vs neithly-monitor's parser fixture`",
                    ],
                ),
                "tasks": [
                    {
                        "title": "feat(core): toOtlpLogRecord — Scope + Breadcrumbs + Exception → OTLP LogRecord JSON",
                        "priority": "P0", "effort": "M", "impact": "high",
                        "body": body_task(
                            goal="Centralise the OTLP/HTTP/JSON LogRecord builder.",
                            context="Without this helper, monitor-node and monitor-browser each end up with their own envelope builder — and they will drift. Pin the shape in core.",
                            acceptance=[
                                "Input: `{ scope: ScopeSnapshot; exception?: ExceptionAttributes; message?: { body: string; level: SeverityLevel } }`",
                                "Output: the `LogRecord` shape per OTLP/HTTP/JSON spec (timeUnixNano, severityNumber, severityText, body, attributes)",
                                "User goes to `attributes['user.id']`, tags to `attributes[tag.*]`, contexts spread under their namespace",
                                "Exception attrs are inserted verbatim",
                                "`attributes['neithly.sdk.name']` and `neithly.sdk.version` are always present",
                            ],
                            approach="""- File: `packages/core/src/otlp-envelope.ts`
- timeUnixNano = `BigInt(Date.now()) * 1_000_000n` then back to string (otel JSON encoding)
- Map SeverityLevel → severityNumber per OTel spec
- TSDoc explains every output field""",
                            test_plan="Vitest snapshots for: error-only, message-only, with user, with tags, with breadcrumbs, with everything.",
                            docs="`packages/core/README.md` documents the LogRecord shape.",
                            deps="Scope + BreadcrumbRing + ExceptionShaper",
                        ),
                    },
                    {
                        "title": "feat(core): MonitorEndpointResolver — derive /v1/logs, /v1/metrics, /v1/traces from one origin",
                        "priority": "P1", "effort": "XS", "impact": "low",
                        "body": body_task(
                            goal="Tiny helper that produces the three ingest URLs from a single origin string.",
                            context="Every runtime SDK needs all three URLs; the OTel exporters want them concrete. One helper means one place to add a new signal in the future.",
                            acceptance=[
                                "`resolveEndpoints('https://monitor.neithly.com') → { logs, metrics, traces }`",
                                "Trailing slashes are normalised away",
                                "An invalid URL throws (uses the URL constructor as the validator)",
                            ],
                            approach="""- File: `packages/core/src/endpoints.ts`
- Use new URL() for validation""",
                            test_plan="Vitest: happy path, trailing slash, query string, invalid input.",
                            docs="none",
                        ),
                    },
                    {
                        "title": "test(core): toOtlpLogRecord round-trip vs neithly-monitor's parser fixture",
                        "priority": "P0", "effort": "S", "impact": "high",
                        "body": body_task(
                            goal="Pin the wire shape against a fixture extracted from the backend's parser tests so future drift is loud.",
                            context="A silent drift in the wire shape would break every Issue grouping for every consumer. This test surfaces drift the moment it happens.",
                            acceptance=[
                                "Test imports a static fixture (committed JSON) that mirrors what the backend's parser test consumes",
                                "Produces a LogRecord via `toOtlpLogRecord` and asserts it matches the fixture byte-for-byte (except timestamps)",
                                "When the fixture is regenerated (manual op), the test prints the diff so reviewers see the impact",
                            ],
                            approach="""- File: `packages/core/test/wire-roundtrip.spec.ts`
- Fixture: `packages/core/test/fixtures/log-record-sample.json`
- Strip timestamps before diffing""",
                            test_plan="The test itself.",
                            docs="Contributor docs explain how to refresh the fixture when the backend's parser evolves.",
                            deps="toOtlpLogRecord",
                        ),
                    },
                ],
            },
        ],
    },
    # =====================================================================
    # EPIC 3 — monitor-node
    # =====================================================================
    # Will be appended in plan_data_part2.py to keep this file readable
]


# Append the rest of the plan from sibling files
from plan_data_part2 import PLAN_PART2
from plan_data_part3 import PLAN_PART3

PLAN.extend(PLAN_PART2)
PLAN.extend(PLAN_PART3)
