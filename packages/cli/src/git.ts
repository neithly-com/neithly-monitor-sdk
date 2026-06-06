import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';

/**
 * Run a git command and return its trimmed stdout, or null if the command fails.
 *
 * Wrapped in its own helper so the spec can stub `execSync` cleanly.
 */
function runGit(args: readonly string[], runner: GitRunner): string | null {
  try {
    const out = runner(['git', ...args].join(' '), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Function signature compatible with `child_process.execSync` when called with
 * an explicit string encoding (so it returns a `string`, not a `Buffer`).
 *
 * Exposed as a seam so tests can stub `execSync` without touching the global.
 */
export type GitRunner = (
  command: string,
  options: ExecSyncOptionsWithStringEncoding,
) => string;

const defaultRunner: GitRunner = (command, options) => execSync(command, options);

/**
 * Detect the current release version from git.
 *
 * Strategy:
 *   1. `git describe --tags --exact-match` — if HEAD is exactly on a tag, use it.
 *   2. `git rev-parse --short HEAD` — otherwise fall back to the short SHA.
 *   3. Returns `null` if both fail (e.g. running outside a git checkout).
 */
export function detectVersion(runner: GitRunner = defaultRunner): string | null {
  const tag = runGit(['describe', '--tags', '--exact-match'], runner);
  if (tag !== null) return tag;

  const sha = runGit(['rev-parse', '--short', 'HEAD'], runner);
  if (sha !== null) return sha;

  return null;
}
