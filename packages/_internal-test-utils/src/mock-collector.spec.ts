import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  Scope,
  shapeException,
  toOtlpLogRecord,
  toOtlpLogsRequest,
} from '@neithly-com/monitor-core';
import type { OtlpLogsRequest } from '@neithly-com/monitor-core';

import { createMockCollector, type MockCollector } from './mock-collector.js';

const SDK_META = {
  sdkName: '@neithly-com/monitor-node',
  sdkVersion: '0.0.0-test',
  serviceName: 'mock-collector-spec',
  release: '0.0.0-test',
  environment: 'test',
};

function buildLogsRequest(opts: {
  err?: unknown;
  message?: string;
  tags?: Record<string, string>;
}): OtlpLogsRequest {
  const scope = new Scope();
  if (opts.tags !== undefined) {
    scope.setTags(opts.tags);
  }
  const exception =
    opts.err !== undefined ? shapeException(opts.err) : undefined;
  const record = toOtlpLogRecord({
    scope: scope.snapshot(),
    ...(exception !== undefined ? { exception } : {}),
    ...(opts.message !== undefined
      ? { message: { body: opts.message, level: 'info' as const } }
      : {}),
    sdkName: SDK_META.sdkName,
    sdkVersion: SDK_META.sdkVersion,
    release: SDK_META.release,
    environment: SDK_META.environment,
    serviceName: SDK_META.serviceName,
  });
  return toOtlpLogsRequest([record], SDK_META);
}

async function postLogs(
  collector: MockCollector,
  envelope: OtlpLogsRequest,
): Promise<Response> {
  return fetch(`${collector.endpoint}/v1/logs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(envelope),
  });
}

describe('createMockCollector', () => {
  let collector: MockCollector;

  beforeEach(async () => {
    collector = await createMockCollector({ defaultTimeoutMs: 1000 });
  });

  afterEach(async () => {
    await collector.close();
  });

  it('resolves with a bound port and endpoint', () => {
    expect(collector.port).toBeGreaterThan(0);
    expect(collector.endpoint).toBe(`http://127.0.0.1:${collector.port}`);
  });

  it('accepts a valid OTLP logs envelope and records it', async () => {
    const envelope = buildLogsRequest({
      err: new RangeError('boom from spec'),
      tags: { feature: 'qa-integration' },
    });

    const res = await postLogs(collector, envelope);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { partialSuccess: unknown };
    expect(body).toEqual({ partialSuccess: {} });

    expect(collector.received.length).toBe(1);
    const recorded = collector.received[0];
    expect(recorded).toBeDefined();
    expect(recorded?.path).toBe('/v1/logs');
    expect(recorded?.method).toBe('POST');
    expect(recorded?.headers['content-type']).toMatch(/application\/json/);
  });

  it('nextRequest() with no predicate resolves with the recorded request', async () => {
    const envelope = buildLogsRequest({ message: 'hello' });
    await postLogs(collector, envelope);

    const req = await collector.nextRequest();
    expect(req.path).toBe('/v1/logs');
    expect(req.method).toBe('POST');
  });

  it('nextRequest() times out with a debuggable error', async () => {
    const envelope = buildLogsRequest({ message: 'noise' });
    await postLogs(collector, envelope);

    await expect(
      collector.nextRequest((r) => r.path === '/v1/traces', { timeoutMs: 50 }),
    ).rejects.toThrow(/received 1 request/);
  });

  it('two awaits of nextRequest() resolve with distinct recorded requests', async () => {
    await postLogs(collector, buildLogsRequest({ message: 'first' }));
    await postLogs(collector, buildLogsRequest({ message: 'second' }));

    const a = await collector.nextRequest();
    const b = await collector.nextRequest();

    expect(a.receivedAt).toBeLessThanOrEqual(b.receivedAt);
    expect(a).not.toBe(b);
  });

  it('assertLogRecord returns the matched record', async () => {
    await postLogs(
      collector,
      buildLogsRequest({ err: new RangeError('range issue') }),
    );

    const rec = collector.assertLogRecord({
      exception: { type: 'RangeError' },
    });
    expect(rec.attributes.find((a) => a.key === 'exception.type')?.value.stringValue).toBe(
      'RangeError',
    );
  });

  it('assertLogRecord throws a useful message when no record matches', async () => {
    await postLogs(
      collector,
      buildLogsRequest({ err: new RangeError('not the one') }),
    );

    expect(() =>
      collector.assertLogRecord({ exception: { type: 'TypeError' } }),
    ).toThrow(/no log record matched/);
  });

  it('waitForLogRecord resolves when a matching record arrives later', async () => {
    const waitPromise = collector.waitForLogRecord(
      { attributes: { 'tag.feature': /qa-integration/ } },
      { timeoutMs: 1000 },
    );

    // Send an unrelated request first.
    await postLogs(collector, buildLogsRequest({ message: 'unrelated' }));
    // Then send the one we're waiting for.
    await postLogs(
      collector,
      buildLogsRequest({
        message: 'targeted',
        tags: { feature: 'qa-integration' },
      }),
    );

    const rec = await waitPromise;
    expect(
      rec.attributes.find((a) => a.key === 'tag.feature')?.value.stringValue,
    ).toBe('qa-integration');
  });

  it('reset() clears received and rejects pending waiters', async () => {
    await postLogs(collector, buildLogsRequest({ message: 'before reset' }));
    expect(collector.received.length).toBe(1);

    const pending = collector.nextRequest((r) => r.path === '/v1/traces', {
      timeoutMs: 5000,
    });
    collector.reset();

    await expect(pending).rejects.toThrow(/collector reset/);
    expect(collector.received.length).toBe(0);
  });

  it('close() rejects pending waiters and refuses subsequent fetches', async () => {
    const pending = collector.nextRequest((r) => r.path === '/v1/traces', {
      timeoutMs: 5000,
    });
    const endpoint = collector.endpoint;
    await collector.close();

    await expect(pending).rejects.toThrow(/collector closed/);

    // Re-create the collector so afterEach's close() is a no-op.
    collector = await createMockCollector({ defaultTimeoutMs: 1000 });

    await expect(
      fetch(`${endpoint}/v1/logs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    ).rejects.toThrow();
  });

  it('GET /v1/logs returns 405', async () => {
    const res = await fetch(`${collector.endpoint}/v1/logs`, { method: 'GET' });
    expect(res.status).toBe(405);
  });

  it('POST /v1/unknown returns 404 and does NOT record', async () => {
    const res = await fetch(`${collector.endpoint}/v1/unknown`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
    expect(collector.received.length).toBe(0);
  });

  it('POST /v1/logs with non-JSON content-type records rawBody but body=null', async () => {
    const res = await fetch(`${collector.endpoint}/v1/logs`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not actually json',
    });
    expect(res.status).toBe(200);
    expect(collector.received.length).toBe(1);
    const recorded = collector.received[0];
    expect(recorded?.rawBody).toBe('not actually json');
    expect(recorded?.body).toBeNull();
  });

  it('POST /v1/logs with body > 5 MiB returns 413 and does NOT record', async () => {
    // 6 MiB of ASCII so the byte count exceeds MAX_BODY_BYTES (5 MiB).
    const oversized = 'x'.repeat(6 * 1024 * 1024);
    const res = await fetch(`${collector.endpoint}/v1/logs`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: oversized,
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('payload_too_large');
    expect(collector.received.length).toBe(0);
  });

  it('waitForLogRecord rejects with a timeout error when no record matches in time', async () => {
    // Send a request that does NOT match the matcher.
    await postLogs(collector, buildLogsRequest({ message: 'unrelated' }));

    await expect(
      collector.waitForLogRecord(
        { exception: { type: 'NoSuchError' } },
        { timeoutMs: 50 },
      ),
    ).rejects.toThrow(/timed out/);
  });

  it('two concurrent waiters with distinct predicates each get their match', async () => {
    const tracesWaiter = collector.nextRequest(
      (r) => r.path === '/v1/traces',
      { timeoutMs: 2000 },
    );
    const logsWaiter = collector.nextRequest(
      (r) => r.path === '/v1/logs',
      { timeoutMs: 2000 },
    );

    // /v1/logs arrives first — only logsWaiter should claim it.
    await postLogs(collector, buildLogsRequest({ message: 'for-logs-waiter' }));
    // Then a /v1/traces request arrives for tracesWaiter.
    await fetch(`${collector.endpoint}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resourceSpans: [] }),
    });

    const logsReq = await logsWaiter;
    const tracesReq = await tracesWaiter;
    expect(logsReq.path).toBe('/v1/logs');
    expect(tracesReq.path).toBe('/v1/traces');
  });

  it('assertLogRecord supports an attributes-only matcher', async () => {
    await postLogs(
      collector,
      buildLogsRequest({
        message: 'tagged',
        tags: { feature: 'qa-integration', team: 'core' },
      }),
    );

    const rec = collector.assertLogRecord({
      attributes: { 'tag.feature': 'qa-integration', 'tag.team': 'core' },
    });
    expect(
      rec.attributes.find((a) => a.key === 'tag.feature')?.value.stringValue,
    ).toBe('qa-integration');
  });

  it('reset() clears the claimed set so subsequent nextRequest() walks from index 0', async () => {
    await postLogs(collector, buildLogsRequest({ message: 'first' }));
    const first = await collector.nextRequest();
    expect(first.path).toBe('/v1/logs');

    collector.reset();
    expect(collector.received.length).toBe(0);

    await postLogs(collector, buildLogsRequest({ message: 'post-reset' }));
    // If reset() did not also clear `claimed` and reset the FIFO cursor, this
    // would hang and time out instead of resolving with the new request.
    const second = await collector.nextRequest(undefined, { timeoutMs: 500 });
    expect(second.path).toBe('/v1/logs');
  });
});
