/**
 * End-to-end test for the Express integration.
 *
 * Wires `expressRequestHandler` + `expressErrorHandler` around a tiny Express
 * app whose one route throws synchronously, drives it with supertest, and
 * asserts the mock collector (installed via `_setProcessorForTest`) receives a
 * single OTLP `LogRecord` carrying `exception.*` attributes plus the request
 * `tag.method` / `tag.url` / `tag.requestId` tags pushed by the request
 * handler.
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { OtlpLogRecord } from '@neithly-com/monitor-core';

import { _setProcessorForTest, type LogRecordProcessor } from '../api/state.js';
import { expressErrorHandler, expressRequestHandler } from './express.js';

function attr(record: OtlpLogRecord, key: string): string | undefined {
  const found = record.attributes.find((a) => a.key === key);
  return found?.value.stringValue;
}

function makeMockProcessor(): {
  processor: LogRecordProcessor;
  received: OtlpLogRecord[];
} {
  const received: OtlpLogRecord[] = [];
  const processor: LogRecordProcessor = {
    process(record: OtlpLogRecord): void {
      received.push(record);
    },
    async flush(): Promise<boolean> {
      return true;
    },
    async shutdown(): Promise<void> {
      return;
    },
  };
  return { processor, received };
}

describe('express integration', () => {
  let received: OtlpLogRecord[];

  beforeEach(() => {
    const mock = makeMockProcessor();
    received = mock.received;
    _setProcessorForTest(mock.processor);
  });

  afterEach(() => {
    _setProcessorForTest(null);
  });

  it('captures an uncaught error from a route and tags the request', async () => {
    const app = express();
    app.use(expressRequestHandler());
    app.get('/boom', (_req, _res) => {
      throw new Error('boom-from-route');
    });
    app.use(expressErrorHandler());

    const response = await request(app)
      .get('/boom')
      .set('x-request-id', 'req-test-123');

    expect(response.status).toBe(500);
    expect(received).toHaveLength(1);

    const record = received[0];
    if (record === undefined) {
      throw new Error('expected a record');
    }

    // exception.* attributes from shapeException
    expect(attr(record, 'exception.type')).toBe('Error');
    expect(attr(record, 'exception.message')).toBe('boom-from-route');
    expect(attr(record, 'exception.stacktrace')).toBeDefined();

    // request tags pushed by expressRequestHandler
    expect(attr(record, 'tag.method')).toBe('GET');
    expect(attr(record, 'tag.url')).toBe('/boom');
    expect(attr(record, 'tag.requestId')).toBe('req-test-123');
  });

  it('does not capture a 4xx error forwarded via next(err)', async () => {
    const app = express();
    app.use(expressRequestHandler());
    app.get('/forbidden', (_req, _res, next) => {
      const err = Object.assign(new Error('nope'), { status: 403 });
      next(err);
    });
    app.use(expressErrorHandler());

    const response = await request(app).get('/forbidden');
    expect(response.status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('captures a 5xx error forwarded via next(err)', async () => {
    const app = express();
    app.use(expressRequestHandler());
    app.get('/bad-gateway', (_req, _res, next) => {
      const err = Object.assign(new Error('upstream down'), { status: 502 });
      next(err);
    });
    app.use(expressErrorHandler());

    const response = await request(app).get('/bad-gateway');
    expect(response.status).toBe(502);
    expect(received).toHaveLength(1);
    const record = received[0];
    if (record === undefined) {
      throw new Error('expected a record');
    }
    expect(attr(record, 'exception.message')).toBe('upstream down');
  });
});
