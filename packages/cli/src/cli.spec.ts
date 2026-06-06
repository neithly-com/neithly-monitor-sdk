import { describe, it, expect, vi } from 'vitest';

import { createProgram } from './cli.js';

describe('createProgram', () => {
  it('exposes monitor name and version', () => {
    const program = createProgram();
    expect(program.name()).toBe('monitor');
    expect(program.version()).toBe('0.1.0');
  });

  it('registers the releases and sourcemaps subcommands', () => {
    const program = createProgram();
    const names = program.commands.map((cmd) => cmd.name()).sort();
    expect(names).toContain('releases');
    expect(names).toContain('sourcemaps');
  });

  it('--help exits with code 0 and lists subcommands', async () => {
    const program = createProgram();
    program.exitOverride();

    let output = '';
    program.configureOutput({
      writeOut: (chunk) => {
        output += chunk;
      },
      writeErr: (chunk) => {
        output += chunk;
      },
    });

    let caught: unknown;
    try {
      await program.parseAsync(['--help'], { from: 'user' });
    } catch (err) {
      caught = err;
    }

    // commander throws a CommanderError with exitCode === 0 on --help under exitOverride.
    expect(caught).toBeDefined();
    const error = caught as { exitCode?: number; code?: string };
    expect(error.exitCode).toBe(0);
    expect(output).toContain('releases');
    expect(output).toContain('sourcemaps');
    expect(output).toContain('Usage:');
  });

  it('--version prints the CLI version', async () => {
    const program = createProgram();
    program.exitOverride();

    let output = '';
    program.configureOutput({
      writeOut: (chunk) => {
        output += chunk;
      },
      writeErr: (chunk) => {
        output += chunk;
      },
    });

    let caught: unknown;
    try {
      await program.parseAsync(['--version'], { from: 'user' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { exitCode?: number }).exitCode).toBe(0);
    expect(output).toContain('0.1.0');
  });

  it('placeholder subcommands write a not-implemented message', async () => {
    const program = createProgram();
    program.exitOverride();

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await program.parseAsync(['releases'], { from: 'user' });
      const written = stdoutSpy.mock.calls.map((args) => String(args[0])).join('');
      expect(written).toContain('releases');
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});
