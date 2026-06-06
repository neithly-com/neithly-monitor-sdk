import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OtlpKeyValue, OtlpLogRecord } from '@neithly-com/monitor-core';

import {
  Neithly,
  _resetStateForTest,
  _setProcessorForTest,
  addBreadcrumb,
  captureException,
  captureMessage,
  flush,
  getActiveScope,
  getConfig,
  init,
  isInitialised,
  setTags,
  setUser,
  shutdown,
  withScope,
  type LogRecordProcessor,
} from './index.js';

interface Sink extends LogRecordProcessor {
  records: OtlpLogRecord[];
  flushed: number;
  shutdownCalls: number;
}

function makeSink(): Sink {
  const records: OtlpLogRecord[] = [];
  let flushed = 0;
  let shutdownCalls = 0;
  const sink: Sink = {
    records,
    get flushed() {
      return flushed;
    },
    get shutdownCalls() {
      return shutdownCalls;
    },
    process(record: OtlpLogRecord) {
      records.push(record);
    },
    async flush() {
      flushed += 1;
      return true;
    },
    async shutdown() {
      shutdownCalls += 1;
    },
  };
  return sink;
}

function attr(record: OtlpLogRecord, key: string): string | undefined {
  const hit = record.attributes.find((kv: OtlpKeyValue) => kv.key === key);
  return hit?.value.stringValue;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_DSN = `nmk_dev_${'a'.repeat(64)}`;

describe('monitor-node api', () => {
  beforeEach(() => {
    _resetStateForTest();
  });

  afterEach(() => {
    _resetStateForTest();
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('parses the dsn and stores config state', () => {
      const cfg = init({ dsn: VALID_DSN, release: '1.2.3' });

      expect(isInitialised()).toBe(true);
      expect(cfg.dsn.environment).toBe('dev');
      expect(cfg.dsn.publicKey).toBe('a'.repeat(64));
      expect(cfg.release).toBe('1.2.3');
      // DSN-encoded environment is the default when caller omits it
      expect(cfg.environment).toBe('dev');
      expect(cfg.sdkName).toBe('@neithly-com/monitor-node');
      expect(getConfig()).toEqual(cfg);
    });

    it('lets an explicit environment override the DSN-encoded one', () => {
      const cfg = init({ dsn: VALID_DSN, environment: 'production' });
      expect(cfg.environment).toBe('production');
    });

    it('warns and ignores a second init call', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const first = init({ dsn: VALID_DSN, release: '1.0.0' });
      const second = init({ dsn: VALID_DSN, release: '9.9.9' });

      expect(warn).toHaveBeenCalledTimes(1);
      // Same config returned — second call did not overwrite release
      expect(second).toBe(first);
      expect(getConfig()?.release).toBe('1.0.0');
    });

    it('propagates DsnMalformedError for an invalid DSN', () => {
      expect(() => init({ dsn: 'not-a-dsn' })).toThrow();
      expect(isInitialised()).toBe(false);
    });
  });

  describe('captureException', () => {
    it('returns a UUID and emits a record with exception.* attributes', () => {
      const sink = makeSink();
      _setProcessorForTest(sink);
      init({ dsn: VALID_DSN });

      const id = captureException(new TypeError('boom'));

      expect(id).toMatch(UUID_RE);
      expect(sink.records).toHaveLength(1);
      const record = sink.records[0];
      expect(record).toBeDefined();
      if (record === undefined) return;

      expect(attr(record, 'exception.type')).toBe('TypeError');
      expect(attr(record, 'exception.message')).toBe('boom');
      expect(attr(record, 'exception.stacktrace')).toContain('TypeError');
      // exception → severity 'error' → SEVERITY_MAP[error] = 17
      expect(record.severityNumber).toBe(17);
      expect(record.severityText).toBe('ERROR');
    });

    it('merges per-call context on top of the active scope', () => {
      const sink = makeSink();
      _setProcessorForTest(sink);
      init({ dsn: VALID_DSN });

      setTags({ region: 'eu' });
      captureException(new Error('x'), {
        tags: { route: '/api/foo' },
        extras: { reqId: 'r-1' },
      });

      const record = sink.records[0];
      expect(record).toBeDefined();
      if (record === undefined) return;
      expect(attr(record, 'tag.region')).toBe('eu');
      expect(attr(record, 'tag.route')).toBe('/api/foo');
      expect(attr(record, 'extra.reqId')).toBe('"r-1"');
    });

    it('is safe to call before init() — the no-op processor swallows the record', () => {
      // No init, no seam swap: must not throw.
      const id = captureException(new Error('pre-init'));
      expect(id).toMatch(UUID_RE);
    });
  });

  describe('captureMessage', () => {
    it('emits with the requested severity and body', () => {
      const sink = makeSink();
      _setProcessorForTest(sink);
      init({ dsn: VALID_DSN });

      const id = captureMessage('hello world', 'warning');

      expect(id).toMatch(UUID_RE);
      const record = sink.records[0];
      expect(record).toBeDefined();
      if (record === undefined) return;
      expect(record.body.stringValue).toBe('hello world');
      expect(record.severityText).toBe('WARNING');
      // SEVERITY_MAP['warning'] = 13
      expect(record.severityNumber).toBe(13);
    });

    it('defaults severity to info when no level is passed', () => {
      const sink = makeSink();
      _setProcessorForTest(sink);
      init({ dsn: VALID_DSN });

      captureMessage('hi');
      const record = sink.records[0];
      expect(record).toBeDefined();
      if (record === undefined) return;
      expect(record.severityText).toBe('INFO');
      expect(record.severityNumber).toBe(9);
    });
  });

  describe('scope mutators', () => {
    it('addBreadcrumb + setUser + setTags flow through to the next capture', () => {
      const sink = makeSink();
      _setProcessorForTest(sink);
      init({ dsn: VALID_DSN });

      setUser({ id: 'u-42', email: 'a@b.c' });
      setTags({ release: 'v1', region: 'us' });
      addBreadcrumb({ category: 'nav', message: 'GET /', timestamp: 1_700_000_000_000 });

      captureMessage('event');

      const record = sink.records[0];
      expect(record).toBeDefined();
      if (record === undefined) return;
      expect(attr(record, 'user.id')).toBe('u-42');
      expect(attr(record, 'user.email')).toBe('a@b.c');
      expect(attr(record, 'tag.release')).toBe('v1');
      expect(attr(record, 'tag.region')).toBe('us');

      const breadcrumbsAttr = attr(record, 'neithly.breadcrumbs');
      expect(breadcrumbsAttr).toBeDefined();
      expect(breadcrumbsAttr).toContain('GET /');
      expect(breadcrumbsAttr).toContain('nav');
    });
  });

  describe('withScope', () => {
    it('isolates mutations from the parent scope', () => {
      const sink = makeSink();
      _setProcessorForTest(sink);
      init({ dsn: VALID_DSN });

      setTags({ region: 'eu' });

      withScope(() => {
        setTags({ region: 'us', route: '/x' });
        captureMessage('inside');
      });

      captureMessage('outside');

      expect(sink.records).toHaveLength(2);
      const inside = sink.records[0];
      const outside = sink.records[1];
      expect(inside).toBeDefined();
      expect(outside).toBeDefined();
      if (inside === undefined || outside === undefined) return;

      expect(attr(inside, 'tag.region')).toBe('us');
      expect(attr(inside, 'tag.route')).toBe('/x');
      // Parent scope was not touched
      expect(attr(outside, 'tag.region')).toBe('eu');
      expect(attr(outside, 'tag.route')).toBeUndefined();
    });

    it('remains async-safe across awaits', async () => {
      const sink = makeSink();
      _setProcessorForTest(sink);
      init({ dsn: VALID_DSN });

      setTags({ shared: 'parent' });

      const runChild = async (label: string, delayMs: number): Promise<void> => {
        await withScope(async () => {
          setTags({ child: label });
          // Two awaits with a microtask + macrotask hop — ALS must survive both.
          await Promise.resolve();
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delayMs);
          });
          captureMessage(`from-${label}`);
        });
      };

      await Promise.all([runChild('A', 10), runChild('B', 1)]);

      // Two captures, one per child scope.
      expect(sink.records).toHaveLength(2);
      const fromA = sink.records.find((r) => r.body.stringValue === 'from-A');
      const fromB = sink.records.find((r) => r.body.stringValue === 'from-B');
      expect(fromA).toBeDefined();
      expect(fromB).toBeDefined();
      if (fromA === undefined || fromB === undefined) return;

      // Each child saw only its own label, plus the parent's shared tag.
      expect(attr(fromA, 'tag.child')).toBe('A');
      expect(attr(fromA, 'tag.shared')).toBe('parent');
      expect(attr(fromB, 'tag.child')).toBe('B');
      expect(attr(fromB, 'tag.shared')).toBe('parent');

      // Parent scope is untouched by either child.
      expect(getActiveScope().snapshot().tags).toEqual({ shared: 'parent' });
    });

    it('returns the callback result so async values flow through', async () => {
      const value = await withScope(async () => 'ok');
      expect(value).toBe('ok');
    });
  });

  describe('lifecycle', () => {
    it('flush() resolves true when init was never called (no-op processor)', async () => {
      await expect(flush(50)).resolves.toBe(true);
    });

    it('shutdown() is a no-op when init was never called', async () => {
      await expect(shutdown()).resolves.toBeUndefined();
    });

    it('delegates to the processor when one is installed', async () => {
      const sink = makeSink();
      _setProcessorForTest(sink);

      await flush(123);
      await shutdown();

      expect(sink.flushed).toBe(1);
      expect(sink.shutdownCalls).toBe(1);
    });
  });

  describe('Neithly singleton', () => {
    it('exposes the same callable surface as the named exports', () => {
      const sink = makeSink();
      _setProcessorForTest(sink);
      Neithly.init({ dsn: VALID_DSN });
      Neithly.setUser({ id: 'singleton-user' });
      const id = Neithly.captureMessage('via-singleton', 'info');

      expect(id).toMatch(UUID_RE);
      const record = sink.records[0];
      expect(record).toBeDefined();
      if (record === undefined) return;
      expect(record.body.stringValue).toBe('via-singleton');
      expect(attr(record, 'user.id')).toBe('singleton-user');
    });
  });
});
