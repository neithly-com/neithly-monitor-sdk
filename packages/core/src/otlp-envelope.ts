/**
 * Shape a `ScopeSnapshot` (+ optional exception, message, SDK metadata) into the
 * OTLP/JSON `LogRecord` envelope expected by the `neithly-monitor` backend's
 * `/v1/logs` ingest.
 *
 * Pure logic: no HTTP, no DOM, no Node-only globals. The shapes here mirror
 * the on-the-wire JSON encoding of OTLP/HTTP for log records.
 */

import type { ScopeSnapshot } from './scope.js';
import type { ExceptionAttributes } from './exception.js';

export type SeverityLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface MessageInput {
  body: string;
  level?: SeverityLevel;
}

export interface ShapeOtlpLogRecordInput {
  scope: ScopeSnapshot;
  exception?: ExceptionAttributes;
  message?: MessageInput;
  release?: string;
  environment?: string;
  serviceName?: string;
  sdkName: string;
  sdkVersion: string;
}

export interface OtlpKeyValue {
  key: string;
  value: { stringValue: string };
}

export interface OtlpLogRecord {
  timeUnixNano: string;
  observedTimeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: { stringValue: string };
  attributes: OtlpKeyValue[];
}

export interface OtlpLogsRequest {
  resourceLogs: [
    {
      resource: { attributes: OtlpKeyValue[] };
      scopeLogs: [
        {
          scope: { name: string; version: string };
          logRecords: OtlpLogRecord[];
        },
      ];
    },
  ];
}

const SEVERITY_MAP: Record<SeverityLevel, number> = {
  debug: 5,
  info: 9,
  warning: 13,
  error: 17,
  fatal: 21,
};

const DEFAULT_SERVICE_NAME = 'neithly-monitor-sdk';
const BREADCRUMBS_BYTE_CAP = 16_384;

function nowMs(): number {
  return Date.now();
}

function msToUnixNano(ms: number): string {
  return (BigInt(ms) * 1_000_000n).toString();
}

function kv(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } };
}

function byteLength(s: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(s).length;
  }
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Serialise the breadcrumb array as JSON, capped at `BREADCRUMBS_BYTE_CAP`.
 * Drops oldest entries until the encoded form fits under the cap.
 */
function serialiseBreadcrumbsCapped(
  breadcrumbs: ScopeSnapshot['breadcrumbs'],
): string {
  const working = breadcrumbs.slice();
  let encoded = JSON.stringify(working);
  while (working.length > 0 && byteLength(encoded) > BREADCRUMBS_BYTE_CAP) {
    working.shift();
    encoded = JSON.stringify(working);
  }
  return encoded;
}

function severityFor(level: SeverityLevel): { number: number; text: string } {
  return { number: SEVERITY_MAP[level], text: level.toUpperCase() };
}

function resolveBody(input: ShapeOtlpLogRecordInput): string {
  if (input.message !== undefined) {
    return input.message.body;
  }
  if (input.exception !== undefined) {
    return input.exception['exception.message'];
  }
  return '';
}

function resolveLevel(input: ShapeOtlpLogRecordInput): SeverityLevel {
  if (input.message?.level !== undefined) {
    return input.message.level;
  }
  if (input.exception !== undefined) {
    return 'error';
  }
  return 'info';
}

/**
 * Shape a single OTLP `LogRecord`.
 */
export function toOtlpLogRecord(input: ShapeOtlpLogRecordInput): OtlpLogRecord {
  const ts = msToUnixNano(nowMs());
  const level = resolveLevel(input);
  const sev = severityFor(level);
  const body = resolveBody(input);
  const attributes: OtlpKeyValue[] = [];

  // exception.* attributes (only when exception provided)
  if (input.exception !== undefined) {
    attributes.push(kv('exception.type', input.exception['exception.type']));
    attributes.push(kv('exception.message', input.exception['exception.message']));
    attributes.push(
      kv('exception.stacktrace', input.exception['exception.stacktrace']),
    );
  }

  // user.* — only defined fields
  const user = input.scope.user;
  if (user !== null) {
    if (user.id !== undefined) {
      attributes.push(kv('user.id', user.id));
    }
    if (user.email !== undefined) {
      attributes.push(kv('user.email', user.email));
    }
    if (user.ip_address !== undefined) {
      attributes.push(kv('user.ip_address', user.ip_address));
    }
  }

  // tags → tag.<name>
  const tagKeys = Object.keys(input.scope.tags).sort();
  for (const name of tagKeys) {
    const value = input.scope.tags[name];
    if (value !== undefined) {
      attributes.push(kv(`tag.${name}`, value));
    }
  }

  // contexts → <namespace>.<key>, JSON-stringify value
  const contextNamespaces = Object.keys(input.scope.contexts).sort();
  for (const namespace of contextNamespaces) {
    const bag = input.scope.contexts[namespace];
    if (bag === undefined) {
      continue;
    }
    const keys = Object.keys(bag).sort();
    for (const key of keys) {
      const value = bag[key];
      attributes.push(kv(`${namespace}.${key}`, JSON.stringify(value) ?? 'null'));
    }
  }

  // extras → extra.<key>, JSON-stringify
  const extraKeys = Object.keys(input.scope.extras).sort();
  for (const key of extraKeys) {
    const value = input.scope.extras[key];
    attributes.push(kv(`extra.${key}`, JSON.stringify(value) ?? 'null'));
  }

  // breadcrumbs — JSON, capped at 16 KB (drop oldest)
  attributes.push(
    kv('neithly.breadcrumbs', serialiseBreadcrumbsCapped(input.scope.breadcrumbs)),
  );

  // SDK identity
  attributes.push(kv('neithly.sdk.name', input.sdkName));
  attributes.push(kv('neithly.sdk.version', input.sdkVersion));

  return {
    timeUnixNano: ts,
    observedTimeUnixNano: ts,
    severityNumber: sev.number,
    severityText: sev.text,
    body: { stringValue: body },
    attributes,
  };
}

/**
 * Wrap one or more `OtlpLogRecord` values in the resource/scope envelope
 * expected by OTLP/HTTP `/v1/logs`.
 */
export function toOtlpLogsRequest(
  records: OtlpLogRecord[],
  meta: Pick<
    ShapeOtlpLogRecordInput,
    'release' | 'environment' | 'serviceName' | 'sdkName' | 'sdkVersion'
  >,
): OtlpLogsRequest {
  const resourceAttributes: OtlpKeyValue[] = [];
  resourceAttributes.push(
    kv('service.name', meta.serviceName ?? DEFAULT_SERVICE_NAME),
  );
  if (meta.release !== undefined) {
    resourceAttributes.push(kv('service.version', meta.release));
  }
  if (meta.environment !== undefined) {
    resourceAttributes.push(kv('deployment.environment', meta.environment));
  }
  resourceAttributes.push(kv('telemetry.sdk.name', meta.sdkName));
  resourceAttributes.push(kv('telemetry.sdk.version', meta.sdkVersion));

  return {
    resourceLogs: [
      {
        resource: { attributes: resourceAttributes },
        scopeLogs: [
          {
            scope: { name: meta.sdkName, version: meta.sdkVersion },
            logRecords: records,
          },
        ],
      },
    ],
  };
}
