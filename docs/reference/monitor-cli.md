# monitor-cli

> CLI for neithly-monitor — ships the `monitor` binary. The full `releases create` and `sourcemaps upload` command bodies exist in source but are not yet wired into the binary's default command tree; the v0.1 binary stubs both with `not implemented yet` messages.
> **Status:** experimental
> **Package:** `@neithly-com/monitor-cli`
> **Source:** `packages/cli/src/`
> **Updated:** 2026-06-09

## Quick reference

| What | How |
|---|---|
| Binary | `monitor` (built from `packages/cli/src/cli.ts`) |
| Default subcommands | `monitor releases` (placeholder) · `monitor sourcemaps` (placeholder) |
| Library entry | `import { SDK_NAME } from '@neithly-com/monitor-cli'` — that is the only exported symbol |
| Full implementations (programmatic wiring only) | `registerReleasesCreateCommand` (`commands/releases-create.ts`) · `registerSourceMapsUploadCommand` / `runSourceMapsUpload` (`commands/sourcemaps-upload.ts`) |
| Config loader | `loadConfig` (`config.ts`) |
| API client | `createMonitorClient` (`api-client.ts`) |
| Git version detect | `detectVersion` (`git.ts`) |

## Install

```bash
pnpm add -D @neithly-com/monitor-cli
# or run ad-hoc
pnpm dlx @neithly-com/monitor-cli --help
```

## What ships in the binary today

**Source:** `packages/cli/src/cli.ts` + `packages/cli/src/commands/index.ts`

```ts
const program = new Command()
  .name('monitor')
  .description('CLI for neithly-monitor — releases + sourcemaps for CI pipelines.')
  .version('0.1.0', '-v, --version', 'Print the CLI version and exit.');

registerReleasesCommand(program);    // → `monitor releases` — prints "releases: not implemented yet"
registerSourcemapsCommand(program);  // → `monitor sourcemaps` — prints "sourcemaps: not implemented yet"
```

| Invocation | Behaviour |
|---|---|
| `monitor --version` | Prints `0.1.0` |
| `monitor --help` | Lists `releases`, `sourcemaps`, global flags |
| `monitor releases` | Prints `releases: not implemented yet` |
| `monitor sourcemaps` | Prints `sourcemaps: not implemented yet` |

The richer `register*Command` factories (below) exist but a follow-up Feature is required to swap them in for the placeholder registrations.

## Library export

**Source:** `packages/cli/src/index.ts`

```ts
export const SDK_NAME = '@neithly-com/monitor-cli';
```

That is the entire surface re-exported from the package's main entry. The internal modules (`commands/*`, `config.ts`, `api-client.ts`, `git.ts`) are not part of the published library — they are reachable only via deep imports against `dist/` paths, which are not stable.

## Internal modules (not in `index.ts`)

The internals below ship inside the package and are unit-tested, but are not part of the stable export surface. They are documented here so contributors and follow-up Features can wire them into the binary.

### `cli.ts`

**Source:** `packages/cli/src/cli.ts`

```ts
export function createProgram(): Command;
export function run(argv: ReadonlyArray<string>): Promise<void>;
export function maybeRunAsMain(): void;
```

| Function | Role |
|---|---|
| `createProgram()` | Build a fresh commander program with the two placeholder subcommands registered |
| `run(argv)` | Parse `argv` against `createProgram()` (using `{ from: 'user' }` so the caller does not need to spoof `process.argv[0..1]`) |
| `maybeRunAsMain()` | Fires automatically at module load — invokes `createProgram().parseAsync(process.argv)` when the module is the process entry, exits 1 on error |

### `registerReleasesCreateCommand(program, deps)`

**Source:** `packages/cli/src/commands/releases-create.ts`

Production-shaped factory that registers `monitor releases create` (under the `releases` subcommand group). Idempotent: looks up an existing `releases` subcommand and reuses it.

**Signature:**

```ts
export function registerReleasesCreateCommand(
  program: Command,
  deps: ReleasesCreateDeps,
): Command;

export interface ReleasesCreateDeps {
  loadConfig(): Promise<ReleasesCreateConfig> | ReleasesCreateConfig;
  createApiClient(config: ReleasesCreateConfig): ReleasesCreateApiClient;
  detectVersion?: () => string | null;
  log?: (line: string) => void;
  error?: (line: string) => void;
  exit?: (code: number) => never;
}

export interface ReleasesCreateConfig {
  readonly project?: string | undefined;
}

export interface ReleasesCreateApiClient {
  post(path: string, body: Record<string, unknown>): Promise<ReleasesCreateApiResponse>;
}

export interface ReleasesCreateApiResponse {
  readonly status: number;
  readonly body: { readonly id?: string } & Record<string, unknown>;
}
```

**Flags:**

| Flag | Required | Default | Behaviour |
|---|---|---|---|
| `--version <v>` | no | `git describe --tags --exact-match` then `git rev-parse --short HEAD` | Free-form version string |
| `--project <slug>` | yes (or in config) | — | Project slug on the backend |

**Behaviour:**

1. Resolve `project` (flag → config). Missing → stderr + `exit(1)`.
2. Resolve `version` (flag → `detectVersion()`). Missing → stderr + `exit(1)`.
3. `POST /projects/<slug>/releases` with `{ version }`.
4. On `2xx` with `id`: print id to stdout. On `2xx` without id → stderr + `exit(1)`.
5. On `409` with `id`: print existing id (treat as success). Without id → stderr + `exit(1)`.
6. Other statuses → stderr + `exit(1)`.

### `runSourceMapsUpload(glob, options, deps?)` / `registerSourceMapsUploadCommand(program, deps?)`

**Source:** `packages/cli/src/commands/sourcemaps-upload.ts`

Glob → SHA-256 → batch-check against the backend → upload only missing files in parallel. Uses `ora` for progress and `p-limit` for concurrency.

**Signature:**

```ts
export function registerSourceMapsUploadCommand(
  program: Command,
  deps?: SourceMapsUploadDeps,
): Command;

export async function runSourceMapsUpload(
  glob: string,
  options: SourceMapsUploadOptions,
  deps?: SourceMapsUploadDeps,
): Promise<SourceMapsUploadResult>;

export interface SourceMapsUploadOptions {
  readonly release: string;
  readonly project: string;
  readonly concurrency?: string | number; // parsed via Number.parseInt when string
}

export interface SourceMapsUploadResult {
  readonly matched: number;
  readonly uploaded: number;
  readonly skipped: number;
}

export interface SourceMapsUploadDeps {
  readonly fetch?: HttpFetch;
  readonly glob?: (patterns: string | readonly string[]) => Promise<string[]>;
  readonly readFile?: (path: string) => Promise<Buffer>;
  readonly createSpinner?: (text?: string) => Spinner;
  readonly env?: NodeJS.ProcessEnv;
  readonly logger?: Pick<Console, 'log' | 'error'>;
}

export class SourceMapsUploadError extends Error {
  override readonly name: 'SourceMapsUploadError';
}

export function sha256Hex(buf: Buffer): string;
```

**Flags:**

| Flag | Required | Default | Behaviour |
|---|---|---|---|
| `--release <version>` | yes | — | Must already exist (`releases create` first) |
| `--project <slug>` | yes | — | Project slug |
| `--concurrency <n>` | no | `4` | Parallel upload workers (must be a positive integer) |

**HTTP flow:**

| Step | Request |
|---|---|
| 1. Resolve release id | `GET <apiBase>/projects/<project>/releases?version=<release>` |
| 2. Batch-check existing | `POST <apiBase>/releases/<releaseId>/files/check` with `{ hashes: [...] }` |
| 3. Upload missing | `POST <apiBase>/releases/<releaseId>/files` per file (multipart: `file` blob, `name`, `sha256`) |

All requests carry `authorization: Bearer <token>`.

**Errors surfaced as `SourceMapsUploadError`:**

| Trigger | Message |
|---|---|
| `NEITHLY_AUTH_TOKEN` and `MONITOR_AUTH_TOKEN` both unset | `Missing auth token — set NEITHLY_AUTH_TOKEN before running.` |
| `--concurrency` not a positive integer | `Invalid --concurrency value: <raw>` |
| Release lookup `401` | `Auth failed` |
| Release lookup `404` or missing `body.id` | `Release not found` |
| Other release lookup non-2xx | `Release lookup failed (HTTP <status>)` |
| Batch-check `401` | `Auth failed` |
| Batch-check other non-2xx | `Batch check failed (HTTP <status>)` |
| Upload `401` | `Auth failed` |
| Upload `404` | `Release not found` |
| Upload other non-2xx | `Upload failed for <filePath> (HTTP <status>)` |

### `loadConfig(options)`

**Source:** `packages/cli/src/config.ts`

Resolve CLI config from precedence: **flags > env vars > config file**. Required fields: `apiUrl`, `apiToken`, `projectSlug`. Missing → throws `ConfigMissingError` with the list of missing keys.

**Signature:**

```ts
export function loadConfig(options: LoadConfigOptions): ResolvedConfig;

export interface LoadConfigOptions {
  cwd: string;
  flags?: ConfigFlags;
  env?: NodeJS.ProcessEnv;
}

export interface ConfigFlags {
  apiUrl?: string;
  apiToken?: string;
  projectSlug?: string;
}

export interface ResolvedConfig {
  apiUrl: string;
  apiToken: string;
  projectSlug: string;
}

export class ConfigMissingError extends Error {
  readonly code: 'CONFIG_MISSING';
  readonly missing: ReadonlyArray<keyof ResolvedConfig>;
}
```

**Env-var bindings:**

| Field | Env var |
|---|---|
| `apiUrl` | `NEITHLY_API_URL` |
| `apiToken` | `NEITHLY_API_TOKEN` |
| `projectSlug` | `NEITHLY_PROJECT_SLUG` |

**Config file search** (via `cosmiconfig`, scoped to `cwd`):

```
.neithlyrc
.neithlyrc.json
.neithlyrc.yaml
.neithlyrc.yml
.neithlyrc.js
.neithlyrc.cjs
neithly.config.js
neithly.config.cjs
```

Recognised keys: `apiUrl`, `apiToken`, `projectSlug` (other keys silently ignored). Empty/whitespace strings are treated as missing.

### `createMonitorClient(options)`

**Source:** `packages/cli/src/api-client.ts`

Thin `fetch` wrapper that adds `Authorization: Bearer <token>` and `Accept: application/json` (plus `Content-Type: application/json` when a body is sent), returns parsed JSON on 2xx, throws `ApiError` on non-2xx.

**Signature:**

```ts
export function createMonitorClient(options: CreateMonitorClientOptions): MonitorClient;

export interface CreateMonitorClientOptions {
  apiUrl: string;
  apiToken: string;
  fetch?: typeof fetch;
}

export interface MonitorClient {
  request: <T = unknown>(path: string, init?: MonitorRequestInit) => Promise<T>;
  apiUrl: string;
}

export interface MonitorRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  readonly code: 'API_ERROR';
  readonly status: number;
  readonly body: unknown;
}
```

| Behaviour | Detail |
|---|---|
| URL composition | `apiUrl` + `/` + `path` (one slash, regardless of trailing/leading slashes) |
| `204 No Content` | Returns `null` cast to `T` |
| Non-2xx | Parses body as JSON (or text fallback) and throws `ApiError(status, body)` |
| Missing `fetch` impl | Throws `Error('No fetch implementation available — pass `fetch` explicitly.')` at construction |

### `detectVersion(runner?)`

**Source:** `packages/cli/src/git.ts`

Detect the release version from git: try `git describe --tags --exact-match` first; fall back to `git rev-parse --short HEAD`; return `null` if both fail (not in a git checkout).

**Signature:**

```ts
export function detectVersion(runner?: GitRunner): string | null;

export type GitRunner = (
  command: string,
  options: ExecSyncOptionsWithStringEncoding,
) => string;
```

The `runner` seam exists so tests can stub `child_process.execSync` without touching the global.

## Environment variables

| Var | Read by | Purpose |
|---|---|---|
| `NEITHLY_AUTH_TOKEN` | `runSourceMapsUpload` | Required bearer for the sourcemaps API |
| `MONITOR_AUTH_TOKEN` | `runSourceMapsUpload` | Alias for `NEITHLY_AUTH_TOKEN` |
| `NEITHLY_API_URL` | `runSourceMapsUpload`, `loadConfig` | Override the API origin (default `https://api.neithly.com`) |
| `NEITHLY_API_TOKEN` | `loadConfig` | Bearer for the generic config-loader flow |
| `NEITHLY_PROJECT_SLUG` | `loadConfig` | Default project slug |

## See also

- [reference/monitor-core.md](monitor-core.md) — `parseDsn` (useful for a future `monitor login`-style UX)
- [guides/operating.md](../guides/operating.md) — env vars, deploy, troubleshooting
- [QA 04](../qa/04-cli-releases-sourcemaps.md) — CLI flow matrix
