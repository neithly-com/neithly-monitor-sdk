import type { Command } from 'commander';

import { detectVersion } from '../git.js';

/**
 * Minimal config shape this command consumes. The scaffold's full config loader
 * is expected to return at least these fields; we keep the contract narrow so
 * the Feature can ship without depending on the sibling scaffold subdirectory.
 */
export interface ReleasesCreateConfig {
  /** Default project slug if `--project` is not supplied. */
  readonly project?: string | undefined;
}

/**
 * Minimal API-client shape this command uses. Scaffold's client must expose a
 * `post(path, body)` method that returns the parsed JSON response and HTTP
 * status. A `409` response means the release already exists and the body
 * carries the existing id under `id`.
 */
export interface ReleasesCreateApiClient {
  post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<ReleasesCreateApiResponse>;
}

export interface ReleasesCreateApiResponse {
  readonly status: number;
  readonly body: { readonly id?: string } & Record<string, unknown>;
}

export interface ReleasesCreateDeps {
  /** Loads the merged CLI config (env + .neithlyrc + flags). */
  loadConfig(): Promise<ReleasesCreateConfig> | ReleasesCreateConfig;
  /** Constructs the API client from the loaded config. */
  createApiClient(config: ReleasesCreateConfig): ReleasesCreateApiClient;
  /** Override for git version detection — defaults to `detectVersion()`. */
  detectVersion?: () => string | null;
  /** Sink for normal output — defaults to `console.log`. */
  log?: (line: string) => void;
  /** Sink for errors — defaults to `console.error`. */
  error?: (line: string) => void;
  /** Process exit — defaults to `process.exit`. */
  exit?: (code: number) => never;
}

interface ReleasesCreateFlags {
  version?: string;
  project?: string;
}

/**
 * Registers `monitor releases create` on the given Commander program.
 *
 * Behaviour:
 *   - `--version <v>` (optional) — auto-detected from git when omitted.
 *   - `--project <slug>` (optional) — falls back to config's default project.
 *   - POSTs `{ version }` to `/projects/<slug>/releases`.
 *   - On 2xx prints the created id.
 *   - On 409 prints the existing id (release already exists).
 *   - Any other status / missing inputs exits with code 1 and a stderr message.
 */
export function registerReleasesCreateCommand(
  program: Command,
  deps: ReleasesCreateDeps,
): Command {
  const detect = deps.detectVersion ?? detectVersion;
  const log = deps.log ?? ((line: string): void => console.log(line));
  const error = deps.error ?? ((line: string): void => console.error(line));
  const exit =
    deps.exit ??
    ((code: number): never => {
      process.exit(code);
    });

  const releases = getOrCreateSubcommand(program, 'releases');

  releases
    .command('create')
    .description('Create a release for a project')
    .option('--version <version>', 'Release version (defaults to git tag/sha)')
    .option('--project <slug>', 'Project slug (defaults to config)')
    .action(async (flags: ReleasesCreateFlags) => {
      const config = await deps.loadConfig();

      const project = flags.project ?? config.project;
      if (project === undefined || project === '') {
        error(
          'monitor releases create: --project is required (no default project in config)',
        );
        exit(1);
        return;
      }

      const version = flags.version ?? detect() ?? undefined;
      if (version === undefined || version === '') {
        error(
          'monitor releases create: --version is required (git tag/sha auto-detect failed)',
        );
        exit(1);
        return;
      }

      const client = deps.createApiClient(config);
      const response = await client.post(`/projects/${project}/releases`, {
        version,
      });

      const id = response.body.id;

      if (response.status >= 200 && response.status < 300) {
        if (id === undefined) {
          error(
            `monitor releases create: server returned ${String(response.status)} without an id`,
          );
          exit(1);
          return;
        }
        log(id);
        return;
      }

      if (response.status === 409) {
        if (id === undefined) {
          error(
            'monitor releases create: release already exists but server omitted id',
          );
          exit(1);
          return;
        }
        log(id);
        return;
      }

      error(
        `monitor releases create: unexpected status ${String(response.status)}`,
      );
      exit(1);
    });

  return releases;
}

/**
 * Look up a subcommand by name and create it if absent.
 *
 * Lets multiple Feature modules share a top-level command (`monitor releases`,
 * `monitor sourcemaps`, …) without colliding when they register independently.
 */
function getOrCreateSubcommand(program: Command, name: string): Command {
  const existing = program.commands.find((c) => c.name() === name);
  if (existing !== undefined) return existing;
  return program.command(name);
}
