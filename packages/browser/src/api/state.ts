/**
 * Module-scoped runtime state for the browser SDK public API.
 *
 * The browser SDK has a single global scope (no AsyncLocalStorage). All
 * `capture*`, scope mutators, and lifecycle helpers read/write the module-level
 * `Scope` and config bag declared here.
 *
 * A "sender" seam is exposed via `_setSenderForTest` so specs can replace the
 * outbound transport without standing up a real fetch exporter — the
 * transport/ subdirectory is owned by a sibling Feature and must not be
 * imported from here.
 */

import { Scope } from '@neithly-com/monitor-core';
import type {
  DsnEnvironment,
  MonitorEndpoints,
  OtlpLogRecord,
} from '@neithly-com/monitor-core';

/**
 * Anything we may want a sender to know about the shaped log record before it
 * goes on the wire. Today: just the record itself. Kept as a discriminated
 * payload so we can extend without breaking the seam contract.
 */
export interface SendPayload {
  record: OtlpLogRecord;
}

/**
 * Outbound sender: hands a shaped log record off to whatever transport the SDK
 * is wired against. May return a Promise that resolves when the record is in
 * the buffer or has been delivered — the API never awaits it from `capture*`.
 */
export type Sender = (payload: SendPayload) => void | Promise<void>;

/**
 * Resolved configuration captured at `init()` time. Fields are optional only
 * when the caller didn't supply them and we don't synthesise a default.
 */
export interface ResolvedConfig {
  publicKey: string;
  environment: string | undefined;
  release: string | undefined;
  endpoints: MonitorEndpoints;
}

interface State {
  initialised: boolean;
  config: ResolvedConfig | null;
  scope: Scope;
  sender: Sender;
}

function noopSender(): void {
  // Default sender swallows the payload. Replaced by transport/ at runtime,
  // or by specs via `_setSenderForTest`.
}

const state: State = {
  initialised: false,
  config: null,
  scope: new Scope(),
  sender: noopSender,
};

export function getScope(): Scope {
  return state.scope;
}

export function setScope(next: Scope): void {
  state.scope = next;
}

export function getConfig(): ResolvedConfig | null {
  return state.config;
}

export function setConfig(next: ResolvedConfig): void {
  state.config = next;
}

export function isInitialised(): boolean {
  return state.initialised;
}

export function markInitialised(): void {
  state.initialised = true;
}

export function getSender(): Sender {
  return state.sender;
}

/**
 * Test seam: replace the outbound sender. Intentionally not part of the
 * public `Neithly` surface — exported from this module only.
 */
export function _setSenderForTest(sender: Sender): void {
  state.sender = sender;
}

/**
 * Test seam: reset module state to a clean slate. Specs use this in
 * `beforeEach` so tests don't bleed scope into one another.
 */
export function _resetStateForTest(): void {
  state.initialised = false;
  state.config = null;
  state.scope = new Scope();
  state.sender = noopSender;
}

/**
 * Helper so init.ts can validate the environment field discriminant without
 * re-declaring the union.
 */
export type DsnEnvironmentValue = DsnEnvironment;
