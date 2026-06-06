import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getResolvedConfig, init } from './init.js';
import { _resetStateForTest, isInitialised } from './state.js';

const VALID_DSN = `nmk_live_${'a'.repeat(64)}`;

describe('init', () => {
  beforeEach(() => {
    _resetStateForTest();
  });

  it('parses the DSN and resolves endpoints from the default ingest origin', () => {
    init({ dsn: VALID_DSN });

    const config = getResolvedConfig();
    expect(config).not.toBeNull();
    expect(config?.publicKey).toBe('a'.repeat(64));
    expect(config?.environment).toBe('live');
    expect(config?.endpoints.logs).toBe('https://ingest.neithly.com/v1/logs');
    expect(isInitialised()).toBe(true);
  });

  it('honours an explicit environment over the DSN-derived one', () => {
    init({ dsn: VALID_DSN, environment: 'qa' });
    expect(getResolvedConfig()?.environment).toBe('qa');
  });

  it('uses the tunnel origin when provided', () => {
    init({ dsn: VALID_DSN, tunnel: 'https://proxy.example/monitor' });
    expect(getResolvedConfig()?.endpoints.logs).toBe(
      'https://proxy.example/monitor/v1/logs',
    );
  });

  it('captures the release option', () => {
    init({ dsn: VALID_DSN, release: '1.2.3' });
    expect(getResolvedConfig()?.release).toBe('1.2.3');
  });

  it('warns and no-ops on a second call', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    init({ dsn: VALID_DSN, release: 'first' });
    init({ dsn: VALID_DSN, release: 'second' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('init() called more than once');
    expect(getResolvedConfig()?.release).toBe('first');

    warn.mockRestore();
  });

  it('throws on a malformed DSN', () => {
    expect(() => init({ dsn: 'not-a-dsn' })).toThrow();
    expect(isInitialised()).toBe(false);
  });
});
