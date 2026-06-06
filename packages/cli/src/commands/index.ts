// Commands barrel — populated by follow-up agents (releases / sourcemaps).
// Each command exports a `register<X>Command(program: Command): void` function
// that the CLI entry point in `../cli.ts` invokes.

import type { Command } from 'commander';

export function registerReleasesCommand(program: Command): void {
  program
    .command('releases')
    .description('Create and manage neithly-monitor releases (placeholder).')
    .action(() => {
      // Implementation lands with a follow-up Feature.
      process.stdout.write('releases: not implemented yet\n');
    });
}

export function registerSourcemapsCommand(program: Command): void {
  program
    .command('sourcemaps')
    .description('Upload sourcemaps tied to a release (placeholder).')
    .action(() => {
      // Implementation lands with a follow-up Feature.
      process.stdout.write('sourcemaps: not implemented yet\n');
    });
}
