// Feature: monitor-cli sourcemaps command.
// Implements `monitor sourcemaps upload <glob>` which:
//   - expands the glob via globby
//   - hashes each file (SHA-256)
//   - batch-checks which hashes are already present on the backend
//   - uploads only the missing files (multipart) with a concurrency cap (p-limit)
//   - shows progress via ora
//
// All side effects (fetch, fs, glob, ora) are injectable via `deps` so the
// command can be unit-tested without touching the filesystem or network.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import type { Command } from 'commander';
import { globby } from 'globby';
import pLimit from 'p-limit';
import ora, { type Ora } from 'ora';

/**
 * Minimal fetch-like response surface the command relies on. Keeping this
 * narrow lets the spec stub out `fetch` without pulling in the whole DOM lib.
 */
export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/**
 * Minimal fetch signature. We deliberately accept `unknown` for the body
 * because the global `fetch` types vary between Node versions.
 */
export type HttpFetch = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body?: any; // multipart FormData / JSON string / undefined
  },
) => Promise<HttpResponse>;

/**
 * Lightweight spinner shape; matches the subset of ora we use.
 */
export interface Spinner {
  start(text?: string): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
  stop(): Spinner;
  text: string;
}

/**
 * Injected dependencies. All have working defaults so production wiring is
 * just `registerSourceMapsUploadCommand(program)`.
 */
export interface SourceMapsUploadDeps {
  readonly fetch?: HttpFetch;
  readonly glob?: (patterns: string | readonly string[]) => Promise<string[]>;
  readonly readFile?: (path: string) => Promise<Buffer>;
  readonly createSpinner?: (text?: string) => Spinner;
  readonly env?: NodeJS.ProcessEnv;
  readonly logger?: Pick<Console, 'log' | 'error'>;
}

/**
 * CLI options the user can pass.
 */
export interface SourceMapsUploadOptions {
  readonly release: string;
  readonly project: string;
  readonly concurrency?: string | number;
}

/**
 * Internal config — after defaults and env resolution.
 */
interface ResolvedConfig {
  readonly apiBase: string;
  readonly token: string;
  readonly project: string;
  readonly release: string;
  readonly concurrency: number;
}

/**
 * Error class used to surface user-facing failure messages without leaking a
 * stack trace through commander.
 */
export class SourceMapsUploadError extends Error {
  public override readonly name = 'SourceMapsUploadError';
  public constructor(message: string) {
    super(message);
  }
}

const DEFAULT_API_BASE = 'https://api.neithly.com';
const DEFAULT_CONCURRENCY = 4;

const fetchAdapter: HttpFetch = async (url, init) => {
  // The global fetch is available on Node 18+. We wrap it to keep the
  // narrow `HttpResponse` shape the rest of the code uses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (globalThis.fetch as any)(url, init);
  return {
    ok: res.ok,
    status: res.status,
    json: () => res.json(),
    text: () => res.text(),
  };
};

const defaultGlob = async (patterns: string | readonly string[]): Promise<string[]> => {
  return globby(patterns);
};

const defaultReadFile = async (path: string): Promise<Buffer> => {
  return readFile(path);
};

const defaultSpinner = (text?: string): Spinner => {
  const inst: Ora = ora(text ?? '');
  // ora already implements the methods we care about; the cast keeps types tight.
  return inst as unknown as Spinner;
};

/**
 * Compute the SHA-256 hex digest of a buffer.
 */
export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function resolveConfig(
  options: SourceMapsUploadOptions,
  env: NodeJS.ProcessEnv,
): ResolvedConfig {
  const token = env['NEITHLY_AUTH_TOKEN'] ?? env['MONITOR_AUTH_TOKEN'] ?? '';
  if (!token) {
    throw new SourceMapsUploadError(
      'Missing auth token — set NEITHLY_AUTH_TOKEN before running.',
    );
  }
  const apiBase = env['NEITHLY_API_URL'] ?? DEFAULT_API_BASE;
  const concurrencyRaw = options.concurrency ?? DEFAULT_CONCURRENCY;
  const concurrency =
    typeof concurrencyRaw === 'number' ? concurrencyRaw : Number.parseInt(concurrencyRaw, 10);
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new SourceMapsUploadError(
      `Invalid --concurrency value: ${String(concurrencyRaw)}`,
    );
  }
  return {
    apiBase: apiBase.replace(/\/+$/, ''),
    token,
    project: options.project,
    release: options.release,
    concurrency,
  };
}

interface ReleaseLookupResponse {
  readonly id: string;
}

async function resolveReleaseId(
  fetchFn: HttpFetch,
  cfg: ResolvedConfig,
): Promise<string> {
  const url = `${cfg.apiBase}/projects/${encodeURIComponent(cfg.project)}/releases?version=${encodeURIComponent(cfg.release)}`;
  const res = await fetchFn(url, {
    method: 'GET',
    headers: authHeaders(cfg.token),
  });
  if (res.status === 401) {
    throw new SourceMapsUploadError('Auth failed');
  }
  if (res.status === 404) {
    throw new SourceMapsUploadError('Release not found');
  }
  if (!res.ok) {
    throw new SourceMapsUploadError(
      `Release lookup failed (HTTP ${res.status})`,
    );
  }
  const body = (await res.json()) as ReleaseLookupResponse | null;
  if (!body || typeof body.id !== 'string' || body.id.length === 0) {
    throw new SourceMapsUploadError('Release not found');
  }
  return body.id;
}

interface BatchCheckResponse {
  readonly existing: readonly string[];
}

async function checkExistingHashes(
  fetchFn: HttpFetch,
  cfg: ResolvedConfig,
  releaseId: string,
  hashes: readonly string[],
): Promise<Set<string>> {
  if (hashes.length === 0) {
    return new Set();
  }
  const url = `${cfg.apiBase}/releases/${encodeURIComponent(releaseId)}/files/check`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      ...authHeaders(cfg.token),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ hashes }),
  });
  if (res.status === 401) {
    throw new SourceMapsUploadError('Auth failed');
  }
  if (!res.ok) {
    throw new SourceMapsUploadError(
      `Batch check failed (HTTP ${res.status})`,
    );
  }
  const body = (await res.json()) as BatchCheckResponse | null;
  const existing = body && Array.isArray(body.existing) ? body.existing : [];
  return new Set(existing.filter((h): h is string => typeof h === 'string'));
}

async function uploadFile(
  fetchFn: HttpFetch,
  cfg: ResolvedConfig,
  releaseId: string,
  filePath: string,
  contents: Buffer,
  sha256: string,
): Promise<void> {
  const url = `${cfg.apiBase}/releases/${encodeURIComponent(releaseId)}/files`;
  const form = new FormData();
  // Node 18+ has global FormData/Blob; the cast keeps Buffer interop tidy.
  const blob = new Blob([new Uint8Array(contents)]);
  form.append('file', blob, basename(filePath));
  form.append('name', filePath);
  form.append('sha256', sha256);
  const res = await fetchFn(url, {
    method: 'POST',
    headers: authHeaders(cfg.token),
    body: form,
  });
  if (res.status === 401) {
    throw new SourceMapsUploadError('Auth failed');
  }
  if (res.status === 404) {
    throw new SourceMapsUploadError('Release not found');
  }
  if (!res.ok) {
    throw new SourceMapsUploadError(
      `Upload failed for ${filePath} (HTTP ${res.status})`,
    );
  }
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/**
 * Result returned by `runSourceMapsUpload` — exposed so the spec can assert on
 * the counters without scraping stdout.
 */
export interface SourceMapsUploadResult {
  readonly matched: number;
  readonly uploaded: number;
  readonly skipped: number;
}

/**
 * Run the upload flow. Exported separately from the commander wiring so tests
 * can call it directly.
 */
export async function runSourceMapsUpload(
  glob: string,
  options: SourceMapsUploadOptions,
  deps: SourceMapsUploadDeps = {},
): Promise<SourceMapsUploadResult> {
  const env = deps.env ?? process.env;
  const fetchFn = deps.fetch ?? fetchAdapter;
  const globFn = deps.glob ?? defaultGlob;
  const readFileFn = deps.readFile ?? defaultReadFile;
  const spinnerFactory = deps.createSpinner ?? defaultSpinner;

  const cfg = resolveConfig(options, env);

  const spinner = spinnerFactory('Resolving release...').start();
  let releaseId: string;
  try {
    releaseId = await resolveReleaseId(fetchFn, cfg);
  } catch (err) {
    spinner.fail(err instanceof Error ? err.message : String(err));
    throw err;
  }

  spinner.text = 'Matching files...';
  const files = await globFn(glob);
  if (files.length === 0) {
    spinner.succeed('No files matched.');
    return { matched: 0, uploaded: 0, skipped: 0 };
  }

  spinner.text = `Hashing ${files.length} file(s)...`;
  const hashed = await Promise.all(
    files.map(async (filePath) => {
      const contents = await readFileFn(filePath);
      return { filePath, contents, sha256: sha256Hex(contents) };
    }),
  );

  spinner.text = 'Checking existing files...';
  const existing = await checkExistingHashes(
    fetchFn,
    cfg,
    releaseId,
    hashed.map((h) => h.sha256),
  );

  const toUpload = hashed.filter((h) => !existing.has(h.sha256));
  const skipped = hashed.length - toUpload.length;

  spinner.text = `Uploading ${toUpload.length} file(s) (skipped ${skipped})...`;
  const limit = pLimit(cfg.concurrency);
  try {
    await Promise.all(
      toUpload.map((entry) =>
        limit(() =>
          uploadFile(fetchFn, cfg, releaseId, entry.filePath, entry.contents, entry.sha256),
        ),
      ),
    );
  } catch (err) {
    spinner.fail(err instanceof Error ? err.message : String(err));
    throw err;
  }

  spinner.succeed(
    `Uploaded ${toUpload.length} file(s), skipped ${skipped} (matched ${hashed.length}).`,
  );

  return {
    matched: hashed.length,
    uploaded: toUpload.length,
    skipped,
  };
}

/**
 * Register the `monitor sourcemaps upload <glob>` command on the given commander
 * program. The command group `sourcemaps` is created on demand so this can
 * safely be called from a bare program.
 */
export function registerSourceMapsUploadCommand(
  program: Command,
  deps: SourceMapsUploadDeps = {},
): Command {
  const existing = program.commands.find((c) => c.name() === 'sourcemaps');
  const group = existing ?? program.command('sourcemaps').description('Manage release sourcemaps');

  const cmd = group
    .command('upload <glob>')
    .description('Upload sourcemaps matching <glob> to a release')
    .requiredOption('--release <version>', 'release version (e.g. 1.2.3)')
    .requiredOption('--project <slug>', 'project slug')
    .option('--concurrency <n>', 'max parallel uploads', String(DEFAULT_CONCURRENCY))
    .action(async (glob: string, raw: SourceMapsUploadOptions) => {
      const logger = deps.logger ?? console;
      try {
        await runSourceMapsUpload(glob, raw, deps);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(message);
        // Bubble up so commander can set a non-zero exit code in real use.
        throw err;
      }
    });

  return cmd;
}
