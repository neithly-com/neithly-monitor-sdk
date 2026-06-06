import { describe, expect, it } from 'vitest';

import { buildNodeSdk } from './sdk.js';

const VALID_DSN =
  'nmk_dev_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('buildNodeSdk', () => {
  it('instantiates a NodeSDK and shuts down without throwing', async () => {
    const sdk = buildNodeSdk({
      dsn: VALID_DSN,
      endpoint: 'http://localhost:4318',
      serviceName: 'neithly-monitor-node-test',
      release: '0.0.0-test',
      sampling: 0.5,
    });

    expect(sdk).toBeDefined();
    await expect(sdk.shutdown()).resolves.not.toThrow();
  });

  it('accepts a minimal config (no release, no sampling, no environment)', async () => {
    const sdk = buildNodeSdk({
      dsn: VALID_DSN,
      endpoint: 'http://localhost:4318',
      serviceName: 'neithly-monitor-node-test-minimal',
    });

    expect(sdk).toBeDefined();
    await expect(sdk.shutdown()).resolves.not.toThrow();
  });

  it('throws DsnMalformedError when the DSN is invalid', () => {
    expect(() =>
      buildNodeSdk({
        dsn: 'not-a-valid-dsn',
        endpoint: 'http://localhost:4318',
        serviceName: 'neithly-monitor-node-test',
      }),
    ).toThrow(/DSN/);
  });
});
