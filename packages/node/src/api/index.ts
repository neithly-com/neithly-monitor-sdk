/**
 * Public surface of the `monitor-node` API Feature.
 *
 * Re-exports the individual functions and also exposes a `Neithly` singleton
 * object that bundles them so callers can do either:
 *
 *   import { init, captureException } from '@neithly-com/monitor-node';
 *   import { Neithly } from '@neithly-com/monitor-node';
 *
 *   Neithly.init({ dsn });
 *   Neithly.captureException(err);
 *
 * The package-level barrel (`src/index.ts`) is wired up by the verify phase;
 * this Feature only owns the `api/` subtree.
 */

import { captureException, captureMessage } from './capture.js';
import { init } from './init.js';
import { flush, shutdown } from './lifecycle.js';
import {
  addBreadcrumb,
  setContext,
  setExtra,
  setTags,
  setUser,
  withScope,
} from './scope-api.js';

export { init } from './init.js';
export type { InitOptions, InitSampling, Integration } from './init.js';
export { captureException, captureMessage } from './capture.js';
export type { CaptureContext } from './capture.js';
export {
  addBreadcrumb,
  setContext,
  setExtra,
  setTags,
  setUser,
  withScope,
} from './scope-api.js';
export { flush, shutdown } from './lifecycle.js';
export {
  _resetStateForTest,
  _setProcessorForTest,
  getActiveScope,
  getConfig,
  isInitialised,
} from './state.js';
export type { LogRecordProcessor, SdkConfig } from './state.js';

/**
 * Singleton handle bundling every public-API call. Convenience surface for
 * callers who prefer `Neithly.captureException(err)` over named imports.
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
