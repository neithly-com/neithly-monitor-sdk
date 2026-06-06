// `monitor` CLI entry point.
//
// Wires up commander with the global `--version` / `--help` flags and registers
// the top-level `releases` and `sourcemaps` subcommands. Subcommand bodies live in
// `./commands/index.ts` (placeholders for now; filled in by follow-up agents).
//
// The shebang (`#!/usr/bin/env node`) is injected by tsup at build time. The
// auto-run block at the bottom only fires when this module is invoked as the
// process entry — importing it from tests stays side-effect-free.

import { Command } from 'commander';
import { pathToFileURL } from 'node:url';

import { registerReleasesCommand, registerSourcemapsCommand } from './commands/index.js';

const CLI_NAME = 'monitor';
const CLI_VERSION = '0.1.0';

export function createProgram(): Command {
  const program = new Command();

  program
    .name(CLI_NAME)
    .description('CLI for neithly-monitor — releases + sourcemaps for CI pipelines.')
    .version(CLI_VERSION, '-v, --version', 'Print the CLI version and exit.')
    .showHelpAfterError(true)
    .showSuggestionAfterError(true);

  registerReleasesCommand(program);
  registerSourcemapsCommand(program);

  return program;
}

export async function run(argv: ReadonlyArray<string>): Promise<void> {
  const program = createProgram();
  await program.parseAsync([...argv], { from: 'user' });
}

function isMainEntry(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

export function maybeRunAsMain(): void {
  if (isMainEntry()) {
    const program = createProgram();
    program.parseAsync(process.argv).catch((err: unknown) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
  }
}

maybeRunAsMain();
