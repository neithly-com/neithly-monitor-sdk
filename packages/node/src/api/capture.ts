/**
 * `captureException` / `captureMessage` — Sentry-shaped capture entry points.
 *
 * Each call snapshots the active scope, optionally layers in per-call context,
 * shapes the result into an `OtlpLogRecord` via `@neithly-com/monitor-core`,
 * and hands it to the module-scoped processor (no-op by default; a real
 * transport processor is wired in by a sibling Feature).
 *
 * Returns a freshly generated UUID — Sentry-compatible event id surface.
 */

import { randomUUID } from 'node:crypto';

import {
  shapeException,
  toOtlpLogRecord,
  type OtlpLogRecord,
  type ScopeSnapshot,
  type SeverityLevel,
  type UserContext,
} from '@neithly-com/monitor-core';

import { getActiveScope, getConfig, getProcessor } from './state.js';

/**
 * Optional per-call context. Merged on top of the active scope snapshot, then
 * passed to the shaper. Each field is shallow-merged on its respective slot.
 */
export interface CaptureContext {
  user?: UserContext | null;
  tags?: Record<string, string>;
  contexts?: Record<string, Record<string, unknown>>;
  extras?: Record<string, unknown>;
}

function mergeSnapshot(
  base: ScopeSnapshot,
  override: CaptureContext | undefined,
): ScopeSnapshot {
  if (override === undefined) {
    return base;
  }

  const user =
    override.user === undefined
      ? base.user
      : override.user === null
        ? null
        : { ...override.user };

  const tags = { ...base.tags };
  if (override.tags !== undefined) {
    for (const key of Object.keys(override.tags)) {
      const value = override.tags[key];
      if (value !== undefined) {
        tags[key] = value;
      }
    }
  }

  const contexts: Record<string, Record<string, unknown>> = {};
  for (const key of Object.keys(base.contexts)) {
    const bag = base.contexts[key];
    if (bag !== undefined) {
      contexts[key] = { ...bag };
    }
  }
  if (override.contexts !== undefined) {
    for (const key of Object.keys(override.contexts)) {
      const bag = override.contexts[key];
      if (bag !== undefined) {
        contexts[key] = { ...bag };
      }
    }
  }

  const extras: Record<string, unknown> = { ...base.extras };
  if (override.extras !== undefined) {
    for (const key of Object.keys(override.extras)) {
      extras[key] = override.extras[key];
    }
  }

  return {
    user,
    tags,
    contexts,
    extras,
    breadcrumbs: base.breadcrumbs,
  };
}

function emit(record: OtlpLogRecord): void {
  getProcessor().process(record);
}

/**
 * Capture a thrown value. Shapes it into `exception.*` attributes via
 * `shapeException` and emits an OTLP `LogRecord`. Returns the event id.
 *
 * Safe to call before `init()` — the default no-op processor swallows the
 * record without throwing.
 */
export function captureException(err: unknown, context?: CaptureContext): string {
  const config = getConfig();
  const snapshot = mergeSnapshot(getActiveScope().snapshot(), context);
  const exception = shapeException(err);

  const record = toOtlpLogRecord({
    scope: snapshot,
    exception,
    sdkName: config?.sdkName ?? '@neithly-com/monitor-node',
    sdkVersion: config?.sdkVersion ?? '0.0.0',
    ...(config?.release !== undefined ? { release: config.release } : {}),
    ...(config?.environment !== undefined ? { environment: config.environment } : {}),
  });

  emit(record);
  return randomUUID();
}

/**
 * Capture a freeform message. `level` defaults to `'info'`. Returns the event id.
 *
 * Safe to call before `init()` — the default no-op processor swallows the
 * record without throwing.
 */
export function captureMessage(
  message: string,
  level: SeverityLevel = 'info',
  context?: CaptureContext,
): string {
  const config = getConfig();
  const snapshot = mergeSnapshot(getActiveScope().snapshot(), context);

  const record = toOtlpLogRecord({
    scope: snapshot,
    message: { body: message, level },
    sdkName: config?.sdkName ?? '@neithly-com/monitor-node',
    sdkVersion: config?.sdkVersion ?? '0.0.0',
    ...(config?.release !== undefined ? { release: config.release } : {}),
    ...(config?.environment !== undefined ? { environment: config.environment } : {}),
  });

  emit(record);
  return randomUUID();
}
