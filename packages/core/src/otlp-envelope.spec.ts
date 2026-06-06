import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExceptionAttributes } from './exception.js';
import type { ScopeSnapshot } from './scope.js';
import type { OtlpKeyValue, OtlpLogRecord, ShapeOtlpLogRecordInput } from './otlp-envelope.js';
import { toOtlpLogRecord, toOtlpLogsRequest } from './otlp-envelope.js';

function emptyScope(overrides: Partial<ScopeSnapshot> = {}): ScopeSnapshot {
  return {
    user: null,
    tags: {},
    contexts: {},
    extras: {},
    breadcrumbs: [],
    ...overrides,
  };
}

function findAttr(record: OtlpLogRecord, key: string): OtlpKeyValue | undefined {
  return record.attributes.find((a) => a.key === key);
}

function getAttr(record: OtlpLogRecord, key: string): string {
  const found = findAttr(record, key);
  if (found === undefined) {
    throw new Error(`attribute ${key} not found`);
  }
  return found.value.stringValue;
}

const MS = 1_700_000_000_000;
const SDK_META: Pick<ShapeOtlpLogRecordInput, 'sdkName' | 'sdkVersion'> = {
  sdkName: '@neithly-com/monitor-core',
  sdkVersion: '0.1.0',
};

describe('toOtlpLogRecord', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MS));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shapes an exception-only record (no message)', () => {
    const exception: ExceptionAttributes = {
      'exception.type': 'TypeError',
      'exception.message': 'cannot read x of undefined',
      'exception.stacktrace': 'TypeError: cannot read x of undefined\n    at foo',
    };
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope(),
      exception,
    });

    expect(record.severityNumber).toBe(17);
    expect(record.severityText).toBe('ERROR');
    expect(record.body.stringValue).toBe('cannot read x of undefined');
    expect(getAttr(record, 'exception.type')).toBe('TypeError');
    expect(getAttr(record, 'exception.message')).toBe('cannot read x of undefined');
    expect(getAttr(record, 'exception.stacktrace')).toContain('at foo');
    expect(record.timeUnixNano).toBe((BigInt(MS) * 1_000_000n).toString());
    expect(record.observedTimeUnixNano).toBe(record.timeUnixNano);
  });

  it('shapes a message-only record at default info level', () => {
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope(),
      message: { body: 'something happened' },
    });

    expect(record.body.stringValue).toBe('something happened');
    expect(record.severityNumber).toBe(9);
    expect(record.severityText).toBe('INFO');
    expect(findAttr(record, 'exception.type')).toBeUndefined();
  });

  it('honours explicit message level (warning)', () => {
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope(),
      message: { body: 'careful', level: 'warning' },
    });
    expect(record.severityNumber).toBe(13);
    expect(record.severityText).toBe('WARNING');
  });

  it('honours fatal message level', () => {
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope(),
      message: { body: 'down', level: 'fatal' },
    });
    expect(record.severityNumber).toBe(21);
    expect(record.severityText).toBe('FATAL');
  });

  it('honours debug message level', () => {
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope(),
      message: { body: 'noisy', level: 'debug' },
    });
    expect(record.severityNumber).toBe(5);
    expect(record.severityText).toBe('DEBUG');
  });

  it('lets message win body when both message and exception are provided', () => {
    const exception: ExceptionAttributes = {
      'exception.type': 'Error',
      'exception.message': 'underlying error',
      'exception.stacktrace': 'Error: underlying error\n    at bar',
    };
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope(),
      exception,
      message: { body: 'human description' },
    });
    expect(record.body.stringValue).toBe('human description');
    expect(getAttr(record, 'exception.type')).toBe('Error');
    expect(getAttr(record, 'exception.message')).toBe('underlying error');
  });

  it('flattens tags into tag.<name> attributes', () => {
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope({
        tags: { region: 'eu-west-3', tier: 'premium' },
      }),
      message: { body: 'ok' },
    });
    expect(getAttr(record, 'tag.region')).toBe('eu-west-3');
    expect(getAttr(record, 'tag.tier')).toBe('premium');
  });

  it('spreads user fields only when defined', () => {
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope({
        user: { id: 'u-123', email: 'alice@example.com' },
      }),
      message: { body: 'ok' },
    });
    expect(getAttr(record, 'user.id')).toBe('u-123');
    expect(getAttr(record, 'user.email')).toBe('alice@example.com');
    expect(findAttr(record, 'user.ip_address')).toBeUndefined();
  });

  it('JSON-stringifies context values under <namespace>.<key>', () => {
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope({
        contexts: {
          runtime: { name: 'node', version: 20 },
          app: { feature_flags: ['exp_a', 'exp_b'] },
        },
      }),
      message: { body: 'ok' },
    });
    expect(getAttr(record, 'runtime.name')).toBe(JSON.stringify('node'));
    expect(getAttr(record, 'runtime.version')).toBe('20');
    expect(getAttr(record, 'app.feature_flags')).toBe(
      JSON.stringify(['exp_a', 'exp_b']),
    );
  });

  it('JSON-stringifies extras under extra.<key>', () => {
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope({
        extras: { request_id: 'req-1', payload: { n: 1 } },
      }),
      message: { body: 'ok' },
    });
    expect(getAttr(record, 'extra.request_id')).toBe(JSON.stringify('req-1'));
    expect(getAttr(record, 'extra.payload')).toBe(JSON.stringify({ n: 1 }));
  });

  it('serialises breadcrumbs as JSON under neithly.breadcrumbs', () => {
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope({
        breadcrumbs: [
          { category: 'nav', message: 'click', timestamp: 1 },
          { category: 'http', message: 'GET /x', timestamp: 2 },
        ],
      }),
      message: { body: 'ok' },
    });
    const raw = getAttr(record, 'neithly.breadcrumbs');
    const parsed = JSON.parse(raw) as Array<{ category: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.category).toBe('nav');
    expect(parsed[1]?.category).toBe('http');
  });

  it('caps breadcrumbs payload at 16 KB, dropping the oldest entries', () => {
    // Build many breadcrumbs with sufficiently large data to blow past 16 KB.
    const breadcrumbs = Array.from({ length: 200 }, (_, i) => ({
      category: 'spam',
      message: 'x'.repeat(500),
      timestamp: i,
    }));
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope({ breadcrumbs }),
      message: { body: 'ok' },
    });
    const raw = getAttr(record, 'neithly.breadcrumbs');
    expect(raw.length).toBeLessThanOrEqual(16_384);
    const parsed = JSON.parse(raw) as Array<{ timestamp: number }>;
    expect(parsed.length).toBeLessThan(breadcrumbs.length);
    // Oldest dropped first → first surviving timestamp > 0.
    expect(parsed[0]?.timestamp).toBeGreaterThan(0);
    // Last entry is preserved.
    expect(parsed[parsed.length - 1]?.timestamp).toBe(199);
  });

  it('always emits neithly.sdk.name and neithly.sdk.version', () => {
    const record = toOtlpLogRecord({
      ...SDK_META,
      scope: emptyScope(),
      message: { body: 'ok' },
    });
    expect(getAttr(record, 'neithly.sdk.name')).toBe('@neithly-com/monitor-core');
    expect(getAttr(record, 'neithly.sdk.version')).toBe('0.1.0');
  });
});

describe('toOtlpLogsRequest', () => {
  it('wraps records with the right resource attrs and scope identity', () => {
    const dummyRecord: OtlpLogRecord = {
      timeUnixNano: '0',
      observedTimeUnixNano: '0',
      severityNumber: 9,
      severityText: 'INFO',
      body: { stringValue: 'hi' },
      attributes: [],
    };
    const request = toOtlpLogsRequest([dummyRecord], {
      release: '1.2.3',
      environment: 'production',
      serviceName: 'auth-web',
      sdkName: '@neithly-com/monitor-node',
      sdkVersion: '0.1.0',
    });

    expect(request.resourceLogs).toHaveLength(1);
    const [outer] = request.resourceLogs;
    const attrs = outer.resource.attributes;
    const byKey = (k: string): string => {
      const found = attrs.find((a) => a.key === k);
      if (found === undefined) {
        throw new Error(`resource attr ${k} not found`);
      }
      return found.value.stringValue;
    };
    expect(byKey('service.name')).toBe('auth-web');
    expect(byKey('service.version')).toBe('1.2.3');
    expect(byKey('deployment.environment')).toBe('production');
    expect(byKey('telemetry.sdk.name')).toBe('@neithly-com/monitor-node');
    expect(byKey('telemetry.sdk.version')).toBe('0.1.0');

    const [scopeLog] = outer.scopeLogs;
    expect(scopeLog.scope.name).toBe('@neithly-com/monitor-node');
    expect(scopeLog.scope.version).toBe('0.1.0');
    expect(scopeLog.logRecords).toEqual([dummyRecord]);
  });

  it('defaults serviceName to neithly-monitor-sdk and omits release / env when absent', () => {
    const request = toOtlpLogsRequest([], {
      sdkName: '@neithly-com/monitor-core',
      sdkVersion: '0.1.0',
    });
    const attrs = request.resourceLogs[0].resource.attributes;
    const keys = attrs.map((a) => a.key);
    expect(attrs.find((a) => a.key === 'service.name')?.value.stringValue).toBe(
      'neithly-monitor-sdk',
    );
    expect(keys).not.toContain('service.version');
    expect(keys).not.toContain('deployment.environment');
    expect(keys).toContain('telemetry.sdk.name');
    expect(keys).toContain('telemetry.sdk.version');
  });
});
