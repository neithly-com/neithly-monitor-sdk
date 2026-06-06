/**
 * `init()` — entry point that wires DSN, environment, release, and an optional
 * `tunnel` override into module state. Subsequent calls warn and no-op so users
 * can't accidentally re-initialise the SDK from a hot-reloaded module.
 */

import { parseDsn, resolveEndpoints } from '@neithly-com/monitor-core';
import type { MonitorEndpoints } from '@neithly-com/monitor-core';

import {
  getConfig,
  isInitialised,
  markInitialised,
  setConfig,
  type ResolvedConfig,
} from './state.js';

const DEFAULT_INGEST_ORIGIN = 'https://ingest.neithly.com';

/**
 * Stand-in placeholder for an integration the host app may want the SDK to
 * register at init time. The browser SDK's integration runtime lives behind a
 * sibling Feature so we only model the type here — `init()` just stashes them
 * for that Feature to pick up later.
 */
export interface BrowserIntegration {
  name: string;
  setup?(): void;
}

export interface InitOptions {
  dsn: string;
  release?: string;
  environment?: string;
  /**
   * Override the ingest origin. Useful when the host app proxies through its
   * own backend to hide the DSN from the browser network panel.
   */
  tunnel?: string;
  integrations?: ReadonlyArray<BrowserIntegration>;
}

function resolveEndpointsForConfig(
  tunnel: string | undefined,
): MonitorEndpoints {
  if (tunnel !== undefined && tunnel !== '') {
    return resolveEndpoints(tunnel);
  }
  return resolveEndpoints(DEFAULT_INGEST_ORIGIN);
}

function emitDoubleInitWarning(): void {
  // Use the global console directly; we don't want to feed the warning back
  // into our own breadcrumb pipeline.
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(
      '[neithly-monitor] init() called more than once — the second call was ignored.',
    );
  }
}

export function init(options: InitOptions): void {
  if (isInitialised()) {
    emitDoubleInitWarning();
    return;
  }

  const parsed = parseDsn(options.dsn);
  const endpoints = resolveEndpointsForConfig(options.tunnel);

  // Environment precedence: explicit option > DSN-derived > undefined.
  const environment: string | undefined =
    options.environment !== undefined
      ? options.environment
      : parsed.environment !== null
        ? parsed.environment
        : undefined;

  const config: ResolvedConfig = {
    publicKey: parsed.publicKey,
    environment,
    release: options.release,
    endpoints,
  };

  setConfig(config);
  markInitialised();

  // Integrations are accepted but not wired here — the integrations/ Feature
  // owns the runtime. We touch the array so unused-parameter lints don't fire.
  if (options.integrations !== undefined) {
    void options.integrations;
  }
}

/**
 * Read-only view of the resolved config. Returns `null` until `init()` has
 * been called.
 */
export function getResolvedConfig(): ResolvedConfig | null {
  return getConfig();
}
