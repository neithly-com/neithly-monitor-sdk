/**
 * Module-scoped SDK state for `@neithly-com/monitor-node`.
 *
 * Holds:
 * - the global `Scope` returned by `getActiveScope()` when no async-local scope
 *   is in play;
 * - an `AsyncLocalStorage<Scope>` used by `withScope` so nested async work runs
 *   against a forked copy of the current scope;
 * - the parsed config bag established by `init()` (DSN, release, environment,
 *   SDK version, an `initialised` flag);
 * - an internal processor seam — the in-memory sink the specs drive via
 *   `_setProcessorForTest`. The default processor is a no-op so the SDK is
 *   safe to call before `init()` (capture-before-init is silently dropped) and
 *   before transport wiring lands.
 *
 * No HTTP, no integrations, no transport here — those live under sibling
 * directories that this Feature does not touch.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import {
  Scope,
  type OtlpLogRecord,
  type ParsedDsn,
} from '@neithly-com/monitor-core';

/**
 * Receives shaped `OtlpLogRecord`s built by `captureException` /
 * `captureMessage` and is responsible for delivery + lifecycle.
 *
 * The default implementation is a no-op; the test seam swaps in a sink, and
 * later Features (transport, batching) will swap in the real processor.
 */
export interface LogRecordProcessor {
  process(record: OtlpLogRecord): void;
  flush?(timeoutMs?: number): Promise<boolean>;
  shutdown?(): Promise<void>;
}

const NOOP_PROCESSOR: LogRecordProcessor = {
  process(): void {
    // intentional no-op — capture before init / before transport drops on the floor
  },
  async flush(): Promise<boolean> {
    return true;
  },
  async shutdown(): Promise<void> {
    return;
  },
};

/** Config bag established by `init()`. */
export interface SdkConfig {
  dsn: ParsedDsn;
  release: string | undefined;
  environment: string | undefined;
  sdkName: string;
  sdkVersion: string;
}

interface InternalState {
  initialised: boolean;
  config: SdkConfig | null;
  globalScope: Scope;
  asyncStorage: AsyncLocalStorage<Scope>;
  processor: LogRecordProcessor;
}

const STATE: InternalState = {
  initialised: false,
  config: null,
  globalScope: new Scope(),
  asyncStorage: new AsyncLocalStorage<Scope>(),
  processor: NOOP_PROCESSOR,
};

/** Returns the active scope: the ALS-bound one if inside `withScope`, else global. */
export function getActiveScope(): Scope {
  const local = STATE.asyncStorage.getStore();
  if (local !== undefined) {
    return local;
  }
  return STATE.globalScope;
}

/** Returns the always-shared global scope (used by top-level scope setters). */
export function getGlobalScope(): Scope {
  return STATE.globalScope;
}

/** Returns the ALS handle so `withScope` can run callbacks bound to a child scope. */
export function getAsyncStorage(): AsyncLocalStorage<Scope> {
  return STATE.asyncStorage;
}

export function isInitialised(): boolean {
  return STATE.initialised;
}

export function getConfig(): SdkConfig | null {
  return STATE.config;
}

export function markInitialised(config: SdkConfig): void {
  STATE.initialised = true;
  STATE.config = config;
}

export function getProcessor(): LogRecordProcessor {
  return STATE.processor;
}

/**
 * Test-only seam. Pass `null` to restore the default no-op processor.
 * Underscored to signal "internal" — exported only so specs can drive it.
 */
export function _setProcessorForTest(processor: LogRecordProcessor | null): void {
  STATE.processor = processor ?? NOOP_PROCESSOR;
}

/**
 * Test-only seam. Clears all module-scoped state so each spec gets a clean SDK.
 * Underscored to signal "internal" — exported only so specs can drive it.
 */
export function _resetStateForTest(): void {
  STATE.initialised = false;
  STATE.config = null;
  STATE.globalScope = new Scope();
  STATE.asyncStorage = new AsyncLocalStorage<Scope>();
  STATE.processor = NOOP_PROCESSOR;
}
