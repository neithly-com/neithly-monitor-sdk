/**
 * `captureException` / `captureMessage` — shape an event from the current
 * module-scope `Scope` + caller input, hand it to the sender seam, and return
 * a synchronous event id.
 */

import {
  SDK_NAME as CORE_SDK_NAME,
  shapeException,
  toOtlpLogRecord,
} from '@neithly-com/monitor-core';
import type {
  OtlpLogRecord,
  SeverityLevel,
  ShapeOtlpLogRecordInput,
} from '@neithly-com/monitor-core';

import { getConfig, getScope, getSender } from './state.js';

const BROWSER_SDK_NAME = '@neithly-com/monitor-browser';
const BROWSER_SDK_VERSION = '0.0.0';
// `CORE_SDK_NAME` is re-exported by core; we keep a reference so the import
// isn't flagged as unused while still documenting the dependency.
void CORE_SDK_NAME;

/**
 * Cryptographically-cheap event id. We use `crypto.randomUUID()` when
 * available (all modern browsers + jsdom 29+) and fall back to a Math.random
 * hex string otherwise.
 */
function generateEventId(): string {
  const cryptoRef: Crypto | undefined =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  if (cryptoRef !== undefined && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID().replace(/-/g, '');
  }
  let out = '';
  for (let i = 0; i < 32; i += 1) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

function buildRecord(
  partial: Pick<ShapeOtlpLogRecordInput, 'exception' | 'message'>,
): OtlpLogRecord {
  const config = getConfig();
  const scope = getScope().snapshot();
  const input: ShapeOtlpLogRecordInput = {
    scope,
    sdkName: BROWSER_SDK_NAME,
    sdkVersion: BROWSER_SDK_VERSION,
  };
  if (partial.exception !== undefined) {
    input.exception = partial.exception;
  }
  if (partial.message !== undefined) {
    input.message = partial.message;
  }
  if (config !== null) {
    if (config.release !== undefined) {
      input.release = config.release;
    }
    if (config.environment !== undefined) {
      input.environment = config.environment;
    }
  }
  return toOtlpLogRecord(input);
}

function emit(record: OtlpLogRecord): void {
  // Sender may be async — we don't await it. The id is what callers care
  // about; delivery happens in the background.
  void getSender()({ record });
}

export function captureException(err: unknown): string {
  const exception = shapeException(err);
  const record = buildRecord({ exception });
  emit(record);
  return generateEventId();
}

export interface CaptureMessageOptions {
  level?: SeverityLevel;
}

export function captureMessage(
  message: string,
  options: CaptureMessageOptions = {},
): string {
  const messageInput =
    options.level !== undefined
      ? { body: message, level: options.level }
      : { body: message };
  const record = buildRecord({ message: messageInput });
  emit(record);
  return generateEventId();
}
