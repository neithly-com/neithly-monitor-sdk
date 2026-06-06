// Configuration resolution for the `monitor` CLI.
//
// Precedence (highest wins): explicit CLI flags > environment variables > .neithlyrc file.
// Required fields (`apiUrl`, `apiToken`, `projectSlug`) trigger `ConfigMissingError`
// when no source supplies them.

import { cosmiconfigSync, type CosmiconfigResult } from 'cosmiconfig';

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

export interface LoadConfigOptions {
  cwd: string;
  flags?: ConfigFlags;
  env?: NodeJS.ProcessEnv;
}

const ENV_KEYS = {
  apiUrl: 'NEITHLY_API_URL',
  apiToken: 'NEITHLY_API_TOKEN',
  projectSlug: 'NEITHLY_PROJECT_SLUG',
} as const;

const MODULE_NAME = 'neithly';

export class ConfigMissingError extends Error {
  public readonly code = 'CONFIG_MISSING' as const;
  public readonly missing: ReadonlyArray<keyof ResolvedConfig>;

  public constructor(missing: ReadonlyArray<keyof ResolvedConfig>) {
    super(`Missing required configuration: ${missing.join(', ')}`);
    this.name = 'ConfigMissingError';
    this.missing = missing;
  }
}

interface PartialConfig {
  apiUrl?: string;
  apiToken?: string;
  projectSlug?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function pickConfigFields(raw: Record<string, unknown>): PartialConfig {
  const out: PartialConfig = {};
  const apiUrl = raw['apiUrl'];
  const apiToken = raw['apiToken'];
  const projectSlug = raw['projectSlug'];
  if (isNonEmptyString(apiUrl)) out.apiUrl = apiUrl;
  if (isNonEmptyString(apiToken)) out.apiToken = apiToken;
  if (isNonEmptyString(projectSlug)) out.projectSlug = projectSlug;
  return out;
}

function readFileConfig(cwd: string): PartialConfig {
  const explorer = cosmiconfigSync(MODULE_NAME, {
    searchPlaces: [
      '.neithlyrc',
      '.neithlyrc.json',
      '.neithlyrc.yaml',
      '.neithlyrc.yml',
      '.neithlyrc.js',
      '.neithlyrc.cjs',
      'neithly.config.js',
      'neithly.config.cjs',
    ],
    stopDir: cwd,
    cache: false,
  });

  const result: CosmiconfigResult = explorer.search(cwd);
  if (result === null || result.isEmpty === true) {
    return {};
  }

  const raw: unknown = result.config;
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return {};
  }

  return pickConfigFields(raw as Record<string, unknown>);
}

function readEnvConfig(env: NodeJS.ProcessEnv): PartialConfig {
  const out: PartialConfig = {};
  const apiUrl = env[ENV_KEYS.apiUrl];
  const apiToken = env[ENV_KEYS.apiToken];
  const projectSlug = env[ENV_KEYS.projectSlug];
  if (isNonEmptyString(apiUrl)) out.apiUrl = apiUrl;
  if (isNonEmptyString(apiToken)) out.apiToken = apiToken;
  if (isNonEmptyString(projectSlug)) out.projectSlug = projectSlug;
  return out;
}

function readFlagsConfig(flags: ConfigFlags): PartialConfig {
  const out: PartialConfig = {};
  if (isNonEmptyString(flags.apiUrl)) out.apiUrl = flags.apiUrl;
  if (isNonEmptyString(flags.apiToken)) out.apiToken = flags.apiToken;
  if (isNonEmptyString(flags.projectSlug)) out.projectSlug = flags.projectSlug;
  return out;
}

export function loadConfig(options: LoadConfigOptions): ResolvedConfig {
  const env = options.env ?? process.env;
  const flags = options.flags ?? {};

  const fromFile = readFileConfig(options.cwd);
  const fromEnv = readEnvConfig(env);
  const fromFlags = readFlagsConfig(flags);

  const apiUrl = fromFlags.apiUrl ?? fromEnv.apiUrl ?? fromFile.apiUrl;
  const apiToken = fromFlags.apiToken ?? fromEnv.apiToken ?? fromFile.apiToken;
  const projectSlug = fromFlags.projectSlug ?? fromEnv.projectSlug ?? fromFile.projectSlug;

  const missing: Array<keyof ResolvedConfig> = [];
  if (apiUrl === undefined) missing.push('apiUrl');
  if (apiToken === undefined) missing.push('apiToken');
  if (projectSlug === undefined) missing.push('projectSlug');

  if (apiUrl === undefined || apiToken === undefined || projectSlug === undefined) {
    throw new ConfigMissingError(missing);
  }

  return { apiUrl, apiToken, projectSlug };
}
