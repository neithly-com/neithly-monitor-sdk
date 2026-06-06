import { describe, it, expect, vi } from 'vitest';

import { detectVersion, type GitRunner } from './git.js';

describe('detectVersion', () => {
  it('returns the tag when git describe --tags --exact-match succeeds', () => {
    const runner = vi.fn<GitRunner>((command) => {
      if (command.includes('describe')) return 'v1.2.3\n';
      throw new Error('should not reach rev-parse');
    });

    expect(detectVersion(runner)).toBe('v1.2.3');
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]?.[0]).toBe('git describe --tags --exact-match');
  });

  it('falls back to short SHA when describe throws', () => {
    const runner = vi.fn<GitRunner>((command) => {
      if (command.includes('describe')) {
        throw new Error('fatal: no tag exactly matches');
      }
      if (command.includes('rev-parse')) return 'abc1234\n';
      throw new Error(`unexpected: ${command}`);
    });

    expect(detectVersion(runner)).toBe('abc1234');
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner.mock.calls[1]?.[0]).toBe('git rev-parse --short HEAD');
  });

  it('returns null when both git commands throw', () => {
    const runner = vi.fn<GitRunner>(() => {
      throw new Error('not a git repository');
    });

    expect(detectVersion(runner)).toBeNull();
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('treats empty stdout as a miss and falls back', () => {
    const runner = vi.fn<GitRunner>((command) => {
      if (command.includes('describe')) return '\n';
      if (command.includes('rev-parse')) return 'deadbee\n';
      throw new Error(`unexpected: ${command}`);
    });

    expect(detectVersion(runner)).toBe('deadbee');
  });
});
