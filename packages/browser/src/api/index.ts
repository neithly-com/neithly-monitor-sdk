/**
 * Public surface of the browser SDK api/ Feature.
 *
 * This is the entrypoint that the package's top-level barrel (src/index.ts —
 * owned by the verify phase) will re-export from. We expose both the
 * individual function exports and a `Neithly` namespace-style singleton so
 * host code can write either:
 *
 *   import { init, captureException } from '@neithly-com/monitor-browser';
 *   import { Neithly } from '@neithly-com/monitor-browser';
 *   Neithly.init({ ... });
 *
 * The seam used by specs and the sibling transport/ Feature lives on
 * `lifecycle._setSenderForTest`.
 */

import { captureException, captureMessage } from './capture.js';
import type { CaptureMessageOptions } from './capture.js';
import { getResolvedConfig, init } from './init.js';
import type { BrowserIntegration, InitOptions } from './init.js';
import { _setSenderForTest, flush, shutdown } from './lifecycle.js';
import {
  addBreadcrumb,
  setContext,
  setExtra,
  setTags,
  setUser,
  withScope,
} from './scope-api.js';

export {
  addBreadcrumb,
  captureException,
  captureMessage,
  flush,
  getResolvedConfig,
  init,
  setContext,
  setExtra,
  setTags,
  setUser,
  shutdown,
  withScope,
  _setSenderForTest,
};

export type { BrowserIntegration, CaptureMessageOptions, InitOptions };

export type { SendPayload, Sender } from './state.js';

/**
 * Sentry-shaped singleton facade. Equivalent to the named exports above but
 * grouped behind one object so host code can import a single symbol.
 */
export const Neithly = {
  init,
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  setTags,
  setContext,
  setExtra,
  withScope,
  flush,
  shutdown,
} as const;
