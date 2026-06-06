import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';

import {
  registerReleasesCreateCommand,
  type ReleasesCreateApiClient,
  type ReleasesCreateApiResponse,
  type ReleasesCreateConfig,
  type ReleasesCreateDeps,
} from './releases-create.js';

interface Harness {
  program: Command;
  client: { post: ReturnType<typeof vi.fn> };
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
  detect: ReturnType<typeof vi.fn>;
}

function buildHarness(opts: {
  config?: ReleasesCreateConfig;
  response?: ReleasesCreateApiResponse;
  detectReturn?: string | null;
}): Harness {
  const program = new Command();
  // Commander's default behaviour exits the process on parse errors; in tests
  // we just want to surface the error so the assertion can inspect it.
  program.exitOverride();

  const post = vi.fn(
    async (): Promise<ReleasesCreateApiResponse> =>
      opts.response ?? { status: 201, body: { id: 'rel_default' } },
  );
  const client: ReleasesCreateApiClient = { post };

  const log = vi.fn();
  const error = vi.fn();
  const exit = vi.fn();
  const detect = vi.fn(() => opts.detectReturn ?? null);

  const deps: ReleasesCreateDeps = {
    loadConfig: () => opts.config ?? {},
    createApiClient: () => client,
    detectVersion: detect,
    log,
    error,
    exit: exit as unknown as (code: number) => never,
  };

  registerReleasesCreateCommand(program, deps);

  return { program, client: { post }, log, error, exit, detect };
}

describe('registerReleasesCreateCommand', () => {
  it('POSTs to /projects/<slug>/releases with the supplied version and prints the id', async () => {
    const h = buildHarness({
      response: { status: 201, body: { id: 'rel_abc' } },
    });

    await h.program.parseAsync(
      ['releases', 'create', '--version', '1.2.3', '--project', 'web'],
      { from: 'user' },
    );

    expect(h.client.post).toHaveBeenCalledTimes(1);
    expect(h.client.post).toHaveBeenCalledWith('/projects/web/releases', {
      version: '1.2.3',
    });
    expect(h.log).toHaveBeenCalledWith('rel_abc');
    expect(h.error).not.toHaveBeenCalled();
    expect(h.exit).not.toHaveBeenCalled();
  });

  it('prints the existing id on HTTP 409', async () => {
    const h = buildHarness({
      response: { status: 409, body: { id: 'rel_existing' } },
    });

    await h.program.parseAsync(
      ['releases', 'create', '--version', '9.9.9', '--project', 'api'],
      { from: 'user' },
    );

    expect(h.client.post).toHaveBeenCalledWith('/projects/api/releases', {
      version: '9.9.9',
    });
    expect(h.log).toHaveBeenCalledWith('rel_existing');
    expect(h.exit).not.toHaveBeenCalled();
  });

  it('auto-detects the version from git when --version is omitted', async () => {
    const h = buildHarness({
      response: { status: 201, body: { id: 'rel_sha' } },
      detectReturn: 'abc1234',
    });

    await h.program.parseAsync(['releases', 'create', '--project', 'web'], {
      from: 'user',
    });

    expect(h.detect).toHaveBeenCalledTimes(1);
    expect(h.client.post).toHaveBeenCalledWith('/projects/web/releases', {
      version: 'abc1234',
    });
    expect(h.log).toHaveBeenCalledWith('rel_sha');
  });

  it('falls back to the default project from config when --project is omitted', async () => {
    const h = buildHarness({
      config: { project: 'default-proj' },
      response: { status: 201, body: { id: 'rel_d' } },
    });

    await h.program.parseAsync(
      ['releases', 'create', '--version', '2.0.0'],
      { from: 'user' },
    );

    expect(h.client.post).toHaveBeenCalledWith(
      '/projects/default-proj/releases',
      { version: '2.0.0' },
    );
  });

  it('errors when no project is available', async () => {
    const h = buildHarness({});

    await h.program.parseAsync(
      ['releases', 'create', '--version', '1.0.0'],
      { from: 'user' },
    );

    expect(h.client.post).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(1);
  });

  it('errors when version cannot be detected', async () => {
    const h = buildHarness({
      config: { project: 'web' },
      detectReturn: null,
    });

    await h.program.parseAsync(['releases', 'create'], { from: 'user' });

    expect(h.client.post).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(1);
  });

  it('errors on unexpected non-2xx, non-409 responses', async () => {
    const h = buildHarness({
      response: { status: 500, body: {} },
    });

    await h.program.parseAsync(
      ['releases', 'create', '--version', '1.0.0', '--project', 'web'],
      { from: 'user' },
    );

    expect(h.error).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(1);
    expect(h.log).not.toHaveBeenCalled();
  });
});
