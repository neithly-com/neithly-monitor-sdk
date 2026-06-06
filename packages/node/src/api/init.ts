/**
 * `init({ dsn, release?, environment?, ... })` — Sentry-shaped entry point.
 *
 * This Feature only owns the public-API state transition: parse the DSN via
 * `@neithly-com/monitor-core`, stash a config bag in module state, and warn on
 * double-init. The actual transport/integrations wiring lands in sibling
 * Features; until then `init()` leaves the no-op processor in place and specs
 * drive the seam directly.
 */

import { parseDsn } from '@neithly-com/monitor-core';

import { getConfig, isInitialised, markInitialised, type SdkConfig } from './state.js';

/**
 * Sampling knobs accepted by `init`. Kept loose at this layer — actual
 * sampling is enforced downstream by the transport/integrations Features.
 */
export interface InitSampling {
  tracesSampleRate?: number;
  errorSampleRate?: number;
}

/**
 * Free-form integration handle. Real integration plumbing lives in the
 * integrations Feature; this layer only carries the array around so the
 * public surface matches Sentry's shape.
 */
export interface Integration {
  name: string;
}

export interface InitOptions {
  dsn: string;
  release?: string;
  environment?: string;
  integrations?: readonly Integration[];
  sampling?: InitSampling;
}

/** SDK package name + version, surfaced on every OTLP record. */
const SDK_NAME = '@neithly-com/monitor-node';
// Sourced from package.json at this Feature's altitude; the build pipeline
// substitutes the real version. Keep in sync with package.json.
const SDK_VERSION = '0.0.0';

/**
 * Initialise the SDK. Idempotent: a second call warns and returns the
 * already-established config without re-parsing.
 */
export function init(options: InitOptions): SdkConfig {
  if (isInitialised()) {
    const existing = getConfig();
     
    console.warn(
      '[@neithly-com/monitor-node] init() called more than once; ignoring subsequent call.',
    );
    if (existing !== null) {
      return existing;
    }
  }

  const dsn = parseDsn(options.dsn);

  // Default environment falls back to the DSN-encoded one when the caller
  // didn't pass one explicitly. `parseDsn` returns `null` for bare-hex DSNs.
  const environment =
    options.environment ?? (dsn.environment === null ? undefined : dsn.environment);

  const config: SdkConfig = {
    dsn,
    release: options.release,
    environment,
    sdkName: SDK_NAME,
    sdkVersion: SDK_VERSION,
  };

  markInitialised(config);
  return config;
}
