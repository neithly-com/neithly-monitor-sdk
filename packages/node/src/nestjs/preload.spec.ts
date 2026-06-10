/**
 * Unit tests for {@link preloadMonitor}.
 *
 * Drives the env-bag branches in isolation: missing DSN in production must
 * throw, missing DSN elsewhere skips quietly, and a valid DSN initialises the
 * SDK + installs uncaught handlers (verified through the public
 * {@link isInitialised} flag).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetStateForTest, isInitialised } from '../api/state.js';
import { MissingMonitorDsnError, _resetPreloadForTesting, preloadMonitor } from './preload.js';

const VALID_DSN = 'nmk_dev_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('preloadMonitor', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetStateForTest();
    _resetPreloadForTesting();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetPreloadForTesting();
    _resetStateForTest();
  });

  it('throws MissingMonitorDsnError when MONITOR_DSN unset in production', () => {
    expect(() =>
      preloadMonitor({
        env: { NODE_ENV: 'production' },
      }),
    ).toThrowError(MissingMonitorDsnError);
  });

  it('warns and skips when MONITOR_DSN unset outside production', () => {
    preloadMonitor({ env: { NODE_ENV: 'development' } });
    expect(warnSpy).toHaveBeenCalled();
    expect(isInitialised()).toBe(false);
  });

  it('initialises the SDK when MONITOR_DSN is set', () => {
    preloadMonitor({
      env: {
        MONITOR_DSN: VALID_DSN,
        MONITOR_ENV: 'test',
        NODE_ENV: 'test',
      },
      serviceName: 'svc-test',
    });
    expect(isInitialised()).toBe(true);
    expect(logSpy).toHaveBeenCalled();
  });

  it('is idempotent — second call is a logged no-op', () => {
    preloadMonitor({
      env: { MONITOR_DSN: VALID_DSN, NODE_ENV: 'test' },
    });
    preloadMonitor({
      env: { MONITOR_DSN: VALID_DSN, NODE_ENV: 'test' },
    });
    // Exactly one "initialised" log — second call short-circuits.
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('called twice'));
  });

  it('falls back to NODE_ENV for environment when MONITOR_ENV is unset', () => {
    preloadMonitor({
      env: { MONITOR_DSN: VALID_DSN, NODE_ENV: 'staging' },
    });
    // No direct getter for environment, but the SDK log line includes it.
    const logLine = String(logSpy.mock.calls.at(-1)?.[0] ?? '');
    expect(logLine).toContain('env=staging');
  });

  it('reads npm_package_version as the release tag', () => {
    preloadMonitor({
      env: {
        MONITOR_DSN: VALID_DSN,
        NODE_ENV: 'test',
        npm_package_version: '0.2.0',
      },
    });
    const logLine = String(logSpy.mock.calls.at(-1)?.[0] ?? '');
    expect(logLine).toContain('release=0.2.0');
  });
});
