import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, ConfigMissingError, type ConfigFlags } from './config.js';

const TOKEN_ENV = 'NEITHLY_API_TOKEN';
const URL_ENV = 'NEITHLY_API_URL';
const SLUG_ENV = 'NEITHLY_PROJECT_SLUG';

function withTempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'neithly-cli-config-'));
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function writeRc(dir: string, body: Record<string, string>): void {
  writeFileSync(join(dir, '.neithlyrc'), JSON.stringify(body), 'utf8');
}

describe('loadConfig', () => {
  let tmp: { dir: string; cleanup: () => void };

  beforeEach(() => {
    tmp = withTempDir();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it('reads all required fields from a .neithlyrc file', () => {
    writeRc(tmp.dir, {
      apiUrl: 'https://api.example.com',
      apiToken: 'tok-file',
      projectSlug: 'slug-file',
    });

    const config = loadConfig({ cwd: tmp.dir, env: {} });
    expect(config).toEqual({
      apiUrl: 'https://api.example.com',
      apiToken: 'tok-file',
      projectSlug: 'slug-file',
    });
  });

  it('env values override file values', () => {
    writeRc(tmp.dir, {
      apiUrl: 'https://file.example.com',
      apiToken: 'tok-file',
      projectSlug: 'slug-file',
    });

    const config = loadConfig({
      cwd: tmp.dir,
      env: {
        [URL_ENV]: 'https://env.example.com',
        [TOKEN_ENV]: 'tok-env',
      },
    });

    expect(config.apiUrl).toBe('https://env.example.com');
    expect(config.apiToken).toBe('tok-env');
    expect(config.projectSlug).toBe('slug-file');
  });

  it('flags override env and file values', () => {
    writeRc(tmp.dir, {
      apiUrl: 'https://file.example.com',
      apiToken: 'tok-file',
      projectSlug: 'slug-file',
    });

    const flags: ConfigFlags = {
      apiUrl: 'https://flag.example.com',
      apiToken: 'tok-flag',
      projectSlug: 'slug-flag',
    };

    const config = loadConfig({
      cwd: tmp.dir,
      env: {
        [URL_ENV]: 'https://env.example.com',
        [TOKEN_ENV]: 'tok-env',
        [SLUG_ENV]: 'slug-env',
      },
      flags,
    });

    expect(config).toEqual({
      apiUrl: 'https://flag.example.com',
      apiToken: 'tok-flag',
      projectSlug: 'slug-flag',
    });
  });

  it('throws ConfigMissingError listing every missing field when no source provides anything', () => {
    let caught: unknown;
    try {
      loadConfig({ cwd: tmp.dir, env: {} });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigMissingError);
    const err = caught as ConfigMissingError;
    expect(err.code).toBe('CONFIG_MISSING');
    expect(err.missing).toEqual(['apiUrl', 'apiToken', 'projectSlug']);
  });

  it('throws ConfigMissingError listing only the missing fields', () => {
    let caught: unknown;
    try {
      loadConfig({
        cwd: tmp.dir,
        env: { [TOKEN_ENV]: 'tok-env' },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigMissingError);
    expect((caught as ConfigMissingError).missing).toEqual(['apiUrl', 'projectSlug']);
  });

  it('ignores empty-string flag values and falls through to env', () => {
    const config = loadConfig({
      cwd: tmp.dir,
      env: {
        [URL_ENV]: 'https://env.example.com',
        [TOKEN_ENV]: 'tok-env',
        [SLUG_ENV]: 'slug-env',
      },
      flags: { apiUrl: '', apiToken: '   ' },
    });
    expect(config.apiUrl).toBe('https://env.example.com');
    expect(config.apiToken).toBe('tok-env');
  });
});
